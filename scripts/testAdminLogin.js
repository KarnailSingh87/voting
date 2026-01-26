#!/usr/bin/env node
// Simple CLI to test admin login endpoint
// Usage:
//   BACKEND_URL=http://localhost:5005 ADMIN_TEST_USERNAME=admin ADMIN_TEST_PASSWORD=Admin@123456 node scripts/testAdminLogin.js
// or
//   node scripts/testAdminLogin.js --url http://localhost:5005 --username admin --password Admin@123456

const args = process.argv.slice(2);
const argv = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const val = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true;
    argv[key] = val;
  }
}

const backend = process.env.BACKEND_URL || argv.url || 'http://localhost:5005';
const username = process.env.ADMIN_TEST_USERNAME || argv.username || 'admin';
const password = process.env.ADMIN_TEST_PASSWORD || argv.password || 'Admin@123456';

async function run() {
  const url = new URL('/api/admin/login', backend).toString();
  console.log(`POST ${url}`);
  console.log(`Attempting login as username/email: ${username}`);
  try {
    // node >=18 has global fetch
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      // timeout not built-in; rely on system timeout
    });
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch (e) { /* not JSON */ }
    console.log('HTTP', res.status, res.statusText);
    console.log('Response body:');
    console.dir(body, { depth: 4 });
    if (res.ok && body && body.token) {
      console.log('\nLogin successful — token received (truncated):', String(body.token).slice(0, 60) + '...');
      process.exit(0);
    } else {
      console.error('\nLogin failed');
      process.exit(2);
    }
  } catch (err) {
    console.error('Request error:', err && err.message ? err.message : err);
    process.exit(3);
  }
}

run();
