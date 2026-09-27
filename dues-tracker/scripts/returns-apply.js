'use strict';
/*
 * Work the undeliverable list from the nominations mailing.
 *
 * Joe's rule, 27 Sep: anyone whose address in NEP already differs from the one
 * that was mailed has fixed it themselves and is left alone. Everyone else has
 * their address moved into Notes and the field cleared, so a blank address
 * means "we know this is wrong and have not heard back" rather than "nobody
 * looked". A member with no address gets no ballot, and no ballot comes back.
 *
 * Two exceptions to the blanking, both of which would throw away a good
 * address:
 *   - a member on the USPS NCOA list with a real forwarding address gets that
 *     address instead;
 *   - a return caused by our own typo — a six-digit zip, a missing leading
 *     zero, a duplicated address line — gets the typo fixed.
 *
 * Notes are appended, never replaced.
 *
 *   node scripts/returns-apply.js <returns.csv> <movers.xls> <roster> [outdir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const t = require(path.join(DT, 'lib/tabular'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const [RET, MOV, ROSTER, OUTDIR] = process.argv.slice(2);
const OUT = OUTDIR || process.cwd();
const TODAY = new Date().toLocaleDateString('en-US');

/* ---- inputs ---- */
function parseCsv(txt) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) { const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
    else if (c !== '\r') cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const all = parseCsv(fs.readFileSync(RET, 'utf8'));
const hi = all.findIndex(r => r[0] === 'Serial');
const hdr = all[hi];
const returns = [];
for (let i = hi + 1; i < all.length; i++) {
  const r = all[i]; if (!/^\d+$/.test(L(r[0]))) break;
  const o = {}; hdr.forEach((h, j) => o[h] = L(r[j])); returns.push(o);
}
const mwb = XLSX.readFile(MOV);
const movers = XLSX.utils.sheet_to_json(mwb.Sheets[mwb.SheetNames[0]], { defval: '', raw: false });
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;

const num = s => L(s).replace(/\D/g, '').replace(/^0+/, '');
const nm = s => L(s).toUpperCase().replace(/[^A-Z]/g, '');
const ad = s => L(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const byId = new Map(), byName = new Map();
N.forEach(r => { const i = num(r['IAFF Member Number']); if (i && !byId.has(i)) byId.set(i, r);
  const k = nm(r['Last Name']) + '|' + nm(r['First Name']); (byName.get(k) || byName.set(k, []).get(k)).push(r); });
const moverBy = new Map(); movers.forEach(m => moverBy.set(nm(m.last) + '|' + nm(m.first), m));

/* ---- NEP's own spellings ---- */
const STATE = { DC: 'District of Columbia', MD: 'Maryland', VA: 'Virginia', PA: 'Pennsylvania',
  DE: 'Delaware', FL: 'Florida', NC: 'North Carolina', SC: 'South Carolina', GA: 'Georgia',
  WV: 'West Virginia', NY: 'New York', NJ: 'New Jersey', TX: 'Texas', TN: 'Tennessee', AZ: 'Arizona' };
const zip5 = z => (L(z).match(/^(\d{5})/) || [])[1] || '';
/* A four-digit zip has lost its leading zero, which is unambiguous. A SIX-digit
 * zip has a stray keystroke somewhere and there is no safe way to guess where:
 * "222309" is Alexandria 22309 (drop a leading 2), but "288226" is Charlotte
 * 28226 (drop an 8) — taking the first or last five gets one of them wrong
 * either way. Those go to a human with a suggestion, never straight into NEP. */
function fixZip(z) {
  const d = L(z).replace(/\D/g, '');
  if (d.length === 5) return d;
  if (d.length === 4) return '0' + d;
  if (d.length === 9) return d.slice(0, 5);
  return '';
}
/* The stray digit is almost always a doubled keystroke, so dropping one of a
 * repeated pair gives the candidates worth putting in front of someone. */
function zipCandidates(z) {
  const d = L(z).replace(/\D/g, '');
  if (d.length !== 6) return [];
  const out = new Set();
  for (let i = 0; i < d.length; i++) if (d[i] === d[i + 1] || d[i] === d[i - 1])
    out.add(d.slice(0, i) + d.slice(i + 1));
  return [...out];
}
const PLACEHOLDER = /^(na|n\/a|not available|none|unknown|n)$/i;
const addrOf = r => [L(r['Street Address']), L(r['Street Address 2']), L(r['City']), L(r['State']), L(r['Zip'])]
  .filter(Boolean).join(', ');

/* ---- sort every return ---- */
const already = [], ncoa = [], typo = [], confirm = [], blank = [], unmatched = [];
for (const r of returns) {
  const i = num(r.MemberID);
  let rec = i && byId.get(i);
  if (!rec) { const g = byName.get(nm(r['Last Name']) + '|' + nm(r['First Name'])) || [];
    if (g.length === 1) rec = g[0]; else { unmatched.push([r, g.length + ' records match the name']); continue; } }
  const now = ad(rec['Street Address']), mailed = ad(r['Address 1']);
  if (now && now !== mailed) { already.push([r, rec]); continue; }
  const m = moverBy.get(nm(r['Last Name']) + '|' + nm(r['First Name']));
  if (m && L(m.address) && !/no forwarding/i.test(m.address)) { ncoa.push([r, rec, m]); continue; }
  const a = L(r['Address 1']), z = L(r.Zip);
  const dupLine = L(r['Address 2']) && L(r['Address 2']).toLowerCase() === a.toLowerCase();
  const sixDigit = !PLACEHOLDER.test(a) && /\d/.test(a) && L(z).replace(/\D/g, '').length === 6;
  if (sixDigit) { confirm.push([r, rec, zipCandidates(z)]); continue; }
  const badZip = !PLACEHOLDER.test(a) && /\d/.test(a) && !/^\d{5}(-\d{4})?$/.test(z) && fixZip(z);
  if (badZip || dupLine) { typo.push([r, rec, badZip ? 'zip ' + z + ' -> ' + fixZip(z) : 'duplicate address line removed']); continue; }
  blank.push([r, rec, !!(m && /no forwarding/i.test(L(m.address)))]);
}

/* ---- key hierarchy ---- */
const uniq = (fn, f) => { const m = new Map(); for (const r of N) { const k = fn(r[f]); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
const mailk = v => L(v).toLowerCase(), numk = v => L(v).replace(/\D/g, ''), plain = v => L(v).toLowerCase();
const NORM = { Email: mailk, 'PeopleSoft Number': numk, 'IAFF Member Number': numk, 'Last Name': plain, 'First Name': plain };
const U = Object.fromEntries(Object.keys(NORM).map(f => [f, uniq(NORM[f], f)]));
const ORDER = ['Email', 'PeopleSoft Number', 'IAFF Member Number', 'Last Name', 'First Name'];
const keyFor = rec => { for (const f of ORDER) { const v = NORM[f](rec[f]); if (v && U[f].get(v) === 1) return { field: f, value: L(rec[f]) }; } return null; };
const KEYNAME = { Email: 'Email', 'PeopleSoft Number': 'PeopleSoft-Number', 'IAFF Member Number': 'IAFF-Member-Number',
  'Last Name': 'Last-Name', 'First Name': 'First-Name' };

const files = [];
const write = (name, header, rows, widths, allowBlank) => {
  const aoa = [header, ...rows];
  for (const [i, row] of aoa.entries()) {
    if (row.length !== header.length) { console.error(`${name}: row ${i + 1} width`); process.exit(1); }
    if (!allowBlank && row.some(c => L(c) === '')) { console.error(`${name}: row ${i + 1} empty cell`); process.exit(1); }
  }
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.slice(0, header.length).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  XLSX.writeFile(wb, path.join(OUT, name));
  files.push([name, rows.length]);
};
let n = 0;
const emit = (tag, list, cols, rowOf, widths, allowBlank) => {
  const b = new Map(); const hand = [];
  for (const item of list) { const k = keyFor(item.rec); if (!k) { hand.push(item); continue; }
    (b.get(k.field) || b.set(k.field, []).get(k.field)).push({ ...item, k }); }
  for (const f of ORDER) { const g = b.get(f); if (!g || !g.length) continue;
    write(`Local36-RETURNS-${++n}-${tag}-${g.length}-KEY-ON-${KEYNAME[f]}.xlsx`,
      [f, ...cols], g.map(x => [x.k.value, ...rowOf(x)]), [34, ...widths], allowBlank); }
  return hand;
};

/* 1. the NCOA forwarding addresses we already hold */
const h1 = emit('new-address', ncoa.map(([r, rec, m]) => ({ r, rec, m })),
  ['Street Address', 'City', 'State', 'Zip', 'Notes'],
  x => [L(x.m.address), L(x.m.city), STATE[L(x.m.st).toUpperCase()] || L(x.m.st), zip5(x.m.zip),
    (L(x.rec['Notes']) ? L(x.rec['Notes']) + ' | ' : '') +
    `address change via NCOA database-old address was: ${addrOf(x.rec)}`],
  [40, 20, 22, 10, 130]);

/* 2. our own typos */
const h2 = emit('typo-fixed', typo.map(([r, rec, why]) => ({ r, rec, why })),
  ['Street Address', 'City', 'State', 'Zip', 'Notes'],
  x => [L(x.r['Address 1']), L(x.r.City), STATE[L(x.r.State).toUpperCase()] || L(x.r.State), fixZip(x.r.Zip),
    (L(x.rec['Notes']) ? L(x.rec['Notes']) + ' | ' : '') +
    `returned undeliverable from the nominations mailing ${TODAY} — corrected, ${x.why}; as mailed it was: ${L(x.r['Address 1'])}, ${L(x.r.City)} ${L(x.r.State)} ${L(x.r.Zip)}`],
  [40, 20, 22, 10, 150]);

/* 3. the blanks — the one place an empty cell is the point */
const h3 = emit('address-cleared', blank.map(([r, rec, dead]) => ({ r, rec, dead })),
  ['Street Address', 'Street Address 2', 'City', 'State', 'Zip', 'Notes'],
  x => ['', '', '', '', '',
    (L(x.rec['Notes']) ? L(x.rec['Notes']) + ' | ' : '') +
    `address removed ${TODAY} — returned undeliverable from the nominations mailing; ` +
    (x.dead ? 'USPS NCOA also reports moved with no forwarding address; ' : '') +
    `old address was: ${addrOf(x.rec)}`],
  [40, 18, 20, 22, 10, 170], true);

/* 2b. six-digit zips — a suggestion, not a decision */
for (const [r, rec, cands] of confirm) {
  const k = keyFor(rec); if (!k) continue;
  write(`Local36-RETURNS-${++n}-YOUR-CALL-zip-${L(rec['Last Name'])}-KEY-ON-${KEYNAME[k.field]}.xlsx`,
    [k.field, 'Street Address', 'City', 'State', 'Zip', 'Notes'],
    [[k.value, L(r['Address 1']), L(r.City), STATE[L(r.State).toUpperCase()] || L(r.State), cands[0] || '',
      (L(rec['Notes']) ? L(rec['Notes']) + ' | ' : '') +
      `returned undeliverable from the nominations mailing ${TODAY} — zip corrected from ${L(r.Zip)}; as mailed it was: ${L(r['Address 1'])}, ${L(r.City)} ${L(r.State)} ${L(r.Zip)}`]],
    [34, 40, 20, 22, 10, 150]);
  console.log(`  ^ ${L(rec['Last Name'])}, ${L(rec['First Name'])} — ${L(r.City)}, ${L(r.State)}: zip "${L(r.Zip)}" could be ${cands.join(' or ')}; the file uses ${cands[0]}`);
}

/* ---- the two follow-up lists ---- */
const wb = XLSX.utils.book_new();
const add = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = w.slice(0, (aoa[2] || aoa[0]).length).map(x => ({ wch: x })); XLSX.utils.book_append_sheet(wb, ws, name); };
const withEmail = blank.filter(([, rec]) => L(rec['Email'])), noEmail = blank.filter(([, rec]) => !L(rec['Email']));
add('Start here', [
  ['Local 36 — the nominations mailing returns'],
  [`${returns.length} came back undeliverable out of 1,854 actually posted.`], [''],
  ['already fixed it themselves — left alone', already.length],
  ['given the USPS forwarding address we hold', ncoa.length],
  ['our own typo, corrected not cleared', typo.length],
  ['address cleared and recorded in Notes', blank.length],
  ['   of those, reachable by email', withEmail.length],
  ['   of those, phone only', noEmail.length],
  [''],
  ['A blank address means we know it is wrong and have not heard back. No address, no ballot, no return.'],
], [70, 10]);
add('Email these members', [['Address returned. These have an email on file.'], [''],
  ['Last Name', 'First Name', 'Email', 'Phone', 'Address removed'],
  ...withEmail.map(([r, rec]) => [L(rec['Last Name']), L(rec['First Name']), L(rec['Email']), L(rec['Phone Number']) || '', addrOf(rec)])],
  [22, 18, 34, 18, 52]);
add('Call these members', [['Address returned and NO email on file. Every one has a phone number.'], [''],
  ['Last Name', 'First Name', 'Phone', 'Member status', 'Address removed'],
  ...noEmail.map(([r, rec]) => [L(rec['Last Name']), L(rec['First Name']), L(rec['Phone Number']) || 'NONE', L(rec['Member Status']), addrOf(rec)])],
  [22, 18, 18, 16, 52]);
add('Left alone', [['Their address in NEP already differs from what was mailed — they fixed it themselves.'], [''],
  ['Last Name', 'First Name', 'Mailed to', 'Address now'],
  ...already.map(([r, rec]) => [L(rec['Last Name']), L(rec['First Name']), L(r['Address 1']), addrOf(rec)])],
  [22, 18, 40, 52]);
XLSX.writeFile(wb, path.join(OUT, 'Local36-RETURNS-followup-lists.xlsx'));

console.log(`${returns.length} returns · leave alone ${already.length} · NCOA address ${ncoa.length} · typo fixed ${typo.length} · zip to confirm ${confirm.length} · cleared ${blank.length}`);
console.log(`   of the cleared: ${withEmail.length} have an email, ${noEmail.length} are phone only`);
for (const [name, rows] of files) console.log(`  ${name}  —  ${rows} rows`);
console.log('  Local36-RETURNS-followup-lists.xlsx  —  the email list, the call list, and who was left alone');
const hand = [...h1, ...h2, ...h3];
if (hand.length) { console.log('\nBY HAND (no unique key):'); hand.forEach(x => console.log('  ' + L(x.rec['Last Name']) + ', ' + L(x.rec['First Name']))); }
if (unmatched.length) { console.log('\nUNMATCHED:'); unmatched.forEach(([r, w]) => console.log('  ' + r['Last Name'] + ', ' + r['First Name'] + ' — ' + w)); }
