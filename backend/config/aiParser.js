import ExcelJS from 'exceljs';

// Basic AI-parser shim that heuristically extracts canonical fields from headered spreadsheet data.
// This is intentionally lightweight and local so it works without external AI keys. You can replace
// the implementation with a call to an external AI (OpenAI, etc.) that performs richer parsing.

const fatherPatterns = ['father','father name','fathername','parent name','guardian','guardian name'];
const addressPatterns = ['address','addr','residence','permanent address','present address'];
const photoCandidates = ['photo','photo_url','photoUrl','image','image_url','imageUrl','avatar','picture'];

export async function parseFile({ buffer, originalname, mimetype, data = [], rawRows = [], imagesMap = {}, headerless = false }) {
  const result = { extractedRows: [] };
  try {
    // If no structured data was provided, try to interpret the raw buffer as text/CSV/TSV
    if ((!Array.isArray(data) || data.length === 0) && (!Array.isArray(rawRows) || rawRows.length === 0) && buffer) {
      try {
        const txt = buffer.toString('utf8');
        if (txt && txt.trim().length > 0) {
          const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            const first = lines[0];
            const commaCount = (first.match(/,/g) || []).length;
            const tabCount = (first.match(/\t/g) || []).length;
            // If looks like a delimiter-separated file, build rawRows
            if (commaCount > 0 || tabCount > 0) {
              const delim = commaCount >= tabCount ? ',' : '\t';
              rawRows = lines.map(line => line.split(delim).map(c => c.replace(/^"|"$/g, '').trim()));
              // detect header presence
              const headerLine = rawRows[0].join(' ');
              const hasHeaders = /\b(roll|name|email|mobile|phone)\b/i.test(headerLine);
              if (hasHeaders) {
                // build data objects from headered rows
                const headerRow = rawRows[0] || [];
                data = [];
                for (let r = 1; r < rawRows.length; r++) {
                  const rowArr = rawRows[r] || [];
                  const obj = {};
                  const maxLen = Math.max(headerRow.length, rowArr.length);
                  for (let c = 0; c < maxLen; c++) {
                    const rawHeaderCell = headerRow[c];
                    let key = (rawHeaderCell == null ? '' : String(rawHeaderCell).trim());
                    if (!key) key = `Col ${c+1}`;
                    obj[key] = (rowArr[c] == null ? '' : rowArr[c]);
                  }
                  data.push(obj);
                }
                headerless = false;
              } else {
                headerless = true;
              }
            } else {
              // Fallback: try to extract key values from free text (emails, phones, roll-like tokens)
              const emails = Array.from(txt.matchAll(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/ig)).map(m => m[1]);
              const phones = Array.from(txt.matchAll(/(\+?\d[\d\-\s]{6,}\d)/g)).map(m => m[1]);
              const rollMatch = txt.match(/\b([A-Za-z0-9_-]{4,20})\b/);
              const nameLine = lines.find(l => /[A-Za-z]{2,}/.test(l) && l.split(' ').length <= 4);
              result.extractedRows.push({
                fatherName: (txt.match(/(father(?:'s)?\s*name[:\-]?\s*)([^\n]+)/i) || [])[2],
                address: (txt.match(/(address[:\-]?\s*)([^\n]+)/i) || [])[2],
                photo: (txt.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|svg)/i) || [])[0],
                emails: emails.filter(Boolean),
                phones: phones.filter(Boolean),
                roll: rollMatch ? rollMatch[1] : undefined,
                name: nameLine || undefined,
                originalText: txt.substring(0, 5000)
              });
              return result;
            }
          }
        }
      } catch (e) {
        // ignore text parsing errors and continue with heuristics below
        console.warn('AI parser: failed text heuristics', e && e.message ? e.message : e);
      }
    }
    if (!headerless) {
      // headered: data is array of objects
      for (let i = 0; i < data.length; i++) {
        const row = data[i] || {};
        const normalized = {};
        for (const k of Object.keys(row)) normalized[k.toString().toLowerCase().trim()] = row[k];
        const findValue = (patterns) => {
          for (const p of patterns) if (Object.prototype.hasOwnProperty.call(normalized, p)) return normalized[p];
          for (const key of Object.keys(normalized)) { for (const p of patterns) if (key.includes(p)) return normalized[key]; }
          return undefined;
        };
        const fatherName = findValue(fatherPatterns);
        const address = findValue(addressPatterns);
        // photo detection: use keys first
        let photo = undefined;
        for (const key of Object.keys(normalized)) {
          const lk = key.toString().toLowerCase();
          if (photoCandidates.includes(lk) || photoCandidates.some(p => lk.includes(p))) {
            photo = normalized[key]; break;
          }
        }
        // fallback: detect any URL-like value in the row
        if (!photo) {
          for (const key of Object.keys(normalized)) {
            const v = String(normalized[key] || '');
            if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(v)) { photo = v; break; }
          }
        }
        result.extractedRows.push({ fatherName, address, photo, originalObj: row });
      }
    } else {
      // headerless: best-effort per-row extraction from rawRows (array of arrays)
      for (let i = 0; i < rawRows.length; i++) {
        const arr = rawRows[i] || [];
        let fatherName;
        let address;
        let photo;
        let roll;
        let name;
        let email;
        let mobile;

        for (let j = 0; j < arr.length; j++) {
          const v = (arr[j] || '').toString().trim();
          if (!v) continue;

          const lower = v.toLowerCase();
          const digitsOnly = v.replace(/\D/g, '');

          // father name style hints or "S/O", "D/O"
          if (!fatherName && /^(father|father name|s\/o|d\/o|son of|daughter of)/i.test(v)) fatherName = v;

          // email
          if (!email && /\S+@\S+\.\S+/.test(v)) email = v;

          // mobile-like numbers (10-15 digits)
          if (!mobile && digitsOnly.length >= 10 && digitsOnly.length <= 15) mobile = v;

          // roll/id-like tokens: contains digits but is not clearly a phone or email
          if (!roll && digitsOnly.length > 0 && (digitsOnly.length < 10 || digitsOnly.length > 15) && !v.includes('@')) {
            roll = v;
          }

          // candidate for name: mostly letters/spaces, no '@' and few or no digits
          if (!name && /[A-Za-z]{2,}/.test(v) && !v.includes('@') && digitsOnly.length === 0 && lower.length <= 60) {
            name = v;
          }

          // address heuristic: long-ish string with spaces and at least one digit (e.g. house no)
          if (!address && v.length > 10 && /\d+\s+\w+/.test(v)) address = v;

          // direct photo URL
          if (!photo && /^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(v)) photo = v;
        }

        // try imagesMap for this row (if any)
        if (!photo && imagesMap) {
          // search any key that ends with :<row+1>:<col>
          const possible = Object.keys(imagesMap).find(k => k.includes(`:${i+1}:`));
          if (possible) {
            const img = imagesMap[possible];
            if (img && img.buffer) {
              photo = `data:image/${img.extension};base64,${Buffer.from(img.buffer).toString('base64')}`;
            }
          }
        }

        result.extractedRows.push({ fatherName, address, photo, roll, name, email, mobile, originalArr: arr });
      }
    }
  } catch (e) {
    console.warn('AI parser failed heuristics:', e && e.message ? e.message : e);
  }
  return result;
}
