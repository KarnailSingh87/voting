import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Student from '../models/Student.js';

dotenv.config();

async function main() {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error('Usage: node scripts/list_rolls_prefix.js <PREFIX>');
    process.exit(2);
  }
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_voting');
  const regex = new RegExp('^' + prefix);
  const docs = await Student.find({ roll: { $regex: regex, $options: 'i' } }).sort({ roll: 1 }).lean();
  console.log(`Found ${docs.length} students with prefix ${prefix}`);
  docs.forEach((d, i) => console.log(`${i+1} ${d.roll} | ${d.name || ''} | ${d.email || ''} | ${d.mobile || ''}`));
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
