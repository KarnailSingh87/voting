import mongoose from 'mongoose';

const adminActionSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  action: { type: String, required: true },
  details: { type: Object },
  ip: { type: String },
}, { timestamps: true });

export default mongoose.model('AdminAction', adminActionSchema);
