import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Student from '../models/Student.js';

dotenv.config();

async function main() {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_voting');
  const count = await Student.countDocuments();
  console.log('Student count:', count);
  const one = await Student.findOne().lean();
  console.log('Sample doc:', one);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
