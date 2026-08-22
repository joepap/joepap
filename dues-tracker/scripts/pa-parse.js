'use strict';
/*
 * Read a Special Order's personnel actions out of the PDF text and match the
 * probationary appointments against the staffing roster.
 *
 * The order's assignment code carries both the company and the platoon —
 * "E-14-2" is Engine 14, Platoon 2; "T-11-3" is Truck 11, Platoon 3; "TL-3-3"
 * is Tower 3. So the order can be checked against TeleStaff on both, which is
 * what catches a member standing somewhere the order did not send them.
 *
 *   node scripts/pa-parse.js <so-text.txt> <merged-telestaff.json> <roster>
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const t = require(path.join(DT, 'lib/tabular'));
const match = require(path.join(DT, 'lib/match'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const [TXT, TSJSON, ROSTER] = process.argv.slice(2);

const lines = fs.readFileSync(TXT, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const RANKS = ['Probationary Firefighter Paramedic', 'Probationary Firefighter',
  'Firefighter Vice-Technician', 'Firefighter Technician', 'Firefighter Paramedic', 'Firefighter',
  'Lieutenant Paramedic', 'Sergeant Paramedic', 'EMS Captain', 'Sergeant', 'Lieutenant', 'Captain'];
const CODE = /^(?:[A-Z]{1,3}-\d+-\d+|TA|FPD|OFC|[A-Z]{2,5}(?:-[A-Z0-9]+)*)(?:\s*\(.*\))?$/;

// Each entry is: "<rank> <name>" then a From line then a To line — sometimes the
// From is on the same line as the name when the name runs long.
const entries = [];
let section = '';
for (let i = 0; i < lines.length; i++) {
  const s = lines[i];
  if (/^The following/i.test(s)) {
    section = /Cadet Training Class No\. (\d+)/i.test(s) ? 'Cadet Class ' + RegExp.$1
      : /Recruit Training Class No\. (\d+)/i.test(s) ? 'Recruit Class ' + RegExp.$1
      : /promotion/i.test(s) ? 'Promotion' : /vice-technician/i.test(s) ? 'Vice-Technician'
      : /technician appointment/i.test(s) ? 'Technician' : /reassignment/i.test(s) ? 'Reassignment'
      : /retirement/i.test(s) ? 'Retirement' : section;
    continue;
  }
  const rank = RANKS.find(r => s.startsWith(r + ' '));
  if (!rank) continue;
  let rest = s.slice(rank.length).trim();
  let from = '', to = '';
  // "…Searchinger TA" — the From is stuck on the end of the name line.
  const tail = rest.match(/\s+(TA|[A-Z]{1,3}-\d+-\d+)$/);
  if (tail) { from = tail[1]; rest = rest.slice(0, tail.index).trim(); }
  if (!from && CODE.test(lines[i + 1] || '')) from = lines[++i];
  if (CODE.test(lines[i + 1] || '')) to = lines[++i];
  // A retirement's second line is a date, not a company.
  if (section === 'Retirement' && /\d{4}$/.test(lines[i + 1] || '')) to = lines[++i];
  entries.push({ section, rank, name: rest, from, to });
}

/** "E-14-2" -> Engine 14, Platoon 2.  "TL-3-3" -> Tower 3, Platoon 3. */
const KIND = { E: 'Engine', T: 'Truck', TL: 'Tower', A: 'Ambulance', RS: 'Rescue Squad', FB: 'Fireboat' };
function decode(code) {
  const m = L(code).match(/^([A-Z]{1,3})-(\d+)-(\d+)/);
  if (!m) return { company: L(code), platoon: '' };
  return { company: (KIND[m[1]] || m[1]) + ' ' + m[2], platoon: 'Platoon ' + m[3], unitNo: m[2], kind: m[1] };
}

const probies = entries.filter(e => /Class/.test(e.section));
console.log(`${entries.length} personnel actions parsed`);
const bySec = {}; entries.forEach(e => bySec[e.section] = (bySec[e.section] || 0) + 1);
console.log('  ' + Object.entries(bySec).map(([k, v]) => k + '=' + v).join('  '));

/* ---- match the probationers to the staffing roster ---- */
const ts = JSON.parse(fs.readFileSync(TSJSON, 'utf8'));
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const nepPS = new Set(N.map(r => L(r['PeopleSoft Number']).replace(/\D/g, '').padStart(8, '0')).filter(x => /^0\d{7}$/.test(x)));

