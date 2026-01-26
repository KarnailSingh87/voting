// Aadhaar & OTP service with Twilio SMS
import crypto from 'crypto';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

// Twilio setup (set env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Nodemailer (SMTP) setup for email OTPs
// Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
let mailTransporter = null;
let isEthereal = false;

// Initialize OTP service (call during app startup so transporter is ready before requests)
export async function initOTPService() {
  // If explicit SMTP creds are provided, use them
  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      mailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true' || false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      isEthereal = false;
      return;
    } catch (e) {
      console.error('[OTP] Failed to create mail transporter from env:', e && e.message ? e.message : e);
      mailTransporter = null;
    }
  }

  // In non-production, create an Ethereal test account so devs can view emails without SMTP creds
  if (process.env.NODE_ENV !== 'production') {
    try {
      const testAccount = await nodemailer.createTestAccount();
      mailTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      isEthereal = true;
      if (process.env.NODE_ENV !== 'test') console.log('[OTP] Ethereal test account created for development:', testAccount.user);
      return;
    } catch (err) {
      console.error('[OTP] Failed to create Ethereal test account:', err && err.message ? err.message : err);
      mailTransporter = null;
    }
  }
  // Otherwise transporter remains null (no email delivery)
}

// In-memory store (replace with Redis in production)
const otpStore = new Map(); // key: aadhaarHash -> { otp, expiresAt, phone }

export function hashAadhaar(aadhaarNumber) {
  return crypto.createHash('sha256').update(aadhaarNumber).digest('hex');
}

export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function requestOTP(aadhaarNumber, contact) {
  // contact may be a phone number (string of digits) or an email address
  const otp = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  const key = hashAadhaar(aadhaarNumber);
  const isEmail = typeof contact === 'string' && contact.includes('@');
  const storeEntry = { otp, expiresAt, contact, contactType: isEmail ? 'email' : 'sms' };
  otpStore.set(key, storeEntry);

  // If email requested and transporter configured, send email
  if (isEmail) {
    if (mailTransporter) {
      try {
        const from = process.env.SMTP_FROM || process.env.SMTP_USER;
        const info = await mailTransporter.sendMail({
          from,
          to: contact,
          subject: 'Your Voting OTP',
          text: `Your voting OTP is: ${otp}. Valid for 5 minutes.`,
        });
        console.log(`[OTP] Sent ${otp} to ${contact} via SMTP`);
        if (isEthereal) {
          const previewUrl = nodemailer.getTestMessageUrl(info);
          if (previewUrl) console.log(`[OTP] Ethereal preview URL: ${previewUrl}`);
        }
      } catch (err) {
        console.error('[OTP] SMTP error:', err.message);
        console.log(`[OTP] Fallback - Console OTP: ${otp} for email ${contact}`);
      }
    } else {
      console.log(`[OTP] Mail transporter not configured. Mock OTP ${otp} for email ${contact} (Aadhaar: ${aadhaarNumber})`);
    }
  } else {
    // Send via Twilio if configured
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        await twilioClient.messages.create({
          body: `Your voting OTP is: ${otp}. Valid for 5 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+91${contact}` // Assuming Indian numbers
        });
        console.log(`[OTP] Sent ${otp} to +91${contact} via Twilio`);
      } catch (err) {
        console.error('[OTP] Twilio error:', err.message);
        console.log(`[OTP] Fallback - Console OTP: ${otp} for phone ${contact}`);
      }
    } else {
      // Fallback to console (mock mode)
      console.log(`[OTP] Mock mode - OTP ${otp} for phone ${contact} (Aadhaar: ${aadhaarNumber})`);
    }
  }

  return { success: true, message: 'OTP sent', expiresAt, contact, contactType: isEmail ? 'email' : 'sms' };
}

export function verifyOTP(aadhaarNumber, otp) {
  const key = hashAadhaar(aadhaarNumber);
  const entry = otpStore.get(key);
  if (!entry) return { success: false, message: 'OTP not requested' };
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { success: false, message: 'OTP expired' };
  }
  if (entry.otp !== otp) return { success: false, message: 'Invalid OTP' };
  otpStore.delete(key);
  return { success: true, contact: entry.contact, contactType: entry.contactType };
}
