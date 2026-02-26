#!/usr/bin/env node
/*
  Usage: node scripts/import_students.js /path/to/students.xlsx
  Expects a sheet with columns: roll, name, email, mobile (case-insensitive header names)
*/
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Student from '../models/Student.js';

dotenv.config();

async function main() {
  const rawArgs = process.argv.slice(2);
  // flags: --preview, --roll-col=<LETTER|NUMBER>
  let preview = false;
  let force = false;
  let rollColArg = null;
  let fileArg = null;
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--preview') preview = true;
    else if (a === '--force') force = true;
    else if (a.startsWith('--roll-col=')) rollColArg = a.split('=')[1];
    else if (!fileArg) fileArg = a;
  }
  const file = fileArg;
  if (!file) {
    console.error('Please provide the path to the Excel file: node scripts/import_students.js [--preview] [--roll-col=I] /path/to/file.xlsx');
    process.exit(1);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs);
    process.exit(1);
  }

  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_Voting');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(abs);
  const worksheet = workbook.worksheets && workbook.worksheets[0];
  const sheetName = worksheet ? worksheet.name : (workbook.worksheets[0] && workbook.worksheets[0].name) || 'Sheet1';
  // build rawRows (array of arrays)
  const rawRows = [];
  if (worksheet) {
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const vals = (row.values ? row.values.slice(1) : []).map(v => (v == null ? '' : (typeof v === 'object' && v.text ? v.text : v)));
      rawRows.push(vals);
    });
  }
  // build data (array of objects) similar to sheet_to_json
  const data = [];
  if (rawRows.length > 0) {
    const headerRow = rawRows[0] || [];
    for (let r = 1; r < rawRows.length; r++) {
      const rowArr = rawRows[r] || [];
      const obj = {};
      const maxLen = Math.max(headerRow.length, rowArr.length);
      for (let c = 0; c < maxLen; c++) {
        const rawHeaderCell = headerRow[c];
        let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
        if (!key) key = `Col ${c+1}`;
        obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
      }
      data.push(obj);
    }
  }
  const headerRow = rawRows[0] || [];
  console.log(`Found ${data.length} rows in sheet ${sheetName}`);

  // compute roll column index if provided (supports letter like I or 1-based number)
  let rollColIndex = null;
  if (rollColArg) {
    if (/^[A-Za-z]$/.test(rollColArg)) {
      rollColIndex = rollColArg.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    } else if (/^[0-9]+$/.test(rollColArg)) {
      rollColIndex = parseInt(rollColArg, 10) - 1; // user provides 1-based index
    }
    if (rollColIndex == null || rollColIndex < 0) {
      console.warn('Invalid --roll-col value, ignoring');
      rollColIndex = null;
    }
  }
  // detect whether the sheet contains header names we can use
  // include common synonyms and the exact template keywords so headers like "ID No", "Mail ID", "Father's Name" are recognized
  const expectedHeaders = [
    'roll','rollno','roll_no','roll number',
    'id','idno','id_no','id number','id no','student id','studentid','registration','regno',
    "father's name", 'father name', 'father_name',
    'name','full name',
    'blood group','bloodgroup','blood_group',
    'mobile','phone','phone number','phone_no',
    'branch','department',
    'address','addr','location',
    'category','batch','mail id','mail_id','mail','email'
  ];
  const firstObj = data[0] || {};
  const lowerKeys = Object.keys(firstObj).map(k => String(k).toLowerCase());
  const hasExpectedHeaders = lowerKeys.some(k => expectedHeaders.some(h => k.includes(h)));
  const headerless = !hasExpectedHeaders;
  if (headerless) {
    console.log('No header row detected; treating sheet as headerless rows.');
  }

  if (preview) {
    console.log('Preview mode - first 20 parsed rows (no DB write):');
    console.log('Header row:', headerRow);
    const previewCount = Math.min(20, data.length);
    for (let i = 0; i < previewCount; i++) {
      if (headerless) {
        const arrRow = rawRows[i] || [];
        let rawRoll = rollColIndex != null ? (arrRow[rollColIndex] || '').toString().trim() : '';
        const roll = rawRoll ? rawRoll.toUpperCase() : '';
        // guess name column as first non-roll string column
        let name = '';
        for (let j = 0; j < arrRow.length; j++) {
          if (j === rollColIndex) continue;
          const v = (arrRow[j] || '').toString().trim();
          if (v && /[A-Za-z]/.test(v)) { name = v; break; }
        }
        const email = '';
        const mobile = '';
        console.log(i + 1, { roll: rawRoll, normalizedRoll: roll, name, email, mobile });
      } else {
        const row = data[i];
        const arrRow = rawRows[i + 1] || [];
        let rawRoll = (row.roll || row.Roll || row.RollNumber || row['Roll Number'] || '').toString().trim();
        if ((!rawRoll || rawRoll === '') && rollColIndex != null) rawRoll = (arrRow[rollColIndex] || '').toString().trim();
        const roll = rawRoll ? rawRoll.toUpperCase() : '';
        const name = (row.name || row.Name || row.student || '').toString().trim();
        const email = (row.email || row.Email || '').toString().trim();
        const mobile = (row.mobile || row.Mobile || row.phone || row.Phone || '').toString().trim();
        console.log(i + 1, { roll: rawRoll, normalizedRoll: roll, name, email, mobile });
      }
    }
    process.exit(0);
  }

  let imported = 0;
  if (headerless) {
    for (let i = 0; i < rawRows.length; i++) {
      const arrRow = rawRows[i] || [];
      let rawRoll = rollColIndex != null ? (arrRow[rollColIndex] || '').toString().trim() : '';
      const roll = rawRoll ? rawRoll.toUpperCase() : '';
      // guess name column as first non-roll string column
      let name = '';
      for (let j = 0; j < arrRow.length; j++) {
        if (j === rollColIndex) continue;
        const v = (arrRow[j] || '').toString().trim();
        if (v && /[A-Za-z]/.test(v)) { name = v; break; }
      }
      const email = '';
      const mobile = '';
      // allow forced import when requested
      const finalRoll = roll || (force ? `GEN${Date.now()}${Math.random().toString(36).slice(2,6)}` : '');
      const finalName = name || (force ? 'Unknown' : '');
      if ((!finalRoll || !finalName) && !force) continue;
      try {
        await Student.updateOne(
          { roll: finalRoll },
          { $set: { name: finalName, email, mobile }, $setOnInsert: { registeredAt: new Date(), voted: false } },
          { upsert: true }
        );
        imported++;
      } catch (e) {
        console.error('Failed to import row', roll, e.message || e);
      }
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const arrRow = rawRows[i + 1] || [];
      let rawRoll = (row.roll || row.Roll || row.RollNumber || row['Roll Number'] || '').toString().trim();
      // fallback to column index if provided or header missing
      if ((!rawRoll || rawRoll === '') && rollColIndex != null) rawRoll = (arrRow[rollColIndex] || '').toString().trim();
      const roll = rawRoll ? rawRoll.toUpperCase() : '';
      const name = (row.name || row.Name || row.student || '').toString().trim();
      const email = (row.email || row.Email || '').toString().trim();
      const mobile = (row.mobile || row.Mobile || row.phone || row.Phone || '').toString().trim();
      const finalRoll = roll || (force ? `GEN${Date.now()}${Math.random().toString(36).slice(2,6)}` : '');
      const finalName = name || (force ? 'Unknown' : '');
      if ((!finalRoll || !finalName) && !force) continue;
      try {
        await Student.updateOne(
          { roll: finalRoll },
          { $set: { name: finalName, email, mobile }, $setOnInsert: { registeredAt: new Date(), voted: false } },
          { upsert: true }
        );
        imported++;
      } catch (e) {
        console.error('Failed to import row', roll, e.message || e);
      }
    }
  }

  console.log(`Imported/updated ${imported} students`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
