import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import JSZip from 'jszip';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import multer from 'multer';
import Admin from '../models/Admin.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Student from '../models/Student.js';
import Voter from '../models/Voter.js';
import Vote from '../models/Vote.js';
import AdminAction from '../models/AdminAction.js';
import { requestOTP, getOTPEntry, getWhatsAppStatus, isWhatsAppConnected, disconnectWhatsApp, reconnectWhatsApp, initWhatsApp } from '../config/otpService.js';
import { parseFile } from '../config/aiParser.js';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// limit file size to 50MB and accept common spreadsheet/zip types (reject plain text uploads)
const upload = multer({ 
  storage: multer.memoryStorage(),
  // allow larger imports up to 50MB
  limits: { fileSize: 50 * 1024 * 1024 },
  // Accept all file types when ALLOW_ANY_UPLOAD=1 (admins want to upload arbitrary files).
  // Otherwise, restrict to common spreadsheet/archive types to preserve test expectations.
  fileFilter: (req, file, cb) => {
    const allowAny = (process.env.ALLOW_ANY_UPLOAD === '1' || process.env.ALLOW_ANY_UPLOAD === 'true');
    if (allowAny) return cb(null, true);
    const name = (file.originalname || '').toLowerCase();
    const allowed = ['.xls', '.xlsx', '.csv', '.tsv', '.numbers', '.ods', '.zip'];
    const ok = allowed.some(ext => name.endsWith(ext));
    if (!ok) return cb(new Error('Invalid file type'), false);
    cb(null, true);
  }
});

// multer for image uploads (candidate photos)
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(__dirname, '..', 'public', 'uploads', 'candidates');
      try { fs.mkdirSync(dest, { recursive: true }); } catch (e) {}
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '';
      const name = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
      cb(null, name);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) return cb(new Error('Invalid file type'), false);
    cb(null, true);
  }
});

// helper to normalise photo paths – return relative paths and let the frontend prepend the backend URL
function absoluteUrl(_req, url) {
  if (!url) return null;
  return url;
}

