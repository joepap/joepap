'use strict';
/*
 * Check a batch of NEP upload files against a roster — before the upload, to
 * prove each row lands on exactly one record and overwrites nothing it should
 * not; and after it, to see what actually landed.
 *
 * The same reading serves both, because the files say what they want in their
 * own cells. Before: every key must match one record, and the report says what
 * each column would replace. After: the same columns are compared again and a
 * row has landed when every one of them now holds the file's value.
 *
 * Generalises scripts/returns-verify.js, which did this for one batch.
 *
 *   node scripts/upload-verify.js <roster-name> <dir> <filename-prefix>
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const [ROSTER, DIR, PREFIX] = process.argv.slice(2);
if (!ROSTER || !DIR || !PREFIX) { console.error('usage: node scripts/upload-verify.js <roster> <dir> <prefix>'); process.exit(1); }
const L = v => String(v == null ? '' : v).trim();
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const norm = (f, v) => (f === 'PeopleSoft Number' || f === 'IAFF Member Number') ? L(v).replace(/\D/g, '').replace(/^0+/, '') : L(v).toLowerCase();
const KEYCOL = { 'Email': 'Email', 'PeopleSoft-Number': 'PeopleSoft Number', 'IAFF-Member-Number': 'IAFF Member Number' };

const files = fs.readdirSync(DIR).filter(f => f.startsWith(PREFIX) && /-KEY-ON-/.test(f)).sort();
let bad = 0, rowsAll = 0, landedAll = 0;
const seen = new Map();
for (const f of files) {
  const ws = XLSX.readFile(path.join(DIR, f), { cellStyles: true }).Sheets['Upload'];
  const [hdr, ...rows] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const problems = [];
  const fromName = KEYCOL[(f.match(/-KEY-ON-(.+)\.xlsx$/) || [])[1]];
  if (hdr[0] !== fromName) problems.push(`filename says the key is ${fromName} but the first column is ${hdr[0]}`);
  if ((ws['!cols'] || []).length !== hdr.length) problems.push(`declares ${(ws['!cols'] || []).length} column widths for ${hdr.length} columns — NEP shows the extra as blank headers`);
  if (XLSX.utils.decode_range(ws['!ref']).e.c + 1 !== hdr.length) problems.push('the sheet is wider than its header');
  if (new Set(hdr.map(L)).size !== hdr.length || hdr.some(h => !L(h))) problems.push('a header is blank or repeated');
  let landed = 0, overwrite = 0;
  for (const [i, r] of rows.entries()) {
    rowsAll++;
    const hits = N.filter(x => norm(hdr[0], x[hdr[0]]) === norm(hdr[0], r[0]));
    if (hits.length !== 1) { problems.push(`row ${i + 2}: key "${r[0]}" matches ${hits.length} records`); continue; }
    const rec = hits[0];
    if (seen.has(rec)) problems.push(`row ${i + 2}: ${L(rec['Last Name'])}, ${L(rec['First Name'])} is also in ${seen.get(rec)}`);
    seen.set(rec, f);
    let same = true;
    for (const [c, col] of hdr.entries()) {
      if (c === 0 || col === 'Notes') continue;
      const want = L(r[c]), got = L(rec[col]);
      if (want.toLowerCase() !== got.toLowerCase()) { same = false; if (got && want) overwrite++; }
    }
    if (same) landed++;
  }
  landedAll += landed;
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${f.replace(PREFIX, '').replace(/\.xlsx$/, '')}   ${rows.length} rows · landed ${landed} · ` +
    `would replace a value NEP already holds: ${overwrite}`);
  problems.forEach(p => { bad++; console.log('        ' + p); });
}
console.log(`\n${files.length} files · ${rowsAll} rows · ${seen.size} distinct members · ${landedAll} landed on ${ROSTER} · ${bad} problems`);
