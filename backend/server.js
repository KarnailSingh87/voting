import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import Election from './models/Election.js';
import voterRoutes from './routes/voterRoutes.js';
import voteRoutes from './routes/voteRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import { initOTPService } from './config/otpService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Trust proxy (Render, Heroku, etc.) so req.protocol reflects the actual client protocol
app.set('trust proxy', 1);

// Enable gzip/brotli compression for all responses
app.use(compression());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS: allow origins from env, plus any *.onrender.com for Render deployments
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : [];
app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return cb(null, true);
    // allow if in explicit list
    if (allowedOrigins.length && allowedOrigins.includes(origin)) return cb(null, true);
    // allow any *.onrender.com origin (all Render static sites)
    if (origin.endsWith('.onrender.com')) return cb(null, true);
    // allow localhost for development
    if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return cb(null, true);
    // if no explicit list was provided, allow everything
    if (!allowedOrigins.length) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Serve uploaded files (candidate photos etc.) with caching
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
}));

// Routes
app.use('/api/voter', voterRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// If a built frontend exists at ../frontend/dist, serve it as static files
// and provide a SPA fallback so refreshing client-side routes doesn't return 404.
try {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { maxAge: '1d' }));
    // Serve index.html for any non-API route (SPA history fallback)
    app.get(/^\/(?!api\/).*/, (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
} catch (err) {
  // If fs isn't available for some reason, skip without crashing
}

// Global error handler to return JSON for Multer and common errors
app.use((err, req, res, next) => {
  if (!err) return next();
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Max size is 50MB.' });
  }
  // Multer invalid file type (we threw Error('Invalid file type'))
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ success: false, message: 'Invalid file type. Allowed: xlsx, xls, csv.' });
  }
  console.error('Unhandled error', err && (err.stack || err.message || err));
  res.status(500).json({ success: false, message: 'Server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length && allowedOrigins.includes(origin)) return cb(null, true);
      if (origin.endsWith('.onrender.com')) return cb(null, true);
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return cb(null, true);
      if (!allowedOrigins.length) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true
  }
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

const PORT = Number(process.env.PORT) || 5005;

async function startServer() {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_Voting');

  // initialize OTP/email transporter so requestOTP can actually send emails (Ethereal or SMTP)
  try {
    await initOTPService();
  } catch (err) {
    console.warn('OTP service init failed (emails will be mocked):', err && err.message ? err.message : err);
  }

  // Scheduler: auto-transition elections based on startTime/endTime.
  // Runs periodically and updates election.status when time boundaries are crossed.
  const scheduleIntervalMs = Number(process.env.ELECTION_SCHEDULE_INTERVAL_MS || 30_000); // default 30s
  const runScheduler = async () => {
    try {
      const now = new Date();
      // Start elections that are scheduled and whose startTime <= now
      const toStart = await Election.find({ status: 'scheduled', startTime: { $lte: now } });
      for (const e of toStart) {
        try {
          const updated = await Election.findByIdAndUpdate(e._id, { status: 'ongoing' }, { new: true });
          if (updated) {
            try { io.emit('election_status', { id: updated._id.toString(), status: updated.status }); } catch(_){}
          }
        } catch (err) { /* silent */ }
      }

      // End elections that are ongoing and whose endTime <= now
      const toEnd = await Election.find({ status: 'ongoing', endTime: { $lte: now } });
      for (const e of toEnd) {
        try {
          const updated = await Election.findByIdAndUpdate(e._id, { status: 'ended' }, { new: true });
          if (updated) {
            try { io.emit('election_status', { id: updated._id.toString(), status: updated.status }); } catch(_){}
          }
        } catch (err) { /* silent */ }
      }
    } catch (err) {
      /* silent */
    }
  };

  // Start periodic scheduler
  try {
    setInterval(runScheduler, scheduleIntervalMs);
    runScheduler().catch(() => {});
  } catch (err) {
    /* silent */
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// export app for testing and programmatic use
export { app, startServer };

// start when run directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  (async () => {
    try {
      await startServer();
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  })();
}
