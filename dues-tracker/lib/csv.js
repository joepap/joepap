'use strict';
// Minimal RFC-4180 CSV parse/serialize. No dependency, handles quoted
// fields, embedded commas/quotes/newlines, CRLF, and a UTF-8 BOM.

function parse(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows.
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/** Parse with a header row; returns { headers, records: [{header: value}] } */
function parseWithHeaders(text) {
  const rows = parse(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] || '').trim(); });
    return o;
  });
  return { headers, records };
}

function escapeField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function serialize(headers, rows) {
  const lines = [headers.map(escapeField).join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => escapeField(r[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

module.exports = { parse, parseWithHeaders, serialize };
