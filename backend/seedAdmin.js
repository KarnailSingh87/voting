import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectDB } from './config/db.js';
import Admin from './models/Admin.js';

dotenv.config();

async function seedAdmin() {
  try {
    await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_Voting');
    
    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'admin@Voting.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
    
    // Check if super admin already exists
    const existing = await Admin.findOne({ role: 'super_admin' });
    if (existing) {
      console.log('✓ Super admin already exists');
      console.log('  Username:', existing.username);
      console.log('  Email:', existing.email);
      process.exit(0);
    }
    
    // Create new super admin
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      username,
      email,
      passwordHash,
      role: 'super_admin'
    });
    
    console.log('✓ Super admin created successfully!');
    console.log('  Username:', username);
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  ID:', admin._id);
    console.log('\nUse these credentials to login to admin panel.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
