// Script to update Student photo field with Cloudinary URLs
// Place this file in scripts/update_student_photos.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Update these as needed
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/voting';
const PHOTO_MAP_FILE = path.join(__dirname, 'voter_photo_urls.json');

// Load mapping: { rollNumber: cloudinaryUrl, ... }
const photoMap = JSON.parse(fs.readFileSync(PHOTO_MAP_FILE, 'utf-8'));

// Student model (minimal)
const studentSchema = new mongoose.Schema({
  roll: String,
  photo: String,
});
const Student = mongoose.model('Student', studentSchema, 'students');

async function updatePhotos() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  let updated = 0, notFound = 0;
  for (const [roll, url] of Object.entries(photoMap)) {
    const res = await Student.updateOne({ roll }, { $set: { photo: url } });
    if (res.matchedCount > 0) updated++;
    else notFound++;
  }
  console.log(`Done. Updated: ${updated}, Not found: ${notFound}`);
  await mongoose.disconnect();
}

updatePhotos().catch(e => { console.error(e); process.exit(1); });
