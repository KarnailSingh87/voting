import express from 'express';
import { getWeb3Status } from '../services/web3Service.js';

const router = express.Router();

// GET /api/debug/web3-status
router.get('/web3-status', async (req, res) => {
  try {
    const status = await getWeb3Status();
    res.json({ success: true, status });
  } catch (err) {
    console.error('web3-status error:', err && err.message ? err.message : err);
    res.status(500).json({ success: false, message: err && err.message ? err.message : 'Internal error' });
  }
});

export default router;
