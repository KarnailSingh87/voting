import mongoose from 'mongoose';

const electionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['scheduled','ongoing','ended'], default: 'scheduled' },
  // importConcepts stores default mapping/suggestions for importing voters for this election
  importConcepts: {
    rollField: { type: String, default: 'roll' },
    nameField: { type: String, default: 'name' },
    emailField: { type: String, default: 'email' },
    mobileField: { type: String, default: 'mobile' },
    photoField: { type: String, default: '' },
    // any additional mappings can be stored here
    other: { type: mongoose.Schema.Types.Mixed, default: undefined }
  },
  onChainIndex: { type: Number },
  onChainTxHash: { type: String }
}, { timestamps: true });

export default mongoose.model('Election', electionSchema);
