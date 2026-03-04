import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import voterAuth from '../middleware/voterAuth.js';
import Voter from '../models/Voter.js';
import Candidate from '../models/Candidate.js';
import Election from '../models/Election.js';
import Student from '../models/Student.js';
import Vote from '../models/Vote.js';

const router = express.Router();

router.post('/cast', voterAuth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { candidateId } = req.body;
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
    // Fallback for legacy data without history array
    if (voter.hasVoted && (!voter.history || voter.history.length === 0)) {
       // assumes single election system if history is empty but hasVoted is true
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
    const newVote = new Vote({
      voteHash,
      election: election._id,
      candidate: candidate._id,
      timestamp: now
    });
    await newVote.save({ session });

    // Add to voter history
    voter.history.push({
      electionId: election._id,
      candidateName: candidate.name,
      voteHash: voteHash,
      timestamp: now
    });

    // also mark master list Student record as voted if we can map
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
    // Emit for Admin Dashboard
    io.emit('vote_cast', { candidateId: candidate._id.toString(), voteCount: candidate.voteCount });
    // Emit for Public Dashboard
    io.emit('voteUpdate', { 
      voteHash: newVote.voteHash, 
      timestamp: newVote.timestamp 
    });

    return res.json({ message: 'Vote cast', candidateId: candidate._id, voteCount: candidate.voteCount, voteHash });
  } catch (e) {
    console.error(e);
    try { await session.abortTransaction(); } catch {}
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

export default router;
