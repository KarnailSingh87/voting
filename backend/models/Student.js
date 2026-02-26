import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  roll: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  fatherName: { type: String },
  bloodGroup: { type: String },
  mobile: { type: String },
  program: { type: String },
  address: { type: String },
  category: { type: String },
  batch: { type: String },
  photo: { type: String },
  email: { type: String },
  voted: { type: Boolean, default: false },
  registeredAt: { type: Date, default: Date.now },
  // preserve original uploaded row so exports can mirror the original file layout
  originalArr: { type: [String], default: undefined }, // headerless rows as array
  originalObj: { type: mongoose.Schema.Types.Mixed, default: undefined }, // when file had headers
  originalHeaders: { type: [String], default: undefined }, // header ordering when available
  // references to elections this student is associated with (optional)
  elections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Election' }],
  // whether this student belongs to the global master voter list (not tied to a specific election)
  masterList: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Student', studentSchema);
