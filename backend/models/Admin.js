import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['super_admin','election_officer'], default: 'election_officer' }
}, { timestamps: true });

adminSchema.methods.comparePassword = function(pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

export default mongoose.model('Admin', adminSchema);
