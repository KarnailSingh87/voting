import mongoose from 'mongoose';

const voterSchema = new mongoose.Schema({
  aadhaarHash: { type: String, required: true, unique: true }, // SHA-256 hash
  identifierRaw: { type: String },
  name: { type: String, required: true },
  mobile: { type: String },
  email: { type: String },
  hasVoted: { type: Boolean, default: false },
  history: [{
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election' },
    voteHash: { type: String },
    timestamp: { type: Date }
  }],
  lastOTPRequestedAt: { type: Date },
  verifiedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model('Voter', voterSchema);
