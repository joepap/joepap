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
  // Columns are found by name, not by position: the marking files carry three
  // columns and the create file carries ten, and both must verify the same way.
  const col = name => hdr.indexOf(name);
  const keyField = hdr[0];
  const iStatus = col('Member Status'), iPay = col('Paying Active Member');
  // A create file makes records that do not exist yet, so a key that matches
  // nothing is right there and wrong everywhere else.
  const creates = col('Last Name') !== -1 && col('First Name') !== -1;
  if (iStatus === -1 || iPay === -1) problems.push('header is missing a column we set: ' + JSON.stringify(hdr));
  for (const [i, r] of rows.entries()) {
    total++;
    if (r.length !== hdr.length || r.some(c => L(c) === '')) problems.push(`row ${i + 2} has an empty cell: ${JSON.stringify(r)}`);
    if (L(r[iStatus]) !== 'Active') problems.push(`row ${i + 2} status is "${r[iStatus]}"`);
    if (L(r[iPay]) !== 'No') problems.push(`row ${i + 2} paying is "${r[iPay]}"`);
    const hits = N.filter(x => norm(keyField, x[keyField]) === norm(keyField, r[0]));
    const want = creates ? 0 : 1;
    if (hits.length !== want)
      problems.push(`row ${i + 2} key "${r[0]}" matches ${hits.length} roster records, wanted ${want}` +
        (creates && hits.length ? ' — creating on top of an existing record makes a duplicate' : ''));
    const who = hits.length === 1 ? L(hits[0]['Last Name']) + ', ' + L(hits[0]['First Name'])
      : creates ? L(r[col('Last Name')]) + ', ' + L(r[col('First Name')]) : null;
    if (who) {
      if (seenPeople.has(who)) problems.push(`${who} appears in more than one file`);
      seenPeople.add(who);
    }
  }
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${f}  (${rows.length} rows, key = ${keyField}${creates ? ', creates new records' : ''})`);
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
