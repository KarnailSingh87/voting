import express from 'express';
import crypto from 'crypto';
import { requestOTP, verifyOTP, hashAadhaar } from '../config/otpService.js';
import Voter from '../models/Voter.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Request OTP for Aadhaar
router.post('/request-otp', async (req, res) => {
  try {
    const { aadhaar, name, mobile, email } = req.body;
    if (!aadhaar || !name || (!mobile && !email)) {
      return res.status(400).json({ message: 'aadhaar, name and (mobile or email) required' });
    }
    const aadhaarHash = hashAadhaar(aadhaar);
    let voter = await Voter.findOne({ aadhaarHash });
    if (!voter) {
      voter = await Voter.create({ aadhaarHash, name, mobile, email, lastOTPRequestedAt: new Date() });
    } else {
      voter.lastOTPRequestedAt = new Date();
      // update contact info if provided
      if (mobile) voter.mobile = mobile;
      if (email) voter.email = email;
      await voter.save();
    }
    const contact = email || mobile;
    const result = await requestOTP(aadhaar, contact);
    if (!result.success) return res.status(429).json({ message: 'OTP request throttled or failed' });
    const dest = email ? 'email' : 'phone';
    return res.json({ message: `OTP sent to your ${dest}`, aadhaarHash });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP and issue JWT
router.post('/verify-otp', async (req, res) => {
  try {
    const { aadhaar, otp } = req.body;
    if (!aadhaar || !otp) return res.status(400).json({ message: 'aadhaar & otp required' });
    const valid = verifyOTP(aadhaar, otp);
    if (!valid) return res.status(401).json({ message: 'Invalid or expired OTP' });
    const aadhaarHash = hashAadhaar(aadhaar);
    const voter = await Voter.findOne({ aadhaarHash });
    if (!voter) return res.status(404).json({ message: 'Voter record missing' });
    voter.verifiedAt = new Date();
    await voter.save();
    const token = jwt.sign({ vid: voter._id, aadhaarHash }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '2h' });
    res.json({ token, voter: { id: voter._id, name: voter.name, hasVoted: voter.hasVoted } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
