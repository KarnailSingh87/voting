 import axios from 'axios';
import fs from 'fs';
import https from 'https';
import Redis from 'ioredis';

const UDI_URL = process.env.UDI_URL || '';
const UDI_API_KEY = process.env.UDI_API_KEY || '';
const UDI_AUTH_SCHEME = (process.env.UDI_AUTH_SCHEME || 'bearer').toLowerCase(); // bearer|header|query|mtls
const UDI_API_KEY_HEADER = process.env.UDI_API_KEY_HEADER || 'x-api-key';
const UDI_TIMEOUT_MS = Number(process.env.UDI_TIMEOUT_MS || 5000);
const UDI_REQ_METHOD = (process.env.UDI_REQ_METHOD || 'POST').toUpperCase();
const UDI_CACHE_TTL = Number(process.env.UDI_CACHE_TTL || 3600); // seconds
const REDIS_URL = process.env.REDIS_URL || '';
const UDI_CLIENT_CERT = process.env.UDI_CLIENT_CERT || '';
const UDI_CLIENT_KEY = process.env.UDI_CLIENT_KEY || '';

let axiosInstance;
let redisClient = null;

if (UDI_CLIENT_CERT && UDI_CLIENT_KEY) {
  try {
    const cert = fs.readFileSync(UDI_CLIENT_CERT);
    const key = fs.readFileSync(UDI_CLIENT_KEY);
    const httpsAgent = new https.Agent({ cert, key });
    axiosInstance = axios.create({ timeout: UDI_TIMEOUT_MS, httpsAgent });
  } catch (e) {
    console.error('[UDI] mTLS cert/key read error:', e.message || e);
    axiosInstance = axios.create({ timeout: UDI_TIMEOUT_MS });
  }
} else {
  axiosInstance = axios.create({ timeout: UDI_TIMEOUT_MS });
}

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL);
  } catch (e) {
    console.error('[UDI] Failed to create Redis client:', e.message || e);
    redisClient = null;
  }
}

// Simple in-memory cache fallback
const memCache = new Map(); // key -> { value, expiresAt }

function cacheGet(key) {
  if (redisClient) return redisClient.get(key).then(res => res ? JSON.parse(res) : null);
  const v = memCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return v.value;
}

function cacheSet(key, value, ttlSeconds) {
  if (redisClient) return redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function maskAadhaar(aadhaar) {
  const d = String(aadhaar).replace(/\D/g, '');
  return d.length >= 4 ? `****${d.slice(-4)}` : '****';
}

async function callExternal(aadhaar) {
  if (!UDI_URL) return { success: false, message: 'UDI not configured' };
  const headers = { 'Accept': 'application/json' };
  let url = UDI_URL;
  // Auth handling
  if (UDI_API_KEY) {
    if (UDI_AUTH_SCHEME === 'bearer') {
      headers['Authorization'] = `Bearer ${UDI_API_KEY}`;
    } else if (UDI_AUTH_SCHEME === 'header') {
      headers[UDI_API_KEY_HEADER] = UDI_API_KEY;
    } else if (UDI_AUTH_SCHEME === 'query') {
      const joiner = url.includes('?') ? '&' : '?';
      url = `${url}${joiner}api_key=${encodeURIComponent(UDI_API_KEY)}`;
    }
  }

  try {
    let resp;
    if (UDI_REQ_METHOD === 'GET') {
      resp = await axiosInstance.get(url, { params: { aadhaar }, headers });
    } else {
      resp = await axiosInstance.post(url, { aadhaar }, { headers });
    }

    const data = resp?.data || {};
    // Attempt to extract a name from common fields
    const candidates = [
      data.name,
      data.fullName,
      data.data && data.data.name,
      data.data && data.data.fullName,
      data.person && data.person.name,
      data.person && data.person.fullName,
    ];
    const name = candidates.find(Boolean);
    if (name) return { success: true, name };
    // If no name found, return raw data for debugging (avoid logging aadhaar)
    return { success: false, message: 'Name not found in UDI response', raw: data };
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message || 'UDI request failed';
    console.error(`[UDI] lookup failed for ${maskAadhaar(aadhaar)}:`, status || '', msg);
    return { success: false, message: `UDI error: ${msg}` };
  }
}

export async function lookup(aadhaar) {
  try {
    const digits = String(aadhaar || '').replace(/\D/g, '');
    if (digits.length !== 12) return { success: false, message: 'aadhaar must be 12 digits' };

    const cacheKey = `udi:${digits}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return { success: true, name: cached.name, cached: true };

    // If UDI not configured, return mock deterministic name
    if (!UDI_URL) {
      const mockName = `User ${digits.slice(-4)}`;
      // cache mock result briefly
      await cacheSet(cacheKey, { name: mockName }, Math.max(60, Math.min(UDI_CACHE_TTL, 3600)));
      return { success: true, name: mockName, mock: true };
    }

    const resp = await callExternal(digits);
    if (resp.success) {
      await cacheSet(cacheKey, { name: resp.name }, UDI_CACHE_TTL);
      return { success: true, name: resp.name };
    }
    return { success: false, message: resp.message || 'UDI lookup failed' };
  } catch (e) {
    console.error('[UDI] unexpected error', e.message || e);
    return { success: false, message: 'Server error' };
  }
}

export default { lookup };
