import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';

const router = express.Router();

// Seed super admin if none exists (dev convenience)
router.post('/seed-super', async (req, res) => {
  try {
    const { username='superadmin', email='super@example.com', password='ChangeMe123!' } = req.body;
    const existing = await Admin.findOne({ role: 'super_admin' });
    if (existing) return res.status(409).json({ message: 'Super admin already exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, email, passwordHash, role: 'super_admin' });
    res.json({ message: 'Super admin created', id: admin._id });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'username & password required' });
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ aid: admin._id, role: admin.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '4h' });
    res.json({ token, admin: { id: admin._id, role: admin.role, username: admin.username } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Auth middleware inline for brevity
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev_secret');
    req.admin = payload; // aid, role
    next();
  } catch(e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Create election
router.post('/election', adminAuth, async (req, res) => {
  try {
    const { title, description, startDate, endDate, startTime, endTime, candidates, isPublic } = req.body;
    
    // Support both startDate/endDate (from frontend) and startTime/endTime
    const start = startDate || startTime;
    const end = endDate || endTime;
    
    if (!title || !start || !end) {
      return res.status(400).json({ message: 'title, start date/time, and end date/time required' });
    }
    
    const election = await Election.create({ 
      title, 
      description, 
      startTime: start, 
      endTime: end 
    });
    
    // If candidates provided, create them
    if (candidates && Array.isArray(candidates)) {
      for (const c of candidates) {
        if (c.name) {
          await Candidate.create({
            election: election._id,
            name: c.name,
            party: c.party || 'Independent',
            manifesto: c.description || ''
          });
        }
      }
    }
    
    res.json({ success: true, election });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// List elections (admin view)
router.get('/election', adminAuth, async (req, res) => {
  try {
    const elections = await Election.find().sort({ startTime: 1 });
    
    // Populate candidates for each election
    const electionsWithCandidates = await Promise.all(
      elections.map(async (election) => {
        const candidates = await Candidate.find({ election: election._id });
        return {
          ...election.toObject(),
          candidates: candidates.map(c => ({
            id: c._id.toString(),
            name: c.name,
            party: c.party,
            description: c.manifesto
          }))
        };
      })
    );
    
    res.json({ success: true, elections: electionsWithCandidates });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update election status
router.patch('/election/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body; // scheduled, ongoing, ended
    if (!['scheduled','ongoing','ended'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const election = await Election.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!election) return res.status(404).json({ message: 'Election not found' });
    const io = req.app.get('io');
    io.emit('election_status', { id: election._id.toString(), status: election.status });
    res.json({ election });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create candidate for an election
router.post('/candidate', adminAuth, async (req, res) => {
  try {
    const { electionId, name, party, manifesto } = req.body;
    if (!electionId || !name) return res.status(400).json({ message: 'electionId & name required' });
    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ message: 'Election not found' });
    const candidate = await Candidate.create({ election: electionId, name, party, manifesto });
    res.json({ candidate });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin dashboard summary
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const elections = await Election.find();
    const totalElections = elections.length;
    const activeElections = elections.filter(e => e.status === 'ongoing').length;
    const upcomingElections = elections.filter(e => e.status === 'scheduled').length;
    const completedElections = elections.filter(e => e.status === 'ended').length;
    const admin = await Admin.findById(req.admin.aid).select('username role updatedAt');
    res.json({ success: true, dashboard: { admin, statistics: { totalElections, activeElections, upcomingElections, completedElections }, recentActivity: [] } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
