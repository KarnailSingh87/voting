import express from 'express';
import mongoose from 'mongoose';
import voterAuth from '../middleware/voterAuth.js';
import Voter from '../models/Voter.js';
import Candidate from '../models/Candidate.js';
import Election from '../models/Election.js';

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
    if (voter.hasVoted) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Voter already cast a vote' });
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

    const now = new Date();
    if (now < election.startTime || now > election.endTime || election.status !== 'ongoing') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Election not accepting votes' });
    }

    candidate.voteCount += 1;
    voter.hasVoted = true;
    await candidate.save({ session });
    await voter.save({ session });

    await session.commitTransaction();

    const io = req.app.get('io');
    io.emit('vote_cast', { candidateId: candidate._id.toString(), voteCount: candidate.voteCount });

    return res.json({ message: 'Vote cast', candidateId: candidate._id, voteCount: candidate.voteCount });
  } catch (e) {
    console.error(e);
    try { await session.abortTransaction(); } catch {}
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

export default router;
