import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
  voteHash: { type: String, required: true, unique: true },
  election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
  timestamp: { type: Date, default: Date.now },
  // Local blockchain fields (MongoDB-based chain)
  blockIndex: { type: Number },
  blockHash:  { type: String },
  // On-chain (Hardhat/Polygon) fields
  txHash:             { type: String },   // Ethereum transaction hash
  onChainElectionIdx: { type: Number },   // election index in smart contract
  onChainCandidateIdx:{ type: Number },   // candidate index in smart contract
  voterWallet:        { type: String },   // wallet address that signed the tx
}, { timestamps: true });

voteSchema.index({ blockHash: 1 });
voteSchema.index({ txHash: 1 });

export default mongoose.model('Vote', voteSchema);
