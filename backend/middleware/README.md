# Middleware

- `voterAuth.js`: Validates JWT token for voter, attaches voter id & aadhaarHash onto req.voter.

Future:
- rateLimit.js for OTP request frequency.
- adminAuth.js for protected admin endpoints.
