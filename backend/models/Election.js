import mongoose from 'mongoose';

const electionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['scheduled','ongoing','ended'], default: 'scheduled' }
}, { timestamps: true });

export default mongoose.model('Election', electionSchema);
