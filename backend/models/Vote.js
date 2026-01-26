import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
  voteHash: { type: String, required: true, unique: true },
  election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' }, // Optional: keep anonymous if needed, but useful for audit
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Vote', voteSchema);
