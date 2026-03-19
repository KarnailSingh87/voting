import mongoose from 'mongoose';

const identityReportSchema = new mongoose.Schema({
  roll: { type: String, required: true },
  detectedName: { type: String },
  reason: { type: String },
  contactProvided: { type: String },
  phone: { type: String },
  userMessage: { type: String },
  reporterIp: { type: String },
}, { timestamps: true });

export default mongoose.model('IdentityReport', identityReportSchema);
