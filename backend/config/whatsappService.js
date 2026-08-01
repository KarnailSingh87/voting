// WhatsApp OTP Service using Baileys
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys/lib/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sock = null;
let isConnected = false;
let connectionPromise = null;
let qrCode = null;
let retryCount = 0;
let currentInitId = 0;
let consecutiveQRs = 0;
const MAX_RETRIES = 10; // generous retries — WhatsApp should stay connected
const RETRY_DELAY_MS = 5000; // 5 seconds between retries

// Auth state folder
const AUTH_FOLDER = path.join(__dirname, '..', 'baileys_auth');

// Ensure auth folder exists
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

// Create a silent logger to reduce noise
const logger = pino({ level: 'silent' });

// Initialize WhatsApp connection
export async function initWhatsApp() {
  // If already connected, return immediately
  if (isConnected && sock) return true;
  // If a connection attempt is already in progress, wait for it
  if (connectionPromise) return connectionPromise;
  // Safety: if a previous socket exists but not marked connected, close it before starting a new one.
  if (sock) {
    try { sock.end(); } catch (_) {}
    sock = null;
  }
  
  console.log('[WhatsApp] Initializing connection...');
  const initId = ++currentInitId;
  
  connectionPromise = new Promise(async (resolve) => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
      
      // Fetch latest version from WhatsApp (required to avoid 405 errors)
      let version;
      try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        console.log('[WhatsApp] Using version:', version);
      } catch (e) {
        // Fallback version if fetch fails
        version = [2, 2413, 1];
        console.log('[WhatsApp] Using fallback version:', version);
      }
      
      sock = makeWASocket({
        auth: state,
        logger,
        version,
        // Using a common desktop UA tends to be more stable than mobile-like values.
        browser: Browsers.macOS('Desktop'),
        // Ensure we always get QR updates (but we don't print it in server logs)
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Ignore events from older init attempts (paranoia for rapid reconnects)
        if (initId !== currentInitId) return;
        
        if (qr) {
          qrCode = qr;
          consecutiveQRs++;
          console.log('[WhatsApp] ✅ QR Code ready! Scan from admin panel');

          // If WhatsApp keeps issuing QRs but pairing fails repeatedly, auth state is often stale.
          // Auto-reset after a few consecutive QR refreshes.
          if (consecutiveQRs >= 5 && !isConnected) {
            console.log('[WhatsApp] ⚠️  Too many QR refreshes without pairing. Clearing auth & restarting...');
            consecutiveQRs = 0;
            try { sock?.end(); } catch (_) {}
            sock = null;
            clearAuthFolder();
            connectionPromise = null;
            setTimeout(() => initWhatsApp(), 1000);
          }
        }

        if (connection === 'close') {
          isConnected = false;
          consecutiveQRs = 0;

          // If this socket is still the active one, clear it.
          try { sock?.end(); } catch (_) {}
          sock = null;
          connectionPromise = null;
          
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`[WhatsApp] Connection closed. Status: ${statusCode}`);
          
          if (statusCode === DisconnectReason.loggedOut) {
            // Session was logged out from the phone — clear stale auth and generate fresh QR
            console.log('[WhatsApp] Logged out from phone. Clearing auth and generating new QR...');
            retryCount = 0;
            clearAuthFolder();
            setTimeout(() => initWhatsApp(), 2000);
            resolve(false);
          } else if (statusCode === DisconnectReason.badSession) {
            // Bad/stale session — reset auth to allow a clean pairing.
            console.log('[WhatsApp] Bad session detected. Clearing auth and generating new QR...');
            retryCount = 0;
            clearAuthFolder();
            setTimeout(() => initWhatsApp(), 2000);
            resolve(false);
          } else if (retryCount < MAX_RETRIES) {
            // Temporary disconnect — reconnect with existing session
            retryCount++;
            console.log(`[WhatsApp] Reconnecting (${retryCount}/${MAX_RETRIES})...`);
            setTimeout(() => initWhatsApp(), RETRY_DELAY_MS);
            resolve(false);
          } else {
            // Max retries exhausted — wait for manual reconnect
            console.log('[WhatsApp] Max retries reached. Use admin panel to reconnect.');
            retryCount = 0;
            resolve(false);
          }
        } else if (connection === 'open') {
          isConnected = true;
          qrCode = null;
          consecutiveQRs = 0;
          retryCount = 0;
          console.log('[WhatsApp] ✅ Connected successfully!');
          resolve(true);
        }
      });

    } catch (error) {
      console.error('[WhatsApp] Init error:', error.message);
      connectionPromise = null;
      resolve(false);
    }
  });

  return connectionPromise;
}

// Helper to clear auth folder
function clearAuthFolder() {
  try {
    if (fs.existsSync(AUTH_FOLDER)) {
      const files = fs.readdirSync(AUTH_FOLDER);
      for (const file of files) {
        fs.unlinkSync(path.join(AUTH_FOLDER, file));
      }
      console.log('[WhatsApp] Auth folder cleared');
    }
  } catch (e) {
    console.error('[WhatsApp] Error clearing auth folder:', e.message);
  }
}

