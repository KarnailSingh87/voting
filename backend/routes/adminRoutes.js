import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mongoose from 'mongoose';
import multer from 'multer';
import Admin from '../models/Admin.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Student from '../models/Student.js';
import AdminAction from '../models/AdminAction.js';
import { requestOTP } from '../config/otpService.js';
import { parseFile } from '../config/aiParser.js';

const router = express.Router();

// limit file size to 50MB and accept common spreadsheet/zip types (reject plain text uploads)
const upload = multer({ 
  storage: multer.memoryStorage(),
  // allow larger imports up to 50MB
  limits: { fileSize: 50 * 1024 * 1024 },
  // Accept all file types when ALLOW_ANY_UPLOAD=1 (admins want to upload arbitrary files).
  // Otherwise, restrict to common spreadsheet/archive types to preserve test expectations.
  fileFilter: (req, file, cb) => {
    const allowAny = (process.env.ALLOW_ANY_UPLOAD === '1' || process.env.ALLOW_ANY_UPLOAD === 'true');
    if (allowAny) return cb(null, true);
    const name = (file.originalname || '').toLowerCase();
    const allowed = ['.xls', '.xlsx', '.csv', '.tsv', '.numbers', '.ods', '.zip'];
    const ok = allowed.some(ext => name.endsWith(ext));
    if (!ok) return cb(new Error('Invalid file type'), false);
    cb(null, true);
  }
});

