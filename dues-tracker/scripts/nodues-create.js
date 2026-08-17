'use strict';
/*
 * Create NEP records for the people on the "working, no dues" sheet who have no
 * record at all — nine as of roster-59.
 *
 * Joe asked for these on 17 Aug 2026. They are employed by the department and
 * appear on the staffing roster, but nothing comes out of their check and NEP
 * has never heard of them. Without a record there is nothing to mark, so the
 * gap cannot be tracked.
 *
 * Built to match the L36NEW batch already in NEP (tags 002-058), which is the
 * proven shape for an add: keyed on PeopleSoft Number, no email, Role/Status/
 * Groups left for NEP to assign. The one difference is Paying Active Member,
 * which is No here rather than Yes — these people are NOT paying, and saying so
 * is the whole point of the exercise.
 *
 * Refuses to write if any of them turns out to be on the roster already, by
 * payroll number or by name. A duplicate profile costs far more to undo than a
 * missing record costs to leave.
 *
 *   node scripts/nodues-create.js [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-59';
const OUT = process.argv[3] || process.cwd();
const fs = require('fs');
const D = require(path.join(DT, 'node_modules/better-sqlite3'));
const db = new D(path.join(DT, 'data/dues.db'), { readonly: true });
const t = require(path.join(DT, 'lib/tabular'));
const tsl = require(path.join(DT, 'lib/telestaff'));
const match = require(path.join(DT, 'lib/match'));
const notmembers = require(path.join(DT, 'lib/notmembers'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const ts = tsl.collapse(t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads/telestaff-2.csv')), 't.csv').records);
const july = db.prepare('SELECT * FROM rows WHERE import_id=8 AND excluded=0').all();
const regPS = new Map(july.map(r => [r.emplid, r]));
const num = v => L(v).replace(/[^0-9]/g, '');
const psOf = r => { const p = L(r['PeopleSoft Number']); return /^0\d{7}$/.test(p) ? p : ''; };
const nepByPS = new Map(); for (const r of N) { const p = psOf(r); if (p && !nepByPS.has(p)) nepByPS.set(p, r); }
const nepByNameAll = (last, first) => N.filter(x => L(x['Last Name']) &&
  match.scoreCandidate({ lastName: last, firstName: first },
    { norm_last: match.normalizeName(L(x['Last Name'])), norm_first: match.normalizeName(L(x['First Name']))}) >= 92);

/* ---- the same list the sheet is built from ---- */
const noLine = ts.filter(p => !regPS.has(p.emplid))
  .filter(p => !july.some(r => match.scoreCandidate({ lastName: p.last_name, firstName: p.first_name }, r) >= 95))
  .sort((a, b) => (a.last_name + a.first_name).localeCompare(b.last_name + b.first_name));
const isChief = p => /\bchief\b/i.test(p.rank);
const isOther = p => /^(PARAMEDIC|Emergency Medical Technician|EMS Advanced Practice Provider)$/i.test(p.rank.trim());
const isRecruit = p => /^RECRUIT$/i.test(p.rank.trim());
const chase = notmembers.withoutNonMembers(noLine.filter(p => !isChief(p) && !isOther(p) && !isRecruit(p)));
const missing = chase.filter(p => !nepByPS.get(p.emplid) && nepByNameAll(p.last_name, p.first_name).length !== 1);

/* ---- refuse to create anybody who is already there ---- */
// nepByNameAll returning 2+ means "a record we cannot tell apart", not "absent" —
// creating on top of that is how a duplicate profile gets made.
const blocked = [];
for (const p of missing) {
  if (nepByPS.has(p.emplid)) blocked.push([p, 'payroll number ' + p.emplid + ' is already on the roster']);
  const near = nepByNameAll(p.last_name, p.first_name);
  if (near.length) blocked.push([p, `${near.length} record(s) match the name: ` +
    near.map(r => L(r['Last Name']) + ', ' + L(r['First Name'])).join(' · ')]);
  if (!/^0\d{7}$/.test(p.emplid)) blocked.push([p, 'payroll number is not in the 0nnnnnnn form']);
}
if (blocked.length) {
  console.error('REFUSING TO WRITE — these are not safe to create:');
  for (const [p, why] of blocked) console.error('  ' + p.last_name + ', ' + p.first_name + ' — ' + why);
  process.exit(1);
}

