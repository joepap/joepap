'use strict';
/*
 * Check what the returns files actually did to NEP.
 *
 * Every file written by returns-apply.js says what it wants in the cells
 * themselves, so the check is literal: find the record the key names, and
 * compare each column against the value the file carries. A blank cell means
 * the field must come back blank — that is the whole point of the batch.
 *
 * Reads the key off the filename (...-KEY-ON-<column>.xlsx) rather than
 * guessing, for the same reason the filename carries it: the wizard asks the
 * operator at step 3, so the file and the check must agree on the answer.
 *
 *   node scripts/returns-verify.js [roster-name] [dir-holding-the-files]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-68';
const S = process.argv[3] || process.cwd();
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const L = v => String(v == null ? '' : v).trim();

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
// NEP writes the zip column "Zip"; the upload files use the same name. Street
// Address 2 is only present on a roster export when somebody has one.
const norm = (f, v) => (f === 'PeopleSoft Number' || f === 'IAFF Member Number')
  ? L(v).replace(/\D/g, '').replace(/^0+/, '')
  : L(v).toLowerCase();
const KEYCOL = { 'Email': 'Email', 'PeopleSoft-Number': 'PeopleSoft Number',
                 'IAFF-Member-Number': 'IAFF Member Number', 'Last-Name': 'Last Name',
                 'First-Name': 'First Name' };

const files = fs.readdirSync(S).filter(f => /^Local36-RETURNS-\d/.test(f)).sort();
let landed = 0, missed = 0, unmatched = [];
for (const f of files) {
  const keyFromName = KEYCOL[(f.match(/-KEY-ON-(.+)\.xlsx$/) || [])[1]];
  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(S, f)).Sheets['Upload'],
    { header: 1, blankrows: false, defval: '' });
  const [hdr, ...rows] = aoa;
  if (hdr[0] !== keyFromName)
    console.log(`WARN  ${f}: filename says key ${keyFromName}, first column is ${hdr[0]}`);
  let ok = 0; const bad = [];
  for (const [i, r] of rows.entries()) {
    const hits = N.filter(x => norm(hdr[0], x[hdr[0]]) === norm(hdr[0], r[0]));
    if (hits.length !== 1) {
      bad.push(`row ${i + 2}: key "${r[0]}" matches ${hits.length} records on ${ROSTER}`);
      unmatched.push([f, r[0]]);
      continue;
    }
    const rec = hits[0];
    const wrong = [];
    for (const [c, col] of hdr.entries()) {
      if (c === 0 || col === 'Notes') continue;
      const want = L(r[c]), got = L(rec[col]);
      if (want.toLowerCase() !== got.toLowerCase())
        wrong.push(`${col}: wanted ${want ? '"' + want + '"' : 'blank'}, NEP has ${got ? '"' + got + '"' : 'blank'}`);
    }
    // Notes are pre-merged, so the file's text should be the field's text. A
    // longer field means somebody typed alongside us; that is worth seeing but
    // is not a failure.
    const iN = hdr.indexOf('Notes');
    if (iN !== -1 && !L(rec['Notes']).includes(L(r[iN]).slice(0, 60)))
      wrong.push('Notes: our line is not there');
    if (wrong.length) bad.push(`row ${i + 2}: ${L(rec['Last Name'])}, ${L(rec['First Name'])} — ` + wrong.join('; '));
    else ok++;
  }
  landed += ok; missed += rows.length - ok;
  console.log(`${ok === rows.length ? 'landed ' : 'PARTIAL'} ${f.replace(/^Local36-RETURNS-/, '').replace(/-KEY-ON-.*/, '')}   ${ok}/${rows.length}`);
  bad.forEach(b => console.log('        ' + b));
}
console.log(`\n${landed} of ${landed + missed} rows landed across ${files.length} files`);

const has = r => !!(L(r['Street Address']) && L(r['City']) && L(r['State']) && L(r['Zip']));
console.log(`\n${ROSTER}: ${N.length} records · mailable ${N.filter(has).length} · no address ${N.filter(r => !has(r)).length}`);
if (unmatched.length) {
  console.log('\nKeys that match nothing — these need looking up in NEP by hand:');
  for (const [f, k] of unmatched) console.log(`  ${k}  (from ${f})`);
}
