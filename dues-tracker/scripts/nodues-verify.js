'use strict';
/*
 * Check every "working, no dues" upload file before it goes near NEP: right
 * headers, no blank cell anywhere, every key value present exactly once on the
 * roster, and the key landing on the person we actually meant.
 *
 *   node scripts/nodues-verify.js [roster-name] [dir-holding-the-files]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-59';
const S = process.argv[3] || process.cwd();
const fs = require('fs');
const XLSX = require(DT + '/node_modules/xlsx');
const t = require(DT + '/lib/tabular');
const L = v => String(v == null ? '' : v).trim();
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const norm = (f, v) => f === 'Email' ? L(v).toLowerCase()
  : (f === 'PeopleSoft Number' || f === 'IAFF Member Number') ? L(v).replace(/[^0-9]/g, '')
  : L(v).toLowerCase();

const files = fs.readdirSync(S).filter(f => /^Local36-NODUES-/.test(f)).sort();
let bad = 0, total = 0;
const seenPeople = new Set();
for (const f of files) {
  const ws = XLSX.readFile(S + '/' + f).Sheets['Upload'];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const [hdr, ...rows] = aoa;
  const problems = [];
  if (hdr.length !== 3 || hdr[1] !== 'Member Status' || hdr[2] !== 'Paying Active Member')
    problems.push('header is ' + JSON.stringify(hdr));
  const keyField = hdr[0];
  for (const [i, r] of rows.entries()) {
    total++;
    if (r.length !== 3 || r.some(c => L(c) === '')) problems.push(`row ${i + 2} has an empty cell: ${JSON.stringify(r)}`);
    if (L(r[1]) !== 'Active') problems.push(`row ${i + 2} status is "${r[1]}"`);
    if (L(r[2]) !== 'No') problems.push(`row ${i + 2} paying is "${r[2]}"`);
    const hits = N.filter(x => norm(keyField, x[keyField]) === norm(keyField, r[0]));
    if (hits.length !== 1) problems.push(`row ${i + 2} key "${r[0]}" matches ${hits.length} roster records`);
    else {
      const who = L(hits[0]['Last Name']) + ', ' + L(hits[0]['First Name']);
      if (seenPeople.has(who)) problems.push(`${who} appears in more than one file`);
      seenPeople.add(who);
    }
  }
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${f}  (${rows.length} rows, key = ${keyField})`);
  problems.forEach(p => { bad++; console.log('        ' + p); });
}
console.log(`\n${files.length} files, ${total} rows, ${seenPeople.size} distinct members, ${bad} problems`);

// Every person the file will touch, so the names can be read against the sheet.
console.log('\nWho each file lands on:');
for (const f of files) {
  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(S + '/' + f).Sheets['Upload'], { header: 1, blankrows: false });
  const keyField = aoa[0][0];
  console.log('  ' + f);
  for (const r of aoa.slice(1)) {
    const hit = N.find(x => norm(keyField, x[keyField]) === norm(keyField, r[0]));
    console.log('      ' + (hit ? (L(hit['Last Name']) + ', ' + L(hit['First Name'])).padEnd(26) +
      'was: ' + (L(hit['Member Status']) || '(blank)').padEnd(10) + ' paying=' + (L(hit['Paying Active Member']) || '(blank)')
      : 'NO MATCH for ' + r[0]));
  }
}
