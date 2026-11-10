'use strict';
/*
 * Addresses for members NEP has never had one for, taken from the
 * International's roll.
 *
 * Joe, 10 Nov 2026: "lets upload the 255 that we have never had." These are
 * Active and Active Retired members with no street address in NEP, no note of
 * an address ever having been removed, and an address on the roll that the
 * International has not marked invalid. They were never mailed and never
 * bounced, so nothing here undoes the September returns work.
 *
 * What is held back, and why:
 *   - an address shared by three or more members of the roll is a placeholder
 *     (nine members "live" at 7701 Landover Rd), not a home
 *   - a member matched to the roll by name rather than by IAFF number goes in a
 *     separate file to be looked at first: a father and son can share a name,
 *     and a wrong match here sends a ballot to the wrong house
 *   - a member with no unique key cannot be uploaded at all
 *
 * One file per key, because the wizard asks for the key at step 3 and does not
 * work it out. Every cell carries a value.
 *
 *   node scripts/iaff-address-upload.js [roster-name] [iaff.csv] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const rolllink = require(path.join(DT, 'lib/rolllink'));
const addr = require(path.join(DT, 'lib/addresskey'));
const ROSTER = process.argv[2] || 'roster-72';
const IAFF = process.argv[3] || 'iaff-roll-2026-11-10.csv';
const OUT = process.argv[4] || process.cwd();
const L = v => String(v == null ? '' : v).trim();
const num = rolllink.num;
const TODAY = new Date().toLocaleDateString('en-US');

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const I = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', IAFF)), 'i.csv').records;
const RL = rolllink.link(N, I);

// NEP spells the state out; the roll abbreviates it.
const STATE = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming' };

const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);
const rollName = x => L(x['First Name']) + (L(x['Middle Name']) ? ' ' + L(x['Middle Name']) : '') + ' ' + L(x['Last Name']) + (L(x['Suffix']) ? ' ' + L(x['Suffix']) : '');
const place = x => addr.compact(x['Home Address 1']) + '|' + addr.zip5(x['Zip/Postal Code']);
const shared = new Map();
for (const x of I) shared.set(place(x), (shared.get(place(x)) || 0) + 1);

const uniq = (f, v) => N.filter(x => (f === 'Email' ? L(x[f]).toLowerCase() : num(x[f])) === (f === 'Email' ? L(v).toLowerCase() : num(v))).length === 1;
const keyFor = r => ['Email', 'PeopleSoft Number', 'IAFF Member Number'].map(f => ({ f, v: L(r[f]) })).find(k => k.v && uniq(k.f, k.v));

const byNumber = [], byName = [], held = [];
for (const [r, x] of RL.nepToRoll) {
  if (!/^(Active|Active Retired)$/.test(L(r['Member Status']))) continue;
  if (L(r['Street Address']) || !L(x['Home Address 1'])) continue;
  // An address NEP once held and removed is a different question, settled separately.
  if (/old address was|address removed|returned undeliverable/i.test(L(r['Notes']))) continue;
  if (L(x['Invalid Address'])) continue;
  const state = STATE[L(x['State Province']).toUpperCase()], zip = addr.zip5(x['Zip/Postal Code']);
  if (shared.get(place(x)) >= 3) { held.push([r, x, `the address is shared by ${shared.get(place(x))} members of the roll — a placeholder, not a home`]); continue; }
  if (/not want mail/i.test(L(x['Home Address 2']))) { held.push([r, x, 'the roll says this member does not want mailings']); continue; }
  if (!state || zip.length !== 5 || !L(x['City'])) { held.push([r, x, 'the roll\'s address is missing a state, city or zip NEP can take']); continue; }
  const k = keyFor(r);
  if (!k) { held.push([r, x, 'no unique email, payroll number or IAFF number to upload on — enter by hand']); continue; }
  const row = { r, x, k, cells: [L(x['Home Address 1']), L(x['City']), state, zip, 'USA'] };
  (RL.how.get(r) === 'number' ? byNumber : byName).push(row);
}

const KEYNAME = { Email: 'Email', 'PeopleSoft Number': 'PeopleSoft-Number', 'IAFF Member Number': 'IAFF-Member-Number' };
const HEAD = ['Street Address', 'City', 'State', 'Zip', 'Country', 'Notes'];
const files = [];
let n = 0;
function write(rows, label, noteFor) {
  const groups = new Map();
  for (const row of rows) { if (!groups.has(row.k.f)) groups.set(row.k.f, []); groups.get(row.k.f).push(row); }
  for (const f of ['Email', 'PeopleSoft Number', 'IAFF Member Number']) {
    const g = groups.get(f); if (!g) continue;
    g.sort((a, b) => who(a.r).localeCompare(who(b.r)));
    const header = [f, ...HEAD];
    const aoa = [header, ...g.map(row => [row.k.v, ...row.cells, (L(row.r['Notes']) ? L(row.r['Notes']) + ' | ' : '') + noteFor(row)])];
    for (const [i, line] of aoa.entries()) if (line.length !== header.length || line.some(c => L(c) === ''))
      { console.error(`REFUSING TO WRITE: row ${i + 1} of the ${f} ${label} file has an empty cell`); process.exit(1); }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [30, 34, 22, 22, 10, 10, 110].slice(0, header.length).map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Upload');
    const name = `Local36-IAFFADDR-${++n}-${label}-${g.length}-KEY-ON-${KEYNAME[f]}.xlsx`;
    XLSX.writeFile(wb, path.join(OUT, name));
    files.push([name, g.length, f, g]);
  }
}
write(byNumber, 'addresses', () => `address added ${TODAY} from the IAFF International roll — NEP had none on file`);
write(byName, 'LOOK-FIRST-matched-by-name', row => `address added ${TODAY} from the IAFF International roll — NEP had none on file; ` +
  `matched to the roll by name (${rollName(row.x)}, IAFF ${L(row.x['Id'])})`);

// the ones no file can carry, with what is needed to act on them by hand
if (held.length) {
  const ws = XLSX.utils.aoa_to_sheet([['Member', 'NEP status', 'Why it is not in an upload file', 'Street', 'City', 'State', 'Zip', 'Name on the roll'],
    ...held.map(([r, x, why]) => [who(r), L(r['Member Status']), why, L(x['Home Address 1']), L(x['City']), L(x['State Province']), addr.zip5(x['Zip/Postal Code']), rollName(x)])]);
  ws['!cols'] = [28, 16, 70, 32, 20, 8, 10, 30].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Held back');
  XLSX.writeFile(wb, path.join(OUT, 'Local36-IAFFADDR-held-back.xlsx'));
}

console.log(`${ROSTER} against ${IAFF}\n`);
console.log(`  matched by IAFF number, in upload files   ${String(byNumber.length).padStart(4)}`);
console.log(`  matched by name only, in LOOK-FIRST files ${String(byName.length).padStart(4)}`);
console.log(`  held back                                 ${String(held.length).padStart(4)}`);
held.forEach(([r, , why]) => console.log(`      ${who(r)} — ${why}`));
console.log('\nFILES — one at a time, in this order, every field on Trust File:');
for (const [name, rows, f] of files) console.log(`  ${name}\n      ${rows} row${rows === 1 ? '' : 's'} · at step 3 choose primary key: ${f}`);