/* ---- continue the L36NEW numbering rather than restarting it ---- */
const usedTags = N.map(r => (L(r['Notes']).match(/L36NEW(\d+)/i) || [])[1]).filter(Boolean).map(Number);
let tag = (usedTags.length ? Math.max(...usedTags) : 0);
console.log('L36NEW tags already in use: ' + usedTags.length + ', highest L36NEW' + String(tag).padStart(3, '0'));

/* ---- staffing-roster values translated into what NEP's dropdowns hold ---- */
const RANK = { 'FIREFIGHTER PARAMEDIC': 'Firefighter Paramedic', 'FIREFIGHTER EMT': 'Firefighter EMT' };
const rankValues = new Set(N.map(r => L(r['DC Fire Rank'])).filter(Boolean));
const platoonValues = new Set(N.map(r => L(r['Platoon'])).filter(Boolean));
// "Jamar J." is how the staffing roster writes it; NEP writes "Jamar J".
const cleanName = s => L(s).replace(/\.$/, '').replace(/\s+/g, ' ');
// "M:(937)818-7618" and "*9173763690" both mean +19378187618.
const phone = s => { const d = num(s); return d.length >= 10 ? '+1' + d.slice(-10) : ''; };

const aoa = [['PeopleSoft Number', 'First Name', 'Last Name', 'Member Status', 'Work Status',
              'Paying Active Member', 'DC Fire Rank', 'Platoon', 'Phone Number', 'Notes']];
const problems = [];
for (const p of missing) {
  const rank = RANK[p.rank.trim().toUpperCase()] || '';
  if (!rank) problems.push(`${p.last_name}: no NEP rank for "${p.rank}"`);
  else if (!rankValues.has(rank)) problems.push(`${p.last_name}: "${rank}" is not a value NEP already holds`);
  if (!platoonValues.has(L(p.platoon))) problems.push(`${p.last_name}: platoon "${p.platoon}" is not a value NEP already holds`);
  const ph = phone(p.phone);
  if (!ph) problems.push(`${p.last_name}: no usable phone number`);
  tag++;
  aoa.push([p.emplid, cleanName(p.first_name), cleanName(p.last_name), 'Active', 'Active Member', 'No',
    rank, L(p.platoon), ph,
    `L36NEW${String(tag).padStart(3, '0')} | added from the DC staffing roster of Aug 2026, emplid ${p.emplid}, ` +
    `working with no dues deduction on the 25 July payroll register — Paying Active Member No until money is actually deducted`]);
}
// Every cell must carry a value: a blank one wipes the field on any later run.
for (const [i, row] of aoa.entries()) if (row.some(c => L(c) === '')) problems.push('row ' + (i + 1) + ' has an empty cell');
if (problems.length) { console.error('REFUSING TO WRITE:'); problems.forEach(p => console.error('  ' + p)); process.exit(1); }

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
               { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 100 }];
XLSX.utils.book_append_sheet(wb, ws, 'Upload');
const name = 'Local36-NODUES-7-CREATE-' + missing.length + '-new-members.xlsx';
XLSX.writeFile(wb, path.join(OUT, name));

console.log(`\n${name} — ${missing.length} new records, keyed on PeopleSoft Number`);
console.log('Role, Status and Groups are left out on purpose: NEP sets those itself, and all 47');
console.log('records of the previous L36NEW batch came out Member / nonactive / "All Members, Active".\n');
for (const row of aoa.slice(1)) console.log('  ' + row[0] + '  ' + (row[2] + ', ' + row[1]).padEnd(24) + row[6].padEnd(22) + row[7].padEnd(11) + row[8]);
