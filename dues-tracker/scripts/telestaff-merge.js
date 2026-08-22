'use strict';
/*
 * TeleStaff only shows who is ON DUTY, so one export is one platoon on one day.
 * Four consecutive days covers all four platoons and is how a whole roster is
 * pulled out of it. This merges them, keeps the company assignment that
 * collapse() drops, and says who is newly on the street and not yet in NEP.
 *
 *   node scripts/telestaff-merge.js <roster-name> <file1.csv> [file2.csv ...]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const t = require(path.join(DT, 'lib/tabular'));
const tsl = require(path.join(DT, 'lib/telestaff'));
const match = require(path.join(DT, 'lib/match'));
const notmembers = require(path.join(DT, 'lib/notmembers'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const [ROSTER, ...FILES] = process.argv.slice(2);
if (!ROSTER || !FILES.length) { console.error('usage: node scripts/telestaff-merge.js <roster> <csv...>'); process.exit(1); }

/* ---- merge the platoon files, keeping the assignment columns ---- */
const people = new Map();      // emplid -> merged person
const seenIn = new Map();      // emplid -> [file labels]
for (const f of FILES) {
  const label = path.basename(f);
  const raw = t.parseUpload(fs.readFileSync(f), 't.csv').records;
  const collapsed = tsl.collapse(raw);
  // collapse() keeps the identity; the raw rows keep where they are working.
  const extra = new Map();
  for (const r of raw) {
    const id = L(r['Employee ID']).replace(/\D/g, '').padStart(8, '0');
    if (!/^0\d{7}$/.test(id) || extra.has(id)) continue;
    extra.set(id, { unit: L(r['Unit']), station: L(r['Station']), battalion: L(r['Battalion']),
      specialty: L(r['Specialty']), canAct: L(r['Can Act As']), shift: L(r['Shift']),
      day: L(r['Start Date']).split(' ')[0], raw: L(r['Name']) });
  }
  for (const p of collapsed) {
    (seenIn.get(p.emplid) || seenIn.set(p.emplid, []).get(p.emplid)).push(label);
    if (!people.has(p.emplid)) people.set(p.emplid, Object.assign({}, p, extra.get(p.emplid) || {}));
  }
}
const ts = [...people.values()];
console.log(`${FILES.length} files -> ${ts.length} unique employees`);
console.log('appearing in more than one file (day-work and specialists): ' +
  [...seenIn.values()].filter(v => v.length > 1).length);

/* ---- against NEP ---- */
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const nepPS = new Map();
N.forEach(r => { const p = L(r['PeopleSoft Number']).replace(/\D/g, ''); if (p) nepPS.set(p.padStart(8, '0'), r); });
const nameAll = (last, first) => N.filter(x => L(x['Last Name']) &&
  match.scoreCandidate({ lastName: last, firstName: first },
    { norm_last: match.normalizeName(L(x['Last Name'])), norm_first: match.normalizeName(L(x['First Name'])) }) >= 92);

const byNumber = [], byNameOnly = [], missing = [], ambiguous = [];
for (const p of ts) {
  if (nepPS.has(p.emplid)) { byNumber.push(p); continue; }
  const h = nameAll(p.last_name, p.first_name);
  if (h.length === 1) { byNameOnly.push({ p, nep: h[0] }); continue; }
  if (h.length > 1) { ambiguous.push({ p, hits: h }); continue; }
  missing.push(p);
}
const isChief = p => /\bchief\b/i.test(p.rank);
const isOther = p => /^(PARAMEDIC|Emergency Medical Technician|EMS Advanced Practice Provider)$/i.test(p.rank.trim());
const isRecruit = p => /^RECRUIT$/i.test(p.rank.trim());
const newMembers = notmembers.withoutNonMembers(
  missing.filter(p => !isChief(p) && !isOther(p) && !isRecruit(p)));
const probation = p => /PROBATION/i.test(p.raw || '') || /PROBATION/i.test(p.specialty || '');

