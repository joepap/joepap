'use strict';
/*
 * The NEP correction files that come out of the three-way comparison.
 *
 * Every change here has a reason that can be checked, and nothing is changed
 * on the strength of a name alone:
 *
 *   create        paying through payroll with no NEP record at all
 *   payroll no.   a NEP record the payroll number belongs to that does not
 *                 carry it, or carries it with one digit wrong
 *   paying flag   paying through payroll, NEP's flag not Yes
 *   status        paying through payroll, NEP has no status at all
 *   IAFF number   the International's number for a record that has none, or
 *                 has it one keystroke out — only where an email, phone or
 *                 house agrees as well (lib/rolllink.js backing())
 *   address       one Joe confirmed with the member, or the one MK Elections
 *                 re-sent a ballot to
 *
 * What is left for Joe on purpose: Kline (paying, NEP Active Retired), Butler
 * (paying through another agency, NEP Drop), the two Karl Robinsons (which
 * record is whose), and the four at $0.00 that NEP still flags as paying.
 *
 * All the changes for one record go in one row, so no cell is ever blank —
 * a blank cell clears the field in NEP. Rows are grouped into files by key and
 * by the columns they change, and the key is never a column the row changes.
 * A record with no unique key cannot be reached by any upload and is listed
 * to be done by hand. A key that matched nothing would make NEP create an
 * empty record, so every key is checked against the export first.
 *
 * Build from the newest export. The Notes column carries what the record
 * already says plus the new line; an older export would wipe anything written
 * since.
 *
 *   node scripts/nep-corrections.js <register.json> [roster] [iaff.csv] [mk-report.csv] [outdir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const reglink = require(path.join(DT, 'lib/reglink'));
const rolllink = require(path.join(DT, 'lib/rolllink'));
const addr = require(path.join(DT, 'lib/addresskey'));
const [REG, ROSTER = 'roster-73', IAFF = 'iaff-roll-2026-11-10.csv', MK = '', OUT = process.cwd()] = process.argv.slice(2);
if (!REG) { console.error('usage: node scripts/nep-corrections.js <register.json> [roster] [iaff.csv] [mk-report.csv] [outdir]'); process.exit(1); }
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');
const TODAY = new Date().toLocaleDateString('en-US');

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const I = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', IAFF)), 'i.csv').records;
const RG = reglink.link(reg.rows, N);
const RL = rolllink.link(N, I);
const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);
const status = r => L(r['Member Status']) || '(no status)';
const regDate = (reg.payPeriod || '').split('..')[1] || 'the latest';

/* ---- every change, gathered per record ---- */
const change = new Map();     // NEP record -> { fields: {col: value}, why: [] }
const created = [], already = [], byHand = [], held = [];
function want(r, field, value, why) {
  if (!change.has(r)) change.set(r, { fields: {}, why: [] });
  const c = change.get(r);
  if (c.fields[field] !== undefined && c.fields[field] !== value) throw new Error(`two values for ${field} on ${who(r)}`);
  c.fields[field] = value; if (!c.why.includes(why)) c.why.push(why);
}
const same = (field, a, b) => (field === 'PeopleSoft Number' || field === 'IAFF Member Number') ? num(a) === num(b) : L(a).toLowerCase() === L(b).toLowerCase();
// Never hand a number to one record that another record already holds.
const holders = (field, v) => N.filter(r => num(r[field]) === num(v));

/* 1. paying, no record: create */
for (const [p, cands] of RG.A.noRecord) {
  if (!p.paying) continue;
  if (holders('PeopleSoft Number', p.emplid).length) { held.push([p.name, 'the payroll number is already on a NEP record']); continue; }
  const namesake = (cands || []).map(h => `not ${who(h)} (${status(h)}${L(h['PeopleSoft Number']) ? ', payroll ' + L(h['PeopleSoft Number']) : ''}), who is another man`);
  created.push({ p, namesake });
}

const STATE = { DC: 'District of Columbia', MD: 'Maryland', VA: 'Virginia', DE: 'Delaware', PA: 'Pennsylvania', WV: 'West Virginia',
  NC: 'North Carolina', SC: 'South Carolina', FL: 'Florida', GA: 'Georgia', NJ: 'New Jersey', NY: 'New York', TX: 'Texas', TN: 'Tennessee', AZ: 'Arizona' };
