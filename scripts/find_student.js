import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Student from '../models/Student.js';

dotenv.config();

async function main() {
  const rollArg = process.argv[2];
  if (!rollArg) {
    console.error('Usage: node scripts/find_student.js <ROLL>');
    process.exit(2);
  }

  const roll = String(rollArg).trim().toUpperCase();
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_Voting');

  const doc = await Student.findOne({ roll: { $regex: `^${roll}$`, $options: 'i' } }).lean();
  if (!doc) {
    console.log('NOT_FOUND');
    process.exit(0);
  }

  console.log(JSON.stringify(doc, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
