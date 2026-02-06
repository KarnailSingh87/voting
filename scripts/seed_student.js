import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Student from '../backend/models/Student.js';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Voting';

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const roll = 'TEST1234';
    
    // Check if student exists
    const existing = await Student.findOne({ roll });
    if (existing) {
      console.log(`Student with roll ${roll} already exists.`);
      process.exit(0);
    }

    const student = new Student({
      roll: roll,
      name: 'Test Student',
      email: 'test@example.com',
      mobile: '1234567890'
    });

    await student.save();
    console.log(`Student created successfully: ${roll}`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding student:', err);
    process.exit(1);
  }
}

seed();
