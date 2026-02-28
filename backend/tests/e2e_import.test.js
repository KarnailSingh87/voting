import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../server.js';

const ADMIN_SECRET = process.env.JWT_SECRET || 'dev_secret';

describe('E2E import workflow', () => {
  let mongod;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri, { autoIndex: true });
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates election, imports CSV and verifies student associated', async () => {
    const token = jwt.sign({ aid: '000000000000000000000000', role: 'super_admin' }, ADMIN_SECRET, { expiresIn: '1h' });

    // create election
    const start = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const end = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const createRes = await request(app).post('/api/admin/election').set('Authorization', `Bearer ${token}`).send({ title: 'E2E Test Election', description: 'desc', startDate: start, endDate: end, importConcepts: { rollField: 'roll', nameField: 'name', emailField: 'email', mobileField: 'mobile' } });
    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);
    const election = createRes.body.election;
    expect(election).toBeDefined();

    // Create an in-memory XLSX file to ensure ExcelJS parsing path is used
    const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['roll','name','email','mobile']);
    ws.addRow(['R101','John Doe','john@example.com','9999999999']);
    const xlsxBuf = await wb.xlsx.writeBuffer();

    const importRes = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('electionId', election._id)
      .attach('file', xlsxBuf, { filename: 'students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect([200,201]).toContain(importRes.status);
    expect(importRes.body.success).toBe(true);

    // fetch students for election
    const studentsRes = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${token}`).query({ electionId: election._id });
    expect(studentsRes.status).toBe(200);
    expect(studentsRes.body.success).toBe(true);
    expect(studentsRes.body.total).toBeGreaterThanOrEqual(1);
    const items = studentsRes.body.items || [];
    const found = items.find(i => i.roll && i.roll.toString().toUpperCase() === 'R101');
    expect(found).toBeDefined();
    expect(found.name).toBe('John Doe');
  }, 20000);

  it('imports CSV with template-style headers (ID No, Mail ID, etc.)', async () => {
    const token = jwt.sign({ aid: '000000000000000000000000', role: 'super_admin' }, ADMIN_SECRET, { expiresIn: '1h' });

    // CSV content using the admin template headers
    const csv = [
      'Name,Father\'s Name,Blood Group,Mobile,Branch,Address,Category,Batch,ID No,Mail ID',
      'Alice Kumar,Raj Kumar,B+,9876543210,CSE,MG Road Bengaluru,GEN,2023-2027,STU100,alice@example.com',
      'Bob Singh,Harpal Singh,O+,9876543211,ECE,Model Town Delhi,SC,2023-2027,STU101,bob@example.com',
    ].join('\n');
    const csvBuf = Buffer.from(csv, 'utf8');

    const importRes = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', csvBuf, { filename: 'template_students.csv', contentType: 'text/csv' });

    expect(importRes.status).toBe(200);
    expect(importRes.body.success).toBe(true);
    expect(importRes.body.imported).toBe(2);

    // verify the students were imported with correct field extraction
    const studentsRes = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${token}`).query({ q: 'STU100' });
    expect(studentsRes.status).toBe(200);
    const items = studentsRes.body.items || [];
    const alice = items.find(i => i.roll === 'STU100');
    expect(alice).toBeDefined();
    expect(alice.name).toBe('Alice Kumar');
    expect(alice.email).toBe('alice@example.com');
    expect(alice.mobile).toBe('9876543210');
  }, 20000);
});