function address(r, a, why) {
  const state = STATE[a.state.toUpperCase()] || a.state, zip = addr.zip5(a.zip);
  if (!a.street || !a.city || !state || zip.length !== 5) { held.push([who(r), 'an address with a part missing: ' + JSON.stringify(a)]); return; }
  want(r, 'Street Address', a.street, why); want(r, 'City', a.city, why); want(r, 'State', state, why); want(r, 'Zip', zip, why); want(r, 'Country', 'USA', why);
}

/* 2. payroll numbers: missing, or one digit wrong */
for (const [p, r] of RG.A.addNumber) if (p.paying) {
  if (holders('PeopleSoft Number', p.emplid).length) held.push([p.name, `payroll ${p.emplid} is already on another record`]);
  else want(r, 'PeopleSoft Number', p.emplid, `payroll number ${p.emplid} from the ${regDate} DC dues register`);
}
for (const [p, r] of RG.A.typo) if (p.paying) {
  if (holders('PeopleSoft Number', p.emplid).length) held.push([p.name, `payroll ${p.emplid} is already on another record`]);
  else want(r, 'PeopleSoft Number', p.emplid, `payroll number corrected from ${L(r['PeopleSoft Number'])} to ${p.emplid}, as printed on the ${regDate} DC dues register`);
}

/* 3. paying flag, and a status where there is none */
for (const [p, r] of RG.A.flagWrong) want(r, 'Paying Active Member', 'Yes', `paying dues through payroll on the ${regDate} register`);
for (const [p, r] of RG.A.statusWrong) {
  if (status(r) === '(no status)') {
    want(r, 'Member Status', 'Active', `no status in NEP; paying dues through payroll on the ${regDate} register`);
    if (L(r['Paying Active Member']) !== 'Yes') want(r, 'Paying Active Member', 'Yes', `paying dues through payroll on the ${regDate} register`);
  } else held.push([p.name, `paying through payroll, NEP says ${status(r)} — Joe's call`]);
}
for (const [p] of RG.A.ambiguous) held.push([p.name, 'two NEP records could be his — Joe to say which']);

/* 4. IAFF numbers from the International's roll, only where something besides the name agrees */
// A shared house is weak evidence on its own: a father and son can share a name
// and an address. So a match backed only by the address is taken only when
// neither side has a namesake and the suffixes do not disagree. An email or a
// phone is the person's own.
const SUFX = s => (L(s).toUpperCase().replace(/\./g, '').match(/\b(JR|SR|II|III|IV|V)\b/) || [''])[0];
const nameKey = r => rolllink.sur(r['Last Name']) + '|' + rolllink.f1(r['First Name']);
const nepNamesakes = new Map(); for (const r of N) nepNamesakes.set(nameKey(r), (nepNamesakes.get(nameKey(r)) || 0) + 1);
function enough(r, x, b) {
  if (b.includes('email') || b.includes('phone')) return true;
  if (!b.length) return false;
  // NEP writes a middle initial V in the first name; only the surname carries a suffix there
  if (SUFX(r['Last Name']) !== (SUFX(x['Suffix']) || SUFX(x['Last Name']))) return false;
  return nepNamesakes.get(nameKey(r)) === 1 && (RL.iByNm.get(nameKey(r)) || []).length === 1;
}
let lookFirst = 0;
for (const [r, x] of RL.fill) {
  const b = rolllink.backing(r, x);
  if (!enough(r, x, b)) { lookFirst++; continue; }
  want(r, 'IAFF Member Number', L(x['Id']), `IAFF number ${L(x['Id'])} from the International's roll — name and ${b.join(' and ')} agree`);
}
// A number one keystroke from the roll's, on a record whose name the roll also
// carries unclaimed, is a typo. Joe confirmed Hoagland on 14 Nov 2026 (his
// address is the one on the roll).
const CONFIRMED = { '00036350': 'Joe, 14 Nov 2026' };
const lev = (a, b) => { let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[b.length]; };
const typoIaff = [];
for (const r of RL.numberNotOnRoll) {
  const c = (RL.iByNm.get(rolllink.sur(r['Last Name']) + '|' + rolllink.f1(r['First Name'])) || []).filter(x => !RL.rollClaimed.has(x));
  if (c.length !== 1 || lev(num(r['IAFF Member Number']), num(c[0]['Id'])) > 2) continue;
  const x = c[0], b = rolllink.backing(r, x), ok = CONFIRMED[num(r['PeopleSoft Number']).padStart(8, '0')];
  if (!enough(r, x, b) && !ok) { held.push([who(r), `IAFF ${L(r['IAFF Member Number'])} in NEP, ${L(x['Id'])} on the roll — nothing but the name agrees`]); continue; }
  want(r, 'IAFF Member Number', L(x['Id']), `IAFF number corrected from ${L(r['IAFF Member Number'])} to ${L(x['Id'])}, the International's — ${ok ? 'confirmed with the member by ' + ok : b.join(' and ') + ' agree'}`);
  typoIaff.push(r);
  // Hoagland: the roll's address is the one he lives at.
  if (ok && L(x['Home Address 1'])) address(r, { street: L(x['Home Address 1']), city: L(x['City']), state: L(x['State Province']), zip: L(x['Zip/Postal Code']) },
    `address confirmed with the member by ${ok}; the ballot went to the old one`);
}

