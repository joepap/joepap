'use strict';
// Unified roster-file reader: accepts CSV or Excel (.xlsx) uploads and
// returns { headers, records } either way. ConnectPlus exports .xlsx.

const csv = require('./csv');

function isXlsx(buffer, filename) {
  // xlsx files are zip archives: magic bytes "PK".
  if (buffer && buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  return /\.xlsx?$/i.test(filename || '');
}

function parseUpload(buffer, filename) {
  if (isXlsx(buffer, filename)) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!rows.length) return { headers: [], records: [] };
    const headers = rows[0].map(h => String(h).trim());
    const records = rows.slice(1)
      .map(r => {
        const o = {};
        headers.forEach((h, i) => { o[h] = String(r[i] == null ? '' : r[i]).trim(); });
        return o;
      })
      .filter(o => Object.values(o).some(v => v !== ''));
    return { headers, records };
  }
  return csv.parseWithHeaders(buffer.toString('utf8'));
}

/** Distinct value counts per column, only for low-cardinality columns —
 *  lets the import UI offer "which values count as good standing" choices. */
function distincts(headers, records, maxValues) {
  maxValues = maxValues || 20;
  const out = {};
  for (const h of headers) {
    const m = new Map();
    let overflow = false;
    for (const r of records) {
      const v = (r[h] || '').trim() || '(blank)';
      m.set(v, (m.get(v) || 0) + 1);
      if (m.size > maxValues) { overflow = true; break; }
    }
    if (!overflow) {
      out[h] = [...m.entries()].sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    }
  }
  return out;
}

module.exports = { parseUpload, distincts };
