import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import voterRoutes from './routes/voterRoutes.js';
import voteRoutes from './routes/voteRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(helmet());

// Routes
app.use('/api/voter', voterRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*'} });
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

const PORT = Number(process.env.PORT) || 5005;

async function startServer() {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/aadhaar_voting');

  const maxAttempts = 5; // try this port + up to maxAttempts-1 additional ports
  const tryListen = (port, attemptsLeft) => {
    // Attach a one-time error handler for this listen attempt
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is in use.`);
        if (attemptsLeft > 0) {
          const nextPort = port + 1;
          console.log(`Attempting to listen on port ${nextPort} (${attemptsLeft - 1} attempts left)...`);
          // small delay before retrying to avoid tight loop
          setTimeout(() => tryListen(nextPort, attemptsLeft - 1), 100);
        } else {
          console.error(`All ${maxAttempts} port attempts failed. Please free a port or set PORT env variable to an available port.`);
          process.exit(1);
        }
      } else {
        console.error('Server error during listen:', err);
        process.exit(1);
      }
    });

    server.listen(port, () => {
      console.log(`Voting backend running on :${port}`);
    });
  };

  tryListen(PORT, maxAttempts - 1);
}

(async () => {
  try {
    await startServer();
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