// The order prints "Given M. Surname"; TeleStaff prints "Surname, Given M."
function splitPA(name) {
  const parts = L(name).replace(/\s+/g, ' ').split(' ');
  const sfx = /^(Jr\.?|Sr\.?|II|III|IV)$/i;
  let suffix = ''; if (sfx.test(parts[parts.length - 1])) suffix = parts.pop();
  const last = parts.pop();
  return { first: parts.join(' '), last: last + (suffix ? ' ' + suffix : ''), bareLast: last };
}
// "Brayan A. Flores Guevara" is one man with a two-word surname; TeleStaff
// writes him "Flores, Brayan". Taking only the last word as the surname loses
// him, so every split point is tried and the best score wins.
function bestMatch(name) {
  const parts = L(name).replace(/\s+/g, ' ').split(' ');
  const sfx = /^(Jr\.?|Sr\.?|II|III|IV)$/i;
  let suffix = ''; if (sfx.test(parts[parts.length - 1])) suffix = parts.pop();
  let best = null;
  for (let cut = 1; cut < parts.length; cut++) {
    const first = parts.slice(0, cut).join(' '), last = parts.slice(cut).join(' ');
    for (const cand of [last, parts[parts.length - 1]]) {
      for (const p of ts) {
        const s = match.scoreCandidate({ lastName: cand, firstName: first },
          { norm_last: match.normalizeName(p.last_name), norm_first: match.normalizeName(p.first_name) });
        if (!best || s > best.s) best = { p, s };
      }
    }
  }
  return best && best.s >= 88 ? best.p : null;
}
const rows = [];
for (const e of probies) {
  const { first, last } = splitPA(e.name);
  const hit = bestMatch(e.name);
  const want = decode(e.to);
  rows.push([e.section, e.rank, e.name, e.to, want.company, want.platoon,
    hit ? hit.emplid : '', hit ? hit.last_name + ', ' + hit.first_name : 'NOT ON THE STAFFING ROSTER',
    hit ? hit.platoon : '', hit && hit.platoon && want.platoon && hit.platoon !== want.platoon ? 'PLATOON DIFFERS' : '',
    hit ? (nepPS.has(hit.emplid) ? 'already in NEP' : 'NOT IN NEP') : '']);
}
const onDuty = rows.filter(r => r[6]);
console.log(`\nprobationary appointments on the order: ${probies.length}`);
console.log(`  found on the staffing roster:      ${onDuty.length}`);
console.log(`  not yet seen on a shift:           ${probies.length - onDuty.length}`);
console.log(`  of those on duty, not in NEP:      ${onDuty.filter(r => r[10] === 'NOT IN NEP').length}`);
console.log(`  platoon differs from the order:    ${rows.filter(r => r[9]).length}`);

/* ---- and the reverse: on the street, not on this order ---- */
// Only bargaining-unit members NEP has never heard of. Chiefs, single-role EMS
// and recruits are outside it, and a member whose NEP record merely lacks a
// payroll number is not missing — they are matched by name.
const paIds = new Set(onDuty.map(r => r[6]));
const notmembers = require(path.join(DT, 'lib/notmembers'));
const nameAll = (last, first) => N.filter(x => L(x['Last Name']) &&
  match.scoreCandidate({ lastName: last, firstName: first },
    { norm_last: match.normalizeName(L(x['Last Name'])), norm_first: match.normalizeName(L(x['First Name'])) }) >= 92);
const isChief = p => /\bchief\b/i.test(p.rank);
const isOther = p => /^(PARAMEDIC|Emergency Medical Technician|EMS Advanced Practice Provider)$/i.test(p.rank.trim());
const isRecruit = p => /^RECRUIT$/i.test(p.rank.trim());
const notOnOrder = notmembers.withoutNonMembers(
  ts.filter(p => !nepPS.has(p.emplid) && !paIds.has(p.emplid) &&
    !isChief(p) && !isOther(p) && !isRecruit(p) && nameAll(p.last_name, p.first_name).length === 0));
console.log(`  on duty, not in NEP, not on this order: ${notOnOrder.length}`);

const wb = XLSX.utils.book_new();
const add = (n, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = w.slice(0, (aoa[2] || aoa[0]).length).map(x => ({ wch: x }));
  XLSX.utils.book_append_sheet(wb, ws, n); };
add('Order vs staffing', [
  ['SO-2026-198 probationary appointments, checked against the four merged TeleStaff exports.'],
  ['The order\'s code carries the company and the platoon — E-14-2 is Engine 14, Platoon 2 — so both are checked.'],
  ['Class', 'Rank on the order', 'Name on the order', 'Code', 'Company', 'Platoon per the order',
   'Payroll number', 'Name on TeleStaff', 'Platoon on duty', 'Mismatch', 'In NEP?'],
  ...rows,
], [16, 34, 30, 10, 16, 20, 16, 26, 16, 16, 16]);
add('On duty, not on this order', [
  ['On the staffing roster, not in NEP, and not among this order\'s appointments. Each needs its own explanation.'], [''],
  ['Payroll number', 'Name', 'Rank', 'Platoon', 'Company', 'Station'],
  ...notOnOrder.sort((a, b) => a.emplid.localeCompare(b.emplid))
    .map(p => [p.emplid, p.last_name + ', ' + p.first_name, p.rank, p.platoon, p.unit || '', p.station || '']),
], [16, 26, 24, 12, 16, 18]);
add('Everything else on the order', [
  ['The non-probationary actions — promotions, appointments, reassignments and retirements.'], [''],
  ['Section', 'Rank', 'Name', 'From', 'To'],
  ...entries.filter(e => !/Class/.test(e.section)).map(e => [e.section, e.rank, e.name, e.from, e.to]),
], [18, 30, 30, 22, 22]);

const out = 'Local36-SO2026-198-vs-staffing.xlsx';
XLSX.writeFile(wb, path.join(process.env.OUT || process.cwd(), out));
console.log('\nwritten: ' + out);
