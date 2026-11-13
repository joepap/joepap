'use strict';
/*
 * Work the ballots MK Elections reports as undeliverable.
 *
 * This is not the September job. Then the mailing was a notice, and Joe's rule
 * was to clear a bounced address so the ballot would not follow it. Now the
 * thing that bounced IS the ballot, so the job is to get a good address to MK
 * while the election is open. For each returned ballot the question is: what
 * do we hold that could get this member a ballot today?
 *
 *   reprinted   MK has already re-sent it; NEP still needs the new address
 *   changed     NEP's address is no longer the one that bounced — the member
 *               has corrected it since, and MK needs to be told
 *   slip        the International's roll has the same house written slightly
 *               differently — a missing quadrant, a transposed zip — and has
 *               not marked it invalid. Ours is probably the typo.
 *   lead        the International holds a different address altogether. It may
 *               be newer than ours or older; it is somewhere to start.
 *   call        nothing else on hand
 *
 * Run it again whenever a newer NEP export arrives: members who fix their own
 * address move into "changed", which is the list to send MK.
 *
 *   node scripts/ballot-returns.js <returns.csv> [roster] [iaff.csv] [outdir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const addr = require(path.join(DT, 'lib/addresskey'));
const zipstate = require(path.join(DT, 'lib/zipstate'));
const [RET, ROSTER = 'roster-73', IAFF = 'iaff-roll-2026-11-10.csv', OUT = process.cwd()] = process.argv.slice(2);
if (!RET) { console.error('usage: node scripts/ballot-returns.js <returns.csv> [roster] [iaff.csv] [outdir]'); process.exit(1); }
const L = v => String(v == null ? '' : v).trim();
const num = s => L(s).replace(/\D/g, '').replace(/^0+/, '');
const nm = s => L(s).toUpperCase().replace(/\b(JR|SR|II|III|IV)\b\.?/g, '').replace(/[^A-Z]/g, '');
const first = s => nm(L(s).split(/\s+/)[0]);
const ten = s => L(s).replace(/\D/g, '').slice(-10);

/* ---- MK's report: three tables in one file, each under a "Serial" header ---- */
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
function table(title) {
  const at = all.findIndex(r => L(r[0]) === title);
  if (at < 0) return [];
  const hi = all.findIndex((r, i) => i > at && r[0] === 'Serial');
  const out = [];
  for (let i = hi + 1; i < all.length; i++) {
    const r = all[i]; if (!/^\d+$/.test(L(r[0]))) break;
    // the reprints table repeats column names for the prior ballot; keep the first of each
    const o = {}; all[hi].forEach((h, j) => { if (!(h in o)) o[h] = L(r[j]); }); out.push(o);
  }
  return out;
}
const returns = table('Undeliverables'), reprints = table('Reprints'), added = table('Added Voters');

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const I = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', IAFF)), 'i.csv').records;
const byId = new Map();
for (const r of N) { const i = num(r['IAFF Member Number']); if (i) byId.set(i, (byId.get(i) || []).concat([r])); }
const iById = new Map(I.map(x => [num(x['Id']), x]));
const status = r => L(r['Member Status']) || '(no status)';
const line = (...parts) => parts.map(L).filter(Boolean).join(', ');