// Send OTP via WhatsApp
export async function sendWhatsAppOTP(phoneNumber, otp) {
  // If not connected, use mock mode (OTP still works, just logged to console)
  if (!sock || !isConnected) {
    console.log(`[WhatsApp] 📱 MOCK MODE - OTP for ${phoneNumber}: ${otp}`);
    console.log('[WhatsApp] WhatsApp not connected. To enable WhatsApp delivery:');
    console.log('[WhatsApp] 1. Check /api/admin/whatsapp-status for QR code');
    console.log('[WhatsApp] 2. Scan QR with WhatsApp on your phone');
    return { success: true, mock: true, message: 'OTP logged to console (WhatsApp not connected)' };
  }

  try {
    // Format phone number for WhatsApp (add country code if not present)
    let formattedNumber = phoneNumber.replace(/\D/g, '');
    
    // Add India country code if it's a 10-digit number
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
    }
    
    // WhatsApp ID format
    const whatsappId = formattedNumber + '@s.whatsapp.net';

    const message = `🗳️ *Voting System OTP*\n\nYour One-Time Password is:\n\n*${otp}*\n\n⏱️ Valid for 5 minutes.\n\n⚠️ Do not share this OTP with anyone.`;

    await sock.sendMessage(whatsappId, { text: message });
    
    console.log(`[WhatsApp] ✅ OTP sent to ${phoneNumber}`);
    return { success: true, message: 'OTP sent via WhatsApp' };
  } catch (error) {
    console.error('[WhatsApp] Error sending message:', error.message);
    console.log(`[WhatsApp] 📱 FALLBACK - OTP for ${phoneNumber}: ${otp}`);
    return { success: true, mock: true, message: 'OTP logged to console (send failed)' };
  }
}

// Send a custom text message via WhatsApp (manual/admin use)
export async function sendWhatsAppMessage(phoneNumber, text) {
  // If not connected, log and return mock response so admin knows it was not delivered
  if (!sock || !isConnected) {
    console.log(`[WhatsApp] 📱 MOCK MODE - Message for ${phoneNumber}: ${text}`);
    return { success: true, mock: true, message: 'WhatsApp not connected; message logged to console' };
  }

  try {
    let formattedNumber = (phoneNumber || '').replace(/\D/g, '');
    if (!formattedNumber) throw new Error('Invalid phone number');

    // Add India country code for 10-digit numbers for convenience
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
    }

    const whatsappId = formattedNumber + '@s.whatsapp.net';

    await sock.sendMessage(whatsappId, { text: text || '' });
    console.log(`[WhatsApp] ✅ Message sent to ${phoneNumber}`);
    return { success: true, message: 'Message sent via WhatsApp' };
  } catch (error) {
    console.error('[WhatsApp] Error sending message:', error.message || error);
    console.log(`[WhatsApp] 📱 FALLBACK - Message for ${phoneNumber}: ${text}`);
    return { success: false, error: error.message || String(error) };
  }
}

// Get connection status
export function getWhatsAppStatus() {
  return {
    connected: isConnected,
    qrCode: qrCode,
  };
}

// Get QR code for admin to scan
export function getQRCode() {
  return qrCode;
}

// Check if WhatsApp is connected
export function isWhatsAppConnected() {
  return isConnected;
}

// Force reconnect — resets state and re-initializes (does NOT log out from WA)
export async function reconnectWhatsApp() {
  console.log('[WhatsApp] Force reconnect requested...');
  // Close existing socket gracefully without logging out
  if (sock) {
    try { sock.end(); } catch (e) { /* ignore */ }
    sock = null;
  }
  isConnected = false;
  qrCode = null;
  connectionPromise = null;
  retryCount = 0;
  consecutiveQRs = 0;
  // Re-initialize — will use existing auth if available
  return initWhatsApp();
}

// Disconnect WhatsApp (manual — logs out from WA and clears auth)
export async function disconnectWhatsApp() {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.log('[WhatsApp] Logout error (may already be disconnected):', e.message);
      }
      sock = null;
    }
    isConnected = false;
    qrCode = null;
    connectionPromise = null;
    retryCount = 0;
    
    // Clear auth folder to force new QR code on next connection
    clearAuthFolder();
    
    // Reinitialize to get new QR code
    setTimeout(() => {
      initWhatsApp();
    }, 1000);
  } catch (e) {
    console.error('[WhatsApp] Disconnect error:', e.message);
    throw e;
  }
}

// Hard reset WhatsApp pairing (clears auth and forces a brand-new QR code)
// Use this when the phone shows "Can't link new device at this time" due to stale pairing state.
export async function resetWhatsAppAuth() {
  console.log('[WhatsApp] Hard reset requested (clear auth & restart)...');
  try {
    if (sock) {
      try { await sock.logout(); } catch (_) { /* ignore */ }
      try { sock.end(); } catch (_) { /* ignore */ }
    }
  } finally {
    sock = null;
    isConnected = false;
    qrCode = null;
    connectionPromise = null;
    retryCount = 0;
    consecutiveQRs = 0;
    clearAuthFolder();
    setTimeout(() => initWhatsApp(), 300);
  }
  return true;
}