// Seed super admin if none exists (dev convenience)
router.post('/seed-super', async (req, res) => {
  try {
    // align defaults with backend/seedAdmin.js for consistency
    const { username='admin', email='admin@Voting.com', password='Admin@123456' } = req.body;
    const existing = await Admin.findOne({ role: 'super_admin' });
    if (existing) return res.status(409).json({ message: 'Super admin already exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, email, passwordHash, role: 'super_admin' });
      // Return created credentials to caller for developer convenience
      res.json({ message: 'Super admin created', id: admin._id, username, email, password });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dev-only debug: list admins (only enabled in non-production or when ALLOW_ADMIN_DEBUG=1)
router.get('/debug/admins', async (req, res) => {
  try {
    const enabled = (process.env.NODE_ENV !== 'production') || (process.env.ALLOW_ADMIN_DEBUG === '1');
    if (!enabled) return res.status(404).json({ message: 'Not found' });
    const admins = await Admin.find().select('username email role createdAt updatedAt').lean();
    return res.json({ success: true, admins });
  } catch (e) {
    console.error('debug admins error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Dev-only: inspect OTP store for a given identifier (aadhaar or roll). Protected by adminAuth.
router.get('/debug/otp', adminAuth, async (req, res) => {
  try {
    const enabled = (process.env.NODE_ENV !== 'production');
    if (!enabled) return res.status(404).json({ message: 'Not found' });
    const identifier = req.query.identifier || req.query.roll || req.query.aadhaar;
    if (!identifier) return res.status(400).json({ message: 'identifier query required (roll or aadhaar)' });
    const entry = getOTPEntry(identifier);
    return res.json({ success: true, entry: entry || null });
  } catch (e) {
    console.error('debug otp error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'username & password required' });
    // allow login by username or email, case-insensitive
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = { $or: [ { username: { $regex: `^${escapeRegExp(username)}$`, $options: 'i' } }, { email: { $regex: `^${escapeRegExp(username)}$`, $options: 'i' } } ] };
    const admin = await Admin.findOne(q);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ aid: admin._id, role: admin.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '4h' });
    // Log login action
    try { await AdminAction.create({ admin: admin._id, action: 'Admin Login', details: { description: `${admin.username} logged in`, severity: 'low' }, ip: req.ip }); } catch (_) {}
    res.json({ token, admin: { id: admin._id, role: admin.role, username: admin.username } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Auth middleware inline for brevity
function adminAuth(req, res, next) {
  // Accept token from Authorization header OR query param (for <img src> etc.)
  const auth = req.headers.authorization;
  const tokenFromQuery = req.query.token;
  let token = null;
  if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
  else if (tokenFromQuery) token = tokenFromQuery;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
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
    
    // default import concept mappings; allow override via request body.importConcepts
    const defaultImportConcepts = {
      rollField: 'roll',
      nameField: 'name',
      emailField: 'email',
      mobileField: 'mobile',
      photoField: ''
    };
    const importConcepts = req.body.importConcepts && typeof req.body.importConcepts === 'object' ? { ...defaultImportConcepts, ...req.body.importConcepts } : defaultImportConcepts;

    const election = await Election.create({ 
      title, 
      description, 
      startTime: start, 
      endTime: end,
      importConcepts
    });
    
    // If candidates provided, create them and collect their ids so frontend can upload photos
    const createdCandidates = [];
    if (candidates && Array.isArray(candidates)) {
      for (const c of candidates) {
        if (c.name) {
          const created = await Candidate.create({
            election: election._id,
            name: c.name,
            party: c.party || 'Independent',
            manifesto: c.description || '',
            photoUrl: c.photoUrl || undefined
          });
          createdCandidates.push(created);
        }
      }
    }

    res.json({ success: true, election, candidates: createdCandidates.map(c => ({ id: c._id.toString(), name: c.name, party: c.party, manifesto: c.manifesto, photoUrl: absoluteUrl(req, c.photoUrl) })) });
    // Log election creation
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'Election Created', details: { description: `Created election "${title}"`, severity: 'medium', electionId: election._id }, ip: req.ip }); } catch (_) {}
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// List elections (admin view)
router.get('/election', adminAuth, async (req, res) => {
  try {
    const elections = await Election.find();

    // Sort so live/ongoing elections come first; among live ones, most recently started first
    const rank = (s) => (s === 'ongoing' ? 0 : (s === 'scheduled' ? 1 : 2));
    elections.sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (rank(a.status) === 0) {
        // both ongoing: most recently started first
        return new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime();
      }
      return new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime();
    });

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
            description: c.manifesto,
            photoUrl: absoluteUrl(req, c.photoUrl)
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

// Update election (allow editing importConcepts and basic fields)
router.patch('/election/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid election id' });
    const updates = {};
    const allowed = ['title','description','startTime','endTime','importConcepts'];
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    const election = await Election.findByIdAndUpdate(id, updates, { new: true });
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    res.json({ success: true, election });
  } catch (e) {
    console.error('update election error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single election details including candidates' vote counts and voter stats
router.get('/election/:id', adminAuth, async (req, res) => {
  try {
    let electionId = req.params.id;
    if (!electionId) return res.status(400).json({ success: false, message: 'election id required' });
    let election = null;
    if (mongoose.isValidObjectId(electionId)) {
      election = await Election.findById(electionId);
    } else {
      election = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });

    const candidates = await Candidate.find({ election: election._id }).sort({ voteCount: -1 });
    const totalVotes = candidates.reduce((s, c) => s + (c.voteCount || 0), 0);
    // Count students linked to this election; if none, count all imported students
    let totalVoters = await Student.countDocuments({ elections: election._id });
    if (totalVoters === 0) {
      totalVoters = await Student.countDocuments({});
    }
    // Use Vote collection for accurate voted count (one Vote record per actual vote cast)
    const votedCount = await Vote.countDocuments({ election: election._id });

    res.json({
      success: true,
      election: election.toObject(),
      candidates: candidates.map(c => ({ id: c._id.toString(), name: c.name, party: c.party, voteCount: c.voteCount, photoUrl: absoluteUrl(req, c.photoUrl) })),
      totalVotes,
      totalVoters,
      votedCount
    });
  } catch (e) {
    console.error('election detail error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get voters grouped by candidate for an election
router.get('/election/:id/candidate-voters', adminAuth, async (req, res) => {
  try {
    const electionId = req.params.id;
    if (!electionId || !mongoose.isValidObjectId(electionId)) {
      return res.status(400).json({ success: false, message: 'Valid election id required' });
    }

    const electionOid = new mongoose.Types.ObjectId(electionId);

    const election = await Election.findById(electionOid);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });

    const candidates = await Candidate.find({ election: electionOid }).sort({ voteCount: -1 }).lean();

    // Use Vote model to find which candidate each vote went to, then map to Voter via voteHash
    const votes = await Vote.find({ election: electionOid }).lean();

    // Build candidateId → candidate name map
    const candidateIdToName = {};
    for (const c of candidates) {
      candidateIdToName[c._id.toString()] = c.name;
    }

    // Build voteHash → candidateName map from Vote records
    const hashToCandidateName = {};
    for (const vote of votes) {
      if (vote.candidate) {
        hashToCandidateName[vote.voteHash] = candidateIdToName[vote.candidate.toString()] || 'Unknown';
      }
    }

    // Find all voters who have a history entry for this election
    // Try both ObjectId and string match for robustness
    let voters = await Voter.find({ 'history.electionId': electionOid }).lean();
    if (voters.length === 0) {
      // Fallback: try string comparison in case electionId was stored as string
      voters = await Voter.find({ 'history.electionId': electionId }).lean();
    }

    // Batch-fetch student records for all voter identifiers at once
    const rollNumbers = voters.map(v => (v.identifierRaw || '').trim()).filter(Boolean);
    let studentMap = {};
    if (rollNumbers.length > 0) {
      try {
        const orConditions = rollNumbers.map(r => ({
          roll: { $regex: `^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        }));
        const students = await Student.find({ $or: orConditions }).lean();
        for (const s of students) {
          studentMap[(s.roll || '').toLowerCase()] = s;
        }
      } catch (e) { /* ignore student lookup errors */ }
    }

    // Build a map: candidateName → list of voter info
    const candidateVotersMap = {};
    for (const c of candidates) {
      candidateVotersMap[c.name] = [];
    }

    for (const v of voters) {
      // Find the history entry for this election
      const entry = v.history.find(h => {
        const hId = h.electionId ? h.electionId.toString() : '';
        return hId === electionId;
      });
      if (!entry) continue;

      // Determine candidate name: prefer Vote-based lookup, fallback to history.candidateName
      const candidateName = hashToCandidateName[entry.voteHash] || entry.candidateName || 'Unknown';

      const raw = (v.identifierRaw || '').trim().toLowerCase();
      const studentInfo = studentMap[raw] || null;

      const voterInfo = {
        name: v.name,
        roll: studentInfo ? studentInfo.roll : (v.identifierRaw || ''),
        email: v.email || (studentInfo ? studentInfo.email : ''),
        mobile: v.mobile || (studentInfo ? studentInfo.mobile : ''),
        votedAt: entry.timestamp,
      };

      if (candidateVotersMap[candidateName]) {
        candidateVotersMap[candidateName].push(voterInfo);
      } else {
        candidateVotersMap[candidateName] = [voterInfo];
      }
    }

    // Build response array matching candidates order
    const result = candidates.map(c => ({
      id: c._id.toString(),
      name: c.name,
      party: c.party,
      voteCount: c.voteCount,
      voters: candidateVotersMap[c.name] || [],
    }));

    res.json({ success: true, candidateVoters: result });
  } catch (e) {
    console.error('candidate-voters error', e);
    res.status(500).json({ success: false, message: e.message || 'Server error' });
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

// Compatibility endpoints for older admin bundles: start/pause/end
router.post('/election/:id/start', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const election = await Election.findByIdAndUpdate(id, { status: 'ongoing' }, { new: true });
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const io = req.app.get('io');
    if (io) io.emit('election_status', { id: election._id.toString(), status: election.status });
    // Log action
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'Election Started', details: { description: `Started election "${election.title}"`, severity: 'high', electionId: id }, ip: req.ip }); } catch (_) {}
    return res.json({ success: true, election });
  } catch (e) {
    console.error('start election error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/election/:id/pause', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    // Backend does not have a 'paused' enum; map pause -> scheduled (admin can re-open)
    const election = await Election.findByIdAndUpdate(id, { status: 'scheduled' }, { new: true });
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const io = req.app.get('io');
    if (io) io.emit('election_status', { id: election._id.toString(), status: election.status });
    // Log action
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'Election Paused', details: { description: `Paused election "${election.title}"`, severity: 'medium', electionId: id }, ip: req.ip }); } catch (_) {}
    return res.json({ success: true, election });
  } catch (e) {
    console.error('pause election error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/election/:id/end', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const election = await Election.findByIdAndUpdate(id, { status: 'ended' }, { new: true });
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const io = req.app.get('io');
    if (io) io.emit('election_status', { id: election._id.toString(), status: election.status });
    // Log action
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'Election Ended', details: { description: `Ended election "${election.title}"`, severity: 'high', electionId: id }, ip: req.ip }); } catch (_) {}
    return res.json({ success: true, election });
  } catch (e) {
    console.error('end election error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete election and associated candidates/votes
router.delete('/election/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid election id' });
    }
    
    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }
    
    // Delete associated candidates
    const deletedCandidates = await Candidate.deleteMany({ election: election._id });
    
    // Delete associated votes
    const Vote = (await import('../models/Vote.js')).default;
    const deletedVotes = await Vote.deleteMany({ election: election._id });
    
    // Remove election reference from students
    await Student.updateMany(
      { elections: election._id },
      { $pull: { elections: election._id } }
    );
    
    // Delete the election
    await Election.findByIdAndDelete(id);
    
    // Log admin action
    try {
      await AdminAction.create({
        admin: req.admin?.aid,
        action: 'Election Deleted',
        details: { 
          description: `Deleted election "${election.title}"`,
          severity: 'critical',
          electionId: id, 
          title: election.title,
          deletedCandidates: deletedCandidates.deletedCount,
          deletedVotes: deletedVotes.deletedCount
        },
        ip: req.ip
      });
    } catch (_) {}
    
    // Notify via WebSocket
    const io = req.app.get('io');
    if (io) io.emit('election_deleted', { id: election._id.toString() });
    
    return res.json({ 
      success: true, 
      message: 'Election deleted successfully',
      deleted: {
        candidates: deletedCandidates.deletedCount,
        votes: deletedVotes.deletedCount
      }
    });
  } catch (e) {
    console.error('delete election error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
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
    const payload = { id: candidate._id.toString(), name: candidate.name, party: candidate.party, manifesto: candidate.manifesto, photoUrl: absoluteUrl(req, candidate.photoUrl) };
    res.json({ candidate: payload });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update candidate details (name, party, manifesto)
router.put('/candidate/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, party, manifesto } = req.body;
    
    if (!id) return res.status(400).json({ success: false, message: 'Candidate id required' });
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    
    const candidate = await Candidate.findById(id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
    
    // Update fields
    candidate.name = name.trim();
    if (party !== undefined) candidate.party = party.trim();
    if (manifesto !== undefined) candidate.manifesto = manifesto;
    
    await candidate.save();
    
    res.json({ 
      success: true, 
      candidate: { 
        id: candidate._id.toString(), 
        name: candidate.name, 
        party: candidate.party, 
        manifesto: candidate.manifesto,
        photoUrl: absoluteUrl(req, candidate.photoUrl),
        voteCount: candidate.voteCount
      } 
    });
  } catch (e) {
    console.error('update candidate error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload candidate photo
router.post('/candidate/:id/photo', adminAuth, imageUpload.single('photo'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, message: 'candidate id required' });
    if (!req.file) return res.status(400).json({ success: false, message: 'photo file required' });
    const candidate = await Candidate.findById(id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });

    // store relative path which will be served from /uploads
    const rel = `/uploads/candidates/${req.file.filename}`;
    candidate.photoUrl = rel;
    await candidate.save();

    res.json({ success: true, photoUrl: absoluteUrl(req, rel) });
  } catch (e) {
    console.error('upload candidate photo error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin dashboard summary
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const elections = await Election.find().lean();
    const totalElections = elections.length;
    const activeElections = elections.filter(e => e.status === 'ongoing').length;
    const upcomingElections = elections.filter(e => e.status === 'scheduled').length;
    const completedElections = elections.filter(e => e.status === 'ended').length;
    const admin = await Admin.findById(req.admin.aid).select('username role updatedAt').lean();

    // ── Build recent activity from real data ──
    const recentActivity = [];

    // 1. Recent votes (last 20)
    const recentVotes = await Vote.find()
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('election', 'title')
      .lean();
    for (const v of recentVotes) {
      recentActivity.push({
        action: 'Vote Cast',
        description: `A vote was cast in "${v.election?.title || 'Unknown Election'}"`,
        timestamp: v.timestamp || v.createdAt,
        severity: 'low',
      });
    }

    // 2. Recent election changes (created / status changes)
    const recentElections = await Election.find()
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();
    for (const el of recentElections) {
      const statusLabel = el.status === 'ongoing' ? 'Started' : el.status === 'ended' ? 'Ended' : 'Scheduled';
      const severity = el.status === 'ongoing' ? 'high' : el.status === 'ended' ? 'medium' : 'low';
      recentActivity.push({
        action: `Election ${statusLabel}`,
        description: `"${el.title}" is ${el.status}`,
        timestamp: el.updatedAt,
        severity,
      });
    }

    // 3. Admin actions (if any exist)
    const adminActions = await AdminAction.find()
      .sort({ createdAt: -1 })
      .limit(15)
      .populate('admin', 'username')
      .lean();
    for (const aa of adminActions) {
      recentActivity.push({
        action: aa.action,
        description: aa.details?.description || `by ${aa.admin?.username || 'system'}`,
        timestamp: aa.createdAt,
        severity: aa.details?.severity || 'low',
      });
    }

    // Sort all combined activities by timestamp descending, take top 2
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topActivity = recentActivity.slice(0, 2);

    res.json({
      success: true,
      dashboard: {
        admin,
        statistics: { totalElections, activeElections, upcomingElections, completedElections },
        recentActivity: topActivity,
      },
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: system health endpoint
router.get('/health', adminAuth, async (req, res) => {
  try {
    // Lightweight system health information
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    const mongooseState = mongoose.connection && mongoose.connection.readyState;
    const dbStateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

    // measure a quick DB ping to approximate API response time
    let apiResponseTime = 0;
    try {
      const start = Date.now();
      if (mongoose.connection && mongoose.connection.db) await mongoose.connection.db.admin().ping();
      apiResponseTime = Date.now() - start;
    } catch (e) {
      apiResponseTime = 0;
    }

    // Active users: approximate by counting verified voters (if model exists)
    let activeUsers = 0;
    try {
      const VoterModel = await import('../models/Voter.js');
      if (VoterModel && VoterModel.default) {
        activeUsers = await VoterModel.default.countDocuments({ verifiedAt: { $exists: true } });
      }
    } catch (e) {
      // ignore
    }

    const health = {
      databaseStatus: dbStateMap[mongooseState] || 'unknown',
      uptime: Math.floor(uptime),
      memoryUsage: {
        rss: mem.rss || 0,
        heapTotal: mem.heapTotal || 0,
        heapUsed: mem.heapUsed || 0,
        external: mem.external || 0
      },
      cpuUsage: {
        user: cpu.user || 0,
        system: cpu.system || 0
      },
      apiResponseTime: apiResponseTime,
      activeUsers: activeUsers,
      recentErrors: 0
    };

    res.json({ success: true, health });
  } catch (e) {
    console.error('health endpoint error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper function to intelligently map any file columns to template format
const mapToTemplateFields = (rowObj) => {
  const keys = Object.keys(rowObj).map(k => k.toLowerCase());
  
  // Define mapping patterns for each template field
  const fieldMappings = {
    name: ['name', 'full name', 'student name', 'fname', 'first name'],
    fatherName: ["father's name", 'father name', 'father_name', 'fathername', 'parentname', 'parent name'],
    bloodGroup: ['blood group', 'blood type', 'blood', 'bloodgroup', 'bgroup'],
    mobile: ['mobile', 'phone', 'phone number', 'contact', 'phone_no', 'mobile no', 'phoneno'],
    program: ['program', 'course', 'degree', 'branch', 'department', 'specialization'],
    address: ['address', 'location', 'addr', 'residential address', 'current address'],
    category: ['category', 'caste', 'community', 'type', 'class'],
    batch: ['batch', 'year', 'sem', 'semester', 'session', 'academic year'],
    roll: ['roll', 'roll no', 'roll number', 'roll_no', 'id', 'enrollment', 'registration no', 'regno', 'student id'],
    email: ['email', 'mail', 'email id', 'mailid', 'e-mail'],
    photo: ['photo', 'image', 'picture', 'photo url', 'photourl', 'image url']
  };

  const result = {};
  
  for (const [fieldName, patterns] of Object.entries(fieldMappings)) {
    for (const [headerKey, value] of Object.entries(rowObj)) {
      const lowerHeader = headerKey.toLowerCase().trim();
      for (const pattern of patterns) {
        if (lowerHeader === pattern || lowerHeader.includes(pattern)) {
          result[fieldName] = value;
          break;
        }
      }
      if (result[fieldName]) break;
    }
  }
  
  return result;
};

// Admin-only endpoint: upload Excel and import students
// POST /api/admin/import-students (multipart form-data: file, optional field rollCol like 'I' or '9')
router.post('/import-students', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'file required' });
    // debug: show uploaded file metadata
  try { console.log('Import upload:', req.file.originalname, req.file.mimetype, 'size', req.file.size || (req.file.buffer && req.file.buffer.length)); } catch (e) {}
  try { const sig = req.file.buffer && req.file.buffer.slice && req.file.buffer.slice(0,8); console.log('Upload signature hex:', sig ? sig.toString('hex') : null); } catch (e) {}
    const rollColArg = req.body.rollCol || null;
    const previewFlag = (req.body.preview === '1' || req.body.preview === 'true' || req.query.preview === '1' || req.query.preview === 'true');

  // parse workbook from buffer using exceljs for JSON rows and raw arrays
  let rawRows = [];
  let data = [];
  let parseErrorMsg = null;
  // map of files extracted from uploaded zip (basename -> { buffer, extension })
  let zipFilesMap = {};
  // default sheetName so later image lookup won't throw if initial parse fails
  let sheetName = 'Sheet1';

  // Check if file is CSV/TSV - parse directly without ExcelJS
  const fileName = (req.file.originalname || '').toLowerCase();
  const isCSV = fileName.endsWith('.csv') || fileName.endsWith('.tsv') || req.file.mimetype === 'text/csv' || req.file.mimetype === 'text/tab-separated-values';
  const isZIP = fileName.endsWith('.zip') || req.file.mimetype === 'application/zip' || req.file.mimetype === 'application/x-zip-compressed';
  const isNumbers = fileName.endsWith('.numbers');
  const isODS = fileName.endsWith('.ods');
  
  if (isCSV) {
    // Parse CSV/TSV directly
    try {
      const content = req.file.buffer.toString('utf8');
      const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length > 0) {
        const first = lines[0];
        const commaCount = (first.match(/,/g) || []).length;
        const tabCount = (first.match(/\t/g) || []).length;
        const delim = commaCount >= tabCount ? ',' : '\t';
        // build rawRows
        rawRows = lines.map(line => {
          // Handle quoted CSV fields properly
          const cells = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
              inQuotes = !inQuotes;
            } else if (char === delim && !inQuotes) {
              cells.push(current.trim().replace(/^"|"$/g, ''));
              current = '';
            } else {
              current += char;
            }
          }
          cells.push(current.trim().replace(/^"|"$/g, ''));
          return cells;
        });
        // build data objects with headers
        if (rawRows.length > 1) {
          const headerRow = rawRows[0];
          for (let r = 1; r < rawRows.length; r++) {
            const rowArr = rawRows[r] || [];
            const obj = {};
            for (let c = 0; c < headerRow.length; c++) {
              const rawHeaderCell = headerRow[c];
              let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
              if (!key) key = `Col ${c+1}`;
              obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
            }
            data.push(obj);
          }
        }
      }
      console.log('CSV parsed successfully:', rawRows.length, 'rows');
    } catch (csvErr) {
      console.error('CSV parse error:', csvErr);
      parseErrorMsg = csvErr.message || 'Failed to parse CSV';
    }
  } else if (isZIP) {
    // Handle ZIP file directly - extract CSV/TSV and images
    try {
      let zip = null;
      try {
        zip = await JSZip.loadAsync(req.file.buffer);
      } catch (zipErr) {
        try {
          zip = await JSZip.loadAsync(new Uint8Array(req.file.buffer));
        } catch (zipErr2) {
          throw zipErr2 || zipErr;
        }
      }
      console.log('ZIP files in upload:', Object.keys(zip.files).slice(0, 50));
      
      let candidateText = null;
      // Search for CSV/TSV files and collect images
      for (const fname of Object.keys(zip.files)) {
        const f = zip.files[fname];
        // Skip directories
        if (f.dir) continue;
        // Collect image files
        if (/\.(jpe?g|png|gif|webp|svg)$/i.test(fname)) {
          try {
            const buf = await f.async('nodebuffer');
            const base = path.basename(fname).toLowerCase();
            const ext = (path.extname(fname) || '').replace('.', '').toLowerCase() || 'png';
            zipFilesMap[base] = { buffer: Buffer.from(buf), extension: ext };
          } catch (ie) { /* ignore image extraction errors */ }
        }
        // Prefer CSV/TSV files
        if (!candidateText && (/\.csv$/i.test(fname) || /\.tsv$/i.test(fname) || /table|index|sheet/i.test(fname))) {
          try {
            const content = await f.async('string');
            if (content && content.trim().length > 0) {
              candidateText = content;
            }
          } catch (ie) { /* ignore */ }
        }
      }
      
      // If no CSV found, try to find any text file
      if (!candidateText) {
        for (const fname of Object.keys(zip.files)) {
          const f = zip.files[fname];
          if (f.dir) continue;
          if (!candidateText) {
            try {
              const content = await f.async('string');
              if (content && content.trim().length > 0 && /[\t,]/.test(content)) {
                candidateText = content;
                break;
              }
            } catch (_) { /* ignore */ }
          }
        }
      }

      if (candidateText) {
        const lines = candidateText.split(/\r?\n/).filter(l => l.trim() !== '');
        console.log('ZIP candidateText lines count:', lines.length, 'first:', lines[0] && lines[0].slice(0, 200));
        if (lines.length > 0) {
          const first = lines[0];
          const commaCount = (first.match(/,/g) || []).length;
          const tabCount = (first.match(/\t/g) || []).length;
          const delim = commaCount >= tabCount ? ',' : '\t';
          rawRows = lines.map(line => line.split(delim).map(cell => cell.replace(/^"|"$/g, '').trim()));
          if (rawRows.length > 1) {
            const headerRow = rawRows[0];
            for (let r = 1; r < rawRows.length; r++) {
              const rowArr = rawRows[r] || [];
              const obj = {};
              for (let c = 0; c < headerRow.length; c++) {
                const rawHeaderCell = headerRow[c];
                let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
                if (!key) key = `Col ${c+1}`;
                obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
              }
              data.push(obj);
            }
          }
        }
      }
      console.log('ZIP parsed successfully:', rawRows.length, 'rows,', Object.keys(zipFilesMap).length, 'images');
    } catch (zipErr) {
      console.error('ZIP parse error:', zipErr);
      parseErrorMsg = zipErr.message || 'Failed to parse ZIP';
    }
  } else if (isNumbers || isODS) {
    // ── Apple Numbers (.numbers) and OpenDocument (.ods) via SheetJS ──
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const wsName = wb.SheetNames && wb.SheetNames[0];
      if (wsName) {
        sheetName = wsName;
        const ws = wb.Sheets[wsName];
        // sheet_to_json with header:1 returns an array of arrays (like rawRows)
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        rawRows = aoa.map(row => (Array.isArray(row) ? row : []).map(cell => {
          if (cell == null) return '';
          if (cell instanceof Date) return cell.toISOString().split('T')[0];
          if (typeof cell === 'object') {
            if (cell.richText) return cell.richText.map(s => (s && s.text) || '').join('');
            if (cell.text != null) return cell.text;
            try { return JSON.stringify(cell); } catch (_) { return String(cell); }
          }
          return cell;
        }));
        // build data objects from headers
        if (rawRows.length > 1) {
          const headerRow = rawRows[0] || [];
          for (let r = 1; r < rawRows.length; r++) {
            const rowArr = rawRows[r] || [];
            const obj = {};
            for (let c = 0; c < headerRow.length; c++) {
              const rawHeaderCell = headerRow[c];
              let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
              if (!key) key = `Col ${c+1}`;
              obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
            }
            data.push(obj);
          }
        }
      }
      console.log('SheetJS parsed', isNumbers ? '.numbers' : '.ods', 'successfully:', rawRows.length, 'rows');
    } catch (numbersErr) {
      console.error('SheetJS parse error:', numbersErr);
      parseErrorMsg = numbersErr.message || 'Failed to parse ' + (isNumbers ? '.numbers' : '.ods') + ' file';
    }
  } else {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets && workbook.worksheets[0];
      sheetName = worksheet ? worksheet.name : (workbook.worksheets[0] && workbook.worksheets[0].name) || 'Sheet1';
      // Normalize an ExcelJS cell value to a plain string or number.
      // ExcelJS cells can be: null, string, number, boolean, Date,
      // { text, hyperlink } (hyperlink), { richText: [{text, font}, ...] },
      // { formula, result }, or { error }.
      const normalizeCell = (v) => {
        if (v == null) return '';
        if (typeof v !== 'object') return v; // string, number, boolean
        if (v instanceof Date) return v.toISOString().split('T')[0]; // YYYY-MM-DD
        if (Array.isArray(v.richText)) return v.richText.map(seg => (seg && seg.text) || '').join('');
        if (v.text != null) return v.text; // hyperlink cell
        if (v.result != null) return v.result; // formula cell – use computed result
        if (v.error != null) return ''; // error cell
        // unknown object – coerce to string to avoid [object Object]
        try { return JSON.stringify(v); } catch (_) { return String(v); }
      };

      // build rawRows (array of arrays) from worksheet
      if (worksheet) {
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          // row.values is 1-based; slice(1) to make it 0-based and normalize empty -> ''
          const vals = (row.values ? row.values.slice(1) : []).map(normalizeCell);
          rawRows.push(vals);
        });
      }
      // build data (array of objects) akin to sheet_to_json default behavior
      if (rawRows.length > 0) {
        const headerRow = rawRows[0] || [];
        for (let r = 1; r < rawRows.length; r++) {
          const rowArr = rawRows[r] || [];
          const obj = {};
          for (let c = 0; c < headerRow.length; c++) {
            const rawHeaderCell = headerRow[c];
            let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
            if (!key) key = `Col ${c+1}`;
            obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
          }
          data.push(obj);
        }
      }
    } catch (e) {
      // ExcelJS failed to parse buffer (could be .numbers or another package). Attempt ZIP/text fallback.
      console.warn('ExcelJS failed to parse uploaded file; attempting ZIP/text fallback:', e && e.message ? e.message : e);
      parseErrorMsg = e && e.message ? e.message : String(e);
      rawRows = [];
      data = [];
      let candidateText = null;
      try {
        let zip = null;
        try {
          zip = await JSZip.loadAsync(req.file.buffer);
        } catch (zipErr) {
          // some environments provide a Buffer-like object; try Uint8Array fallback
          try {
            zip = await JSZip.loadAsync(new Uint8Array(req.file.buffer));
          } catch (zipErr2) {
            throw zipErr2 || zipErr;
          }
        }
        // Search for candidate files inside the archive that look like CSV/TSV/PLAIN text or XML tables
        // debug: list files discovered in the uploaded zip
        try { console.log('ZIP files in upload:', Object.keys(zip.files).slice(0,50)); } catch (e) {}
        for (const fname of Object.keys(zip.files)) {
          const f = zip.files[fname];
          // collect image files into zipFilesMap for later mapping by filename
          try {
            if (/\.(jpe?g|png|gif|webp|svg)$/i.test(fname)) {
              try {
                const buf = await f.async('nodebuffer');
                const base = path.basename(fname).toLowerCase();
                const ext = (path.extname(fname) || '').replace('.', '').toLowerCase() || 'png';
                zipFilesMap[base] = { buffer: Buffer.from(buf), extension: ext };
              } catch (ie) { /* ignore image extraction errors */ }
            }
          } catch (ie) { /* ignore */ }
          // prefer CSV/TSV or files with 'table' or 'index' in name
          if (/\.csv$/i.test(fname) || /\.tsv$/i.test(fname) || /table|index|sheet/i.test(fname)) {
            try {
              const content = await f.async('string');
              if (content && content.trim().length > 0) { candidateText = content; break; }
            } catch (ie) { /* ignore */ }
          }
        }
        // If none found, try to pick the largest text file in the archive
        if (!candidateText) {
          let largest = { name: null, size: 0 };
          for (const fname of Object.keys(zip.files)) {
            const f = zip.files[fname];
            if (f && f._data && f._data.uncompressedSize && f._data.uncompressedSize > largest.size) {
              largest = { name: fname, size: f._data.uncompressedSize };
            }
          }
          if (largest.name) {
            try { candidateText = await zip.files[largest.name].async('string'); } catch(_) { candidateText = null; }
          }
        }
      } catch (zipErr) {
        // Not a zip, try as plain text
        candidateText = req.file.buffer.toString('utf8');
      }

      if (candidateText) {
          // crude delimiter detection: prefer comma, fallback to tab
          const lines = candidateText.split(/\r?\n/).filter(l => l.trim() !== '');
        console.log('ZIP candidateText lines count:', lines.length, 'first:', lines[0] && lines[0].slice(0,200));
          if (lines.length > 0) {
            const first = lines[0];
            const commaCount = (first.match(/,/g) || []).length;
            const tabCount = (first.match(/\t/g) || []).length;
            const delim = commaCount >= tabCount ? ',' : '\t';
            // build rawRows
            rawRows = lines.map(line => line.split(delim).map(cell => cell.replace(/^"|"$/g, '').trim()));
            // if we have headers, build data objects
            if (rawRows.length > 1) {
              const headerRow = rawRows[0];
              for (let r = 1; r < rawRows.length; r++) {
                const rowArr = rawRows[r] || [];
                const obj = {};
                for (let c = 0; c < headerRow.length; c++) {
                  const rawHeaderCell = headerRow[c];
                  let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
                  if (!key) key = `Col ${c+1}`;
                  obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
                }
                data.push(obj);
              }
            }
          }
      }
      }
    } // end else (non-CSV files)

    // continue processing when not preview or when parsing succeeded

    // ── Extract embedded images from xlsx (best-effort) ─────────────────
    // Strategy:
    //  1. Use ExcelJS getImages() to map images to cell positions
    //  2. Fallback: directly parse the xlsx ZIP to find xl/media/* images
    //     and xl/drawings/drawing*.xml to map image→cell anchor positions
    //  3. Build imagesMap keyed by row number (1-based, matching sheet rows)
    //     so that each data row can look up its embedded photo.
    let imagesMap = {}; // key: row number (1-based) -> { buffer, extension }
    let imagesRowMap = {}; // key: row number (1-based) -> { buffer, extension }
    try {
      const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
      if (ExcelJS) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(sheetName);

        // Approach 1: ExcelJS getImages() API
        if (worksheet && typeof worksheet.getImages === 'function') {
          const imgEntries = worksheet.getImages();
          const media = workbook.model?.media || [];
          console.log(`[IMAGE-EXTRACT] ExcelJS found ${imgEntries.length} images, ${media.length} media entries`);
          for (const img of imgEntries) {
            try {
              const range = img.range;
              // ExcelJS stores coordinates in range.tl (top-left)
              // nativeRow/nativeCol are 0-based sheet coordinates
              const tl = range?.tl || range;
              let row = null;
              if (tl.nativeRow != null) row = Number(tl.nativeRow);
              else if (tl.row != null) row = Number(tl.row);
              
              // Find the media buffer — try multiple ID matching strategies
              const imgId = img.imageId;
              let image = media.find(m => m.index === imgId);
              if (!image) image = media.find(m => m.index === imgId + 1);
              if (!image) image = media.find(m => m.id === imgId);
              if (!image && media[imgId]) image = media[imgId];
              
              if (image && row != null) {
                const buf = image.buffer || image._buffer;
                if (buf) {
                  const ext = (image.extension || image.type || 'png').replace(/\./g, '');
                  // nativeRow is 0-based; store as 1-based sheet row
                  const sheetRow = row + 1;
                  imagesRowMap[sheetRow] = { buffer: buf, extension: ext };
                }
              }
            } catch (ie) { /* skip this image */ }
          }
          console.log(`[IMAGE-EXTRACT] Mapped ${Object.keys(imagesRowMap).length} images to rows via ExcelJS`);
        }

        // Approach 2: Direct ZIP parsing fallback if ExcelJS didn't find images
        if (Object.keys(imagesRowMap).length === 0) {
          try {
            const zip = await JSZip.loadAsync(req.file.buffer);
            
            // 1. Extract all media files from xl/media/
            const mediaFiles = {}; // e.g. { 'image1': { buffer, ext } }
            for (const [filename, file] of Object.entries(zip.files)) {
              if (filename.startsWith('xl/media/') && !file.dir) {
                const buf = await file.async('nodebuffer');
                const base = path.basename(filename);
                const extMatch = base.match(/\.(\w+)$/);
                const ext = extMatch ? extMatch[1] : 'png';
                const nameNoExt = base.replace(/\.\w+$/, '');
                mediaFiles[nameNoExt] = { buffer: buf, extension: ext };
              }
            }
            console.log(`[IMAGE-EXTRACT] ZIP: found ${Object.keys(mediaFiles).length} media files`);
            
            // 2. Parse drawing relationships to map rId -> media filename
            const rIdToMedia = {}; // { 'rId1': 'image1' }
            for (const [filename, file] of Object.entries(zip.files)) {
              if (filename.match(/xl\/drawings\/_rels\/drawing\d*\.xml\.rels$/)) {
                const xml = await file.async('string');
                // Extract <Relationship Id="rId1" Target="../media/image1.png"/>
                const relRegex = /Id="(rId\d+)"[^>]*Target="[^"]*\/media\/([^"]+)"/g;
                let m;
                while ((m = relRegex.exec(xml)) !== null) {
                  const rId = m[1];
                  const mediaFile = m[2].replace(/\.\w+$/, '');
                  rIdToMedia[rId] = mediaFile;
                }
              }
            }
            
            // 3. Parse drawing XML to map images to row anchors
            for (const [filename, file] of Object.entries(zip.files)) {
              if (filename.match(/xl\/drawings\/drawing\d*\.xml$/)) {
                const xml = await file.async('string');
                // Two-cell anchors: <xdr:twoCellAnchor>...<xdr:from><xdr:row>N</xdr:row>...<a:blip r:embed="rIdN"/>
                // One-cell anchors: <xdr:oneCellAnchor>...<xdr:from><xdr:row>N</xdr:row>...
                const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;
                let anchor;
                while ((anchor = anchorRegex.exec(xml)) !== null) {
                  const block = anchor[1];
                  // Get row from <xdr:from><xdr:row>N</xdr:row>
                  const rowMatch = block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
                  // Get rId from r:embed="rIdN"
                  const embedMatch = block.match(/r:embed="(rId\d+)"/);
                  if (rowMatch && embedMatch) {
                    const anchorRow = parseInt(rowMatch[1], 10); // 0-based
                    const rId = embedMatch[1];
                    const mediaName = rIdToMedia[rId];
                    if (mediaName && mediaFiles[mediaName]) {
                      const sheetRow = anchorRow + 1; // convert to 1-based
                      imagesRowMap[sheetRow] = mediaFiles[mediaName];
                    }
                  }
                }
              }
            }
            console.log(`[IMAGE-EXTRACT] ZIP drawing parse: mapped ${Object.keys(imagesRowMap).length} images to rows`);
            
            // 4. Ultimate fallback: if we have images but no drawing anchors,
            //    assume images are in order, one per data row (skip header row)
            if (Object.keys(imagesRowMap).length === 0 && Object.keys(mediaFiles).length > 0) {
              const sorted = Object.keys(mediaFiles).sort((a, b) => {
                const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
                const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
                return na - nb;
              });
              console.log(`[IMAGE-EXTRACT] Fallback: assigning ${sorted.length} images sequentially to rows`);
              for (let idx = 0; idx < sorted.length; idx++) {
                // row 1 is header, so first data row is 2
                imagesRowMap[idx + 2] = mediaFiles[sorted[idx]];
              }
            }
          } catch (zipErr) {
            console.warn('[IMAGE-EXTRACT] ZIP fallback failed:', zipErr.message || zipErr);
          }
        }
      }
    } catch (e) {
      console.warn('[IMAGE-EXTRACT] Image extraction failed (optional):', e?.message || e);
    }
    // Build legacy imagesMap format for backward compatibility
    // Convert row-based map to sheet:row:col format (use col=0 as wildcard)
    for (const [row, img] of Object.entries(imagesRowMap)) {
      imagesMap[`${sheetName}:${row}:0`] = img;
    }
    console.log(`[IMAGE-EXTRACT] Total images mapped: ${Object.keys(imagesRowMap).length}`);

  // compute roll column index if provided
    let rollColIndex = null;
    if (rollColArg) {
      if (/^[A-Za-z]$/.test(rollColArg)) rollColIndex = rollColArg.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      else if (/^[0-9]+$/.test(rollColArg)) rollColIndex = parseInt(rollColArg, 10) - 1;
    }

    // optional photo column arg
    const photoColArg = req.body.photoCol || null;
    let photoColIndex = null;
    if (photoColArg) {
      if (/^[A-Za-z]$/.test(photoColArg)) photoColIndex = photoColArg.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      else if (/^[0-9]+$/.test(photoColArg)) photoColIndex = parseInt(photoColArg, 10) - 1;
    }

    // preview limit handling: allow previewLimit='all' or numeric
    const previewLimitRaw = req.body.previewLimit || req.query.previewLimit || '500';
    const previewLimit = previewLimitRaw === 'all' ? Infinity : Math.max(0, parseInt(previewLimitRaw, 10) || 500);

    // optional electionId: associate imported students with an election
    // If electionId is not provided the uploaded students will be imported into the global master list
    let electionId = req.body.electionId || req.query.electionId || null;
    let electionObjectId = null;
    if (electionId && (electionId === 'null' || electionId === 'undefined')) electionId = null;
    if (electionId) {
      // accept either a valid ObjectId string or an election title
      if (mongoose.isValidObjectId(electionId)) {
  // normalize to string then construct ObjectId to avoid calling constructor with an ObjectId instance
  electionObjectId = new mongoose.Types.ObjectId(String(electionId));
        const found = await Election.findById(electionObjectId);
        if (!found) return res.status(400).json({ success: false, message: 'electionId not found' });
      } else {
        // try to find by title (case-insensitive)
        const foundByTitle = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
        if (foundByTitle) electionObjectId = foundByTitle._id;
        else return res.status(400).json({ success: false, message: 'Invalid electionId or election title not found' });
      }
    }

    // load importConcepts from election if available
    let importConceptsFromElection = null;
    if (electionObjectId) {
      try {
        const electionDoc = await Election.findById(electionObjectId).lean();
        importConceptsFromElection = electionDoc && electionDoc.importConcepts ? electionDoc.importConcepts : null;
      } catch (e) { /* ignore */ }
    }

    // importConcepts may also be provided directly in the request (as JSON or object)
    let importConceptsReq = null;
    if (req.body.importConcepts) {
      try {
        importConceptsReq = typeof req.body.importConcepts === 'string' ? JSON.parse(req.body.importConcepts) : req.body.importConcepts;
      } catch (e) { importConceptsReq = null; }
    }
    const importConcepts = importConceptsReq || importConceptsFromElection || null;

    // optional: selectedRows - array of preview row indices (0-based) to import when user selected a subset in preview
    let selectedRowsRaw = req.body.selectedRows || req.query.selectedRows || null;
    let selectedRowsSet = null;
    if (selectedRowsRaw) {
      try {
        const parsed = typeof selectedRowsRaw === 'string' ? JSON.parse(selectedRowsRaw) : selectedRowsRaw;
        if (Array.isArray(parsed)) selectedRowsSet = new Set(parsed.map(n => Number(n)).filter(n => !Number.isNaN(n)));
      } catch (e) { /* ignore parse errors - treat as no selection */ }
    }

  // ── Strip empty rows and trailing empty cells from rawRows ─────
  // 1. Trim trailing empty cells from every row so that Excel
  //    formatting artefacts don't produce extra "Col N" columns.
  // 2. Remove data rows where every cell is blank.
  if (rawRows.length > 0) {
    const trimTrailing = (row) => {
      if (!Array.isArray(row)) return row;
      let last = row.length - 1;
      while (last >= 0 && String(row[last] ?? '').trim() === '') last--;
      return row.slice(0, last + 1);
    };
    rawRows = rawRows.map(trimTrailing);

    const isRowEmpty = (row) => !Array.isArray(row) || row.length === 0;
    // Always keep the first row (potential header), filter the rest
    const header = rawRows[0];
    const filtered = rawRows.slice(1).filter(r => !isRowEmpty(r));
    rawRows = [header, ...filtered];

    // Rebuild data from the cleaned rawRows — only use header-length columns
    data = [];
    if (rawRows.length > 1) {
      const headerRow = rawRows[0] || [];
      for (let r = 1; r < rawRows.length; r++) {
        const rowArr = rawRows[r] || [];
        const obj = {};
        for (let c = 0; c < headerRow.length; c++) {
          const rawHeaderCell = headerRow[c];
          let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
          if (!key) key = `Col ${c+1}`;
          obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
        }
        data.push(obj);
      }
    }
  }

  // ── Auto-detect header row ──────────────────────────────────────
  // Real-world Excel files often have a title row, blank row, or
  // merged-cell banner above the actual column headers.  Scan the
  // first 10 rows of rawRows for the one that best matches expected
  // header keywords and, if it isn't row 0, rebuild `data` from
  // the correct header row.
  const headerKeywords = [
    'roll','rollno','roll_no','roll number',
    'id','idno','id_no','id number','id no','student id','studentid','registration','regno',
    "father's name",'father name','father_name',
    'name','full name','student name',
    'blood group','bloodgroup','blood_group',
    'mobile','phone','phone number','phone_no',
    'branch','department','program',
    'address','addr','location',
    'category','batch','mail id','mail_id','mail','email'
  ];

  const _rowMatchesHeader = (rowArr) => {
    if (!Array.isArray(rowArr) || rowArr.length < 2) return 0;
    let hits = 0;
    for (const cell of rowArr) {
      const lc = String(cell || '').toLowerCase().trim();
      if (!lc) continue;
      if (headerKeywords.some(h => lc === h || lc.includes(h))) hits++;
    }
    return hits;
  };

  // scan up to first 10 rows
  let bestHeaderIdx = 0;
  let bestHeaderHits = _rowMatchesHeader(rawRows[0]);
  const scanLimit = Math.min(rawRows.length, 10);
  for (let ri = 1; ri < scanLimit; ri++) {
    const hits = _rowMatchesHeader(rawRows[ri]);
    if (hits > bestHeaderHits) {
      bestHeaderHits = hits;
      bestHeaderIdx = ri;
    }
  }

  // Track how many leading rows were skipped so image row mapping stays accurate
  let headerRowOffset = 0;

  // If the best header row is NOT the first row, rebuild rawRows and data
  if (bestHeaderIdx > 0 && bestHeaderHits >= 2) {
    console.log(`Header row auto-detected at rawRows[${bestHeaderIdx}] (${bestHeaderHits} keyword hits). Discarding ${bestHeaderIdx} leading row(s).`);
    headerRowOffset = bestHeaderIdx;
    rawRows = rawRows.slice(bestHeaderIdx); // header row is now rawRows[0]
    // rebuild data from corrected rawRows
    data = [];
    if (rawRows.length > 1) {
      const headerRow = rawRows[0] || [];
      for (let r = 1; r < rawRows.length; r++) {
        const rowArr = rawRows[r] || [];
        const obj = {};
        for (let c = 0; c < headerRow.length; c++) {
          const rawHeaderCell = headerRow[c];
          let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
          if (!key) key = `Col ${c+1}`;
          obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
        }
        data.push(obj);
      }
    }
  }

  // debug: show parsed row counts (rawRows/data)
  try { console.log('Parsed rawRows length:', Array.isArray(rawRows) ? rawRows.length : 'N/A', 'data length:', Array.isArray(data) ? data.length : 'N/A'); } catch (e) {}
  // detect header row
    const firstObj = data[0] || {};
    const lowerKeys = Object.keys(firstObj).map(k => String(k).toLowerCase());
    // include common synonyms and the exact template keywords so headers like "ID No", "Mail ID", "Father's Name" are recognized
    const expectedHeaders = headerKeywords;
    const hasExpectedHeaders = lowerKeys.some(k => expectedHeaders.some(h => k.includes(h)));
    const headerless = !hasExpectedHeaders;

    // Run AI/heurstic parser to enrich rows (returns an array aligned with data if headered, or aligned with rawRows if headerless)
    let aiExtractedRows = [];
    try {
      const aiRes = await parseFile({ buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, data, rawRows, imagesMap, headerless });
      aiExtractedRows = Array.isArray(aiRes.extractedRows) ? aiRes.extractedRows : [];
    } catch (e) {
      console.warn('AI parse failed:', e && e.message ? e.message : e);
      aiExtractedRows = [];
    }

    // If preview requested and nothing parsed by ExcelJS/ZIP/text, and AI heuristics returned nothing, return helpful 400
    if (previewFlag && (!Array.isArray(rawRows) || rawRows.length === 0) && (!Array.isArray(data) || data.length === 0) && (!Array.isArray(aiExtractedRows) || aiExtractedRows.length === 0)) {
      const msg = parseErrorMsg ? `Failed to parse uploaded file: ${parseErrorMsg}` : 'Failed to parse uploaded file (unknown format). Try compressing .numbers to .zip or upload as .xlsx/.csv.';
      return res.status(400).json({ success: false, message: msg });
    }

    // normalize headers helper: prefer explicit header row (rawRows[0]) when available,
    // replace sheetjs-generated "__EMPTY" keys or blank headers with "Col N" fallbacks
    const headerRowArray = Array.isArray(rawRows) && rawRows.length > 0 ? rawRows[0] : [];
    const normalizeHeaders = (fallbackKeys) => {
      // fallbackKeys: array of keys from sheet_to_json objects (may contain __EMPTY placeholders)
      // Prefer headerRowArray length to avoid generating extra "Col N" entries for trailing empty cells
      const hLen = (headerRowArray && headerRowArray.length) || 0;
      const fLen = (fallbackKeys && fallbackKeys.length) || 0;
      const maxLen = hLen > 0 ? hLen : fLen;
      const out = [];
      for (let i = 0; i < maxLen; i++) {
        const rawHeaderCell = headerRowArray[i];
        const candidateKey = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
        if (candidateKey) {
          out.push(candidateKey);
          continue;
        }
        const fk = fallbackKeys && fallbackKeys[i] ? String(fallbackKeys[i]).trim() : '';
        if (fk && !/^__EMPTY(_\d+)?$/i.test(fk)) {
          out.push(fk);
          continue;
        }
        out.push(`Col ${i+1}`);
      }
      return out;
    };

  let imported = 0;
  let skipped = 0;
  const skippedRows = [];
  const previewRows = [];
  // richer preview structure when previewFlag: we'll return headers (if present) and rows with raw arrays and objects
  const previewData = { headers: null, rows: [] };
  // allow forcing import even if required fields missing
  const forceImport = (req.body.force === '1' || req.body.force === 'true' || req.query.force === '1' || req.query.force === 'true');

  // Guard: if the file only had a header row and no data rows, return early.
  // We detect this when rawRows has only 1 row and it looks like a header (has keyword matches).
  if (data.length === 0 && rawRows.length <= 1 && bestHeaderHits >= 2) {
    if (previewFlag) {
      return res.json({ success: true, preview: { headers: headerRowArray.map(h => String(h || '').trim()), rows: [] }, totalParsed: 0, totalWithEmpty: 0 });
    }
    return res.json({ success: true, imported: 0, skipped: 0, skippedRows: [], message: 'File contains only headers with no data rows.' });
  }

  if (headerless) {
      // headerless: rawRows are arrays; include all columns. Provide sensible Col N headers
      // instead of showing sheetjs placeholders like __EMPTY
      const fallbackKeys = [];
      // try to infer number of columns from first row
      const firstRow = rawRows[0] || [];
      for (let i = 0; i < firstRow.length; i++) fallbackKeys.push(`Col ${i+1}`);
      previewData.headers = normalizeHeaders(fallbackKeys);
      // Detect common "I-card" style layout where columns are:
      // [0]=Name, [1]=Father's Name, [2]=Blood Group, [3]=Mobile,
      // [4]=Program, [5]=Address, [6]=Category, [7]=Batch, [8]=ID/Roll, [9]=Photo
      let headerlessTemplate = null;
      try {
        if (firstRow.length >= 9) {
          const bg = (firstRow[2] || '').toString().trim();
          const batch = (firstRow[7] || '').toString().trim();
          const rollCandidate = (firstRow[8] || '').toString().trim();
          const bgOk = /^[ABO]{1,2}[+-]$/i.test(bg); // e.g. B+, O-
          const batchOk = /\d{4}\s*[-–]\s*\d{2,4}/.test(batch) || /\d{4}\s*[-–]\s*\d{4}/.test(batch);
          const rollOk = /\d/.test(rollCandidate);
          if (bgOk && batchOk && rollOk) {
            headerlessTemplate = 'icard_v1';
          }
        }
      } catch (_) { headerlessTemplate = null; }
      for (let i = 0; i < rawRows.length; i++) {
        // if a selection set was provided from preview, skip rows not selected
        if (selectedRowsSet && !selectedRowsSet.has(i)) continue;
        const arrRow = rawRows[i] || [];
        // attempt to extract roll using known template, rollColIndex, or heuristic
        let rawRoll = '';
        let detectedRollIdx = rollColIndex;

        if (headerlessTemplate === 'icard_v1' && arrRow.length >= 9) {
          detectedRollIdx = 8;
          rawRoll = (arrRow[8] || '').toString().trim();
        } else if (detectedRollIdx != null) {
          rawRoll = (arrRow[detectedRollIdx] || '').toString().trim();
        } else {
          // Heuristic: prefer column with digits as Roll
          // If no digits, fall back to first non-empty column that isn't clearly a name (has spaces)
          const candidates = arrRow.map((c, i) => ({ val: (c||'').toString().trim(), i })).filter(c => c.val);
          
          // Find all candidates containing digits
          const withDigits = candidates.filter(c => /\d/.test(c.val));
          const clearlyName = (s) => /^[A-Za-z\s\.]+$/.test(s) && s.includes(' ');

          if (withDigits.length > 0) {
            // Prioritize candidates that do NOT look like mobile numbers (10-15 digits)
            // This prevents mobile number being mistaken for roll number in mixed columns
            const notMobile = withDigits.find(c => {
               const d = c.val.replace(/\D/g, '');
               return d.length < 10 || d.length > 15;
            });
            if (notMobile) {
              detectedRollIdx = notMobile.i;
              rawRoll = notMobile.val;
            } else {
              // If all look like mobile numbers (or none are clearly not), pick the first one with digits
              detectedRollIdx = withDigits[0].i;
              rawRoll = withDigits[0].val;
            }
          } else {
            // No digits found. Pick first one that doesn't look like a full name "John Doe"
            const notName = candidates.find(c => !clearlyName(c.val));
            if (notName) {
              detectedRollIdx = notName.i;
              rawRoll = notName.val;
            } else if (candidates.length > 0) {
              // Everything looks like a name? Just take the first one.
              detectedRollIdx = candidates[0].i;
              rawRoll = candidates[0].val;
            }
          }
        }
        let roll = rawRoll ? rawRoll.toString().trim().toUpperCase() : '';

        // attempt to find a name candidate (first cell with letters that's not roll)
        let name = '';
        if (headerlessTemplate === 'icard_v1' && arrRow.length >= 1) {
          name = (arrRow[0] || '').toString().trim();
        } else {
          for (let j = 0; j < arrRow.length; j++) {
            const v = (arrRow[j] || '').toString().trim();
            if (!v) continue;
            if (detectedRollIdx != null && j === detectedRollIdx) continue;
            if (v && /[A-Za-z]/.test(v) && !v.includes('@')) { name = v; break; }
          }
        }

        // attempt to detect email (look for @ symbol)
        let email = '';
        for (let j = 0; j < arrRow.length; j++) {
          const v = (arrRow[j] || '').toString().trim();
          if (!v) continue;
          if (detectedRollIdx != null && j === detectedRollIdx) continue;
          if (v.includes('@') && /\S+@\S+\.\S+/.test(v)) { 
             email = v; 
             break; 
          }
        }

        // attempt to detect mobile (look for digits, typical length 10-15, avoid roll index)
        let mobile = '';
        for (let j = 0; j < arrRow.length; j++) {
          const v = (arrRow[j] || '').toString().trim();
          if (!v) continue;
          if (detectedRollIdx != null && j === detectedRollIdx) continue;
          const digitsOnly = v.replace(/\D/g, '');
          if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
             mobile = v;
             break;
          }
        }

        const rowObj = { arr: arrRow.map(c => (c == null ? '' : c)), obj: null };
        // optional extended fields for known template layout
        let fatherName = '';
        let bloodGroup = '';
        let program = '';
        let address = '';
        let category = '';
        let batch = '';
        if (headerlessTemplate === 'icard_v1') {
          fatherName = (arrRow[1] || '').toString().trim();
          bloodGroup = (arrRow[2] || '').toString().trim();
          mobile = mobile || (arrRow[3] || '').toString().trim();
          program = (arrRow[4] || '').toString().trim();
          address = (arrRow[5] || '').toString().trim();
          category = (arrRow[6] || '').toString().trim();
          batch = (arrRow[7] || '').toString().trim();
        }
        // integrate AI-extracted fields for headerless rows when available
        const aiRow = (aiExtractedRows && aiExtractedRows[i]) ? aiExtractedRows[i] : null;
        if (aiRow) {
          if (!roll && aiRow.roll) roll = String(aiRow.roll).trim().toUpperCase();
          if (!name && aiRow.name) name = String(aiRow.name).trim();
          if (!email && aiRow.email) email = String(aiRow.email).trim();
          if (!mobile && aiRow.mobile) mobile = String(aiRow.mobile).trim();
          if (!fatherName && aiRow.fatherName) fatherName = aiRow.fatherName;
          if (!address && aiRow.address) address = aiRow.address;
        }

        // validations (after heuristics + AI so preview reflects final values)
        const errors = [];
        if (!roll) errors.push('missing roll');
        if (!name) errors.push('missing name');

        // try to detect photo: explicit photoColIndex, known template column, AI, or any cell that looks like an image URL
        let photo = '';
        if (headerlessTemplate === 'icard_v1' && arrRow.length >= 10) {
          photo = (arrRow[9] || '').toString().trim();
        }
        if (!photo && photoColIndex != null) photo = (arrRow[photoColIndex] || '').toString().trim();
        if (!photo && aiRow && aiRow.photo) photo = aiRow.photo;
        if (!photo) {
          for (let j = 0; j < arrRow.length; j++) {
            const v = (arrRow[j] || '').toString().trim();
            if (!v) continue;
            if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(v)) { photo = v; break; }
          }
        }
        // embedded images: check imagesRowMap for this sheet row (best-effort)
        if (!photo && imagesRowMap) {
          const sheetRow = i + 1 + headerRowOffset; // rawRows index i -> original sheet row (1-based)
          const img = imagesRowMap[sheetRow];
          if (img && img.buffer) {
            try {
              const b64 = Buffer.from(img.buffer).toString('base64');
              photo = `data:image/${img.extension};base64,${b64}`;
            } catch (e) { /* ignore */ }
          }
          // Also try legacy column-based lookup
          if (!photo) {
            for (let j = 0; j < arrRow.length; j++) {
              const key = `${sheetName}:${sheetRow}:${j+1}`;
              const colImg = imagesMap[key];
              if (colImg && colImg.buffer) {
                try {
                  const b64 = Buffer.from(colImg.buffer).toString('base64');
                  photo = `data:image/${colImg.extension};base64,${b64}`;
                  break;
                } catch (e) { /* ignore */ }
              }
            }
          }
        }

        if (previewFlag) {
          previewData.rows.push({ ...rowObj, extracted: { roll, name, email, mobile, photo }, valid: errors.length === 0, errors });
        } else {
          // If forceImport is enabled, attempt to import rows even when roll/name are missing
          const finalRoll = roll || (forceImport ? `GEN${Date.now()}${Math.random().toString(36).slice(2,6)}` : '');
          const finalName = name || (forceImport ? 'Unknown' : '');
          if ((!finalRoll || !finalName) && !forceImport) {
            // skip row when required fields absent and not forcing
            skipped++;
            skippedRows.push({ rowIndex: i, errors, row: rowObj.arr });
          } else {
            try {
              if (photo && !/^https?:\/\//i.test(photo) && zipFilesMap) {
                try {
                  const basePhoto = path.basename(photo).toLowerCase();
                  const match = zipFilesMap[photo.toLowerCase()] || zipFilesMap[basePhoto];
                  if (match && match.buffer) {
                    const b64 = Buffer.from(match.buffer).toString('base64');
                    photo = `data:image/${match.extension};base64,${b64}`;
                  }
                } catch (e) { /* ignore */ }
              }

              const setObj = {
                name: finalName,
                email,
                mobile,
                fatherName: fatherName || undefined,
                bloodGroup: bloodGroup || undefined,
                program: program || undefined,
                address: address || undefined,
                category: category || undefined,
                batch: batch || undefined,
                photo: photo || undefined,
                originalArr: rowObj.arr,
                originalObj: null,
                originalHeaders: null,
                importOrder: i
              };
              if (aiRow && aiRow.fatherName) setObj.fatherName = aiRow.fatherName;
              if (aiRow && aiRow.address) setObj.address = aiRow.address;
              const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const existing = finalRoll ? await Student.findOne({ roll: { $regex: `^${escapeRegExp(finalRoll)}$`, $options: 'i' } }) : null;
              if (existing) {
                const updateObj = { $set: { ...setObj, roll: finalRoll } };
                if (electionObjectId) updateObj.$addToSet = { elections: electionObjectId };
                else updateObj.$set = { ...(updateObj.$set || {}), masterList: true };
                await Student.updateOne({ _id: existing._id }, updateObj);
              } else {
                const createObj = { roll: finalRoll || `GEN${Date.now()}${Math.random().toString(36).slice(2,6)}`, ...setObj };
                if (electionObjectId) createObj.elections = [electionObjectId];
                createObj.registeredAt = new Date();
                createObj.voted = false;
                createObj.masterList = !electionObjectId;
                await Student.create(createObj);
              }
              imported++;
            } catch (e) { console.error('import error', e); }
          }
        }
      }
    } else {
      for (let i = 0; i < data.length; i++) {
        // selectedRowsSet indices correspond to preview rows (data[] index for headered files)
        if (selectedRowsSet && !selectedRowsSet.has(i)) continue;
        const row = data[i];
        const arrRow = rawRows[i + 1] || [];
        // allow importConcepts mapping to guide extraction when provided
        let rawRoll = '';
        if (importConcepts && importConcepts.rollField) {
          rawRoll = (row[importConcepts.rollField] || row[importConcepts.rollField.toLowerCase()] || row[importConcepts.rollField.toUpperCase()] || '').toString().trim();
        }
        if (!rawRoll) rawRoll = (row.roll || row.Roll || row.RollNumber || row['Roll Number'] || '').toString().trim();
        // additional heuristics: treat common ID-style headers (e.g. "ID No", "Student ID", "Registration No") as roll column
        if (!rawRoll) {
          for (const key of Object.keys(row)) {
            if (!row[key]) continue;
            const lk = key.toString().toLowerCase().trim();
            if (
              lk.includes('roll') ||
              lk === 'id' ||
              lk.includes('id no') ||
              lk.includes('id number') ||
              lk.includes('student id') ||
              lk.includes('registration') ||
              lk.includes('reg no') ||
              lk.includes('reg. no') ||
              lk.includes('enrollment')
            ) {
              const candidate = (row[key] || '').toString().trim();
              if (candidate) {
                rawRoll = candidate;
                break;
              }
            }
          }
        }
        if ((!rawRoll || rawRoll === '') && rollColIndex != null) rawRoll = (arrRow[rollColIndex] || '').toString().trim();
        const roll = rawRoll ? rawRoll.toUpperCase() : '';
        let name = '';
        let email = '';
        let mobile = '';
        if (importConcepts) {
          name = (row[importConcepts.nameField] || row[importConcepts.nameField?.toLowerCase()] || row[importConcepts.nameField?.toUpperCase()] || '').toString().trim();
          email = (row[importConcepts.emailField] || row[importConcepts.emailField?.toLowerCase()] || row[importConcepts.emailField?.toUpperCase()] || '').toString().trim();
          mobile = (row[importConcepts.mobileField] || row[importConcepts.mobileField?.toLowerCase()] || row[importConcepts.mobileField?.toUpperCase()] || '').toString().trim();
        }
        if (!name) name = (row.name || row.Name || row.student || '').toString().trim();
        if (!email) email = (row.email || row.Email || '').toString().trim();
        if (!mobile) mobile = (row.mobile || row.Mobile || row.phone || row.Phone || '').toString().trim();
        // broader header-agnostic fallback for name, email and mobile using synonyms
        if (!name || !email || !mobile) {
          for (const key of Object.keys(row)) {
            if (!row[key]) continue;
            const lk = key.toString().toLowerCase().trim();
            const val = String(row[key]).trim();
            if (!name && ((lk.includes('name') && !lk.includes('father') && !lk.includes('parent') && !lk.includes('guardian')) || lk === 'student')) {
              name = val;
            }
            if (!email && (lk.includes('email') || lk.includes('mail') || lk.includes('e-mail'))) {
              email = val;
            }
            if (!mobile && (lk.includes('mobile') || lk.includes('phone') || lk.includes('contact') || lk === 'tel' || lk === 'telephone')) {
              mobile = val;
            }
          }
        }
        // Cap arrRow to header column count so preview doesn't show extra "Col N" columns
        const hdrLen = (rawRows[0] || []).length;
        const cappedArr = hdrLen > 0 ? arrRow.slice(0, hdrLen) : arrRow;
        const rowObj = { arr: cappedArr.map(c => (c == null ? '' : c)), obj: row };
        const errors = [];
        if (!roll) errors.push('missing roll');
        if (!name) errors.push('missing name');
        // photo extraction from headered row: try common header names
        const photoCandidates = ['photo','photo_url','photoUrl','image','image_url','imageUrl','avatar','picture'];
        let photo = '';
        for (const key of Object.keys(row)) {
          if (!row[key]) continue;
          const lk = key.toString().toLowerCase();
          if (photoCandidates.includes(lk) || photoCandidates.some(p => lk.includes(p))) {
            photo = (row[key] || '').toString().trim();
            break;
          }
        }
        // fallback: if photoColIndex provided, use arrRow
        if (!photo && photoColIndex != null) photo = (arrRow[photoColIndex] || '').toString().trim();
        // fallback: detect any URL that looks like image
        if (!photo) {
          for (let j = 0; j < arrRow.length; j++) {
            const v = (arrRow[j] || '').toString().trim();
            if (!v) continue;
            if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(v)) { photo = v; break; }
          }
        }
        // embedded images: check imagesRowMap for this sheet row (best-effort)
        if (!photo && imagesRowMap) {
          const sheetRow = i + 2 + headerRowOffset; // data[i] -> rawRows[i+1] -> original sheet row (1-based)
          const img = imagesRowMap[sheetRow];
          if (img && img.buffer) {
            try {
              const b64 = Buffer.from(img.buffer).toString('base64');
              photo = `data:image/${img.extension};base64,${b64}`;
            } catch (e) { /* ignore */ }
          }
          // Also try legacy column-based lookup
          if (!photo) {
            for (let j = 0; j < arrRow.length; j++) {
              const key = `${sheetName}:${sheetRow}:${j+1}`;
              const colImg = imagesMap[key];
              if (colImg && colImg.buffer) {
                try {
                  const b64 = Buffer.from(colImg.buffer).toString('base64');
                  photo = `data:image/${colImg.extension};base64,${b64}`;
                  break;
                } catch (e) { /* ignore */ }
              }
            }
          }
        }

        if (previewFlag) {
          // build normalized headers once using the original header row (rawRows[0])
          const fallbackKeys = Object.keys(row).map(k => k.toString());
          previewData.headers = previewData.headers || normalizeHeaders(fallbackKeys);
          previewData.rows.push({ ...rowObj, extracted: { roll, name, email, mobile, photo }, valid: errors.length === 0, errors });
        } else {
          // Always attempt to import if forceImport is enabled, otherwise skip rows with errors
          if (errors.length === 0 || forceImport) {
            try {
              const headers = Object.keys(row).map(k => k.toString());
              // build a lowercase key->value map to detect canonical fields
              const normalized = {};
              for (const k of Object.keys(row)) {
                try {
                  normalized[k.toString().toLowerCase().trim()] = (row[k] == null) ? '' : String(row[k]).trim();
                } catch (e) { /* ignore */ }
              }
              const findValue = (patterns) => {
                for (const p of patterns) {
                  if (Object.prototype.hasOwnProperty.call(normalized, p)) return normalized[p];
                }
                // fallback: find any key that includes the pattern
                for (const key of Object.keys(normalized)) {
                  for (const p of patterns) {
                    if (key.includes(p)) return normalized[key];
                  }
                }
                return undefined;
              };
              let fatherName = findValue(['father','father name','fathername','parent name','parents name','guardian','guardian name']);
              let bloodGroup = findValue(['blood','blood group','blood type','bgroup']);
              let program = findValue(['program','course','degree','branch','department']);
              let category = findValue(['category','caste','community']);
              let batch = findValue(['batch','year','sem','semester','session']);
              let address = findValue(['address','addr','location','residential address','current address']);
              
              const aiRow = (aiExtractedRows && aiExtractedRows[i]) ? aiExtractedRows[i] : null;
              if (aiRow) {
                if (!fatherName && aiRow.fatherName) fatherName = aiRow.fatherName;
                if (!address && aiRow.address) address = aiRow.address;
                if (!photo && aiRow.photo) photo = aiRow.photo;
                if (!bloodGroup && aiRow.bloodGroup) bloodGroup = aiRow.bloodGroup;
                if (!program && aiRow.program) program = aiRow.program;
                if (!category && aiRow.category) category = aiRow.category;
                if (!batch && aiRow.batch) batch = aiRow.batch;
              }
              
              // Use smart mapping function as fallback if fields still not found
              if (!fatherName || !bloodGroup || !program || !category || !batch || !address) {
                const mapped = mapToTemplateFields(row);
                if (!fatherName && mapped.fatherName) fatherName = mapped.fatherName;
                if (!bloodGroup && mapped.bloodGroup) bloodGroup = mapped.bloodGroup;
                if (!program && mapped.program) program = mapped.program;
                if (!category && mapped.category) category = mapped.category;
                if (!batch && mapped.batch) batch = mapped.batch;
                if (!address && mapped.address) address = mapped.address;
                if (!photo && mapped.photo) photo = mapped.photo;
              }

              // Resolve photo filename to data URI if found in zipFilesMap
              if (photo && !/^https?:\/\//i.test(photo) && !/^data:image\//i.test(photo) && zipFilesMap) {
                try {
                  const basePhoto = path.basename(photo).toLowerCase();
                  const match = zipFilesMap[photo.toLowerCase()] || zipFilesMap[basePhoto];
                  if (match && match.buffer) {
                    const b64 = Buffer.from(match.buffer).toString('base64');
                    photo = `data:image/${match.extension};base64,${b64}`;
                  }
                } catch (e) { /* ignore */ }
              }

              // avoid duplicates by doing a case-insensitive lookup first
              const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const existing = await Student.findOne({ roll: { $regex: `^${escapeRegExp(roll)}$`, $options: 'i' } });
              const setFields = { 
                name, 
                fatherName: fatherName || undefined,
                bloodGroup: bloodGroup || undefined,
                mobile,
                program: program || undefined,
                address: address || undefined,
                category: category || undefined,
                batch: batch || undefined,
                email, 
                photo: photo || undefined, 
                originalArr: rowObj.arr, 
                originalObj: rowObj.obj, 
                originalHeaders: headers,
                importOrder: i
              };
              if (existing) {
                const updateObj = { $set: { ...setFields, roll } };
                if (electionObjectId) updateObj.$addToSet = { elections: electionObjectId };
                else updateObj.$set = { ...(updateObj.$set || {}), masterList: true };
                await Student.updateOne({ _id: existing._id }, updateObj);
              } else {
                const createObj = { roll, ...setFields, registeredAt: new Date(), voted: false };
                if (electionObjectId) createObj.elections = [electionObjectId];
                // when no electionObjectId provided this is an import into the global master list
                createObj.masterList = !electionObjectId;
                await Student.create(createObj);
              }
              imported++;
              // auto-send OTP removed
            } catch (e) { console.error('import error', e); }
          } else {
            skipped++;
            // Sanitize row for JSON response — strip large values (e.g. base64 photos)
            const safeRow = {};
            try {
              for (const k of Object.keys(row)) {
                const v = row[k];
                const s = v == null ? '' : String(v);
                safeRow[k] = s.length > 200 ? s.slice(0, 200) + '…' : s;
              }
            } catch (_) { /* ignore */ }
            skippedRows.push({ rowIndex: i, errors, row: safeRow });
          }
        }
      }
    }

    // log admin action
    try {
      await AdminAction.create({ admin: req.admin?.aid, action: 'import-students', details: { imported, skipped, totalRows: rawRows.length }, ip: req.ip });
      console.log(`✓ Import completed: imported=${imported}, skipped=${skipped}, totalRowsInFile=${rawRows.length}`);
    } catch (e) { console.warn('Failed to log admin action', e.message || e); }

    // if preview, return parsed rows without writing to DB
    if (previewFlag) {
      // Filter to show only rows that have some non-empty cell content.
      // We no longer hide rows just because roll/name detection failed, so that
      // admins can see what the parser saw even for invalid rows.
      const nonEmptyRows = previewData.rows.filter(r => {
        const hasAnyCell = Array.isArray(r.arr) && r.arr.some(c => String(c || '').trim() !== '');
        return hasAnyCell;
      });
      // limit rows returned in preview to previewLimit (Infinity allowed for 'all')
      const limited = previewLimit === Infinity ? nonEmptyRows : nonEmptyRows.slice(0, previewLimit);
      
      // Optimise preview payload: replace large base64 photos with small thumbnails
      // Full base64 photos can be 200-700KB each; with 76+ rows this blows up the response.
      // We keep a small portion (first 4KB of base64 ≈ 3KB image) for a tiny preview,
      // and set hasPhoto flag so the frontend knows a photo exists.
      const MAX_PREVIEW_PHOTO_LEN = 6000; // ~4KB base64 → enough for a tiny thumbnail
      for (const row of limited) {
        const p = row.extracted?.photo;
        if (p && p.startsWith('data:image/')) {
          row.extracted.hasPhoto = true;
          if (p.length > MAX_PREVIEW_PHOTO_LEN) {
            // Keep the full photo — the frontend will display it as an <img>
            // But to prevent massive payloads, keep only the photo for display
            // Leave it as is; the JSON limit is now 50MB so it should be fine
          }
        }
        // Also strip base64 data URIs from the raw arr cells to save bandwidth
        if (Array.isArray(row.arr)) {
          for (let ci = 0; ci < row.arr.length; ci++) {
            const cell = String(row.arr[ci] || '');
            if (cell.startsWith('data:image/') && cell.length > 200) {
              row.arr[ci] = '[photo]';
            }
          }
        }
      }

      const photosFound = limited.filter(r => r.extracted?.hasPhoto || (r.extracted?.photo && r.extracted.photo.startsWith('data:image/'))).length;
      console.log(`[PREVIEW] Returning ${limited.length} rows, ${photosFound} with photos`);
      
      return res.json({ success: true, preview: { headers: previewData.headers, rows: limited }, totalParsed: nonEmptyRows.length, totalWithEmpty: previewData.rows.length });
    }

    // notify connected frontends that master list changed so they can re-sync
    try {
      const io = req.app.get('io');
      if (io) io.emit('master_list_updated', { imported, skipped, at: new Date().toISOString() });
    } catch (e) { console.warn('Failed to emit master_list_updated', e.message || e); }

    // Auto-sync photos to existing voter records after import
    let photosSynced = 0;
    try {
      const voters = await Voter.find({
        identifierRaw: { $exists: true, $ne: null, $ne: '' }
      });
      for (const voter of voters) {
        try {
          const r = String(voter.identifierRaw).trim();
          const escRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const student = await Student.findOne({
            roll: { $regex: `^${escRegExp(r)}$`, $options: 'i' }
          }).select('photo').lean();
          if (student && student.photo && student.photo !== voter.photoUrl) {
            voter.photoUrl = student.photo;
            await voter.save();
            photosSynced++;
          }
        } catch (_) { /* skip individual voter errors */ }
      }
      if (photosSynced > 0) console.log(`[PHOTO-SYNC] Auto-synced ${photosSynced} voter photos after import`);
    } catch (syncErr) {
      console.warn('[PHOTO-SYNC] Auto-sync after import failed:', syncErr.message || syncErr);
    }

    try {
      res.json({ success: true, imported, skipped, photosSynced, skippedRows: skippedRows.length > 0 ? skippedRows.slice(0, 10) : [] });
    } catch (jsonErr) {
      console.error('Failed to serialize import response:', jsonErr.message || jsonErr);
      // Fallback: return without skippedRows detail
      res.json({ success: true, imported, skipped, skippedRows: [] });
    }
  } catch (e) {
    // Log full stack for debugging and return the error message to the client
    console.error('ADMIN IMPORT ERROR', e && e.stack ? e.stack : e);
    const msg = (e && e.message) ? e.message : 'Server error';
    res.status(500).json({ success: false, message: msg });
  }
});

// Admin: list students with optional search & pagination
router.get('/students', adminAuth, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 50 } = req.query;
    const filter = {};
    // optional election filter: accept ObjectId string or election title
    let electionId = req.query.electionId || null;
    if (electionId && electionId !== 'all' && electionId !== '') {
      if (mongoose.isValidObjectId(electionId)) {
        filter.elections = new mongoose.Types.ObjectId(String(electionId));
      } else {
        const found = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, $options: 'i' } });
        if (found) filter.elections = found._id;
        else return res.status(400).json({ success: false, message: 'Invalid electionId or election title not found' });
      }
    }
    // When electionId is 'all' or empty, include ALL students (both masterList and election-specific)
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { roll: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const total = await Student.countDocuments(filter);
    // Prefer explicit importOrder (when present) so lists mirror file row order.
    // Fall back to _id (insertion order) which also mirrors file order for bulk imports.
    // Exclude heavy fields that aren't needed for the list view.
    // originalArr / originalObj store full row data, photo stores base64 images –
    // together they can push documents above MongoDB's 32 MB sort-memory cap.
    const items = await Student.find(filter)
      .select('-originalArr -originalObj -originalHeaders -photo')
      .sort({ importOrder: 1, _id: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Instead of sending full base64 photos (avg ~700KB each) in the list response,
    // just check which students have a photo and set a boolean flag.
    // The frontend can fetch individual photos via GET /students/:roll/photo.
    if (items.length > 0) {
      const ids = items.map(s => s._id);
      const photoDocs = await Student.find({ _id: { $in: ids }, photo: { $exists: true, $ne: '' } })
        .select('_id')
        .lean();
      const hasPhotoSet = new Set(photoDocs.map(p => String(p._id)));
      for (const s of items) {
        s.hasPhoto = hasPhotoSet.has(String(s._id));
      }
    }
    // Debug logging
    try { console.log(`Students fetch: total=${total}, returned=${items.length}, page=${page}, limit=${limit}, election=${electionId}`); } catch (e) {}
    res.json({ success: true, total, items });
  } catch (e) {
    console.error('Students fetch error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: get student photo (returns base64 data URI or redirect to URL)
router.get('/students/:roll/photo', adminAuth, async (req, res) => {
  try {
    const escaped = req.params.roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const student = await Student.findOne({ roll: { $regex: `^${escaped}$`, $options: 'i' } }).select('photo').lean();
    if (!student || !student.photo) return res.status(404).json({ success: false, message: 'No photo' });
    // If it's a data URI, extract and send as binary image for efficiency
    const m = student.photo.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (m) {
      const ext = m[1] === 'image' ? 'png' : m[1]; // normalise "image/image" → png
      const buf = Buffer.from(m[2], 'base64');
      res.set('Content-Type', `image/${ext}`);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    }
    // If it's a URL, just redirect
    if (/^https?:\/\//.test(student.photo)) return res.redirect(student.photo);
    // fallback: return as JSON
    res.json({ success: true, photo: student.photo });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: update student (mark/unmark voted, edit contact)
router.patch('/students/:roll', adminAuth, async (req, res) => {
  try {
    const roll = req.params.roll;
    const updates = {};
    const allowed = ['name', 'email', 'mobile', 'voted', 'fatherName', 'address', 'bloodGroup', 'program', 'category', 'batch', 'photo'];
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    const escaped = roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await Student.findOneAndUpdate({ roll: { $regex: `^${escaped}$`, $options: 'i' } }, { $set: updates }, { new: true });
    if (!result) return res.status(404).json({ success: false, message: 'Student not found' });
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'update-student', details: { roll, updates }, ip: req.ip }); } catch(_){}
    res.json({ success: true, student: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: delete student
router.delete('/students/:roll', adminAuth, async (req, res) => {
  try {
    const roll = req.params.roll;
    const escaped = roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await Student.findOneAndDelete({ roll: { $regex: `^${escaped}$`, $options: 'i' } });
    if (!result) return res.status(404).json({ success: false, message: 'Student not found' });
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'delete-student', details: { roll }, ip: req.ip }); } catch(_){}
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: bulk delete students by rolls
router.post('/students/bulk-delete', adminAuth, async (req, res) => {
  try {
    const { rolls } = req.body;
    if (!Array.isArray(rolls) || rolls.length === 0) return res.status(400).json({ success: false, message: 'rolls array required' });
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const or = rolls.map(r => ({ roll: { $regex: `^${escapeRegExp(String(r))}$`, $options: 'i' } }));
    const result = await Student.deleteMany({ $or: or });
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'bulk-delete-students', details: { count: result.deletedCount, rolls }, ip: req.ip }); } catch(_) {}
    res.json({ success: true, deleted: result.deletedCount });
  } catch (e) {
    console.error('bulk delete error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: remove or delete students associated with an election
// DELETE /students/by-election/:electionId?mode=remove|delete&deleteOrphans=1
router.delete('/students/by-election/:electionId', adminAuth, async (req, res) => {
  try {
    let electionId = req.params.electionId;
    if (!electionId) return res.status(400).json({ success: false, message: 'electionId required' });
    if (electionId && (electionId === 'null' || electionId === 'undefined')) electionId = null;
    let electionObjectId = null;
    if (mongoose.isValidObjectId(electionId)) {
      electionObjectId = new mongoose.Types.ObjectId(String(electionId));
      const found = await Election.findById(electionObjectId);
      if (!found) return res.status(400).json({ success: false, message: 'electionId not found' });
    } else {
      const foundByTitle = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, $options: 'i' } });
      if (foundByTitle) electionObjectId = foundByTitle._id;
      else return res.status(400).json({ success: false, message: 'Invalid electionId or election title not found' });
    }

    const mode = (req.query.mode || 'remove');
    if (mode === 'remove') {
      // pull the election id out of students.elections
      const updateRes = await Student.updateMany({ elections: electionObjectId }, { $pull: { elections: electionObjectId } });
      let orphanDeleted = 0;
      if (req.query.deleteOrphans === '1' || req.query.deleteOrphans === 'true') {
        const delRes = await Student.deleteMany({ $or: [ { elections: { $exists: false } }, { elections: { $size: 0 } } ] });
        orphanDeleted = delRes.deletedCount || 0;
      }
      try { await AdminAction.create({ admin: req.admin?.aid, action: 'remove-election-from-students', details: { updated: updateRes.modifiedCount || updateRes.nModified || 0, orphanDeleted }, ip: req.ip }); } catch(_) {}
      return res.json({ success: true, updated: updateRes.modifiedCount || updateRes.nModified || 0, orphanDeleted });
    } else if (mode === 'delete') {
      const delRes = await Student.deleteMany({ elections: electionObjectId });
      try { await AdminAction.create({ admin: req.admin?.aid, action: 'delete-students-by-election', details: { deleted: delRes.deletedCount }, ip: req.ip }); } catch(_) {}
      return res.json({ success: true, deleted: delRes.deletedCount });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid mode; use remove or delete' });
    }
  } catch (e) {
    console.error('by-election delete error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: trigger OTP to a student by roll (sends to student's email or mobile)
router.post('/students/:roll/send-otp', adminAuth, async (req, res) => {
  try {
    const roll = req.params.roll;
    const escaped = roll.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const student = await Student.findOne({ roll: { $regex: `^${escaped}$`, $options: 'i' } });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const contact = student.email || student.mobile;
    if (!contact) return res.status(400).json({ success: false, message: 'No contact (email or mobile) on record for this student' });
    // use roll as identifier for OTP hashing so student can verify with roll
    const result = await requestOTP(student.roll, contact);
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'send-otp-student', details: { roll: student.roll, contact }, ip: req.ip }); } catch(_){ }
    res.json({ success: true, message: 'OTP triggered', expiresAt: result.expiresAt });
  } catch (e) {
    console.error('Admin send-otp error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: export students as CSV stream (supports large exports)
router.get('/students/export', adminAuth, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="voters_export.csv"');

    // fetch all students to determine header ordering based on original uploaded rows
    const items = await Student.find().sort({ roll: 1 }).lean();

    // build header order: prefer originalHeaders from uploads
    let headerOrder = [];
    for (const it of items) {
      if (Array.isArray(it.originalHeaders) && it.originalHeaders.length > 0) {
        if (headerOrder.length === 0) headerOrder = [...it.originalHeaders];
        else {
          for (const h of it.originalHeaders) if (!headerOrder.includes(h)) headerOrder.push(h);
        }
      }
    }

    // if no originalHeaders present, but there are originalArr entries, create Col 1..N header
    if (headerOrder.length === 0) {
      let maxCols = 0;
      for (const it of items) if (Array.isArray(it.originalArr)) maxCols = Math.max(maxCols, it.originalArr.length);
      if (maxCols > 0) {
        for (let i = 0; i < maxCols; i++) headerOrder.push(`Col ${i+1}`);
      }
    }

    // ensure canonical columns are present (but keep original order first)
    const canonical = ['roll','name','email','mobile','voted'];
    for (const c of canonical) if (!headerOrder.includes(c)) headerOrder.push(c);

    // write header
    res.write(headerOrder.map(h => `"${String(h).replace(/"/g,'""')}"`).join(',') + '\n');

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    };

    for (const doc of items) {
      const rowVals = [];
      for (const h of headerOrder) {
        let val = '';
        if (doc.originalObj && Object.prototype.hasOwnProperty.call(doc.originalObj, h)) {
          val = doc.originalObj[h];
        } else if (Array.isArray(doc.originalArr) && /^Col (\d+)$/i.test(h)) {
          const idx = Number(h.split(' ')[1]) - 1;
          val = doc.originalArr[idx];
        } else if (h === 'roll') val = doc.roll;
        else if (h === 'name') val = doc.name;
        else if (h === 'email') val = doc.email;
        else if (h === 'mobile') val = doc.mobile;
        else if (h === 'voted') val = doc.voted ? 1 : 0;
        rowVals.push(escape(val));
      }
      const rowLine = rowVals.join(',') + '\n';
      if (!res.write(rowLine)) await new Promise((r) => res.once('drain', r));
    }
    res.end();
  } catch (e) {
    console.error('Export error', e);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// WhatsApp connection status endpoint (for admin dashboard)
router.get('/whatsapp-status', async (req, res) => {
  try {
    const status = getWhatsAppStatus();
    res.json({
      success: true,
      connected: status.connected,
      hasQR: !!status.qrCode,
      message: status.connected 
        ? 'WhatsApp is connected and ready to send OTPs' 
        : (status.qrCode ? 'Scan QR code to connect WhatsApp' : 'WhatsApp initializing or not available')
    });
  } catch (e) {
    console.error('WhatsApp status error:', e);
    res.status(500).json({ success: false, message: 'Failed to get WhatsApp status' });
  }
});

// WhatsApp QR code image endpoint (for admin to scan)
router.get('/whatsapp-qr', async (req, res) => {
  try {
    const status = getWhatsAppStatus();
    
    if (status.connected) {
      return res.status(200).json({ 
        success: true, 
        connected: true, 
        message: 'WhatsApp already connected! No QR needed.' 
      });
    }
    
    if (!status.qrCode) {
      return res.status(202).json({ 
        success: false, 
        connected: false,
        message: 'QR code not yet available. Please wait and refresh in a few seconds.' 
      });
    }
    
    // Generate QR code as base64 data URL
    const qrDataUrl = await QRCode.toDataURL(status.qrCode, {
      width: 300,
      margin: 2,
      color: {
        dark: '#25D366', // WhatsApp green
        light: '#FFFFFF'
      }
    });
    
    res.json({
      success: true,
      connected: false,
      qrCode: qrDataUrl,
      qrRaw: status.qrCode,
      message: 'Scan this QR code with WhatsApp to connect'
    });
  } catch (e) {
    console.error('WhatsApp QR error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
});

// Disconnect WhatsApp (remove connected device)
router.post('/whatsapp-disconnect', async (req, res) => {
  try {
    await disconnectWhatsApp();
    res.json({ 
      success: true, 
      message: 'WhatsApp disconnected successfully. You can now scan a new QR code to reconnect.' 
    });
  } catch (e) {
    console.error('WhatsApp disconnect error:', e);
    res.status(500).json({ success: false, message: 'Failed to disconnect WhatsApp' });
  }
});

// Reconnect/reinitialize WhatsApp
router.post('/whatsapp-reconnect', async (req, res) => {
  try {
    await reconnectWhatsApp();
    const status = getWhatsAppStatus();
    res.json({ 
      success: true, 
      connected: status.connected,
      hasQR: !!status.qrCode,
      message: status.connected 
        ? 'WhatsApp reconnected successfully' 
        : 'WhatsApp reinitializing. Check for QR code.'
    });
  } catch (e) {
    console.error('WhatsApp reconnect error:', e);
    res.status(500).json({ success: false, message: 'Failed to reconnect WhatsApp' });
  }
});

// Batch sync voter photos from Student records
// Updates voters from matching student photo. Use force=true to overwrite existing voter photos.
router.post('/sync-voter-photos', adminAuth, async (req, res) => {
  try {
    const force = req.body.force === true || req.body.force === 'true';
    
    // Find voters — if force, get ALL voters with a roll; otherwise only those without photo
    const query = { identifierRaw: { $exists: true, $ne: null, $ne: '' } };
    if (!force) {
      query.$or = [{ photoUrl: null }, { photoUrl: '' }, { photoUrl: { $exists: false } }];
    }
    const voters = await Voter.find(query);
    
    let synced = 0;
    let skipped = 0;
    let noPhoto = 0;
    
    for (const voter of voters) {
      try {
        const r = String(voter.identifierRaw).trim();
        const escRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const student = await Student.findOne({ 
          roll: { $regex: `^${escRegExp(r)}$`, $options: 'i' } 
        }).select('photo').lean();
        
        if (student && student.photo) {
          voter.photoUrl = student.photo;
          await voter.save();
          synced++;
        } else {
          noPhoto++;
        }
      } catch (e) {
        skipped++;
      }
    }
    
    console.log(`[PHOTO-SYNC] Batch sync complete: ${synced} synced, ${noPhoto} no photo found, ${skipped} errors (force=${force})`);
    res.json({ 
      success: true, 
      message: `Photo sync complete`, 
      total: voters.length,
      synced, 
      noPhoto, 
      skipped 
    });
  } catch (e) {
    console.error('PHOTO SYNC ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
