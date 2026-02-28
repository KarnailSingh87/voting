#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connectDB } from '../config/db.js';
import Admin from '../models/Admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

async function checkLogin() {
  if (!MONGO_URI) {
    console.error('MONGO_URI not set in .env');
    process.exit(2);
  }
  if (!PASSWORD) {
    console.error('ADMIN_PASSWORD not set in .env');
    process.exit(2);
  }
  await connectDB(MONGO_URI);
  // find by username or email (case-insensitive)
  const query = { $or: [ { username: { $regex: `^${USERNAME}$`, $options: 'i' } }, { email: { $regex: `^${USERNAME}$`, $options: 'i' } } ] };
  const admin = await Admin.findOne(query);
  if (!admin) {
    console.error('Admin not found for username/email:', USERNAME);
    process.exit(3);
  }
  const ok = await bcrypt.compare(PASSWORD, admin.passwordHash);
  if (!ok) {
    console.error('Invalid credentials for admin', admin.username);
    process.exit(4);
  }
  const token = jwt.sign({ aid: admin._id, role: admin.role }, JWT_SECRET, { expiresIn: '4h' });
  console.log('LOGIN_OK');
  console.log(JSON.stringify({ token, admin: { id: admin._id.toString(), username: admin.username, role: admin.role } }));
  process.exit(0);
}

checkLogin().catch(err => {
  console.error('Error during login check', err.message || err);
  process.exit(1);
});