/* 5. addresses MK Elections re-sent a ballot to */
if (MK) {
  const rows = []; let row = [], cur = '', q = false; const txt = fs.readFileSync(MK, 'utf8');
  for (let i = 0; i < txt.length; i++) { const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; } else if (c !== '\r') cur += c; }
  const at = rows.findIndex(r => L(r[0]) === 'Reprints'), hi = rows.findIndex((r, i) => i > at && r[0] === 'Serial');
  for (let i = hi + 1; at >= 0 && i < rows.length && /^\d+$/.test(L(rows[i][0])); i++) {
    const o = {}; rows[hi].forEach((h, j) => { if (!(h in o)) o[h] = L(rows[i][j]); });
    const hits = o.MemberID ? N.filter(r => num(r['IAFF Member Number']) === num(o.MemberID)) : [];
    if (hits.length !== 1) { held.push([o['Last Name'] + ', ' + o['First Name'], 'MK re-sent a ballot, and the MemberID does not pick out one NEP record']); continue; }
    if (o['Address 2']) { held.push([who(hits[0]), 'MK\'s new address has a second line — enter by hand']); continue; }
    address(hits[0], { street: o['Address 1'], city: o.City, state: o.State, zip: o.Zip }, `address MK Elections re-sent the ballot to on ${o['Date Reprinted'].split(' ')[0]}`);
  }
}

/* ---- drop what NEP already holds; pick a key; group into files ---- */
const KEYS = ['Email', 'PeopleSoft Number', 'IAFF Member Number'];
const uniq = (f, v) => !!v && N.filter(x => f === 'Email' ? L(x[f]).toLowerCase() === v.toLowerCase() : num(x[f]) === num(v)).length === 1;
const ORDER = ['PeopleSoft Number', 'IAFF Member Number', 'Member Status', 'Paying Active Member', 'Street Address', 'City', 'State', 'Zip', 'Country'];
const groups = new Map();
for (const [r, c] of change) {
  for (const f of Object.keys(c.fields)) if (same(f, r[f], c.fields[f])) { already.push([who(r), f]); delete c.fields[f]; }
  const cols = ORDER.filter(f => f in c.fields);
  if (!cols.length) continue;
  const key = KEYS.find(k => !cols.includes(k) && uniq(k, L(r[k])));
  if (!key) { byHand.push([r, c]); continue; }
  const g = key + '|' + cols.join('|');
  if (!groups.has(g)) groups.set(g, { key, cols, rows: [] });
  groups.get(g).rows.push([r, c]);
}

/* ---- write ---- */
const KEYNAME = { Email: 'Email', 'PeopleSoft Number': 'PeopleSoft-Number', 'IAFF Member Number': 'IAFF-Member-Number' };
const LABEL = c => c.includes('Street Address') ? 'address' + (c.includes('IAFF Member Number') ? '-and-IAFF-number' : '')
  : c.map(f => ({ 'PeopleSoft Number': 'payroll-number', 'IAFF Member Number': 'IAFF-number', 'Member Status': 'status', 'Paying Active Member': 'paying-flag' })[f]).join('-and-');
