import express from 'express';
import rateLimit from 'express-rate-limit';
import udiService from '../config/udiService.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Student from '../models/Student.js';
import IdentityReport from '../models/IdentityReport.js';
import Vote from '../models/Vote.js';
import Voter from '../models/Voter.js';
import {
  validateChain,
  validateElectionChain,
  findBlockByVoteHash,
  getChainStats,
  getRecentBlocks,
  getElectionBlocks,
} from '../services/blockchainService.js';
import {
  verifyVoteOnChain,
  verifyTransaction,
  getWeb3Status,
  getElectionResults as getOnChainResults,
} from '../services/web3Service.js';

const router = express.Router();

// Aadhaar lookup endpoint (uses UDI service when configured)
// POST /api/aadhaar-lookup { aadhaar }
const lookupLimiter = rateLimit({
  windowMs: Number(process.env.UDI_RATE_WINDOW_MS || 60_000), // 1 minute
  max: Number(process.env.UDI_RATE_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
});

// limiter for public student list (avoid scraping)
const studentListLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/aadhaar-lookup', lookupLimiter, async (req, res) => {
  try {
    const { aadhaar } = req.body;
    if (!aadhaar || typeof aadhaar !== 'string') return res.status(400).json({ success: false, message: 'aadhaar required' });

    const result = await udiService.lookup(aadhaar);
    if (result.success) return res.json({ success: true, name: result.name, cached: !!result.cached, mock: !!result.mock });
    // If UDI call failed, return error message
    return res.status(502).json({ success: false, message: result.message || 'Lookup failed' });
  } catch (e) {
    console.error('AADHAAR LOOKUP ERROR', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Student lookup endpoint - POST /api/student-lookup { roll }
router.post('/student-lookup', lookupLimiter, async (req, res) => {
  try {
    const { roll } = req.body;
    if (!roll || typeof roll !== 'string') return res.status(400).json({ success: false, message: 'roll required' });
    // match roll: prefer an indexed exact match first (fast). Only fall back to a
    // case-insensitive regex scan if exact match fails. Regex scans can be slow on
    // large collections and cause the frontend to hang showing "Verifying roll number...".
    const r = roll.trim();
    // Try an indexed exact lookup first. This will use the unique index on `roll`.
    let student = await Student.findOne({ roll: r }).lean();
    if (!student) {
      // If not found, fall back to case-insensitive match (covers case variations)
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      student = await Student.findOne({ roll: { $regex: `^${escapeRegExp(r)}$`, $options: 'i' } }).lean();
    }
    if (!student) return res.status(404).json({ success: false, message: 'Not found' });
    // Return richer student data so frontends can display photo and any original upload fields
    const payload = {
      roll: student.roll,
      name: student.name,
      email: student.email,
      mobile: student.mobile,
      photo: student.photo,
      voted: student.voted,
      registeredAt: student.registeredAt,
      originalObj: student.originalObj,
      originalArr: student.originalArr,
      originalHeaders: student.originalHeaders,
    };
    // keep older responses compatible by exposing name/top-level fields too
    return res.json({ success: true, student: payload, name: student.name, email: student.email, mobile: student.mobile });
  } catch (e) {
    console.error('STUDENT LOOKUP ERROR', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Report identity mismatch ("Not me / Report")
// POST /api/report-identity { roll, detectedName, reason?, contactProvided?, phone?, message? }
router.post('/report-identity', lookupLimiter, async (req, res) => {
  try {
    const { roll, detectedName, reason = 'mismatch', contactProvided, phone, message } = req.body;
  if (!roll || !detectedName) return res.status(400).json({ success: false, message: 'roll and detectedName required' });
  // Require phone and message to ensure admins can contact and have context
  if (!phone || !String(phone).trim()) return res.status(400).json({ success: false, message: 'phone required' });
  // Enforce 10-digit local phone format (digits only). This mirrors client-side validation.
  if (!/^\d{10}$/.test(String(phone).trim())) return res.status(400).json({ success: false, message: 'phone must be 10 digits' });
  if (!message || !String(message).trim()) return res.status(400).json({ success: false, message: 'message required' });
    const r = String(roll).trim();
    const report = await IdentityReport.create({
      roll: r,
      detectedName: String(detectedName),
      reason: String(reason),
      contactProvided: contactProvided ? String(contactProvided) : undefined,
      phone: phone ? String(phone) : undefined,
      userMessage: message ? String(message) : undefined,
      reporterIp: req.ip,
    });
    return res.json({ success: true, message: 'Report saved', id: report._id });
  } catch (e) {
    console.error('REPORT IDENTITY ERROR', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Report missing student record - POST /api/report-missing { roll, contactProvided? }
router.post('/report-missing', lookupLimiter, async (req, res) => {
  try {
    const { roll, contactProvided, phone } = req.body;
    if (!roll) return res.status(400).json({ success: false, message: 'roll required' });
    const r = String(roll).trim();
    // If phone provided, validate it's 10 digits (client expects 10-digit local numbers)
    if (phone && String(phone).trim() && !/^\d{10}$/.test(String(phone).trim())) return res.status(400).json({ success: false, message: 'phone must be 10 digits' });
    const report = await IdentityReport.create({
      roll: r,
      reason: 'missing',
      contactProvided: contactProvided ? String(contactProvided) : undefined,
      phone: phone ? String(phone) : undefined,
      reporterIp: req.ip,
    });
    return res.json({ success: true, message: 'Missing student report saved', id: report._id });
  } catch (e) {
    console.error('REPORT MISSING ERROR', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public list of elections with candidates
router.get('/election', async (req, res) => {
  try {
    const elections = await Election.find().sort({ startTime: 1 });
    const candidateMap = await Candidate.find().then(list => list.reduce((acc,c)=>{ (acc[c.election] ||= []).push(c); return acc; }, {}));
    const data = elections.map(e => ({
      _id: e._id,
      title: e.title,
      description: e.description,
      status: e.status === 'ongoing' ? 'active' : (e.status === 'scheduled' ? 'draft' : (e.status === 'ended' ? 'completed' : e.status)),
      startDate: e.startTime,
      endDate: e.endTime,
      candidates: (candidateMap[e._id]||[]).map(c => ({ id: c._id.toString(), name: c.name, party: c.party, voteCount: c.voteCount, photoUrl: c.photoUrl || null }))
    }));
    // Sort so live/active elections appear first; among live ones, most recently started first
    const rank = (s) => (s === 'active' || s === 'ongoing') ? 0 : (s === 'scheduled' || s === 'draft') ? 1 : 2;
    data.sort((a,b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      // if both live/active, show most recently started first
      if (rank(a.status) === 0 && rank(b.status) === 0) {
        return new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime();
      }
      // otherwise earlier start first
      return new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime();
    });

    res.json({ success: true, elections: data });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public: get single election by id
router.get('/election/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, message: 'election id required' });
    const election = await Election.findById(id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    const candidates = await Candidate.find({ election: election._id }).sort({ voteCount: -1 });
    const totalVotes = candidates.reduce((s, c) => s + (c.voteCount || 0), 0);
  res.json({ success: true, election: { _id: election._id, title: election.title, description: election.description, status: election.status, startDate: election.startTime, endDate: election.endTime, onChainIndex: election.onChainIndex, onChainTxHash: election.onChainTxHash }, candidates: candidates.map(c => ({ id: c._id.toString(), _id: c._id.toString(), name: c.name, party: c.party, voteCount: c.voteCount, photoUrl: c.photoUrl || null, onChainIndex: c.onChainIndex })), totalVotes });
  } catch (e) {
    console.error('public election detail error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public endpoint to fetch master student list (for frontend sync)
// GET /api/students?q=&page=&limit=
router.get('/students', studentListLimiter, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 1000 } = req.query;
    const filter = {};
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { roll: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const items = await Student.find(filter).sort({ roll: 1 }).skip(skip).limit(Number(limit)).select('roll name email mobile voted registeredAt');
    const total = await Student.countDocuments(filter);
    res.json({ success: true, total, items });
  } catch (e) {
    console.error('STUDENT LIST ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public stats for dashboard
router.get('/stats', async (req, res) => {
  try {
    const totalVotes = await Vote.countDocuments();
    // recent votes in last 24 hours
    const recentVotes = await Vote.countDocuments({ timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) } });
    const activeElections = await Election.countDocuments({ status: 'ongoing' });
    const totalVoters = await Student.countDocuments();
    // Attempt to include live connected client count (if Socket.IO instance is available)
    let connectedClients = 0;
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) connectedClients = io.engine?.clientsCount ?? (io.sockets?.sockets?.size ?? 0);
    } catch (e) {
      connectedClients = 0;
    }

    res.json({
      success: true,
      statistics: {
        totalVotes,
        recentVotes,
        activeElections,
        totalVoters,
        connectedClients
      }
    });
  } catch (e) {
    console.error('STATS ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public ledger (latest votes)
router.get('/ledger', async (req, res) => {
  try {
    const limit = 50;
    const votes = await Vote.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('voteHash timestamp blockIndex blockHash')
      .lean();
      
    // Transform to match frontend expectation
    const ledger = votes.map(v => ({
      _id: v.voteHash,
      voteHash: v.voteHash,
      timestamp: v.timestamp,
      confirmationId: 'N/A',
      blockIndex: v.blockIndex ?? null,
      blockHash: v.blockHash ?? null,
    }));
    
    // Include chain stats summary
    let chainStats = null;
    try { chainStats = await getChainStats(); } catch (_) {}
    
    res.json({ success: true, ledger, chainStats });
  } catch (e) {
    console.error('LEDGER ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public ledger filtered by election id with pagination
// GET /api/ledger/:electionId?page=1&limit=50
router.get('/ledger/:electionId', async (req, res) => {
  try {
    const { electionId } = req.params;
    if (!electionId) return res.status(400).json({ success: false, message: 'electionId required' });
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    // Ensure election exists
    const election = await Election.findById(electionId).lean();
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });

    const [total, votes] = await Promise.all([
      Vote.countDocuments({ election: election._id }),
      Vote.find({ election: election._id })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .select('voteHash timestamp candidate voter blockIndex blockHash')
        .lean()
    ]);

    const ledger = votes.map(v => ({
      _id: v.voteHash || v._id,
      voteHash: v.voteHash,
      timestamp: v.timestamp,
      candidate: v.candidate,
      voter: v.voter ? String(v.voter) : undefined,
      blockIndex: v.blockIndex ?? null,
      blockHash: v.blockHash ?? null,
    }));

    res.json({ success: true, total, page, limit, ledger });
  } catch (e) {
    console.error('LEDGER BY ELECTION ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Verify vote by hash — now includes blockchain verification
router.get('/vote/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const vote = await Vote.findOne({ voteHash: hash }).select('voteHash timestamp blockIndex blockHash').lean();
    if (!vote) return res.status(404).json({ success: false, message: 'Vote not found' });
    
    // Look up the blockchain block for this vote (local index)
    let blockchainData = null;
    try {
      const block = await findBlockByVoteHash(hash);
      if (block) {
        blockchainData = {
          blockIndex: block.index,
          blockHash: block.hash,
          previousHash: block.previousHash,
          nonce: block.nonce,
          minedAt: block.timestamp,
        };
      }
    } catch (_) {}

    // Verify on Ethereum/Polygon contract
    let onChainData = null;
    try {
      if (vote.txHash) {
        const txStatus = await verifyTransaction(vote.txHash);
        const contractRecord = await verifyVoteOnChain(vote.voteHash);
        if (txStatus || contractRecord?.found) {
          onChainData = {
            txHash: vote.txHash,
            voterWallet: vote.voterWallet,
            status: txStatus?.status || (contractRecord?.found ? 'success' : 'unknown'),
            blockNumber: txStatus?.blockNumber || null,
            confirmed: !!contractRecord?.found || txStatus?.confirmed,
            contractRecord: contractRecord?.found ? contractRecord : null,
          };
        }
      } else {
        // Just verify contract directly if they didn't supply txHash
        const contractRecord = await verifyVoteOnChain(vote.voteHash);
        if (contractRecord?.found) {
          onChainData = {
            voterWallet: contractRecord.voter,
            status: 'success',
            confirmed: true,
            contractRecord,
          };
        }
      }
    } catch (_) {}

    res.json({ 
      success: true, 
      voteHash: vote.voteHash, 
      timestamp: vote.timestamp,
      blockchain: blockchainData,
      onChain: onChainData,
    });
  } catch (e) {
    console.error('VERIFY VOTE ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── BLOCKCHAIN PUBLIC ENDPOINTS ──────────────────────────────────────

// Get blockchain statistics (local MongoDB chain + Web3 status)
router.get('/blockchain/stats', async (req, res) => {
  try {
    const stats = await getChainStats();
    const web3Status = await getWeb3Status();
    res.json({ success: true, localChain: stats, web3: web3Status });
  } catch (e) {
    console.error('BLOCKCHAIN STATS ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Validate entire blockchain
router.get('/blockchain/validate', async (req, res) => {
  try {
    const result = await validateChain();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('BLOCKCHAIN VALIDATE ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Validate blockchain for a specific election
router.get('/blockchain/validate/:electionId', async (req, res) => {
  try {
    const { electionId } = req.params;
    const result = await validateElectionChain(electionId);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('BLOCKCHAIN VALIDATE ELECTION ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get recent blockchain blocks (public explorer)
router.get('/blockchain/blocks', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const result = await getRecentBlocks(limit, page);
    res.json({ success: true, ...result, page, limit });
  } catch (e) {
    console.error('BLOCKCHAIN BLOCKS ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get blockchain blocks for a specific election
router.get('/blockchain/blocks/:electionId', async (req, res) => {
  try {
    const { electionId } = req.params;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const result = await getElectionBlocks(electionId, limit, page);
    res.json({ success: true, ...result, page, limit });
  } catch (e) {
    console.error('BLOCKCHAIN ELECTION BLOCKS ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Verify a specific block by its hash
router.get('/blockchain/block/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const block = await findBlockByVoteHash(hash);
    if (!block) {
      const Block = (await import('../models/Block.js')).default;
      const byBlockHash = await Block.findOne({ hash }).lean();
      if (!byBlockHash) return res.status(404).json({ success: false, message: 'Block not found' });
      return res.json({ success: true, block: byBlockHash });
    }
    res.json({ success: true, block });
  } catch (e) {
    console.error('BLOCKCHAIN BLOCK LOOKUP ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get election results directly from smart contract
router.get('/blockchain/web3/results/:electionIndex', async (req, res) => {
  try {
    const { electionIndex } = req.params;
    const results = await getOnChainResults(Number(electionIndex));
    if (!results) return res.status(500).json({ success: false, message: 'Web3 not configured or contract unreachable' });
    res.json({ success: true, results });
  } catch (e) {
    console.error('WEB3 ELECTION RESULTS ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

