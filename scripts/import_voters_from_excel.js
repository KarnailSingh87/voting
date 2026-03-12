// Script to import voters from Excel and update MongoDB
// Place this file in scripts/import_voters_from_excel.js

const XLSX = require('xlsx');
const mongoose = require('mongoose');
const path = require('path');

// Update with your MongoDB URI
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/voting';
const EXCEL_FILE = path.join(__dirname, 'voters.xlsx');

// Minimal Student schema for import
const studentSchema = new mongoose.Schema({
  roll: String,
  name: String,
  email: String,
  mobile: String,
  photo: String, // Add photo field to store photo URL or filename from Excel
  // ...add other fields as needed
});
const Student = mongoose.model('Student', studentSchema, 'students');

async function importVoters() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  let imported = 0;
  for (const row of data) {
    if (!row.roll) continue;
    await Student.updateOne(
      { roll: row.roll },
      { $set: row },
      { upsert: true }
    );
    imported++;
  }
  console.log(`Imported/updated ${imported} voters.`);
  await mongoose.disconnect();
}

importVoters().catch(e => { console.error(e); process.exit(1); });
