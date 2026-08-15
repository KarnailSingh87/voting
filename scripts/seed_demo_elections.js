import { seedDemoElections } from '../backend/seed_demo_elections.js';
import { connectDB } from '../backend/config/db.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voting';
  await connectDB(uri);
  await seedDemoElections({ force: process.argv.includes('--force') });
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
