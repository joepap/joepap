'use strict';
/*
 * Create NEP records for a class appointed by a personnel action.
 *
 * The order is the authority (rule 5): rank, company and platoon come from it,
 * not from where the member happened to be standing on a shift. TeleStaff
 * supplies the payroll number, the phone, and the EMT designation the order's
 * house shorthand leaves off (rule 6 — never strip an EMT off a PA line).
 *
 * Cadets and recruits are dated differently (Joe, 22 Aug): a cadet's
 * appointment date is the date printed on the order; a recruit's is when they
 * started the fire academy, which we do not hold — so that column is left off
 * the recruit file entirely rather than filled with the order's date. Prior
 * service at another DC agency does not carry over either way.
 *
 * Paying Active Member is left off both files. DCHR can take months to start a
 * deduction after a member elects to join, so "No" would read as "has not
 * joined" when it may only mean "not processed yet". The next register settles
 * it; asserting nothing is the honest position until then.
 *
 *   node scripts/class-create.js <so-text.txt> <merged-ts.json> <roster> [outdir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const t = require(path.join(DT, 'lib/tabular'));
const match = require(path.join(DT, 'lib/match'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const [TXT, TSJSON, ROSTER, OUTDIR] = process.argv.slice(2);
const OUT = OUTDIR || process.cwd();

const ts = JSON.parse(fs.readFileSync(TSJSON, 'utf8'));
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const nepPS = new Set(N.map(r => L(r['PeopleSoft Number']).replace(/\D/g, '').padStart(8, '0')).filter(x => /^0\d{7}$/.test(x)));
const companies = new Set(N.map(r => L(r['Current Company'])).filter(Boolean));
const ranks = new Set(N.map(r => L(r['DC Fire Rank'])).filter(Boolean));
const platoons = new Set(N.map(r => L(r['Platoon'])).filter(Boolean));

/* ---- read the order ---- */
const lines = fs.readFileSync(TXT, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const CODE = /^(?:[A-Z]{1,3}-\d+-\d+|TA)(?:\s*\(.*\))?$/;
const entries = []; let section = '', effective = '';
for (let i = 0; i < lines.length; i++) {
  const s = lines[i];
  if (/^The following appointments from (Cadet|Recruit) Training Class No\. (\d+)/i.test(s)) {
    section = RegExp.$1 + ' ' + RegExp.$2;
    const d = (lines[i] + ' ' + (lines[i + 1] || '')).match(/(\w+ \d{1,2}, \d{4})/);
    if (d) effective = d[1];
    continue;
  }
  if (/^The following/i.test(s)) { section = ''; continue; }
  if (!section) continue;
  const m = s.match(/^Probationary Firefighter (Paramedic )?(.+?)(?:\s+(TA))?$/);
  if (!m) continue;
  let from = m[3] || '', to = '';
  if (!from && CODE.test(lines[i + 1] || '')) from = lines[++i];
  if (CODE.test(lines[i + 1] || '')) to = lines[++i];
  entries.push({ section, paramedic: !!m[1], name: m[2].trim(), to, effective });
}

/* ---- decode E-14-2 -> Engine 14 / Platoon 2 ---- */
// TeleStaff calls Truck 3 "Tower 3" after the apparatus; NEP files its crew
// under Truck 3, so the order's TL maps to Truck.
const KIND = { E: 'Engine', T: 'Truck', TL: 'Truck', A: 'Ambulance', RS: 'Rescue' };
const decode = c => { const m = L(c).match(/^([A-Z]{1,3})-(\d+)-(\d+)/); return m
  ? { company: (KIND[m[1]] || m[1]) + ' ' + Number(m[2]), platoon: 'Platoon ' + m[3] } : { company: '', platoon: '' }; };

/* ---- find each on the staffing roster for the payroll number and phone ---- */
// Every split point of "Brayan A. Flores Guevara" is tried, but only as a real
// partition: whatever is not the surname stays in the first name, so the middle
// initial is never quietly dropped. Ties go to the longer surname, which is what
// keeps a two-word surname together.
function bestMatch(name) {
  const parts = L(name).replace(/\s+/g, ' ').split(' ');
  let suffix = '';
  if (/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(parts[parts.length - 1])) suffix = parts.pop();
  let best = null;
  for (let cut = 1; cut < parts.length; cut++) {
    const first = parts.slice(0, cut).join(' ');
    const last = parts.slice(cut).join(' ');
    // A surname never begins with an initial: "Brayan A. Flores Guevara" splits
    // after the "A.", not before it.
    if (/^[A-Z]\.?$/.test(parts[cut])) continue;
    for (const p of ts) {
      const s = match.scoreCandidate({ lastName: last, firstName: first },
        { norm_last: match.normalizeName(p.last_name), norm_first: match.normalizeName(p.first_name) });
      if (!best || s > best.s || (s === best.s && last.length > best.last.length))
        best = { p, s, first, last: last + (suffix ? ' ' + suffix : '') };
    }
  }
  return best && best.s >= 88 ? best : null;
}
const phone = s => { const d = L(s).replace(/\D/g, ''); return d.length >= 10 ? '+1' + d.slice(-10) : ''; };
// NEP writes a middle initial without the stop: "Jordan M", not "Jordan M."
const tidy = s => L(s).replace(/\s+/g, ' ').replace(/(\s[A-Z])\.$/, '$1');

let tag = Math.max(0, ...N.map(r => Number((L(r['Notes']).match(/L36NEW(\d+)/i) || [])[1]) || 0));
const problems = [], nameDiff = [], built = {};
for (const e of entries) {
  const hit = bestMatch(e.name);
  if (!hit) { problems.push(`${e.name}: not on the staffing roster, so no payroll number`); continue; }
  const p = hit.p;
  if (nepPS.has(p.emplid)) { problems.push(`${e.name}: payroll ${p.emplid} is already on the roster`); continue; }
  const { company, platoon } = decode(e.to);
  if (!companies.has(company)) problems.push(`${e.name}: company "${company}" is not a value NEP holds`);
  if (!platoons.has(platoon)) problems.push(`${e.name}: platoon "${platoon}" is not a value NEP holds`);
  // The order prints a bare "Firefighter"; TeleStaff carries the EMT. Rule 6.
  const rank = e.paramedic ? 'Firefighter Paramedic'
    : /EMT/i.test(p.rank) ? 'Firefighter EMT' : /PARAMEDIC/i.test(p.rank) ? 'Firefighter Paramedic' : 'Firefighter';
  if (!ranks.has(rank)) problems.push(`${e.name}: rank "${rank}" is not a value NEP holds`);
  const ph = phone(p.phone);
  if (!ph) problems.push(`${e.name}: no usable phone number`);
  // Prefer the order's spelling — it is the signed document — but say where it
  // differs from the department's own staffing system.
  const first = tidy(hit.first), last = tidy(hit.last);
  const tsName = p.last_name + ', ' + p.first_name;
  if (match.normalizeName(last) !== match.normalizeName(p.last_name) ||
      match.normalizeName(first) !== match.normalizeName(p.first_name))
    nameDiff.push([p.emplid, e.name, last + ', ' + first, tsName]);
  tag++;
  const cadet = /^Cadet/.test(e.section);
  (built[e.section] = built[e.section] || []).push({ ps: p.emplid, first, last, rank, platoon, company, ph, cadet,
    classNo: cadet ? 'CC' + e.section.split(' ')[1] : e.section.split(' ')[1],
    appt: cadet ? new Date(e.effective).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '',
    tag: 'L36NEW' + String(tag).padStart(3, '0'), effective: e.effective, onDuty: p.platoon });
}
if (problems.length) { console.error('REFUSING TO WRITE:'); problems.forEach(x => console.error('  ' + x)); process.exit(1); }

/* ---- one file per class ---- */
const files = [];
let n = 0;
for (const [section, rows] of Object.entries(built)) {
  const cadet = /^Cadet/.test(section);
  const header = ['PeopleSoft Number', 'First Name', 'Last Name', 'Member Status', 'Work Status',
    'DC Fire Rank', 'Platoon', 'Current Company', 'Class Number', 'Cadet',
    ...(cadet ? ['Appointment Date'] : []), 'Phone Number', 'Notes'];
  const aoa = [header, ...rows.map(r => [r.ps, r.first, r.last, 'Active', 'Active Member',
    r.rank, r.platoon, r.company, r.classNo, cadet ? 'Yes' : 'No',
    ...(cadet ? [r.appt] : []), r.ph,
    `${r.tag} | ${section === 'Cadet 28' ? 'Cadet Training Class No. 28' : 'Recruit Training Class No. ' + r.classNo}` +
    `, SO-2026-198, appointed to ${r.company} ${r.platoon} effective ${r.effective}`])];
  for (const [i, row] of aoa.entries()) if (row.length !== header.length || row.some(c => L(c) === ''))
    { console.error(`REFUSING TO WRITE ${section}: row ${i + 1} has an empty cell`); process.exit(1); }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [18, 16, 18, 14, 14, 22, 12, 16, 13, 8, 16, 16, 110].slice(0, header.length).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  const name = `Local36-CLASS-${++n}-${section.replace(/\s+/g, '-')}-${rows.length}-new-members-KEY-ON-PeopleSoft-Number.xlsx`;
  XLSX.writeFile(wb, path.join(OUT, name));
  files.push([name, rows.length, header.length]);
  console.log(`${name}\n   ${rows.length} records · ${header.length} columns · Class Number ${rows[0].classNo} · Cadet ${cadet ? 'Yes' : 'No'} · Appointment Date ${cadet ? rows[0].appt : '(left off — academy start not held)'}`);
}
console.log('\nPaying Active Member is on neither file — DCHR lag means "No" would read as "never joined".');
if (nameDiff.length) {
  console.log(`\nname differs between the order and TeleStaff (${nameDiff.length}) — the order's spelling is used:`);
  nameDiff.forEach(d => console.log('   ' + d[0] + '  order "' + d[2] + '"   TeleStaff "' + d[3] + '"'));
}
const moved = Object.values(built).flat().filter(r => r.onDuty && r.onDuty !== r.platoon);
if (moved.length) {
  console.log(`\nplatoon per the order differs from where they are working (${moved.length}) — the order wins, rule 5:`);
  moved.forEach(r => console.log('   ' + r.ps + '  ' + (r.last + ', ' + r.first).padEnd(24) + 'order ' + r.platoon + '   on duty ' + r.onDuty));
}
