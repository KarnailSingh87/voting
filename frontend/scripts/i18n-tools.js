#!/usr/bin/env node
// Simple i18n export/import tool
// Usage:
//  node scripts/i18n-tools.js export <localesDir> <out.csv>
//  node scripts/i18n-tools.js import <in.csv> <localesDir>

import fs from 'fs';
import path from 'path';

function readLocales(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const locales = {};
  for (const e of entries) {
    if (e.isDirectory()) {
      const p = path.join(dir, e.name, 'translation.json');
      if (fs.existsSync(p)) {
        try {
          locales[e.name] = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (err) {
          console.error('Failed to parse', p, err.message);
        }
      }
    }
  }
  return locales;
}

function escapeCSV(value) {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\r') continue;
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += ch;
    }
  }
  // last
  if (field !== '' || inQuotes || cur.length) cur.push(field);
  if (cur.length) rows.push(cur);
  return rows;
}

function exportCSV(localesDir, outFile) {
  const locales = readLocales(localesDir);
  const langs = Object.keys(locales).sort();
  const keys = new Set();
  langs.forEach(l => Object.keys(locales[l] || {}).forEach(k => keys.add(k)));
  const header = ['key', ...langs];
  const rows = [header];
  for (const key of Array.from(keys).sort()) {
    const row = [key];
    for (const l of langs) row.push(locales[l][key] ?? '');
    rows.push(row.map(escapeCSV).join(','));
  }
  const out = rows[0].map(escapeCSV).join(',') + '\n' + rows.slice(1).join('\n');
  fs.writeFileSync(outFile, out, 'utf8');
  console.log('Exported', outFile);
}

function importCSV(inFile, localesDir) {
  const text = fs.readFileSync(inFile, 'utf8');
  const rows = parseCSV(text);
  if (!rows || rows.length < 1) { console.error('Empty CSV'); return; }
  const header = rows[0].map(h => h.trim());
  const langs = header.slice(1);
  const locales = {};
  for (const l of langs) locales[l] = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const key = row[0];
    for (let c = 1; c < header.length; c++) {
      const lang = header[c];
      const val = row[c] ?? '';
      locales[lang][key] = val;
    }
  }
  // write back
  for (const lang of Object.keys(locales)) {
    const dir = path.join(localesDir, lang);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'translation.json');
    fs.writeFileSync(file, JSON.stringify(locales[lang], null, 2), 'utf8');
    console.log('Wrote', file);
  }
}

const argv = process.argv.slice(2);
if (argv.length < 1) {
  console.log('Usage: node scripts/i18n-tools.js export <localesDir> <out.csv>');
  console.log('       node scripts/i18n-tools.js import <in.csv> <localesDir>');
  process.exit(1);
}

const cmd = argv[0];
if (cmd === 'export') {
  const localesDir = argv[1] || './src/locales';
  const out = argv[2] || './translations.csv';
  exportCSV(localesDir, out);
} else if (cmd === 'import') {
  const inFile = argv[1] || './translations.csv';
  const localesDir = argv[2] || './src/locales';
  importCSV(inFile, localesDir);
} else {
  console.error('Unknown command', cmd);
}
