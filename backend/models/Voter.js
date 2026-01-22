import mongoose from 'mongoose';

const voterSchema = new mongoose.Schema({
  aadhaarHash: { type: String, required: true, unique: true }, // SHA-256 hash
  name: { type: String, required: true },
  mobile: { type: String },
  email: { type: String },
  hasVoted: { type: Boolean, default: false },
  lastOTPRequestedAt: { type: Date },
  verifiedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model('Voter', voterSchema);