/* ---- sort every return ---- */
const rows = [], unmatched = [];
for (const o of returns) {
  let recs = o.MemberID ? (byId.get(num(o.MemberID)) || []) : [], how = 'IAFF number';
  if (!recs.length) { how = 'name'; recs = N.filter(r => nm(r['Last Name']) === nm(o['Last Name']) && first(r['First Name']) === first(o['First Name'])); }
  // A ballot went to a voting member; a retired or dropped namesake is not who bounced.
  if (recs.length > 1) recs = recs.filter(r => /^(Active|Active Retired)$/.test(status(r)));
  // ...and of several, the one whose address is the address that bounced.
  if (recs.length > 1) recs = recs.filter(r => L(r['Street Address']) && addr.compare({ street: o['Address 1'], zip: o['Zip'] }, { street: r['Street Address'], zip: r['Zip'] }) === 'same');
  if (recs.length !== 1) { unmatched.push([o, recs.length]); continue; }
  const r = recs[0], x = iById.get(num(r['IAFF Member Number']));
  const mailed = { street: o['Address 1'], zip: o['Zip'] };
  const mailedText = line(o['Address 1'], o['Address 2'], o.City, o.State, o.Zip);
  const nepText = line(r['Street Address'], r['Street Address 2'], r['City'], r['State'], r['Zip']);
  const rollText = x ? line(x['Home Address 1'], x['Home Address 2'], x['City'], x['State Province'], x['Zip/Postal Code']) : '';
  const nepNow = L(r['Street Address']) ? addr.compare(mailed, { street: r['Street Address'], zip: r['Zip'] }) : 'blank';
  const roll = x && L(x['Home Address 1']) ? addr.compare(mailed, { street: x['Home Address 1'], zip: x['Zip/Postal Code'] }) : null;
  const rollBad = !!x && !!L(x['Invalid Address']);
  const rp = reprints.find(p => (p.MemberID && num(p.MemberID) === num(o.MemberID)) || (nm(p['Last Name']) === nm(o['Last Name']) && first(p['First Name']) === first(o['First Name'])));

  // what is visibly wrong with the address as mailed
  const wrong = [];
  const zs = zipstate.stateForZip(o.Zip);
  if (!/[a-z]/i.test(o['Address 1']) || /^\?+$/.test(o.City)) wrong.push('there is no real address on file — the street and city are placeholders');
  else {
    if (zs && zs !== o.State) wrong.push(`zip ${o.Zip} is in ${zs}, but the state on file is ${o.State}`);
    if (o.State === 'District of Columbia' && !/\b(NE|NW|SE|SW)\b/i.test(o['Address 1'])) wrong.push('a DC street with no NE / NW / SE / SW');
    // The roll's city comes from the post office, by zip. Ours was typed.
    if (x && roll === 'same' && L(x['City']) && nm(x['City']) !== nm(o.City)) wrong.push(`zip ${o.Zip} is ${L(x['City'])}, ${L(x['State Province'])} — not ${o.City}`);
  }

  let action, other = '', sure = '';
  if (rp) { action = '1  Already re-sent by MK'; other = line(rp['Address 1'], rp['Address 2'], rp.City, rp.State, rp.Zip);
    sure = nepNow === 'same' ? 'the address MK re-sent to — NEP still has the old one, so change it there' : 'the address MK re-sent to'; }
  else if (nepNow !== 'same' && nepNow !== 'blank') { action = '2  NEP has a new address — send it to MK'; other = nepText; sure = 'changed in NEP since the ballot file was built'; }
  // The same house written better is only a fix if the better version is not
  // itself marked invalid: where it is, mail has failed at that house however
  // it is spelt, and the member has to be asked.
  else if (roll === 'near' && !rollBad) { action = '3  Looks like our typo'; other = rollText; sure = 'the same house as the International writes it'; }
  else if (roll === 'near') { action = '5  Call or text'; other = rollText;
    sure = 'the International writes the same house this way and has marked it invalid as well — so the spelling is not the whole story'; }
  else if (roll === 'different') { action = '4  The International has a different address'; other = rollText;
    sure = 'from the International\'s roll — may be newer or older than ours, confirm with the member' + (rollBad ? '; the International has marked it invalid' : ''); }
  else { action = '5  Call or text'; sure = wrong.length ? '' : roll === 'same' ? 'the International has the same address' + (rollBad ? ' and has marked it invalid' : '') : !x ? 'not on the International\'s roll' : ''; }

  const xEmail = x && /@/.test(L(x['Email'])) && L(x['Email']).toLowerCase() !== L(r['Email']).toLowerCase() ? L(x['Email']) : '';
  const xPhone = x && ten(x['Mobile Phone']).length === 10 && ten(x['Mobile Phone']) !== ten(r['Phone Number']) ? L(x['Mobile Phone']) : '';
  rows.push({ action, name: L(r['Last Name']) + ', ' + L(r['First Name']), status: status(r), how,
    phone: L(r['Phone Number']), email: L(r['Email']), alsoTry: [xPhone, xEmail].filter(Boolean).join(' · '),
    mailed: mailedText, wrong: wrong.join('; '), other, sure, marked: o['Date Marked'].split(' ')[0], memberId: o.MemberID,
    company: L(r['Current Company']), platoon: L(r['Platoon']) });
}
if (unmatched.length) {
  for (const [o, n] of unmatched) console.error(`NOT MATCHED: ${o['Last Name']}, ${o['First Name']} (MemberID ${o.MemberID || 'none'}) — ${n} NEP records`);
  console.error('Every returned ballot has to be tied to one member before this list is used.'); process.exit(1);
}
rows.sort((a, b) => a.action.localeCompare(b.action) || a.name.localeCompare(b.name));

