import express from 'express';
import rateLimit from 'express-rate-limit';
import udiService from '../config/udiService.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';

const router = express.Router();

// Aadhaar lookup endpoint (uses UDI service when configured)
// POST /api/aadhaar-lookup { aadhaar }
const lookupLimiter = rateLimit({
  windowMs: Number(process.env.UDI_RATE_WINDOW_MS || 60_000), // 1 minute
  max: Number(process.env.UDI_RATE_MAX || 20),
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
      candidates: (candidateMap[e._id]||[]).map(c => ({ id: c._id.toString(), name: c.name, party: c.party, voteCount: c.voteCount }))
    }));
    res.json({ success: true, elections: data });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
