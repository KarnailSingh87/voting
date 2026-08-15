import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Election from './models/Election.js';
import Candidate from './models/Candidate.js';
import { connectDB } from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

export const DEMO_ELECTION_TITLES = [
  'Student Council General Election 2026',
  'Department of Computer Science Representative Election'
];

export async function getDemoElectionsStatus() {
  const demoElections = await Election.find({ title: { $in: DEMO_ELECTION_TITLES } });
  return {
    enabled: demoElections.length > 0,
    count: demoElections.length,
    elections: demoElections.map(e => ({ id: e._id, title: e.title, status: e.status }))
  };
}

export async function removeDemoElections() {
  try {
    const demoElections = await Election.find({ title: { $in: DEMO_ELECTION_TITLES } });
    if (demoElections.length === 0) {
      return { removed: false, message: 'No demo elections found' };
    }

    const ids = demoElections.map(e => e._id);
    await Candidate.deleteMany({ election: { $in: ids } });
    await Election.deleteMany({ _id: { $in: ids } });

    console.log(`🗑️ Removed ${demoElections.length} demo election(s) and their candidates.`);
    return { removed: true, count: demoElections.length, message: `Removed ${demoElections.length} demo election(s)` };
  } catch (err) {
    console.error('❌ Error removing demo elections:', err);
    throw err;
  }
}

export async function seedDemoElections({ force = false } = {}) {
  try {
    // Check if demo elections already exist
    const existingDemo = await Election.find({ title: { $in: DEMO_ELECTION_TITLES } });
    
    if (existingDemo.length > 0 && !force) {
      console.log(`ℹ️ Demo election(s) already exist. Preserving existing data.`);
      return { seeded: false, message: `Demo election(s) already exist` };
    }

    if (force && existingDemo.length > 0) {
      console.log('Force re-seeding demo elections...');
      await removeDemoElections();
    } else {
      console.log('🌱 Seeding demo elections and candidates...');
    }

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Active Election
    const activeElection = await Election.create({
      title: 'Student Council General Election 2026',
      description: 'University-wide election to elect Student Union Officers & Representatives for Academic Year 2026-2027.',
      startTime: lastWeek,
      endTime: nextWeek,
      status: 'ongoing',
      onChainIndex: 0
    });

    await Candidate.create([
      {
        name: 'Aarav Sharma',
        party: 'Progressive Student Front (PSF)',
        manifesto: 'Better campus WiFi, 24/7 library access, and improved sports facilities.',
        photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
        election: activeElection._id,
        voteCount: 42
      },
      {
        name: 'Ananya Verma',
        party: 'United Student Alliance (USA)',
        manifesto: 'Subsidized canteen food, mental health support center, and transparent campus funding.',
        photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
        election: activeElection._id,
        voteCount: 38
      },
      {
        name: 'Rohan Patel',
        party: 'Independent Student Voice',
        manifesto: 'Ecological sustainability, green energy campus, and career placement workshops.',
        photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
        election: activeElection._id,
        voteCount: 19
      }
    ]);

    // 2. Upcoming Election
    const upcomingElection = await Election.create({
      title: 'Department of Computer Science Representative Election',
      description: 'Annual election for CS Department Class Representatives and Technical Society Lead.',
      startTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000),
      status: 'scheduled',
      onChainIndex: 1
    });

    await Candidate.create([
      {
        name: 'Priya Nair',
        party: 'Code & Innovate Union',
        manifesto: 'Hackathon sponsorships, cloud lab credits for students, open-source workshop series.',
        photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
        election: upcomingElection._id,
        voteCount: 0
      },
      {
        name: 'Vikram Singh',
        party: 'Tech Freedom Initiative',
        manifesto: 'Updated course curriculum, Linux lab upgrades, peer tutoring programs.',
        photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
        election: upcomingElection._id,
        voteCount: 0
      }
    ]);

    console.log('✅ Successfully seeded 2 demo elections with candidates!');
    return { seeded: true, message: 'Successfully seeded 2 demo elections' };
  } catch (err) {
    console.error('❌ Error seeding demo data:', err);
    throw err;
  }
}

// When run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('seed_demo_elections.js')) {
  (async () => {
    try {
      const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voting';
      await connectDB(uri);
      if (process.argv.includes('--off') || process.argv.includes('--remove')) {
        await removeDemoElections();
      } else {
        await seedDemoElections({ force: process.argv.includes('--force') });
      }
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      process.exit(1);
    }
  })();
}