const WIDTH = { Email: 34, 'PeopleSoft Number': 18, 'IAFF Member Number': 20, 'Member Status': 14, 'Work Status': 14, 'Paying Active Member': 20,
  'Street Address': 34, City: 20, State: 20, Zip: 8, Country: 8, 'First Name': 18, 'Last Name': 20, Notes: 110 };
const files = []; let n = 0;
function write(label, header, aoa) {
  for (const [i, line] of [header, ...aoa].entries()) if (line.length !== header.length || line.some(c => L(c) === ''))
    { console.error(`REFUSING TO WRITE ${label}: row ${i + 1} has an empty cell`); process.exit(1); }
  const ws = XLSX.utils.aoa_to_sheet([header, ...aoa]);
  ws['!cols'] = header.map(h => ({ wch: WIDTH[h] || 16 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  const name = `Local36-FIX-${++n}-${label}-${aoa.length}-KEY-ON-${KEYNAME[header[0]]}.xlsx`;
  XLSX.writeFile(wb, path.join(OUT, name));
  files.push({ name, rows: aoa.length, key: header[0], label });
}
const note = (r, why) => (L(r['Notes']) ? L(r['Notes']) + ' | ' : '') + why.join('; ') + ` (${TODAY})`;

// creates first, keyed on a payroll number nobody holds — that is what makes NEP create
let tag = Math.max(0, ...N.map(r => Number((L(r['Notes']).match(/L36NEW(\d+)/i) || [])[1]) || 0));
if (created.length) write(`CREATE-new-member${created.length === 1 ? '' : 's'}`,
  ['PeopleSoft Number', 'First Name', 'Last Name', 'Member Status', 'Work Status', 'Paying Active Member', 'Notes'],
  created.map(({ p, namesake }) => [p.emplid, p.first + (p.mid ? ' ' + p.mid : ''), p.last, 'Active', 'Active Member', 'Yes',
    `L36NEW${String(++tag).padStart(3, '0')} | added from the ${regDate} DC payroll dues register, emplid ${p.emplid} — paying, no record in NEP` +
    (namesake.length ? '; ' + namesake.join('; ') : '') + ` (${TODAY})`]));
const sorted = [...groups.values()].sort((a, b) => ORDER.indexOf(a.cols[0]) - ORDER.indexOf(b.cols[0]) || a.cols.length - b.cols.length || KEYS.indexOf(a.key) - KEYS.indexOf(b.key));
for (const g of sorted) {
  g.rows.sort(([a], [b]) => who(a).localeCompare(who(b)));
  write(LABEL(g.cols), [g.key, ...g.cols, 'Notes'], g.rows.map(([r, c]) => [L(r[g.key]), ...g.cols.map(f => c.fields[f]), note(r, c.why)]));
}

/* ---- report ---- */
console.log(`${ROSTER} · ${path.basename(REG)} · ${IAFF}${MK ? ' · ' + path.basename(MK) : ''}\n`);
console.log('FILES — one at a time, in this order, every field on Trust File:');
for (const f of files) console.log(`  ${f.name}\n      ${f.rows} row${f.rows === 1 ? '' : 's'} · at step 3 choose primary key: ${f.key}`);
if (byHand.length) {
  console.log('\nBY HAND — no unique email, payroll number or IAFF number to key on:');
  for (const [r, c] of byHand) console.log(`  ${who(r)} [${status(r)}] — ` + Object.entries(c.fields).map(([f, v]) => `${f} → ${v}`).join(', '));
}
if (held.length) { console.log('\nLEFT ALONE:'); for (const [w, why] of held) console.log(`  ${w} — ${why}`); }
if (already.length) console.log(`\nAlready in NEP, skipped: ${already.map(([w, f]) => `${w} (${f})`).join('; ')}`);
console.log(`\nIAFF numbers matched on the name alone, or on a shared house where a father and son could be confused — not in any file: ${lookFirst}`);
