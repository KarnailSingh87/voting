import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voting';

const electionSchema = new mongoose.Schema({
  title: String,
  description: String,
  startTime: Date,
  endTime: Date,
  status: { type: String, enum: ['scheduled','ongoing','ended'], default: 'scheduled' },
  onChainIndex: Number,
  onChainTxHash: String
}, { timestamps: true });

const candidateSchema = new mongoose.Schema({
  name: String,
  party: String,
  manifesto: String,
  photoUrl: String,
  election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election' },
  voteCount: { type: Number, default: 0 }
}, { timestamps: true });

const Election = mongoose.models.Election || mongoose.model('Election', electionSchema);
const Candidate = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema);

async function seedDemoData() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const count = await Election.countDocuments();
    if (count > 0) {
      console.log(`Database already has ${count} election(s). Existing elections preserved.`);
    } else {
      console.log('Seeding demo elections and candidates...');

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

      console.log('Successfully seeded 2 demo elections with candidates!');
    }

    const allElections = await Election.find({});
    console.log(`Current elections in DB (${allElections.length}):`);
    allElections.forEach(e => console.log(` - ${e.title} [Status: ${e.status}]`));

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error seeding demo data:', err);
    process.exit(1);
  }
}

seedDemoData();
