// lib/scanners/index.js
// Example scanner registry. Replace TLS/http_headers with your real handlers.

const tlsScanner = async (task) => {
  // placeholder - in real project this would run TLS checks
  return { status: 'done', scanner: 'tls', task };
};

const httpHeadersScanner = async (task) => {
  // placeholder - in real project this would run HTTP header checks
  return { status: 'done', scanner: 'http_headers', task };
};

const noop = async (task) => ({ status: 'skipped', reason: 'noop fallback - unknown task_type', taskType: task.task_type || task.type || null, task });

module.exports = {
  tls: tlsScanner,
  http_headers: httpHeadersScanner,
  noop,
};