/* ---- the workbook ---- */
const count = k => rows.filter(r => r.action.startsWith(k)).length;
const days = {}; for (const r of rows) days[r.marked] = (days[r.marked] || 0) + 1;
const summary = [
  ['Local 36 — ballots returned undeliverable', ''],
  ['', ''],
  [`MK report: ${path.basename(RET)} · NEP export: ${ROSTER} · International roll: ${IAFF}`, ''],
  ['', ''],
  ['Ballots returned', rows.length],
  ['   already re-sent by MK', count('1')],
  ['   NEP now has a different address — send it to MK', count('2')],
  ['   looks like our typo — the International writes the same house differently', count('3')],
  ['   the International holds a different address', count('4')],
  ['   nothing else on hand — call or text', count('5')],
  ['', ''],
  ['Have a phone number in NEP', rows.filter(r => r.phone).length],
  ['Have an email in NEP', rows.filter(r => /@/.test(r.email)).length],
  ['', ''],
  ['When MK marked them', ''],
  ...Object.entries(days).map(([d, n]) => ['   ' + d, n]),
  ['', ''],
  ['HOW TO USE THIS', ''],
  ['The tab "Work list" has one row for each member, in the order above.', ''],
  ['An address in the column "Another address we hold" is a lead, not a fact.', ''],
  ['Confirm it with the member before asking MK to re-send a ballot there.', ''],
  ['When a member gives a new address: change it in NEP and send it to Kenny at MK.', ''],
];
const wb = XLSX.utils.book_new();
const s1 = XLSX.utils.aoa_to_sheet(summary); s1['!cols'] = [{ wch: 84 }, { wch: 8 }];
XLSX.utils.book_append_sheet(wb, s1, 'Start here');
const HEAD = ['What to do', 'Member', 'NEP status', 'Phone', 'Email', 'Also try (from the International)', 'Where the ballot went', 'What looks wrong with it',
  'Another address we hold', 'Where that comes from', 'Company', 'Platoon', 'MK marked it', 'MK MemberID'];
const s2 = XLSX.utils.aoa_to_sheet([HEAD, ...rows.map(r => [r.action.slice(3), r.name, r.status, r.phone, r.email, r.alsoTry, r.mailed, r.wrong, r.other, r.sure, r.company, r.platoon, r.marked, r.memberId])]);
s2['!cols'] = [40, 26, 15, 16, 30, 34, 52, 52, 52, 60, 16, 12, 12, 12].map(w => ({ wch: w }));
XLSX.utils.book_append_sheet(wb, s2, 'Work list');
const file = path.join(OUT, `Local36-BALLOT-RETURNS-${new Date().toISOString().slice(0, 10)}.xlsx`);
XLSX.writeFile(wb, file);

for (const [a, b] of summary.slice(4, 13)) if (a) console.log((b === '' ? '' : String(b).padStart(5) + '  ') + a);
console.log(`\nmatched to NEP: ${rows.filter(r => r.how === 'IAFF number').length} by IAFF number, ${rows.filter(r => r.how === 'name').length} by name`);
console.log(`MK's own tables: ${reprints.length} reprint${reprints.length === 1 ? '' : 's'}, ${added.length} added voter${added.length === 1 ? '' : 's'}`);
console.log('\nWORKBOOK  ' + path.basename(file));
