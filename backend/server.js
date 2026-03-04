import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Serve uploaded files (candidate photos etc.)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes
app.use('/api/voter', voterRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*'} });
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
