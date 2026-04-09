import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import voterAuth from '../middleware/voterAuth.js';
import Voter from '../models/Voter.js';
import Candidate from '../models/Candidate.js';
import Election from '../models/Election.js';
import Student from '../models/Student.js';
import Vote from '../models/Vote.js';
import { addVoteToChain } from '../services/blockchainService.js';
import { verifyTransaction } from '../services/web3Service.js';

const router = express.Router();

/**
 * POST /api/vote/cast
 * Cast a vote. The frontend may optionally include:
 *   - txHash:              MetaMask on-chain transaction hash
 *   - onChainElectionIdx:  election index in the smart contract
 *   - onChainCandidateIdx: candidate index in the smart contract
 *   - voterWallet:         wallet address that signed the tx
 */
router.post('/cast', voterAuth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { candidateId, txHash, onChainElectionIdx, onChainCandidateIdx, voterWallet } = req.body;
    if (!candidateId) return res.status(400).json({ message: 'candidateId required' });

    session.startTransaction();

    const voter = await Voter.findById(req.voter.id).session(session);
    if (!voter) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Voter not found' });
    }
    
    const candidate = await Candidate.findById(candidateId).session(session);
    if (!candidate) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Candidate not found' });
    }
    const election = await Election.findById(candidate.election).session(session);
    if (!election) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Election not found' });
    }

    // Check if already voted in THIS election
    if (voter.history && voter.history.some(h => h.electionId.toString() === election._id.toString())) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'You have already voted in this election' });
    }
    if (voter.hasVoted && (!voter.history || voter.history.length === 0)) {
       await session.abortTransaction();
       return res.status(409).json({ message: 'Voter already cast a vote' });
    }

    const now = new Date();
    if (now < election.startTime || now > election.endTime || election.status !== 'ongoing') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Election not accepting votes' });
    }

    candidate.voteCount += 1;
    voter.hasVoted = true;
    
    // Create Vote record for ledger
    const voteHash = crypto.createHash('sha256').update(`${voter._id}-${candidate._id}-${now.getTime()}-${Math.random()}`).digest('hex');
    
    // ─── LOCAL BLOCKCHAIN: Add vote to MongoDB chain ──────────────────
    let blockData = null;
    try {
      blockData = await addVoteToChain(voteHash, election._id, candidate._id);
    } catch (blockErr) {
      console.error('LOCAL CHAIN ERROR (non-fatal):', blockErr.message || blockErr);
    }

    // ─── Verify on-chain tx if provided ───────────────────────────────
    let verifiedTx = null;
    if (txHash) {
      try {
        verifiedTx = await verifyTransaction(txHash);
      } catch (_) {}
    }

    const newVote = new Vote({
      voteHash,
      election: election._id,
      candidate: candidate._id,
      timestamp: now,
      // Local chain
      blockIndex: blockData?.index ?? null,
      blockHash: blockData?.hash ?? null,
      // On-chain (Hardhat/Polygon)
      txHash: txHash || null,
      onChainElectionIdx: onChainElectionIdx ?? null,
      onChainCandidateIdx: onChainCandidateIdx ?? null,
      voterWallet: voterWallet || null,
    });
    await newVote.save({ session });

    // Add to voter history
    voter.history.push({
      electionId: election._id,
      candidateName: candidate.name,
      voteHash: voteHash,
      timestamp: now
    });

    // Mark Student record as voted
    try {
      if (voter.identifierRaw) {
        const r = voter.identifierRaw.trim();
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await Student.updateOne({ roll: { $regex: `^${escapeRegExp(r)}$`, $options: 'i' } }, { $set: { voted: true } }).session(session);
      }
    } catch (err) {
      console.warn('Failed to mark Student.voted', err.message || err);
    }
    await candidate.save({ session });
    await voter.save({ session });

    await session.commitTransaction();

    const io = req.app.get('io');
    io.emit('vote_cast', { candidateId: candidate._id.toString(), voteCount: candidate.voteCount });
    io.emit('voteUpdate', { 
      voteHash: newVote.voteHash, 
      timestamp: newVote.timestamp,
      blockIndex: blockData?.index ?? null,
      blockHash: blockData?.hash ?? null,
      txHash: txHash || null,
    });

    return res.json({ 
      message: 'Vote cast', 
      candidateId: candidate._id, 
      voteCount: candidate.voteCount, 
      voteHash,
      // Local chain confirmation
      blockchain: blockData ? {
        blockIndex: blockData.index,
        blockHash: blockData.hash,
        previousHash: blockData.previousHash,
        nonce: blockData.nonce,
        minedAt: blockData.timestamp,
      } : null,
      // On-chain confirmation
      onChain: txHash ? {
        txHash,
        verified: verifiedTx?.confirmed ?? false,
        blockNumber: verifiedTx?.blockNumber ?? null,
      } : null,
    });
  } catch (e) {
    console.error(e);
    try { await session.abortTransaction(); } catch {}
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/vote/link-tx
 * Link an on-chain transaction hash to an existing vote record.
 * Called by the frontend after MetaMask tx is mined.
 */
router.post('/link-tx', voterAuth, async (req, res) => {
  try {
    const { voteHash, txHash, voterWallet, onChainElectionIdx, onChainCandidateIdx } = req.body;
    if (!voteHash || !txHash) return res.status(400).json({ message: 'voteHash and txHash required' });

    const vote = await Vote.findOne({ voteHash });
    if (!vote) return res.status(404).json({ message: 'Vote not found' });

    // Verify the tx on-chain
    let verified = null;
    try {
      verified = await verifyTransaction(txHash);
    } catch (_) {}

    vote.txHash = txHash;
    vote.voterWallet = voterWallet || null;
    vote.onChainElectionIdx = onChainElectionIdx ?? null;
    vote.onChainCandidateIdx = onChainCandidateIdx ?? null;
    await vote.save();

    res.json({
      success: true,
      message: 'Transaction linked',
      txHash,
      verified: verified?.confirmed ?? false,
      blockNumber: verified?.blockNumber ?? null,
    });
  } catch (e) {
    console.error('LINK-TX ERROR', e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
