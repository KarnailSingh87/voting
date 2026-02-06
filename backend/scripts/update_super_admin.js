#!/usr/bin/env node
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

// project-relative imports
import { connectDB } from '../config/db.js';
import Admin from '../models/Admin.js';

// load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@voting.com';

if (!MONGO_URI) {
  console.error('MONGO_URI not found in .env');
  process.exit(1);
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('ADMIN_USERNAME or ADMIN_PASSWORD not set in .env');
  process.exit(1);
}

async function upsertSuperAdmin() {
  try {
    await connectDB(MONGO_URI);

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    // Try to find any existing super_admin by role first
    let admin = await Admin.findOne({ role: 'super_admin' });

    if (admin) {
      // Update fields
      admin.username = ADMIN_USERNAME;
      admin.email = ADMIN_EMAIL.toLowerCase();
      admin.passwordHash = passwordHash;
      await admin.save();
      console.log('Updated existing super_admin. Username:', admin.username, 'Email:', admin.email);
    } else {
      // If none exists, create one. Use provided username/email/password
      admin = new Admin({
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL.toLowerCase(),
        passwordHash,
        role: 'super_admin'
      });
      await admin.save();
      console.log('Created new super_admin. Username:', admin.username, 'Email:', admin.email);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error updating/creating super_admin:', err.message || err);
    process.exit(1);
  }
}

upsertSuperAdmin();
