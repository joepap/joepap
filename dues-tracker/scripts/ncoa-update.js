'use strict';
/*
 * Apply the USPS NCOA results MK Elections returned.
 *
 * 68 members have a new address; 3 came back "Moved No Forwarding Address" and
 * their address is removed rather than replaced — we now know it is dead and
 * have nothing to put there.
 *
 * Three things this has to get right or it costs data:
 *
 *  - Notes are APPENDED, never replaced. Six of the 71 carry "50 year member",
 *    and overwriting that loses the only record of the honour.
 *  - NCOA writes states as "MD"; NEP writes "Maryland". Writing the short form
 *    would leave the State column in two formats.
 *  - NCOA gives ZIP+4; NEP holds five digits on 2,774 records against 11 with
 *    the extension, so the zip is trimmed to match the house convention.
 *
 * The deletion file is the one place a blank cell is deliberate: a blank wipes
 * the field, which is exactly what is wanted for those three.
 *
 *   node scripts/ncoa-update.js <movers.xls> <roster> [outdir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const t = require(path.join(DT, 'lib/tabular'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const [FILE, ROSTER, OUTDIR] = process.argv.slice(2);
const OUT = OUTDIR || process.cwd();

const wbIn = XLSX.readFile(FILE);
const movers = XLSX.utils.sheet_to_json(wbIn.Sheets[wbIn.SheetNames[0]], { defval: '', raw: false });
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const norm = s => L(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const nep = new Map(); N.forEach(r => nep.set(norm(r['Last Name']) + '|' + norm(r['First Name']), r));

const STATE = { DC: 'District of Columbia', MD: 'Maryland', VA: 'Virginia', PA: 'Pennsylvania',
  DE: 'Delaware', FL: 'Florida', NC: 'North Carolina', SC: 'South Carolina', GA: 'Georgia',
  WV: 'West Virginia', NY: 'New York', NJ: 'New Jersey', OH: 'Ohio', TX: 'Texas', TN: 'Tennessee',
  AZ: 'Arizona', CA: 'California', ME: 'Maine', MA: 'Massachusetts', CT: 'Connecticut' };
const zip5 = z => (L(z).match(/^(\d{5})/) || [])[1] || '';
const oldAddr = r => [L(r.oaddress), L(r.oaddress2), L(r.ocity), L(r.ostate), zip5(r.ozipcode)]
  .filter(Boolean).join(', ');

/* ---- key hierarchy, one key column per file ---- */
const uniq = (fn, field) => { const m = new Map(); for (const r of N) { const k = fn(r[field]); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
const mail = v => L(v).toLowerCase(), num = v => L(v).replace(/\D/g, ''), plain = v => L(v).toLowerCase();
const U = { Email: uniq(mail, 'Email'), 'PeopleSoft Number': uniq(num, 'PeopleSoft Number'),
  'IAFF Member Number': uniq(num, 'IAFF Member Number'), 'Last Name': uniq(plain, 'Last Name'),
  'First Name': uniq(plain, 'First Name') };
const NORMOF = { Email: mail, 'PeopleSoft Number': num, 'IAFF Member Number': num, 'Last Name': plain, 'First Name': plain };
const keyFor = rec => {
  for (const f of ['Email', 'PeopleSoft Number', 'IAFF Member Number', 'Last Name', 'First Name']) {
    const v = NORMOF[f](rec[f]);
    if (v && U[f].get(v) === 1) return { field: f, value: L(rec[f]) };
  }
  return null;
};

const updates = [], removals = [], byHand = [], problems = [];
for (const r of movers) {
  const rec = nep.get(norm(r.last) + '|' + norm(r.first));
  if (!rec) { problems.push(`${r.last}, ${r.first}: no NEP record`); continue; }
  const k = keyFor(rec);
  if (!k) { byHand.push([r, rec, 'no field on the record is unique roster-wide']); continue; }
  const gone = /no forwarding/i.test(L(r.address));
  // Keep whatever the record already says — six of these are "50 year member".
  const prior = L(rec['Notes']);
  if (gone) {
    removals.push({ k, r, rec, note: (prior ? prior + ' | ' : '') +
      `address removed ${new Date().toLocaleDateString('en-US')} — USPS NCOA reports moved with no forwarding address; old address was: ${oldAddr(r)}` });
    continue;
  }
  const state = STATE[L(r.st).toUpperCase()];
  if (!state) { problems.push(`${r.last}, ${r.first}: no long form for state "${r.st}"`); continue; }
  if (!L(r.address) || !L(r.city) || !zip5(r.zip)) { problems.push(`${r.last}, ${r.first}: incomplete new address`); continue; }
  updates.push({ k, r, rec, state,
    note: (prior ? prior + ' | ' : '') + `address change via NCOA database-old address was: ${oldAddr(r)}` });
}
if (problems.length) { console.error('REFUSING TO WRITE:'); problems.forEach(p => console.error('  ' + p)); process.exit(1); }

const KEYNAME = { 'Email': 'Email', 'PeopleSoft Number': 'PeopleSoft-Number',
  'IAFF Member Number': 'IAFF-Member-Number', 'Last Name': 'Last-Name', 'First Name': 'First-Name' };
const files = [];
const write = (name, header, rows, widths, allowBlank) => {
  const aoa = [header, ...rows];
  for (const [i, row] of aoa.entries()) {
    if (row.length !== header.length) { console.error(`${name}: row ${i + 1} has ${row.length} cells, header has ${header.length}`); process.exit(1); }
    if (!allowBlank && row.some(c => L(c) === '')) { console.error(`${name}: row ${i + 1} has an empty cell`); process.exit(1); }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.slice(0, header.length).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  XLSX.writeFile(wb, path.join(OUT, name));
  files.push([name, rows.length]);
};

let n = 0;
const buckets = new Map();
updates.forEach(u => { const f = u.k.field; (buckets.get(f) || buckets.set(f, []).get(f)).push(u); });
for (const f of ['Email', 'PeopleSoft Number', 'IAFF Member Number', 'Last Name', 'First Name']) {
  const g = buckets.get(f); if (!g || !g.length) continue;
  write(`Local36-NCOA-${++n}-${g.length}-new-addresses-KEY-ON-${KEYNAME[f]}.xlsx`,
    [f, 'Street Address', 'City', 'State', 'Zip', 'Notes'],
    g.map(u => [u.k.value, L(u.r.address), L(u.r.city), u.state, zip5(u.r.zip), u.note]),
    [34, 40, 20, 22, 10, 120]);
}
// Blank cells here are the point: a blank wipes the field. Split by key type
// like any other batch, since three people need not share one.
const rbuckets = new Map();
removals.forEach(x => { const f = x.k.field; (rbuckets.get(f) || rbuckets.set(f, []).get(f)).push(x); });
for (const f of ['Email', 'PeopleSoft Number', 'IAFF Member Number', 'Last Name', 'First Name']) {
  const g = rbuckets.get(f); if (!g || !g.length) continue;
  write(`Local36-NCOA-${++n}-REMOVE-${g.length}-dead-address${g.length === 1 ? '' : 'es'}-KEY-ON-${KEYNAME[f]}.xlsx`,
    [f, 'Street Address', 'City', 'State', 'Zip', 'Notes'],
    g.map(x => [x.k.value, '', '', '', '', x.note]), [34, 40, 20, 22, 10, 140], true);
}

console.log(`${movers.length} movers · ${updates.length} new addresses · ${removals.length} removals · ${byHand.length} by hand`);
for (const [name, rows] of files) console.log(`  ${name}  —  ${rows} rows`);
console.log(`\nNotes appended, never replaced — ${updates.concat(removals).filter(u => L(u.rec['Notes'])).length} of these carry an existing note.`);
if (byHand.length) { console.log('\nBY HAND:'); byHand.forEach(([r, , why]) => console.log(`  ${r.last}, ${r.first} — ${why}`)); }
console.log('\nremovals:');
removals.forEach(x => console.log(`  ${x.r.last}, ${x.r.first}  (key ${x.k.field} ${x.k.value})`));