console.log(`  in NEP by payroll number: ${byNumber.length}`);
console.log(`  in NEP by name only (record holds no number): ${byNameOnly.length}`);
console.log(`  not in NEP, bargaining unit: ${newMembers.length}   (of which probationary: ${newMembers.filter(probation).length})`);
console.log(`  set aside: chiefs ${missing.filter(isChief).length} · single-role EMS ${missing.filter(isOther).length} · recruits ${missing.filter(isRecruit).length} · ambiguous ${ambiguous.length}`);

/* ---- workbook ---- */
const wb = XLSX.utils.book_new();
const add = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = w.slice(0, (aoa[2] || aoa[0]).length).map(x => ({ wch: x }));
  XLSX.utils.book_append_sheet(wb, ws, name); };

const blocks = {};
newMembers.forEach(p => { const b = p.emplid.slice(0, 6); (blocks[b] = blocks[b] || []).push(p); });

add('Start here', [
  ['Local 36 — the August staffing roster against NEP'],
  [`${FILES.length} TeleStaff exports merged (one platoon each) = ${ts.length} unique employees, against ${ROSTER} (${N.length} records)`],
  [''],
  ['TeleStaff shows who is on duty, not who is employed, so one export is one platoon. Four consecutive days covers the department.'],
  [''],
  ['On the staffing roster and in NEP by payroll number', byNumber.length],
  ['In NEP but the record carries no payroll number', byNameOnly.length],
  ['NOT IN NEP AT ALL — bargaining unit', newMembers.length],
  ['   of those, tagged PROBATION by TeleStaff', newMembers.filter(probation).length],
  ['Set aside: chiefs, single-role EMS, recruits, ambiguous names',
    missing.filter(isChief).length + missing.filter(isOther).length + missing.filter(isRecruit).length + ambiguous.length],
  [''],
  ['Payroll-number blocks among the missing — a block is a class:'],
  ...Object.entries(blocks).sort((a, b) => b[1].length - a[1].length).map(([b, g]) => ['   ' + b + 'xx', g.length]),
], [110, 12]);

add('Not in NEP', [
  ['On the street with a company assignment, and NEP has never heard of them. Sorted by payroll number, so each class sits together.'], [''],
  ['Payroll number', 'Name', 'Rank', 'Platoon', 'Company', 'Station', 'Battalion', 'Probation?', 'Phone', 'Seen on'],
  ...newMembers.sort((a, b) => a.emplid.localeCompare(b.emplid)).map(p => [p.emplid,
    p.last_name + ', ' + p.first_name, p.rank, p.platoon, p.unit || '', p.station || '', p.battalion || '',
    probation(p) ? 'YES' : '', p.phone || '', (seenIn.get(p.emplid) || []).join(' ')]),
], [16, 26, 24, 12, 16, 18, 16, 12, 18, 26]);

add('In NEP, no payroll number', [
  ['Matched by name, but their NEP record carries no payroll number. Adding it makes every future match certain.'], [''],
  ['Payroll number', 'Name on TeleStaff', 'Name in NEP', 'Member status', 'Rank', 'Platoon', 'Company'],
  ...byNameOnly.sort((a, b) => a.p.last_name.localeCompare(b.p.last_name)).map(({ p, nep }) => [p.emplid,
    p.last_name + ', ' + p.first_name, L(nep['Last Name']) + ', ' + L(nep['First Name']),
    L(nep['Member Status']) || '(blank)', p.rank, p.platoon, p.unit || '']),
], [16, 26, 26, 15, 24, 12, 16]);

if (ambiguous.length) add('Ambiguous names', [
  ['TeleStaff has one person; NEP has two or more of that name. A person must pick.'], [''],
  ['Payroll number', 'Name on TeleStaff', 'Rank', 'NEP records of that name'],
  ...ambiguous.map(({ p, hits }) => [p.emplid, p.last_name + ', ' + p.first_name, p.rank,
    hits.map(h => `${L(h['Last Name'])}, ${L(h['First Name'])} [${L(h['Member Status']) || 'blank'}, payroll ${L(h['PeopleSoft Number']) || 'none'}]`).join('  |  ')]),
], [16, 26, 24, 90]);

const out = 'Local36-STAFFING-vs-NEP.xlsx';
XLSX.writeFile(wb, path.join(process.env.OUT || process.cwd(), out));
console.log('\nwritten: ' + out);
