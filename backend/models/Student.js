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
  // optional per-import row ordering so admin lists can mirror file order when desired
  importOrder: { type: Number },
}, { timestamps: true });

// Compound index used by the GET /students list query (sort by importOrder, _id).
// _id fallback preserves insertion order which mirrors file row order.
studentSchema.index({ importOrder: 1, _id: 1 });
// Index for election-scoped queries
studentSchema.index({ elections: 1 });

export default mongoose.model('Student', studentSchema);
