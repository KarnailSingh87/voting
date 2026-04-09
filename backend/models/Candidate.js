import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  party: { type: String, required: true },
  manifesto: { type: String },
  photoUrl: { type: String },
  election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  voteCount: { type: Number, default: 0 },
  onChainIndex: { type: Number },
  onChainTxHash: { type: String }
}, { timestamps: true });

export default mongoose.model('Candidate', candidateSchema);
