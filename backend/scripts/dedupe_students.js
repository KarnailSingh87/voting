#!/usr/bin/env node
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import Student from '../models/Student.js';

async function dedupe() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/Voting';
  await connectDB(uri);

  console.log('Scanning students for duplicate rolls (case-insensitive)...');

  // aggregate by lowercased roll to find groups
  const groups = await Student.aggregate([
    { $project: { rollLower: { $toLower: '$roll' }, doc: '$$ROOT' } },
    { $group: { _id: '$rollLower', ids: { $push: '$_id' }, docs: { $push: '$doc' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).allowDiskUse(true);

  if (!groups || groups.length === 0) {
    console.log('No duplicates found.');
    process.exit(0);
  }

  console.log(`Found ${groups.length} duplicate roll groups. Processing...`);

  for (const g of groups) {
    const { ids, docs } = g;
    // pick primary doc: prefer one with most non-empty fields, or the earliest created (smallest _id)
    docs.sort((a, b) => {
      const score = (d) => ((d.name ? 1 : 0) + (d.email ? 1 : 0) + (d.mobile ? 1 : 0) + (Array.isArray(d.elections) ? d.elections.length : 0));
      const sa = score(b) - score(a);
      if (sa !== 0) return sa;
      return a._id.toString().localeCompare(b._id.toString());
    });
    const primary = docs[0];
    const others = docs.slice(1);

    // merge elections and fields
    const mergedElections = new Set((primary.elections || []).map(String));
    for (const o of others) {
      (o.elections || []).forEach(e => mergedElections.add(String(e)));
    }

    const merged = {
      roll: (primary.roll || '').toUpperCase(),
      name: primary.name || (others[0] && others[0].name) || '',
      email: primary.email || (others[0] && others[0].email) || undefined,
      mobile: primary.mobile || (others[0] && others[0].mobile) || undefined,
      fatherName: primary.fatherName || undefined,
      address: primary.address || undefined,
      photo: primary.photo || undefined,
      registeredAt: primary.registeredAt || new Date(),
      voted: primary.voted || false,
      originalArr: primary.originalArr || undefined,
      originalObj: primary.originalObj || undefined,
      originalHeaders: primary.originalHeaders || undefined,
      elections: Array.from(mergedElections).map(id => mongoose.Types.ObjectId(String(id)))
    };

    // update primary
    await Student.updateOne({ _id: primary._id }, { $set: merged });

    // remove others
    const otherIds = others.map(o => o._id);
    await Student.deleteMany({ _id: { $in: otherIds } });

    console.log(`Merged ${others.length + 1} docs for roll '${primary.roll}' -> kept ${primary._id}, removed ${otherIds.length}`);
  }

  console.log('Deduplication complete.');
  process.exit(0);
}

dedupe().catch(err => {
  console.error('Dedupe failed', err);
  process.exit(1);
});
