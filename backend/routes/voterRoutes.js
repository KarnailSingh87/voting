
import express from 'express';
import crypto from 'crypto';
import { requestOTP, verifyOTP, hashAadhaar } from '../config/otpService.js';
import Voter from '../models/Voter.js';
import Student from '../models/Student.js';
import Candidate from '../models/Candidate.js';
import voterAuth from '../middleware/voterAuth.js';
import jwt from 'jsonwebtoken';
import upload from '../middleware/voterPhotoUpload.js';
import Vote from '../models/Vote.js';

import mongoose from 'mongoose';
import Query from '../models/Query.js';

const router = express.Router();
// Submit a query
router.post('/query', voterAuth, async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (!voter) return res.status(404).json({ success: false, message: 'Voter not found' });
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ success: false, message: 'Subject and message are required' });
    const query = new Query({
      user: voter._id,
      name: voter.name,
      email: voter.email,
      subject,
      message
    });
    await query.save();
    res.status(201).json({ success: true, query });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload voter photo
router.post('/upload-photo', voterAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const voter = await Voter.findById(req.voter.id);
    if (!voter) return res.status(404).json({ success: false, message: 'Voter not found' });
    // Save relative path for frontend access
    voter.photoUrl = `/uploads/voters/${req.file.filename}`;
    await voter.save();
    res.json({ success: true, photoUrl: voter.photoUrl });
  } catch (e) {
    console.error('PHOTO UPLOAD ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get Voting history
router.get('/history', voterAuth, async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id).populate('history.electionId', 'title');
    if (!voter) return res.status(404).json({ message: 'Voter not found' });
    
    const history = await Promise.all((voter.history || []).map(async (h) => {
      let candidateName = h.candidateName || null;
      let candidatePhotoUrl = null;

      // Look up candidate details from Vote model
      if (h.voteHash) {
        try {
          const voteRecord = await Vote.findOne({ voteHash: h.voteHash }).populate('candidate', 'name photoUrl');
          if (voteRecord?.candidate) {
            if (!candidateName && voteRecord.candidate.name) {
              candidateName = voteRecord.candidate.name;
            }
            if (voteRecord.candidate.photoUrl) {
              candidatePhotoUrl = voteRecord.candidate.photoUrl;
            }
          }
        } catch (_) { /* ignore lookup errors */ }
      }

      // If we still don't have photo, try finding candidate by name + election
      if (!candidatePhotoUrl && candidateName && (h.electionId?._id || h.electionId)) {
        try {
          const candidate = await Candidate.findOne({ 
            name: candidateName, 
            election: h.electionId?._id || h.electionId 
          }).select('photoUrl');
          if (candidate?.photoUrl) {
            candidatePhotoUrl = candidate.photoUrl;
          }
        } catch (_) { /* ignore */ }
      }

      return {
        confirmationId: h.voteHash, 
        voteHash: h.voteHash,
        timestamp: h.timestamp,
        electionId: h.electionId?._id || h.electionId,
        election: h.electionId ? { title: h.electionId.title } : { title: 'Unknown Election' },
        candidateName: candidateName || 'N/A',
        candidatePhotoUrl: candidatePhotoUrl || null
      };
    }));

    // Sort by timestamp descending — latest vote on top
    history.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    
    res.json({ success: true, voteHistory: history });
  } catch (e) {
    console.error('HISTORY ERROR', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get voter profile with student details
router.get('/profile', voterAuth, async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id).populate('history.electionId', 'title');
    if (!voter) return res.status(404).json({ success: false, message: 'Voter not found' });

    // Try to get additional details from Student collection using identifierRaw (roll number)
    let studentDetails = null;
    if (voter.identifierRaw) {
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      studentDetails = await Student.findOne({
        roll: { $regex: `^${escapeRegExp(voter.identifierRaw)}$`, $options: 'i' }
      }).lean();
    }

    // Fetch all queries for this voter
    const queries = await Query.find({ user: voter._id }).sort({ createdAt: -1 }).lean();

    // Fetch all identity reports for this roll number
    let reports = [];
    if (voter.identifierRaw) {
      reports = await (await import('../models/IdentityReport.js')).default.find({ roll: voter.identifierRaw }).sort({ createdAt: -1 }).lean();
    }

    // Get photo URL - prefer student photo (always freshest), fall back to voter's own upload
    let photoUrl = studentDetails?.photo || voter.photoUrl || null;
    if (photoUrl && !photoUrl.startsWith('data:') && !photoUrl.startsWith('http') && !photoUrl.startsWith('/')) {
      photoUrl = `/uploads/${photoUrl}`;
    }

    // Build profile response
    const profile = {
      id: voter._id,
      name: voter.name,
      roll: voter.identifierRaw,
      mobile: voter.mobile,
      email: voter.email || studentDetails?.email,
      photoUrl: photoUrl,
      hasVoted: voter.hasVoted,
      verifiedAt: voter.verifiedAt,
      createdAt: voter.createdAt,
      // Additional student details if available
      fatherName: studentDetails?.fatherName,
      program: studentDetails?.program,
      batch: studentDetails?.batch,
      bloodGroup: studentDetails?.bloodGroup,
      address: studentDetails?.address,
      category: studentDetails?.category,
      // Voting statistics
      totalVotes: voter.history?.length || 0,
      votingHistory: (voter.history || []).map(h => ({
        electionId: h.electionId?._id || h.electionId,
        electionTitle: h.electionId?.title || 'Unknown Election',
        candidateName: h.candidateName || 'N/A',
        timestamp: h.timestamp,
        voteHash: h.voteHash
      })),
      queries,
      reports
    };

    res.json({ success: true, profile });
  } catch (e) {
    console.error('PROFILE ERROR', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Request OTP for Aadhaar
router.post('/request-otp', async (req, res) => {
  try {
    // Support both aadhaar and roll as identifier
    // channel: 'whatsapp' (default) or 'email' or 'sms'
    const { aadhaar, roll, name, mobile, email, channel = 'whatsapp' } = req.body;
    const identifier = aadhaar || roll;
    
    // For WhatsApp channel, mobile is required; for email channel, email is required
    if (!identifier || !name) {
      return res.status(400).json({ message: 'identifier (aadhaar or roll) and name required' });
    }
    
    // Validate contact based on channel
    if (channel === 'whatsapp' && !mobile) {
      return res.status(400).json({ message: 'mobile number required for WhatsApp OTP' });
    }
    if (channel === 'email' && !email) {
      return res.status(400).json({ message: 'email required for email OTP' });
    }
    if (!mobile && !email) {
      return res.status(400).json({ message: 'mobile or email required' });
    }
    
    // If this is a roll-based login, enforce that the roll exists in Master List
    if (roll) {
      const r = roll.trim();
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const student = await Student.findOne({ roll: { $regex: `^${escapeRegExp(r)}$`, $options: 'i' } });
      if (!student) return res.status(403).json({ message: 'Access Denied: You are not registered in the voter list' });
    }
    const idHash = hashAadhaar(identifier);
    let voter = await Voter.findOne({ aadhaarHash: idHash });
    if (!voter) {
      voter = await Voter.create({ aadhaarHash: idHash, identifierRaw: identifier, name, mobile, email, lastOTPRequestedAt: new Date() });
    } else {
      voter.lastOTPRequestedAt = new Date();
      // update contact info if provided
      if (mobile) voter.mobile = mobile;
      if (email) voter.email = email;
      voter.identifierRaw = identifier;
      await voter.save();
    }
    
    // Auto-sync photo from Student record if voter has no photo
    if (!voter.photoUrl && identifier) {
      try {
        const r = String(identifier).trim();
        const escRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const student = await Student.findOne({ roll: { $regex: `^${escRegExp(r)}$`, $options: 'i' } }).select('photo').lean();
        if (student && student.photo) {
          voter.photoUrl = student.photo;
          await voter.save();
          console.log(`[PHOTO-SYNC] Auto-synced photo for voter ${identifier}`);
        }
      } catch (photoErr) {
        console.error('[PHOTO-SYNC] Error syncing photo:', photoErr.message);
      }
    }
    
    // Determine contact based on channel preference
    const contact = channel === 'whatsapp' ? mobile : (channel === 'email' ? email : (mobile || email));
    const result = await requestOTP(identifier, contact, channel);
    if (!result.success) return res.status(429).json({ message: 'OTP request throttled or failed' });
    // result may contain contact and contactType (whatsapp|email|sms)
    const { contact: sentContact, contactType } = result || {};
    // mask the contact before returning to client
    const maskEmail = (em) => {
      try {
        const [local, domain] = em.split('@');
        const dparts = domain.split('.');
        const maskedLocal = local.length <= 2 ? local[0] + '*' : local[0] + '*'.repeat(Math.min(3, local.length-1)) + local.slice(-1);
        const maskedDomain = dparts.map((p,i)=> i===0 ? p[0] + '*'.repeat(Math.max(1,p.length-1)) : p).join('.');
        return `${maskedLocal}@${maskedDomain}`;
      } catch (e) { return '****'; }
    };
    const maskPhone = (p) => {
      try {
        const digits = p.replace(/\D/g,'');
        if (digits.length <= 4) return '*'.repeat(digits.length);
        const visibleLast = digits.slice(-3);
        return '*'.repeat(Math.max(0, digits.length - 3)) + visibleLast;
      } catch (e) { return '****'; }
    };
    let maskedContact = undefined;
    if (sentContact) {
      if (contactType === 'email' || sentContact.includes('@')) maskedContact = maskEmail(String(sentContact));
      else maskedContact = maskPhone(String(sentContact)); // handles both 'whatsapp' and 'sms' types
    }
    
    // In development mode, include OTP in response for testing
    const isDev = process.env.NODE_ENV !== 'production';
    const response = { message: 'OTP sent', identifierHash: idHash, sentTo: maskedContact, contactType };
    if (isDev) {
      const { getOTPEntry } = await import('../config/otpService.js');
      const entry = getOTPEntry(identifier);
      if (entry) response.devOTP = entry.otp;
    }
    return res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP and issue JWT
router.post('/verify-otp', async (req, res) => {
  try {
    const { aadhaar, roll, otp } = req.body;
    const identifier = aadhaar || roll;
    if (!identifier || !otp) return res.status(400).json({ message: 'identifier & otp required' });
    const valid = verifyOTP(identifier, otp);
    if (!valid || !valid.success) return res.status(401).json({ message: (valid && valid.message) || 'Invalid or expired OTP' });
    const idHash = hashAadhaar(identifier);
    const voter = await Voter.findOne({ aadhaarHash: idHash });
    if (!voter) return res.status(404).json({ message: 'Voter record missing' });
    voter.verifiedAt = new Date();
    
    // Auto-sync photo from Student record on every login if voter has no photo
    if (!voter.photoUrl && identifier) {
      try {
        const r = String(identifier).trim();
        const escRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const student = await Student.findOne({ roll: { $regex: `^${escRegExp(r)}$`, $options: 'i' } }).select('photo').lean();
        if (student && student.photo) {
          voter.photoUrl = student.photo;
          console.log(`[PHOTO-SYNC] Auto-synced photo for voter ${identifier} on login`);
        }
      } catch (photoErr) {
        console.error('[PHOTO-SYNC] Error syncing photo on login:', photoErr.message);
      }
    }
    
    await voter.save();
    const token = jwt.sign({ vid: voter._id, identifierHash: idHash }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '2h' });
    res.json({ token, voter: { id: voter._id, name: voter.name, hasVoted: voter.hasVoted } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
