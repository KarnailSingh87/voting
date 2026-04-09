import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema({
  index:        { type: Number, required: true, unique: true },
  timestamp:    { type: Date, required: true, default: Date.now },
  voteHash:     { type: String, required: true },               // SHA-256 hash of the vote
  electionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Election' },
  candidateId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
  previousHash: { type: String, required: true },               // hash of previous block
  hash:         { type: String, required: true, unique: true },  // this block's hash
  nonce:        { type: Number, required: true, default: 0 },   // proof-of-work nonce
  merkleRoot:   { type: String },                               // optional: merkle root if batching
}, { timestamps: true });

// Additional indexes (index and hash already indexed via unique:true)
blockSchema.index({ voteHash: 1 });
blockSchema.index({ electionId: 1, index: 1 });

export default mongoose.model('Block', blockSchema);