// Seed super admin if none exists (dev convenience)
router.post('/seed-super', async (req, res) => {
  try {
    // align defaults with backend/seedAdmin.js for consistency
    const { username='admin', email='admin@voting.com', password='Admin@123456' } = req.body;
    const existing = await Admin.findOne({ role: 'super_admin' });
    if (existing) return res.status(409).json({ message: 'Super admin already exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, email, passwordHash, role: 'super_admin' });
      // Return created credentials to caller for developer convenience
      res.json({ message: 'Super admin created', id: admin._id, username, email, password });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'username & password required' });
    // allow login by username or email, case-insensitive
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = { $or: [ { username: { $regex: `^${escapeRegExp(username)}$`, $options: 'i' } }, { email: { $regex: `^${escapeRegExp(username)}$`, $options: 'i' } } ] };
    const admin = await Admin.findOne(q);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ aid: admin._id, role: admin.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '4h' });
    res.json({ token, admin: { id: admin._id, role: admin.role, username: admin.username } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Auth middleware inline for brevity
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev_secret');
    req.admin = payload; // aid, role
    next();
  } catch(e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Create election
router.post('/election', adminAuth, async (req, res) => {
  try {
    const { title, description, startDate, endDate, startTime, endTime, candidates, isPublic } = req.body;
    
    // Support both startDate/endDate (from frontend) and startTime/endTime
    const start = startDate || startTime;
    const end = endDate || endTime;
    
    if (!title || !start || !end) {
      return res.status(400).json({ message: 'title, start date/time, and end date/time required' });
    }
    
    // default import concept mappings; allow override via request body.importConcepts
    const defaultImportConcepts = {
      rollField: 'roll',
      nameField: 'name',
      emailField: 'email',
      mobileField: 'mobile',
      photoField: ''
    };
    const importConcepts = req.body.importConcepts && typeof req.body.importConcepts === 'object' ? { ...defaultImportConcepts, ...req.body.importConcepts } : defaultImportConcepts;

    const election = await Election.create({ 
      title, 
      description, 
      startTime: start, 
      endTime: end,
      importConcepts
    });
    
    // If candidates provided, create them
    if (candidates && Array.isArray(candidates)) {
      for (const c of candidates) {
        if (c.name) {
          await Candidate.create({
            election: election._id,
            name: c.name,
            party: c.party || 'Independent',
            manifesto: c.description || ''
          });
        }
      }
    }
    
    res.json({ success: true, election });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// List elections (admin view)
router.get('/election', adminAuth, async (req, res) => {
  try {
    const elections = await Election.find().sort({ startTime: 1 });
    
    // Populate candidates for each election
    const electionsWithCandidates = await Promise.all(
      elections.map(async (election) => {
        const candidates = await Candidate.find({ election: election._id });
        return {
          ...election.toObject(),
          candidates: candidates.map(c => ({
            id: c._id.toString(),
            name: c.name,
            party: c.party,
            description: c.manifesto
          }))
        };
      })
    );
    
    res.json({ success: true, elections: electionsWithCandidates });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update election (allow editing importConcepts and basic fields)
router.patch('/election/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid election id' });
    const updates = {};
    const allowed = ['title','description','startTime','endTime','importConcepts'];
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    const election = await Election.findByIdAndUpdate(id, updates, { new: true });
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    res.json({ success: true, election });
  } catch (e) {
    console.error('update election error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single election details including candidates' vote counts and voter stats
router.get('/election/:id', adminAuth, async (req, res) => {
  try {
    let electionId = req.params.id;
    if (!electionId) return res.status(400).json({ success: false, message: 'election id required' });
    let election = null;
    if (mongoose.isValidObjectId(electionId)) {
      election = await Election.findById(electionId);
    } else {
      election = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });

    const candidates = await Candidate.find({ election: election._id }).sort({ voteCount: -1 });
    const totalVotes = candidates.reduce((s, c) => s + (c.voteCount || 0), 0);
    const totalVoters = await Student.countDocuments({ elections: election._id });
    const votedCount = await Student.countDocuments({ elections: election._id, voted: true });

    res.json({ success: true, election: election.toObject(), candidates: candidates.map(c => ({ id: c._id.toString(), name: c.name, party: c.party, voteCount: c.voteCount })), totalVotes, totalVoters, votedCount });
  } catch (e) {
    console.error('election detail error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update election status
router.patch('/election/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body; // scheduled, ongoing, ended
    if (!['scheduled','ongoing','ended'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const election = await Election.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!election) return res.status(404).json({ message: 'Election not found' });
    const io = req.app.get('io');
    io.emit('election_status', { id: election._id.toString(), status: election.status });
    res.json({ election });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create candidate for an election
router.post('/candidate', adminAuth, async (req, res) => {
  try {
    const { electionId, name, party, manifesto } = req.body;
    if (!electionId || !name) return res.status(400).json({ message: 'electionId & name required' });
    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ message: 'Election not found' });
    const candidate = await Candidate.create({ election: electionId, name, party, manifesto });
    res.json({ candidate });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin dashboard summary
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const elections = await Election.find();
    const totalElections = elections.length;
    const activeElections = elections.filter(e => e.status === 'ongoing').length;
    const upcomingElections = elections.filter(e => e.status === 'scheduled').length;
    const completedElections = elections.filter(e => e.status === 'ended').length;
    const admin = await Admin.findById(req.admin.aid).select('username role updatedAt');
    res.json({ success: true, dashboard: { admin, statistics: { totalElections, activeElections, upcomingElections, completedElections }, recentActivity: [] } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin-only endpoint: upload Excel and import students
// POST /api/admin/import-students (multipart form-data: file, optional field rollCol like 'I' or '9')
router.post('/import-students', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'file required' });
    const rollColArg = req.body.rollCol || null;
    const previewFlag = (req.body.preview === '1' || req.body.preview === 'true' || req.query.preview === '1' || req.query.preview === 'true');

  // parse workbook from buffer using exceljs for JSON rows and raw arrays
  let rawRows = [];
  let data = [];
  let parseErrorMsg = null;
  // default sheetName so later image lookup won't throw if initial parse fails
  let sheetName = 'Sheet1';
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets && workbook.worksheets[0];
      sheetName = worksheet ? worksheet.name : (workbook.worksheets[0] && workbook.worksheets[0].name) || 'Sheet1';
      // build rawRows (array of arrays) from worksheet
      if (worksheet) {
        worksheet.eachRow({ includeEmpty: true }, (row) => {
          // row.values is 1-based; slice(1) to make it 0-based and normalize empty -> ''
          const vals = (row.values ? row.values.slice(1) : []).map(v => (v == null ? '' : (typeof v === 'object' && v.text ? v.text : v)));
          rawRows.push(vals);
        });
      }
      // build data (array of objects) akin to sheet_to_json default behavior
      if (rawRows.length > 0) {
        const headerRow = rawRows[0] || [];
        for (let r = 1; r < rawRows.length; r++) {
          const rowArr = rawRows[r] || [];
          const obj = {};
          const maxLen = Math.max(headerRow.length, rowArr.length);
          for (let c = 0; c < maxLen; c++) {
            const rawHeaderCell = headerRow[c];
            let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
            if (!key) key = `Col ${c+1}`;
            obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
          }
          data.push(obj);
        }
      }
    } catch (e) {
      // ExcelJS failed to parse buffer (could be .numbers or another package). Attempt ZIP/text fallback.
      console.warn('ExcelJS failed to parse uploaded file; attempting ZIP/text fallback:', e && e.message ? e.message : e);
      parseErrorMsg = e && e.message ? e.message : String(e);
      rawRows = [];
      data = [];
      let candidateText = null;
      try {
        const zip = await JSZip.loadAsync(req.file.buffer);
        // Search for candidate files inside the archive that look like CSV/TSV/PLAIN text or XML tables
        for (const fname of Object.keys(zip.files)) {
          const f = zip.files[fname];
          // prefer CSV/TSV or files with 'table' or 'index' in name
          if (/\.csv$/i.test(fname) || /\.tsv$/i.test(fname) || /table|index|sheet/i.test(fname)) {
            try {
              const content = await f.async('string');
              if (content && content.trim().length > 0) { candidateText = content; break; }
            } catch (ie) { /* ignore */ }
          }
        }
        // If none found, try to pick the largest text file in the archive
        if (!candidateText) {
          let largest = { name: null, size: 0 };
          for (const fname of Object.keys(zip.files)) {
            const f = zip.files[fname];
            if (f && f._data && f._data.uncompressedSize && f._data.uncompressedSize > largest.size) {
              largest = { name: fname, size: f._data.uncompressedSize };
            }
          }
          if (largest.name) {
            try { candidateText = await zip.files[largest.name].async('string'); } catch(_) { candidateText = null; }
          }
        }
      } catch (zipErr) {
        // Not a zip, try as plain text
        candidateText = req.file.buffer.toString('utf8');
      }

      if (candidateText) {
          // crude delimiter detection: prefer comma, fallback to tab
          const lines = candidateText.split(/\r?\n/).filter(l => l.trim() !== '');
          if (lines.length > 0) {
            const first = lines[0];
            const commaCount = (first.match(/,/g) || []).length;
            const tabCount = (first.match(/\t/g) || []).length;
            const delim = commaCount >= tabCount ? ',' : '\t';
            // build rawRows
            rawRows = lines.map(line => line.split(delim).map(cell => cell.replace(/^"|"$/g, '').trim()));
            // if we have headers, build data objects
            if (rawRows.length > 1) {
              const headerRow = rawRows[0];
              for (let r = 1; r < rawRows.length; r++) {
                const rowArr = rawRows[r] || [];
                const obj = {};
                const maxLen = Math.max(headerRow.length, rowArr.length);
                for (let c = 0; c < maxLen; c++) {
                  const rawHeaderCell = headerRow[c];
                  let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
                  if (!key) key = `Col ${c+1}`;
                  obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
                }
                data.push(obj);
              }
            }
          }
      }
      }

    // continue processing when not preview or when parsing succeeded

    // attempt to load with exceljs to extract embedded images (best-effort)
    let imagesMap = {}; // key: `${sheetName}:${row}:${col}` -> { buffer, extension }
    try {
      // dynamic import so tests / env without exceljs still run
      let ExcelJS;
      try { ExcelJS = (await import('exceljs')).default || (await import('exceljs')); } catch (ie) { ExcelJS = null; }
      if (ExcelJS) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(sheetName);
        if (worksheet && typeof worksheet.getImages === 'function') {
          const imgEntries = worksheet.getImages();
          for (const img of imgEntries) {
            try {
              const range = img.range;
              const tl = range.tl || range.topLeft || range;
              const row = tl.nativeRow || tl.row || (tl.r != null ? tl.r : null);
              const col = tl.nativeCol || tl.col || (tl.c != null ? tl.c : null);
              const r = row != null ? Number(row) : null;
              const c = col != null ? Number(col) : null;
              const image = workbook.model.media.find(m => m.index === img.imageId || m.id === img.imageId || m.index === img.imageId+1);
              if (image && r && c) {
                const ext = (image.type || image.extension || '').replace(/\./g,'') || (image.extension || 'png');
                imagesMap[`${sheetName}:${r}:${c}`] = { buffer: image.buffer || image._buffer || null, extension: ext };
              }
            } catch (ie) { /* ignore image mapping errors */ }
          }
        }
      }
    } catch (e) {
      console.warn('ExcelJS image extraction failed (optional):', e && e.message ? e.message : e);
    }

  // compute roll column index if provided
    let rollColIndex = null;
    if (rollColArg) {
      if (/^[A-Za-z]$/.test(rollColArg)) rollColIndex = rollColArg.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      else if (/^[0-9]+$/.test(rollColArg)) rollColIndex = parseInt(rollColArg, 10) - 1;
    }

    // optional photo column arg
    const photoColArg = req.body.photoCol || null;
    let photoColIndex = null;
    if (photoColArg) {
      if (/^[A-Za-z]$/.test(photoColArg)) photoColIndex = photoColArg.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      else if (/^[0-9]+$/.test(photoColArg)) photoColIndex = parseInt(photoColArg, 10) - 1;
    }

    // preview limit handling: allow previewLimit='all' or numeric
    const previewLimitRaw = req.body.previewLimit || req.query.previewLimit || '500';
    const previewLimit = previewLimitRaw === 'all' ? Infinity : Math.max(0, parseInt(previewLimitRaw, 10) || 500);

    // optional electionId: associate imported students with an election
    // If electionId is not provided the uploaded students will be imported into the global master list
    let electionId = req.body.electionId || req.query.electionId || null;
    let electionObjectId = null;
    if (electionId && (electionId === 'null' || electionId === 'undefined')) electionId = null;
    if (electionId) {
      // accept either a valid ObjectId string or an election title
      if (mongoose.isValidObjectId(electionId)) {
  // normalize to string then construct ObjectId to avoid calling constructor with an ObjectId instance
  electionObjectId = new mongoose.Types.ObjectId(String(electionId));
        const found = await Election.findById(electionObjectId);
        if (!found) return res.status(400).json({ success: false, message: 'electionId not found' });
      } else {
        // try to find by title (case-insensitive)
        const foundByTitle = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
        if (foundByTitle) electionObjectId = foundByTitle._id;
        else return res.status(400).json({ success: false, message: 'Invalid electionId or election title not found' });
      }
    }

    // load importConcepts from election if available
    let importConceptsFromElection = null;
    if (electionObjectId) {
      try {
        const electionDoc = await Election.findById(electionObjectId).lean();
        importConceptsFromElection = electionDoc && electionDoc.importConcepts ? electionDoc.importConcepts : null;
      } catch (e) { /* ignore */ }
    }

    // importConcepts may also be provided directly in the request (as JSON or object)
    let importConceptsReq = null;
    if (req.body.importConcepts) {
      try {
        importConceptsReq = typeof req.body.importConcepts === 'string' ? JSON.parse(req.body.importConcepts) : req.body.importConcepts;
      } catch (e) { importConceptsReq = null; }
    }
    const importConcepts = importConceptsReq || importConceptsFromElection || null;

    // optional: selectedRows - array of preview row indices (0-based) to import when user selected a subset in preview
    let selectedRowsRaw = req.body.selectedRows || req.query.selectedRows || null;
    let selectedRowsSet = null;
    if (selectedRowsRaw) {
      try {
        const parsed = typeof selectedRowsRaw === 'string' ? JSON.parse(selectedRowsRaw) : selectedRowsRaw;
        if (Array.isArray(parsed)) selectedRowsSet = new Set(parsed.map(n => Number(n)).filter(n => !Number.isNaN(n)));
      } catch (e) { /* ignore parse errors - treat as no selection */ }
    }

    // detect header row
    const firstObj = data[0] || {};
    const lowerKeys = Object.keys(firstObj).map(k => String(k).toLowerCase());
    const expectedHeaders = ['roll', 'name', 'email', 'mobile'];
    const hasExpectedHeaders = lowerKeys.some(k => expectedHeaders.some(h => k.includes(h)));
    const headerless = !hasExpectedHeaders;

    // Run AI/heurstic parser to enrich rows (returns an array aligned with data if headered, or aligned with rawRows if headerless)
    let aiExtractedRows = [];
    try {
      const aiRes = await parseFile({ buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, data, rawRows, imagesMap, headerless });
      aiExtractedRows = Array.isArray(aiRes.extractedRows) ? aiRes.extractedRows : [];
    } catch (e) {
      console.warn('AI parse failed:', e && e.message ? e.message : e);
      aiExtractedRows = [];
    }

    // If preview requested and nothing parsed by ExcelJS/ZIP/text, and AI heuristics returned nothing, return helpful 400
    if (previewFlag && (!Array.isArray(rawRows) || rawRows.length === 0) && (!Array.isArray(data) || data.length === 0) && (!Array.isArray(aiExtractedRows) || aiExtractedRows.length === 0)) {
      const msg = parseErrorMsg ? `Failed to parse uploaded file: ${parseErrorMsg}` : 'Failed to parse uploaded file (unknown format). Try compressing .numbers to .zip or upload as .xlsx/.csv.';
      return res.status(400).json({ success: false, message: msg });
    }

    // normalize headers helper: prefer explicit header row (rawRows[0]) when available,
    // replace sheetjs-generated "__EMPTY" keys or blank headers with "Col N" fallbacks
    const headerRowArray = Array.isArray(rawRows) && rawRows.length > 0 ? rawRows[0] : [];
    const normalizeHeaders = (fallbackKeys) => {
      // fallbackKeys: array of keys from sheet_to_json objects (may contain __EMPTY placeholders)
      const maxLen = Math.max((headerRowArray && headerRowArray.length) || 0, (fallbackKeys && fallbackKeys.length) || 0);
      const out = [];
      for (let i = 0; i < maxLen; i++) {
        const rawHeaderCell = headerRowArray[i];
        const candidateKey = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
        if (candidateKey) {
          out.push(candidateKey);
          continue;
        }
        const fk = fallbackKeys && fallbackKeys[i] ? String(fallbackKeys[i]).trim() : '';
        if (fk && !/^__EMPTY(_\d+)?$/i.test(fk)) {
          out.push(fk);
          continue;
        }
        out.push(`Col ${i+1}`);
      }
      return out;
    };

  let imported = 0;
  const previewRows = [];
  // richer preview structure when previewFlag: we'll return headers (if present) and rows with raw arrays and objects
  const previewData = { headers: null, rows: [] };
  if (headerless) {
      // headerless: rawRows are arrays; include all columns. Provide sensible Col N headers
      // instead of showing sheetjs placeholders like __EMPTY
      const fallbackKeys = [];
      // try to infer number of columns from first row
      const firstRow = rawRows[0] || [];
      for (let i = 0; i < firstRow.length; i++) fallbackKeys.push(`Col ${i+1}`);
      previewData.headers = normalizeHeaders(fallbackKeys);
      for (let i = 0; i < rawRows.length; i++) {
        // if a selection set was provided from preview, skip rows not selected
        if (selectedRowsSet && !selectedRowsSet.has(i)) continue;
        const arrRow = rawRows[i] || [];
        // attempt to extract roll using rollColIndex if provided, else heuristic
        let rawRoll = '';
        let detectedRollIdx = rollColIndex;

        if (detectedRollIdx != null) {
          rawRoll = (arrRow[detectedRollIdx] || '').toString().trim();
        } else {
          // Heuristic: prefer column with digits as Roll
          // If no digits, fall back to first non-empty column that isn't clearly a name (has spaces)
          const candidates = arrRow.map((c, i) => ({ val: (c||'').toString().trim(), i })).filter(c => c.val);
          
          // Find all candidates containing digits
          const withDigits = candidates.filter(c => /\d/.test(c.val));
          const clearlyName = (s) => /^[A-Za-z\s\.]+$/.test(s) && s.includes(' ');

          if (withDigits.length > 0) {
            // Prioritize candidates that do NOT look like mobile numbers (10-15 digits)
            // This prevents mobile number being mistaken for roll number in mixed columns
            const notMobile = withDigits.find(c => {
               const d = c.val.replace(/\D/g, '');
               return d.length < 10 || d.length > 15;
            });
            if (notMobile) {
              detectedRollIdx = notMobile.i;
              rawRoll = notMobile.val;
            } else {
              // If all look like mobile numbers (or none are clearly not), pick the first one with digits
              detectedRollIdx = withDigits[0].i;
              rawRoll = withDigits[0].val;
            }
          } else {
            // No digits found. Pick first one that doesn't look like a full name "John Doe"
            const notName = candidates.find(c => !clearlyName(c.val));
            if (notName) {
              detectedRollIdx = notName.i;
              rawRoll = notName.val;
            } else if (candidates.length > 0) {
              // Everything looks like a name? Just take the first one.
              detectedRollIdx = candidates[0].i;
              rawRoll = candidates[0].val;
            }
          }
        }
        const roll = rawRoll ? rawRoll.toString().trim().toUpperCase() : '';

        // attempt to find a name candidate (first cell with letters that's not roll)
        let name = '';
        for (let j = 0; j < arrRow.length; j++) {
          const v = (arrRow[j] || '').toString().trim();
          if (!v) continue;
          if (detectedRollIdx != null && j === detectedRollIdx) continue;
          if (v && /[A-Za-z]/.test(v) && !v.includes('@')) { name = v; break; }
        }

        // attempt to detect email (look for @ symbol)
        let email = '';
        for (let j = 0; j < arrRow.length; j++) {
          const v = (arrRow[j] || '').toString().trim();
          if (!v) continue;
          if (detectedRollIdx != null && j === detectedRollIdx) continue;
          if (v.includes('@') && /\S+@\S+\.\S+/.test(v)) { 
             email = v; 
             break; 
          }
        }

        // attempt to detect mobile (look for digits, typical length 10-15, avoid roll index)
        let mobile = '';
        for (let j = 0; j < arrRow.length; j++) {
          const v = (arrRow[j] || '').toString().trim();
          if (!v) continue;
          if (detectedRollIdx != null && j === detectedRollIdx) continue;
          const digitsOnly = v.replace(/\D/g, '');
          if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
             mobile = v;
             break;
          }
        }

        const rowObj = { arr: arrRow.map(c => (c == null ? '' : c)), obj: null };
        // validations
        const errors = [];
        if (!roll) errors.push('missing roll');
        if (!name) errors.push('missing name');
        // try to detect photo: explicit photoColIndex or any cell that looks like an image URL
        let photo = '';
        if (photoColIndex != null) photo = (arrRow[photoColIndex] || '').toString().trim();
        if (!photo) {
          for (let j = 0; j < arrRow.length; j++) {
            const v = (arrRow[j] || '').toString().trim();
            if (!v) continue;
            if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(v)) { photo = v; break; }
          }
        }
        // embedded images: check imagesMap for this sheet row/col (best-effort)
        if (!photo && imagesMap) {
          const sheetRow = i + 1; // rawRows index i corresponds to sheet row i+1
          for (let j = 0; j < arrRow.length; j++) {
            const key = `${sheetName}:${sheetRow}:${j+1}`;
            const img = imagesMap[key];
            if (img && img.buffer) {
              try {
                const b64 = Buffer.from(img.buffer).toString('base64');
                photo = `data:image/${img.extension};base64,${b64}`;
                break;
              } catch (e) { /* ignore */ }
            }
          }
        }

        if (previewFlag) {
          previewData.rows.push({ ...rowObj, extracted: { roll, name, email, mobile, photo }, valid: errors.length === 0, errors });
        } else {
          if (errors.length === 0) {
            try {
              // allow AI-extracted fields to enrich headerless rows
              const aiRow = (aiExtractedRows && aiExtractedRows[i]) ? aiExtractedRows[i] : null;
              const setObj = { name, email, mobile, photo: (photo || (aiRow && aiRow.photo)) || undefined, originalArr: rowObj.arr, originalObj: null, originalHeaders: null };
              if (aiRow && aiRow.fatherName) setObj.fatherName = aiRow.fatherName;
              if (aiRow && aiRow.address) setObj.address = aiRow.address;
              // perform case-insensitive find to avoid duplicate students differing only by roll casing
              const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const existing = await Student.findOne({ roll: { $regex: `^${escapeRegExp(roll)}$`, $options: 'i' } });
              if (existing) {
                // normalize stored roll to uppercase and merge fields
                // If no electionObjectId provided, mark this student as part of the global master list
                const updateObj = { $set: { ...setObj, roll: roll } };
                if (electionObjectId) updateObj.$addToSet = { elections: electionObjectId };
                else updateObj.$set = { ...(updateObj.$set || {}), masterList: true };
                await Student.updateOne({ _id: existing._id }, updateObj);
              } else {
                const createObj = { roll: roll, ...setObj };
                if (electionObjectId) createObj.elections = [electionObjectId];
                createObj.registeredAt = new Date();
                createObj.voted = false;
                // mark as master list if no election association provided
                createObj.masterList = !electionObjectId;
                await Student.create(createObj);
              }
              imported++;
              // if requested, attempt to auto-send OTP to any detected email in the row
              // auto-send OTP removed
            } catch (e) { console.error('import error', e); }
          }
        }
      }
    } else {
      for (let i = 0; i < data.length; i++) {
        // selectedRowsSet indices correspond to preview rows (data[] index for headered files)
        if (selectedRowsSet && !selectedRowsSet.has(i)) continue;
        const row = data[i];
        const arrRow = rawRows[i + 1] || [];
        // allow importConcepts mapping to guide extraction when provided
        let rawRoll = '';
        if (importConcepts && importConcepts.rollField) {
          rawRoll = (row[importConcepts.rollField] || row[importConcepts.rollField.toLowerCase()] || row[importConcepts.rollField.toUpperCase()] || '').toString().trim();
        }
        if (!rawRoll) rawRoll = (row.roll || row.Roll || row.RollNumber || row['Roll Number'] || '').toString().trim();
        if ((!rawRoll || rawRoll === '') && rollColIndex != null) rawRoll = (arrRow[rollColIndex] || '').toString().trim();
        const roll = rawRoll ? rawRoll.toUpperCase() : '';
        let name = '';
        let email = '';
        let mobile = '';
        if (importConcepts) {
          name = (row[importConcepts.nameField] || row[importConcepts.nameField?.toLowerCase()] || row[importConcepts.nameField?.toUpperCase()] || '').toString().trim();
          email = (row[importConcepts.emailField] || row[importConcepts.emailField?.toLowerCase()] || row[importConcepts.emailField?.toUpperCase()] || '').toString().trim();
          mobile = (row[importConcepts.mobileField] || row[importConcepts.mobileField?.toLowerCase()] || row[importConcepts.mobileField?.toUpperCase()] || '').toString().trim();
        }
        if (!name) name = (row.name || row.Name || row.student || '').toString().trim();
        if (!email) email = (row.email || row.Email || '').toString().trim();
        if (!mobile) mobile = (row.mobile || row.Mobile || row.phone || row.Phone || '').toString().trim();
        const rowObj = { arr: arrRow.map(c => (c == null ? '' : c)), obj: row };
        const errors = [];
        if (!roll) errors.push('missing roll');
        if (!name) errors.push('missing name');
        // photo extraction from headered row: try common header names
        const photoCandidates = ['photo','photo_url','photoUrl','image','image_url','imageUrl','avatar','picture'];
        let photo = '';
        for (const key of Object.keys(row)) {
          if (!row[key]) continue;
          const lk = key.toString().toLowerCase();
          if (photoCandidates.includes(lk) || photoCandidates.some(p => lk.includes(p))) {
            photo = (row[key] || '').toString().trim();
            break;
          }
        }
        // fallback: if photoColIndex provided, use arrRow
        if (!photo && photoColIndex != null) photo = (arrRow[photoColIndex] || '').toString().trim();
        // fallback: detect any URL that looks like image
        if (!photo) {
          for (let j = 0; j < arrRow.length; j++) {
            const v = (arrRow[j] || '').toString().trim();
            if (!v) continue;
            if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(v)) { photo = v; break; }
          }
        }
        // embedded images: check imagesMap for this sheet row/col (best-effort)
        if (!photo && imagesMap) {
          const sheetRow = i + 2; // headered rows start at sheet row 2
          for (let j = 0; j < arrRow.length; j++) {
            const key = `${sheetName}:${sheetRow}:${j+1}`;
            const img = imagesMap[key];
            if (img && img.buffer) {
              try {
                const b64 = Buffer.from(img.buffer).toString('base64');
                photo = `data:image/${img.extension};base64,${b64}`;
                break;
              } catch (e) { /* ignore */ }
            }
          }
        }

        if (previewFlag) {
          // build normalized headers once using the original header row (rawRows[0])
          const fallbackKeys = Object.keys(row).map(k => k.toString());
          previewData.headers = previewData.headers || normalizeHeaders(fallbackKeys);
          previewData.rows.push({ ...rowObj, extracted: { roll, name, email, mobile, photo }, valid: errors.length === 0, errors });
        } else {
          if (errors.length === 0) {
            try {
              const headers = Object.keys(row).map(k => k.toString());
              // build a lowercase key->value map to detect canonical fields
              const normalized = {};
              for (const k of Object.keys(row)) {
                try {
                  normalized[k.toString().toLowerCase().trim()] = (row[k] == null) ? '' : String(row[k]).trim();
                } catch (e) { /* ignore */ }
              }
              const findValue = (patterns) => {
                for (const p of patterns) {
                  if (Object.prototype.hasOwnProperty.call(normalized, p)) return normalized[p];
                }
                // fallback: find any key that includes the pattern
                for (const key of Object.keys(normalized)) {
                  for (const p of patterns) {
                    if (key.includes(p)) return normalized[key];
                  }
                }
                return undefined;
              };
              let fatherName = findValue(['father','father name','fathername','parent name','parents name','guardian','guardian name']);
              let address = findValue(['address','addr','residence','permanent address','present address']);
              const aiRow = (aiExtractedRows && aiExtractedRows[i]) ? aiExtractedRows[i] : null;
              if (aiRow) {
                if (!fatherName && aiRow.fatherName) fatherName = aiRow.fatherName;
                if (!address && aiRow.address) address = aiRow.address;
                if (!photo && aiRow.photo) photo = aiRow.photo;
              }

              // avoid duplicates by doing a case-insensitive lookup first
              const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const existing = await Student.findOne({ roll: { $regex: `^${escapeRegExp(roll)}$`, $options: 'i' } });
              const setFields = { name, email, mobile, photo: photo || undefined, originalArr: rowObj.arr, originalObj: rowObj.obj, originalHeaders: headers, fatherName: fatherName || undefined, address: address || undefined };
              if (existing) {
                const updateObj = { $set: { ...setFields, roll } };
                if (electionObjectId) updateObj.$addToSet = { elections: electionObjectId };
                else updateObj.$set = { ...(updateObj.$set || {}), masterList: true };
                await Student.updateOne({ _id: existing._id }, updateObj);
              } else {
                const createObj = { roll, ...setFields, registeredAt: new Date(), voted: false };
                if (electionObjectId) createObj.elections = [electionObjectId];
                // when no electionObjectId provided this is an import into the global master list
                createObj.masterList = !electionObjectId;
                await Student.create(createObj);
              }
              imported++;
              // auto-send OTP removed
            } catch (e) { console.error('import error', e); }
          }
        }
      }
    }

    // log admin action
    try {
      await AdminAction.create({ admin: req.admin?.aid, action: 'import-students', details: { imported }, ip: req.ip });
    } catch (e) { console.warn('Failed to log admin action', e.message || e); }

    // if preview, return parsed rows without writing to DB
    if (previewFlag) {
      // limit rows returned in preview to previewLimit (Infinity allowed for 'all')
      const limited = previewLimit === Infinity ? previewData.rows : previewData.rows.slice(0, previewLimit);
      return res.json({ success: true, preview: { headers: previewData.headers, rows: limited }, totalParsed: previewData.rows.length });
    }

    // notify connected frontends that master list changed so they can re-sync
    try {
      const io = req.app.get('io');
      if (io) io.emit('master_list_updated', { imported, at: new Date().toISOString() });
    } catch (e) { console.warn('Failed to emit master_list_updated', e.message || e); }

    res.json({ success: true, imported });
  } catch (e) {
    // Log full stack for debugging and return the error message to the client
    console.error('ADMIN IMPORT ERROR', e && e.stack ? e.stack : e);
    const msg = (e && e.message) ? e.message : 'Server error';
    res.status(500).json({ success: false, message: msg });
  }
});

// Admin: list students with optional search & pagination
router.get('/students', adminAuth, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 50 } = req.query;
    const filter = {};
    // optional election filter: accept ObjectId string or election title
    let electionId = req.query.electionId || null;
    if (electionId && electionId !== 'all') {
      if (mongoose.isValidObjectId(electionId)) {
        filter.elections = new mongoose.Types.ObjectId(String(electionId));
      } else {
        const found = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, $options: 'i' } });
        if (found) filter.elections = found._id;
        else return res.status(400).json({ success: false, message: 'Invalid electionId or election title not found' });
      }
    }
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { roll: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const total = await Student.countDocuments(filter);
    const items = await Student.find(filter).sort({ roll: 1 }).skip(skip).limit(Number(limit));
    res.json({ success: true, total, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: update student (mark/unmark voted, edit contact)
router.patch('/students/:roll', adminAuth, async (req, res) => {
  try {
    const roll = req.params.roll;
    const updates = {};
    const allowed = ['name', 'email', 'mobile', 'voted'];
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    const escaped = roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await Student.findOneAndUpdate({ roll: { $regex: `^${escaped}$`, $options: 'i' } }, { $set: updates }, { new: true });
    if (!result) return res.status(404).json({ success: false, message: 'Student not found' });
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'update-student', details: { roll, updates }, ip: req.ip }); } catch(_){}
    res.json({ success: true, student: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: delete student
router.delete('/students/:roll', adminAuth, async (req, res) => {
  try {
    const roll = req.params.roll;
    const escaped = roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await Student.findOneAndDelete({ roll: { $regex: `^${escaped}$`, $options: 'i' } });
    if (!result) return res.status(404).json({ success: false, message: 'Student not found' });
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'delete-student', details: { roll }, ip: req.ip }); } catch(_){}
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: bulk delete students by rolls
router.post('/students/bulk-delete', adminAuth, async (req, res) => {
  try {
    const { rolls } = req.body;
    if (!Array.isArray(rolls) || rolls.length === 0) return res.status(400).json({ success: false, message: 'rolls array required' });
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const or = rolls.map(r => ({ roll: { $regex: `^${escapeRegExp(String(r))}$`, $options: 'i' } }));
    const result = await Student.deleteMany({ $or: or });
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'bulk-delete-students', details: { count: result.deletedCount, rolls }, ip: req.ip }); } catch(_) {}
    res.json({ success: true, deleted: result.deletedCount });
  } catch (e) {
    console.error('bulk delete error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: remove or delete students associated with an election
// DELETE /students/by-election/:electionId?mode=remove|delete&deleteOrphans=1
router.delete('/students/by-election/:electionId', adminAuth, async (req, res) => {
  try {
    let electionId = req.params.electionId;
    if (!electionId) return res.status(400).json({ success: false, message: 'electionId required' });
    if (electionId && (electionId === 'null' || electionId === 'undefined')) electionId = null;
    let electionObjectId = null;
    if (mongoose.isValidObjectId(electionId)) {
      electionObjectId = new mongoose.Types.ObjectId(String(electionId));
      const found = await Election.findById(electionObjectId);
      if (!found) return res.status(400).json({ success: false, message: 'electionId not found' });
    } else {
      const foundByTitle = await Election.findOne({ title: { $regex: `^${String(electionId).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, $options: 'i' } });
      if (foundByTitle) electionObjectId = foundByTitle._id;
      else return res.status(400).json({ success: false, message: 'Invalid electionId or election title not found' });
    }

    const mode = (req.query.mode || 'remove');
    if (mode === 'remove') {
      // pull the election id out of students.elections
      const updateRes = await Student.updateMany({ elections: electionObjectId }, { $pull: { elections: electionObjectId } });
      let orphanDeleted = 0;
      if (req.query.deleteOrphans === '1' || req.query.deleteOrphans === 'true') {
        const delRes = await Student.deleteMany({ $or: [ { elections: { $exists: false } }, { elections: { $size: 0 } } ] });
        orphanDeleted = delRes.deletedCount || 0;
      }
      try { await AdminAction.create({ admin: req.admin?.aid, action: 'remove-election-from-students', details: { updated: updateRes.modifiedCount || updateRes.nModified || 0, orphanDeleted }, ip: req.ip }); } catch(_) {}
      return res.json({ success: true, updated: updateRes.modifiedCount || updateRes.nModified || 0, orphanDeleted });
    } else if (mode === 'delete') {
      const delRes = await Student.deleteMany({ elections: electionObjectId });
      try { await AdminAction.create({ admin: req.admin?.aid, action: 'delete-students-by-election', details: { deleted: delRes.deletedCount }, ip: req.ip }); } catch(_) {}
      return res.json({ success: true, deleted: delRes.deletedCount });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid mode; use remove or delete' });
    }
  } catch (e) {
    console.error('by-election delete error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: trigger OTP to a student by roll (sends to student's email or mobile)
router.post('/students/:roll/send-otp', adminAuth, async (req, res) => {
  try {
    const roll = req.params.roll;
    const escaped = roll.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const student = await Student.findOne({ roll: { $regex: `^${escaped}$`, $options: 'i' } });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const contact = student.email || student.mobile;
    if (!contact) return res.status(400).json({ success: false, message: 'No contact (email or mobile) on record for this student' });
    // use roll as identifier for OTP hashing so student can verify with roll
    const result = await requestOTP(student.roll, contact);
    try { await AdminAction.create({ admin: req.admin?.aid, action: 'send-otp-student', details: { roll: student.roll, contact }, ip: req.ip }); } catch(_){ }
    res.json({ success: true, message: 'OTP triggered', expiresAt: result.expiresAt });
  } catch (e) {
    console.error('Admin send-otp error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: export students as CSV stream (supports large exports)
router.get('/students/export', adminAuth, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="voters_export.csv"');

    // fetch all students to determine header ordering based on original uploaded rows
    const items = await Student.find().sort({ roll: 1 }).lean();

    // build header order: prefer originalHeaders from uploads
    let headerOrder = [];
    for (const it of items) {
      if (Array.isArray(it.originalHeaders) && it.originalHeaders.length > 0) {
        if (headerOrder.length === 0) headerOrder = [...it.originalHeaders];
        else {
          for (const h of it.originalHeaders) if (!headerOrder.includes(h)) headerOrder.push(h);
        }
      }
    }

    // if no originalHeaders present, but there are originalArr entries, create Col 1..N header
    if (headerOrder.length === 0) {
      let maxCols = 0;
      for (const it of items) if (Array.isArray(it.originalArr)) maxCols = Math.max(maxCols, it.originalArr.length);
      if (maxCols > 0) {
        for (let i = 0; i < maxCols; i++) headerOrder.push(`Col ${i+1}`);
      }
    }

    // ensure canonical columns are present (but keep original order first)
    const canonical = ['roll','name','email','mobile','voted'];
    for (const c of canonical) if (!headerOrder.includes(c)) headerOrder.push(c);

    // write header
    res.write(headerOrder.map(h => `"${String(h).replace(/"/g,'""')}"`).join(',') + '\n');

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    };

    for (const doc of items) {
      const rowVals = [];
      for (const h of headerOrder) {
        let val = '';
        if (doc.originalObj && Object.prototype.hasOwnProperty.call(doc.originalObj, h)) {
          val = doc.originalObj[h];
        } else if (Array.isArray(doc.originalArr) && /^Col (\d+)$/i.test(h)) {
          const idx = Number(h.split(' ')[1]) - 1;
          val = doc.originalArr[idx];
        } else if (h === 'roll') val = doc.roll;
        else if (h === 'name') val = doc.name;
        else if (h === 'email') val = doc.email;
        else if (h === 'mobile') val = doc.mobile;
        else if (h === 'voted') val = doc.voted ? 1 : 0;
        rowVals.push(escape(val));
      }
      const rowLine = rowVals.join(',') + '\n';
      if (!res.write(rowLine)) await new Promise((r) => res.once('drain', r));
    }
    res.end();
  } catch (e) {
    console.error('Export error', e);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

export default router;

