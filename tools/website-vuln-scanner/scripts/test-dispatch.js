// scripts/test-dispatch.js
const scanners = require('../lib/scanners');
const { dispatchTask } = require('../lib/dispatchTask');

async function run() {
  console.log('--- unknown task_type (literal "unknown") ---');
  const r1 = await dispatchTask({ id: 't1', task_type: 'unknown', url: 'https://example.com' }, scanners);
  console.log(JSON.stringify(r1, null, 2));

  console.log('\n--- missing type field ---');
  const r2 = await dispatchTask({ id: 't2', url: 'https://example.com' }, scanners);
  console.log(JSON.stringify(r2, null, 2));

  console.log('\n--- known type (tls) ---');
  const r3 = await dispatchTask({ id: 't3', task_type: 'tls', url: 'https://example.com' }, scanners);
  console.log(JSON.stringify(r3, null, 2));
}

run().catch(err => { console.error(err); process.exitCode = 1; });
