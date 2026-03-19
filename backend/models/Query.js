
import mongoose from 'mongoose';

const QuerySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voter',
    required: false
  },
  roll: {
    type: String,
    required: false
  },
  name: {
    type: String,
    required: false
  },
  detectedName: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: false
  },
  // reason field removed
  // contactProvided field removed
  phone: {
    type: String,
    required: false
  },
  subject: {
    type: String,
    required: false
  },
  message: {
    type: String,
    required: false
  },
  ip: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Query = mongoose.model('Query', QuerySchema);
export default Query;
