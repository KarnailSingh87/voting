// Script to upload voter photos to Cloudinary and map URLs to voter IDs
// Place this file in scripts/upload_voter_photos.js

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const cloudinary = require('cloudinary').v2;

// TODO: Set your Cloudinary credentials here or use environment variables
cloudinary.config({
  cloud_name: 'YOUR_CLOUD_NAME',
  api_key: 'YOUR_API_KEY',
  api_secret: 'YOUR_API_SECRET',
});

// CONFIGURE THESE PATHS
const EXCEL_FILE = path.join(__dirname, 'voters.xlsx'); // Path to your Excel file
const PHOTOS_DIR = path.join(__dirname, 'photos'); // Folder with voter photos
const OUTPUT_FILE = path.join(__dirname, 'voter_photo_urls.json');

// CONFIGURE THESE COLUMN NAMES
const VOTER_ID_COL = 'roll_number'; // Unique voter ID column in Excel
const PHOTO_FILE_COL = 'photo_filename'; // Photo filename column in Excel

async function uploadPhotos() {
  const workbook = xlsx.readFile(EXCEL_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  const result = {};

  for (const row of data) {
    const voterId = row[VOTER_ID_COL];
    const photoFile = row[PHOTO_FILE_COL];
    if (!voterId || !photoFile) continue;
    const photoPath = path.join(PHOTOS_DIR, photoFile);
    if (!fs.existsSync(photoPath)) {
      console.warn(`Photo not found: ${photoPath}`);
      continue;
    }
    try {
      const uploadRes = await cloudinary.uploader.upload(photoPath, {
        folder: 'voters',
        public_id: voterId,
        overwrite: true,
      });
      result[voterId] = uploadRes.secure_url;
      console.log(`Uploaded ${photoFile} for ${voterId}`);
    } catch (err) {
      console.error(`Failed to upload ${photoFile}:`, err.message);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`Done! Mapping saved to ${OUTPUT_FILE}`);
}

uploadPhotos();
