import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import { connectDB } from '../config/db.js';

dotenv.config();

async function listAdmins() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_voting';
    await connectDB(uri);
    const admins = await Admin.find().select('username email role createdAt updatedAt').lean();
    console.log('Admins in DB:');
    admins.forEach(a => console.log(JSON.stringify(a, null, 2)));
    process.exit(0);
  } catch (err) {
    console.error('Error listing admins:', err);
    process.exit(1);
  }
}

listAdmins();
