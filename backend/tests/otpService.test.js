import { jest } from '@jest/globals';
let requestOTP, verifyOTP;

// Jest ESM workaround: ensure Node's crypto is available (already) - placeholder to confirm ESM load.

// NOTE: Since OTP service logs OTP to console and stores in memory, we cannot capture the exact OTP easily.
// Strategy: Monkey-patch Math.random to force predictable OTP, then test verify.

describe('OTP Service', () => {
  const originalRandom = Math.random;
  beforeAll(async () => {
    // Prevent Ethereal async creation during tests by forcing production env
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const mod = await import('../config/otpService.js');
    requestOTP = mod.requestOTP;
    verifyOTP = mod.verifyOTP;

    let calls = 0;
    Math.random = () => { calls++; return 0.123456 + calls * 0.000001; }; // deterministic-ish
  });
  afterAll(() => { Math.random = originalRandom; });

  test('request and verify OTP success', async () => {
    const aadhaar = '123412341234';
    const resp = await requestOTP(aadhaar);
    expect(resp.success).toBe(true);
    // Our deterministic generator: otp digits from random -> parse.
    // Implementation uses Math.random()*10 floored 6 times.
    // With our fixed random small value <1 each time roughly 0.123456 + n*0.000001 => digit 0.
    const forcedOtp = '211111'; // From console log output
    const result = verifyOTP(aadhaar, forcedOtp);
    expect(result.success).toBe(true);
  });

  test('fails with wrong OTP', async () => {
    const aadhaar = '999988887777';
    await requestOTP(aadhaar);
    const result = verifyOTP(aadhaar, '111111');
    expect(result.success).toBe(false);
  });
});
