'use strict';
/*
 * Check the "paying, no record" files before they go near NEP.
 *
 * Direction matters and is decided per file: a CREATE file's key must match no
 * roster record (or it makes a duplicate), a LINK or fill-in file's key must
 * match exactly one. Every cell must carry a value, every payroll number must
 * be on the 25 July register, and nobody may appear in two files.
 *
 *   node scripts/paying-verify.js [roster-name] [dir-holding-the-files]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-60';
const S = process.argv[3] || process.cwd();
const fs = require('fs');
const D = require(path.join(DT, 'node_modules/better-sqlite3'));
const db = new D(path.join(DT, 'data/dues.db'), { readonly: true });
const t = require(path.join(DT, 'lib/tabular'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const norm = (f, v) => (f === 'PeopleSoft Number' || f === 'IAFF Member Number')
  ? L(v).replace(/[^0-9]/g, '').replace(/^0+/, '') : L(v).toLowerCase();
const onRegister = ps => !!db.prepare('SELECT 1 FROM rows WHERE import_id=8 AND emplid=? AND excluded=0').get(L(ps));

// The files are numbered because they run in order, and a later one may fill in
// a record an earlier one creates. So the check walks them in that order and
// keeps track of what will exist by the time each is uploaded.
const files = fs.readdirSync(S).filter(f => /^Local36-PAYING-/.test(f)).sort();
let bad = 0, total = 0;
const created = new Set();     // payroll numbers a CREATE file will have made
const touched = new Set();     // payroll numbers already written to by some file
for (const f of files) {
  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(S, f)).Sheets['Upload'], { header: 1, blankrows: false });
  const [hdr, ...rows] = aoa;
  const keyField = hdr[0];
  const isCreate = /CREATE/.test(f);
  const iPS = hdr.indexOf('PeopleSoft Number');
  const problems = [];
  for (const [i, r] of rows.entries()) {
    total++;
    const at = 'row ' + (i + 2);
    if (r.length !== hdr.length || r.some(c => L(c) === '')) problems.push(`${at} has an empty cell: ${JSON.stringify(r)}`);
    const hits = N.filter(x => norm(keyField, x[keyField]) === norm(keyField, r[0]));
    const ps = iPS === -1 ? '' : L(r[iPS]);
    if (isCreate) {
      if (hits.length) problems.push(`${at} key "${r[0]}" already matches ${hits.length} roster record(s) — creating on top of one makes a duplicate`);
      if (created.has(ps)) problems.push(`${at} payroll ${ps} is created twice`);
    } else {
      // Either the record is on the roster now, or an earlier file in this run made it.
      const willExist = hits.length === 1 || (keyField === 'PeopleSoft Number' && created.has(L(r[0])));
      if (!willExist) problems.push(`${at} key "${r[0]}" matches ${hits.length} roster records and is not created by an earlier file`);
      if (hits.length > 1) problems.push(`${at} key "${r[0]}" matches ${hits.length} records — it cannot pick one`);
    }
    // The whole warrant for these records is that the person is paying.
    if (ps) {
      if (!/^0\d{7}$/.test(ps)) problems.push(`${at} payroll number "${ps}" is not in the 0nnnnnnn form`);
      else if (!onRegister(ps)) problems.push(`${at} payroll ${ps} is not on the 25 July register`);
      if (isCreate) {
        if (touched.has(ps)) problems.push(`${at} payroll ${ps} is written to by an earlier file as well`);
        created.add(ps);
      }
      touched.add(ps);
    }
  }
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${f}  (${rows.length} rows, key = ${keyField}${isCreate ? ', creates new records' : ''})`);
  problems.forEach(p => { bad++; console.log('        ' + p); });
}
console.log(`\n${files.length} files, ${total} rows, ${touched.size} distinct payroll numbers, ${created.size} created, ${bad} problems`);

// The two links are the risky ones: print the record each will land on.
console.log('\nThe links land on:');
for (const f of files.filter(x => /LINK/.test(x))) {
  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(S, f)).Sheets['Upload'], { header: 1, blankrows: false });
  const [hdr, row] = aoa;
  const hit = N.find(x => norm(hdr[0], x[hdr[0]]) === norm(hdr[0], row[0]));
  console.log('  ' + f);
  console.log('      ' + (hit ? `${L(hit['Last Name'])}, ${L(hit['First Name'])} — appointed ${L(hit['Appointment Date']) || '?'}, ` +
    `${L(hit['Current Company']) || 'no company'}, payroll now "${L(hit['PeopleSoft Number']) || '(blank)'}"` : 'NO MATCH'));
  console.log('      setting: ' + hdr.slice(1).map((h, i) => h + ' = ' + row[i + 1]).join(', '));
}
