// WhatsApp OTP Service using Baileys
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
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
const MAX_RETRIES = 3;

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
  if (connectionPromise) return connectionPromise;
  if (isConnected) return true;
  
  console.log('[WhatsApp] Initializing connection...');
  
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
        browser: ['Ubuntu', 'Chrome', '114.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          qrCode = qr;
          console.log('[WhatsApp] ✅ QR Code ready! Scan from admin panel');
        }

        if (connection === 'close') {
          isConnected = false;
          sock = null;
          
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && retryCount < MAX_RETRIES;
          
          console.log(`[WhatsApp] Connection closed. Status: ${statusCode}`);
          
          if (shouldReconnect) {
            retryCount++;
            connectionPromise = null;
            console.log(`[WhatsApp] Reconnecting (${retryCount}/${MAX_RETRIES})...`);
            setTimeout(() => initWhatsApp(), 3000);
          } else {
            connectionPromise = null;
            resolve(false);
          }
        } else if (connection === 'open') {
          isConnected = true;
          qrCode = null;
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

// Disconnect WhatsApp
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
    if (fs.existsSync(AUTH_FOLDER)) {
      const files = fs.readdirSync(AUTH_FOLDER);
      for (const file of files) {
        fs.unlinkSync(path.join(AUTH_FOLDER, file));
      }
      console.log('[WhatsApp] Auth folder cleared');
    }
    
    // Reinitialize to get new QR code
    setTimeout(() => {
      initWhatsApp();
    }, 1000);
  } catch (e) {
    console.error('[WhatsApp] Disconnect error:', e.message);
    throw e;
  }
}
