import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
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
import debugRoutes from './routes/debugRoutes.js';
import { initOTPService } from './config/otpService.js';
import { createGenesisBlock } from './services/blockchainService.js';
import { initWeb3 } from './services/web3Service.js';
import { seedSuperAdmin } from './seedAdmin.js';
import { seedDemoElections } from './seed_demo_elections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Don't advertise Express/Node in responses
app.disable('x-powered-by');

// Trust proxy (Render, Heroku, etc.) so req.protocol reflects the actual client protocol
app.set('trust proxy', 1);

// Enable gzip/brotli compression for all responses
app.use(compression());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS: allow origins from env, plus known frontends and any *.onrender.com for Render deployments
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : [];

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return cb(null, true);
    // allow if '*' specified in env
    if (allowedOrigins.includes('*')) return cb(null, true);
    // allow if in explicit list
    if (allowedOrigins.length && allowedOrigins.includes(origin)) return cb(null, true);
    // allow any *.onrender.com origin (all Render static sites)
    if (origin.endsWith('.onrender.com') || origin.includes('render.com')) return cb(null, true);
    // allow localhost for development
    if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return cb(null, true);
    // if no explicit list was provided, default to allowing all origins so public site opens without admin login
    if (!allowedOrigins.length) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Security headers: use helmet with tuned options and add a few custom headers.
app.use(helmet({
  // Set Cross-Origin-Resource-Policy to cross-origin so public assets/APIs load without restriction
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  // We'll set a CSP below explicitly to avoid breaking the frontend while improving security.
  contentSecurityPolicy: false
}));

// Content Security Policy & other security headers - adjust if your frontend requires additional sources
app.use((req, res, next) => {
  // In production be strict: avoid 'unsafe-inline' and 'unsafe-eval'. In dev allow them to reduce friction.
  const isProd = process.env.NODE_ENV === 'production';

  const scriptSrc = isProd
    ? "script-src 'self' https: 'strict-dynamic'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:";

  const styleSrc = isProd
    ? "style-src 'self' https:" // avoid unsafe-inline in prod
    : "style-src 'self' 'unsafe-inline' https:";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    "font-src 'self' https: data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  // In prod set the enforcement header; in non-prod set Report-Only to test without breaking users
  if (isProd) {
    res.setHeader('Content-Security-Policy', csp);
  } else {
    res.setHeader('Content-Security-Policy-Report-Only', csp + "; report-uri /csp-report" );
  }

  // Cross-Origin policies
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Keep COEP conservative unless you have full CORP coverage
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Permissions policy (formerly Feature-Policy) - disable powerful features by default
  res.setHeader('Permissions-Policy', "camera=(), microphone=(), geolocation=(), interest-cohort=()");

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS - only set if serving over HTTPS in production
  if (isProd && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // Prevent clickjacking & MIME sniffing
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Remove Server header if present
  try { res.removeHeader('Server'); } catch (e) {}

  next();
});

// CSP report receiver (no-op) to avoid 404s for report-uri during testing
app.post('/csp-report', express.json({ type: ['application/csp-report', 'application/json'] }), (req, res) => {
  try { console.warn('CSP report:', JSON.stringify(req.body).slice(0, 1000)); } catch (_) {}
  res.status(204).end();
});

// Ensure API responses are not cached by browsers or intermediate proxies
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Serve uploaded files (candidate photos etc.) with caching
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    // Allow images to be embedded by the admin UI hosted on a different origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Rate limiting: global and endpoint-specific limits
const isProd = process.env.NODE_ENV === 'production';

// Enforce HTTPS in production by redirecting HTTP -> HTTPS (useful behind proxies)
if (isProd) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    // Redirect to same host over HTTPS
    const host = req.headers.host;
    if (!host) return next();
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

// Global: moderate throttling to prevent abuse (adjust as needed)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 500 : 2000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Stricter limiter for OTP endpoints to prevent enumeration/abuse
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many requests; try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/voter/request-otp', otpLimiter);
app.use('/api/voter/verify-otp', otpLimiter);

// Stricter limiter for admin routes
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/admin', adminLimiter);

// Routes
app.use('/api/voter', voterRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
// Debug / diagnostic routes (non-production but useful for checking web3 status)
app.use('/api/debug', debugRoutes);

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

// Helper to safely read current connected socket count
const getConnectedClients = () => {
  try {
    // socket.io v4 exposes engine.clientsCount; fallback to sockets map size
    return io && (io.engine?.clientsCount ?? (io.sockets?.sockets?.size ?? 0));
  } catch (e) {
    return 0;
  }
};

io.on('connection', (socket) => {
  // Broadcast current viewer count when a client connects
  try { io.emit('viewerCount', { connectedClients: getConnectedClients() }); } catch (_) {}

  socket.on('disconnect', () => {
    // Broadcast updated viewer count when a client disconnects
    try { io.emit('viewerCount', { connectedClients: getConnectedClients() }); } catch (_) {}
  });
});

const PORT = Number(process.env.PORT) || 5005;


async function startServer() {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_Voting');

  // Auto-seed default super admin and demo elections if database is empty (unless disabled via env)
  try {
    await seedSuperAdmin();
    const enableDemo = process.env.ENABLE_DEMO_ELECTIONS !== 'false' && process.env.SEED_DEMO_ELECTIONS !== 'false';
    if (enableDemo) {
      await seedDemoElections();
    } else {
      console.log('ℹ️ Demo elections seeding skipped (ENABLE_DEMO_ELECTIONS=false)');
    }
  } catch (err) {
    console.warn('Auto-seed check failed (non-fatal):', err && err.message ? err.message : err);
  }

  // initialize OTP/email transporter so requestOTP can actually send emails (Ethereal or SMTP)
  // Initialize blockchain (create genesis block if needed)
  try {
    // Only initialize the local DB-backed blockchain when explicitly enabled.
    // This lets deployments opt-in to the local PoW chain or disable it to
    // rely purely on the on-chain smart contract (useful for online-only setups).
    const useLocalChain = process.env.USE_LOCAL_BLOCKCHAIN
      ? process.env.USE_LOCAL_BLOCKCHAIN === 'true'
      : true; // default true for backwards compatibility

    if (useLocalChain) {
      await createGenesisBlock();
      console.log('🔗 Local blockchain initialized');
    } else {
      console.log('ℹ️  Skipping local blockchain initialization (USE_LOCAL_BLOCKCHAIN=false)');
    }
  } catch (err) {
    console.warn('Local blockchain init failed (votes will still work):', err && err.message ? err.message : err);
  }

  // Initialize Web3 (Hardhat/Alchemy smart contract connection)
  try {
    const ok = initWeb3();
    if (ok) console.log('🔗 Web3 smart contract connected');
    else console.warn('⚠️  Web3 not configured — smart contract features disabled');
  } catch (err) {
    console.warn('Web3 init failed (non-fatal):', err && err.message ? err.message : err);
  }

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
