import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectDB } from './config/db.js';
import Admin from './models/Admin.js';

dotenv.config();

export async function seedSuperAdmin() {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'admin@voting.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
    
    // Check if super admin already exists
    const existing = await Admin.findOne({ role: 'super_admin' });
    if (existing) {
      console.log('ℹ️ Super admin already exists');
      return { seeded: false, username: existing.username, email: existing.email };
    }
    
    // Create new super admin
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      username,
      email,
      passwordHash,
      role: 'super_admin'
    });
    
    console.log('✅ Super admin created successfully!');
    return { seeded: true, username, email, password, id: admin._id };
  } catch (error) {
    console.error('❌ Error seeding super admin:', error);
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith('seedAdmin.js')) {
  (async () => {
    try {
      await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_Voting');
      await seedSuperAdmin();
      process.exit(0);
    } catch (err) {
      process.exit(1);
    }
  })();
}
