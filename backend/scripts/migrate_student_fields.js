import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Student from '../models/Student.js';

dotenv.config();

function findValueFromObj(obj, patterns) {
  if (!obj) return undefined;
  const normalized = {};
  for (const k of Object.keys(obj)) {
    try { normalized[k.toString().toLowerCase().trim()] = obj[k]; } catch (e) {}
  }
  for (const p of patterns) if (Object.prototype.hasOwnProperty.call(normalized, p)) return normalized[p];
  for (const key of Object.keys(normalized)) {
    for (const p of patterns) {
      if (key.includes(p)) return normalized[key];
    }
  }
  return undefined;
}

async function migrate() {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_voting');
  const cursor = Student.find().cursor();
  let updated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      const obj = doc.originalObj;
      const headers = Array.isArray(doc.originalHeaders) ? doc.originalHeaders.map(h => String(h).toLowerCase()) : null;
      let fatherName, address;
      if (obj) {
        fatherName = findValueFromObj(obj, ['father','father name','fathername','parent name','guardian','guardian name']);
        address = findValueFromObj(obj, ['address','addr','residence','permanent address','present address']);
      } else if (headers && Array.isArray(doc.originalArr)) {
        // try header/array pairing
        const row = {};
        for (let i = 0; i < headers.length; i++) { row[headers[i]] = doc.originalArr[i]; }
        fatherName = findValueFromObj(row, ['father','father name','fathername','parent name','guardian','guardian name']);
        address = findValueFromObj(row, ['address','addr','residence','permanent address','present address']);
      }

      const updates = {};
      if (fatherName && !doc.fatherName) updates.fatherName = fatherName;
      if (address && !doc.address) updates.address = address;
      if (Object.keys(updates).length > 0) {
        await Student.updateOne({ _id: doc._id }, { $set: updates });
        updated++;
      }
    } catch (e) {
      console.warn('Migration error for doc', doc && doc._id, e && e.message ? e.message : e);
    }
  }
  console.log('Migration complete. Documents updated:', updated);
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
