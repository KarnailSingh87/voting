import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../server.js';

let mongod;
let token;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  const secret = process.env.JWT_SECRET || 'dev_secret';
  token = jwt.sign({ aid: '000000000000000000000000', role: 'super_admin' }, secret, { expiresIn: '1h' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clean up students between tests
  const Student = mongoose.model('Student');
  await Student.deleteMany({});
});

function makeXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  for (const row of rows) ws.addRow(row);
  return wb.xlsx.writeBuffer();
}

function attach(buf) {
  return { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

describe('XLSX import - header auto-detection', () => {

  test('title row above headers: should import data rows correctly', async () => {
    const buf = await makeXlsx([
      ['Student Data - 2023-2027 Batch'],  // title
      [],                                    // blank
      ['Name', 'Roll No', 'Email', 'Mobile'], // real headers
      ['John Doe', 'STU001', 'john@test.com', '9876543210'],
      ['Jane Smith', 'STU002', 'jane@test.com', '9876543211'],
    ]);

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), attach());

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(0);

    const Student = mongoose.model('Student');
    const students = await Student.find({}).lean();
    expect(students).toHaveLength(2);
    expect(students.map(s => s.roll).sort()).toEqual(['STU001', 'STU002']);
    expect(students.find(s => s.roll === 'STU001').name).toBe('John Doe');
  });

  test('normal headers in row 1: still works', async () => {
    const buf = await makeXlsx([
      ['Name', 'Roll No', 'Email'],
      ['Alice', 'STU003', 'alice@test.com'],
    ]);

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), attach());

    expect(res.body.imported).toBe(1);
    const Student = mongoose.model('Student');
    const s = await Student.findOne({ roll: 'STU003' });
    expect(s.name).toBe('Alice');
  });

  test('header-only file: should import 0 (not import headers as data)', async () => {
    const buf = await makeXlsx([
      ['Name', 'Roll No', 'Email'],
    ]);

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), attach());

    expect(res.body.imported).toBe(0);
    const Student = mongoose.model('Student');
    const students = await Student.find({}).lean();
    expect(students).toHaveLength(0);
  });

  test('preview with title row: correct headers and rows', async () => {
    const buf = await makeXlsx([
      ['Student Data 2024'],
      [],
      ['Name', 'Roll No', 'Email', 'Mobile'],
      ['John', 'STU001', 'john@t.com', '9876543210'],
      ['Jane', 'STU002', 'jane@t.com', '9876543211'],
    ]);

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('preview', '1')
      .field('previewLimit', 'all')
      .attach('file', Buffer.from(buf), attach());

    expect(res.status).toBe(200);
    const preview = res.body.preview;
    expect(preview.headers).toEqual(['Name', 'Roll No', 'Email', 'Mobile']);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0].extracted.name).toBe('John');
    expect(preview.rows[0].extracted.roll).toBe('STU001');
  });

  test('multiple title/blank rows above headers', async () => {
    const buf = await makeXlsx([
      ['UNIVERSITY OF TECHNOLOGY'],
      ['Department of Computer Science'],
      [],
      ['Student List for Semester 2'],
      [],
      ['Name', 'Roll No', 'Email', 'Batch'],
      ['Dave', 'STU030', 'dave@t.com', '2023-2027'],
    ]);

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), attach());

    expect(res.body.imported).toBe(1);
    const Student = mongoose.model('Student');
    const s = await Student.findOne({ roll: 'STU030' });
    expect(s.name).toBe('Dave');
  });

  test('rich text and Date cells are properly normalized', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Name', 'Roll No', 'Email', 'DOB']);
    ws.addRow(['placeholder', 'STU040', 'jane@t.com', new Date('2000-01-15')]);
    ws.getCell('A2').value = { richText: [{ text: 'Jane' }, { text: ' Doe', font: { bold: true } }] };
    const buf = await wb.xlsx.writeBuffer();

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('preview', '1')
      .attach('file', Buffer.from(buf), attach());

    const row = res.body.preview.rows[0];
    expect(row.extracted.name).toBe('Jane Doe');
    expect(row.arr[0]).toBe('Jane Doe');      // richText normalized
    expect(row.arr[3]).toBe('2000-01-15');    // Date normalized
  });

  test('template format with ID No and Mail ID headers', async () => {
    const buf = await makeXlsx([
      ['Name', "Father's Name", 'Blood Group', 'Mobile', 'Branch', 'Address', 'Category', 'Batch', 'ID No', 'Mail ID'],
      ['TestUser', 'TestFather', 'B+', '9876543210', 'CSE', 'Some Address', 'Gen', '2023-2027', 'STU050', 'test@example.com'],
    ]);

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), attach());

    expect(res.body.imported).toBe(1);
    const Student = mongoose.model('Student');
    const s = await Student.findOne({ roll: 'STU050' });
    expect(s.name).toBe('TestUser');
    expect(s.email).toBe('test@example.com');
  });

  test('ODS file: import and preview work via SheetJS', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Roll No', 'Email', 'Mobile'],
      ['ODS User', 'ODS001', 'ods@test.com', '1234567890'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'ods' });

    // Import
    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), { filename: 'test.ods', contentType: 'application/vnd.oasis.opendocument.spreadsheet' });

    expect(res.body.imported).toBe(1);
    const Student = mongoose.model('Student');
    const s = await Student.findOne({ roll: 'ODS001' });
    expect(s).toBeTruthy();
    expect(s.name).toBe('ODS User');
    expect(s.email).toBe('ods@test.com');
  });

  test('ODS file: preview returns correct headers and rows', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Roll No', 'Email'],
      ['Alice ODS', 'ODS002', 'alice@ods.com'],
      ['Bob ODS', 'ODS003', 'bob@ods.com'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'ods' });

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('preview', '1')
      .field('previewLimit', 'all')
      .attach('file', Buffer.from(buf), { filename: 'preview.ods', contentType: 'application/vnd.oasis.opendocument.spreadsheet' });

    expect(res.status).toBe(200);
    expect(res.body.preview.headers).toEqual(['Name', 'Roll No', 'Email']);
    expect(res.body.preview.rows).toHaveLength(2);
    expect(res.body.preview.rows[0].extracted.name).toBe('Alice ODS');
    expect(res.body.preview.rows[0].extracted.roll).toBe('ODS002');
  });

  test('.numbers filename routes to SheetJS parser', async () => {
    // Create xlsx content but name it .numbers to verify routing
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Roll No', 'Email'],
      ['Numbers User', 'NUM001', 'num@test.com'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), { filename: 'voters.numbers', contentType: 'application/octet-stream' });

    expect(res.body.imported).toBe(1);
    const Student = mongoose.model('Student');
    const s = await Student.findOne({ roll: 'NUM001' });
    expect(s).toBeTruthy();
    expect(s.name).toBe('Numbers User');
  });

  test('empty rows between data are stripped - no skipped rows', async () => {
    const buf = await makeXlsx([
      ['Name', 'Roll No', 'Email'],
      ['Alice', 'STU060', 'alice@t.com'],
      [],                                    // empty row
      [null, null, null],                    // all-null row
      ['', '', ''],                          // all-blank row
      ['Bob', 'STU061', 'bob@t.com'],
    ]);

    // Preview should only show 2 real rows, no empty ones
    const previewRes = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('preview', '1')
      .field('previewLimit', 'all')
      .attach('file', Buffer.from(buf), attach());

    expect(previewRes.body.preview.rows).toHaveLength(2);
    expect(previewRes.body.preview.rows[0].extracted.roll).toBe('STU060');
    expect(previewRes.body.preview.rows[1].extracted.roll).toBe('STU061');

    // Import should import 2, skip 0
    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(buf), attach());

    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(0);
  });

  test('no extra Col N headers when data rows have trailing empty cells', async () => {
    // Simulate an Excel file where headers span 4 columns but data rows have extra trailing empties
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Name', 'Roll No', 'Email', 'Mobile']);
    // Data row with extra cells beyond header columns (trailing empties)
    const dataRow = ws.addRow(['Alice', 'STU100', 'alice@test.com', '9000000001']);
    // Manually set extra cells beyond col 4 to simulate Excel files that have trailing empty cells
    dataRow.getCell(5).value = '';
    dataRow.getCell(6).value = null;
    dataRow.getCell(10).value = '';

    const buf = await wb.xlsx.writeBuffer();

    const previewRes = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('preview', '1')
      .field('previewLimit', 'all')
      .attach('file', Buffer.from(buf), { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(previewRes.status).toBe(200);
    const headers = previewRes.body.preview.headers;
    // Should only have 4 headers matching our header row, no Col 5, Col 6, etc.
    expect(headers).toHaveLength(4);
    expect(headers).toEqual(['Name', 'Roll No', 'Email', 'Mobile']);
    // The arr in each row should also be capped to 4 elements
    for (const row of previewRes.body.preview.rows) {
      expect(row.arr.length).toBeLessThanOrEqual(4);
    }
    // No header should match "Col N" pattern
    const colNHeaders = headers.filter(h => /^Col \d+$/.test(h));
    expect(colNHeaders).toHaveLength(0);
  });
});
