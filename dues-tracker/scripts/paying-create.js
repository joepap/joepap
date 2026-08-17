'use strict';
/*
 * Create NEP records for the people who are paying dues but are not in our
 * database — the "Treasurer - paying no record" sheet. Joe sent the list on
 * 17 Aug 2026: 49 payroll numbers, every one of them deducting on the 25 July
 * register, none of them on the roster.
 *
 * Two of the 49 turn out to be already there under a different spelling. Those
 * get their payroll number added instead of a second profile:
 *
 *   Belle, TySean D  00079233  ->  NEP "Bell, Tysean D", IAFF 1318785
 *   Thomas, Cortni   00093402  ->  NEP "Thomas, Corta M", Class 377
 *
 * Names are taken exactly as the payroll register prints them, split on the
 * comma only. NEP holds multi-word first names and multi-word surnames, so
 * "Lopez Zabala, Leonardo David" needs no rearranging.
 *
 *   node scripts/paying-create.js <list.xlsx> [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const LIST = process.argv[2];
const ROSTER = process.argv[3] || 'roster-60';
const OUT = process.argv[4] || process.cwd();
if (!LIST) { console.error('usage: node scripts/paying-create.js <list.xlsx> [roster] [outdir]'); process.exit(1); }
const fs = require('fs');
const D = require(path.join(DT, 'node_modules/better-sqlite3'));
const db = new D(path.join(DT, 'data/dues.db'), { readonly: true });
const t = require(path.join(DT, 'lib/tabular'));
const tsl = require(path.join(DT, 'lib/telestaff'));
const match = require(path.join(DT, 'lib/match'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/[^0-9]/g, '');
const ps8 = v => num(v).padStart(8, '0');

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const ts = tsl.collapse(t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads/telestaff-2.csv')), 't.csv').records);
const tsBy = new Map(ts.map(p => [p.emplid, p]));
const nepPS = new Set(N.map(r => ps8(r['PeopleSoft Number'])).filter(p => /^0\d{7}$/.test(p)));

const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(LIST).Sheets[XLSX.readFile(LIST).SheetNames[0]],
  { header: 1, blankrows: false, raw: false });
const list = aoa.slice(1).filter(r => num(r[0])).map(r => ({ ps: ps8(r[0]), printed: L(r[1]) }));

/* ---- people already on the roster under another spelling ---- */
// Settled by evidence, not by resemblance. Bell: NEP and the IAFF roll both
// spell him Bell with IAFF 1318785; only the DC payroll writes Belle. Thomas:
// NEP has her as Corta M, Class 377, appointed 09/18/2016 with no payroll
// number, and her classmates hold 00093410, 00093445 and 00093454 — 00093402
// sits inside that block.
const ALREADY = {
  '00079233': { key: 'IAFF Member Number', value: '1318785', who: 'Bell, Tysean D' },
  '00093402': { key: 'First Name', value: 'Corta M', who: 'Thomas, Corta M' },
};

/* ---- refuse to create anyone who is already there ---- */
const creates = [], links = [], blocked = [];
for (const x of list) {
  if (ALREADY[x.ps]) { links.push(x); continue; }
  const reg = db.prepare('SELECT last_name, first_name FROM rows WHERE import_id=8 AND emplid=? AND excluded=0').get(x.ps);
  if (!reg) { blocked.push([x, 'not on the 25 July register — cannot confirm they pay']); continue; }
  if (nepPS.has(x.ps)) { blocked.push([x, 'payroll number is already on the roster']); continue; }
  const near = N.map(r => ({ r, s: match.scoreCandidate({ lastName: reg.last_name, firstName: reg.first_name },
    { norm_last: match.normalizeName(L(r['Last Name'])), norm_first: match.normalizeName(L(r['First Name'])) }) }))
    .filter(y => y.s >= 92);
  if (near.length) { blocked.push([x, 'name matches ' + near.map(y => L(y.r['Last Name']) + ',' + L(y.r['First Name']) + '(' + y.s + ')').join(' ')]); continue; }
  const i = x.printed.indexOf(',');
  if (i < 1) { blocked.push([x, 'cannot split "' + x.printed + '" into a surname and a first name']); continue; }
  creates.push({ ...x, last: L(x.printed.slice(0, i)), first: L(x.printed.slice(i + 1)) });
}
if (blocked.length) {
  console.error('REFUSING TO WRITE — these are not safe to create:');
  for (const [x, why] of blocked) console.error('  ' + x.printed + ' (' + x.ps + ') — ' + why);
  process.exit(1);
}

let tag = Math.max(0, ...N.map(r => Number((L(r['Notes']).match(/L36NEW(\d+)/i) || [])[1]) || 0));
console.log(`${list.length} on the list — ${creates.length} to create, ${links.length} already on the roster under another spelling`);
console.log('L36NEW numbering continues from ' + String(tag).padStart(3, '0') + '\n');

const files = [];
const write = (name, header, rows, widths) => {
  const sheet = [header, ...rows];
  for (const [i, r] of sheet.entries()) if (r.length !== header.length || r.some(c => L(c) === ''))
    { console.error('REFUSING TO WRITE ' + name + ': row ' + (i + 1) + ' has an empty cell'); process.exit(1); }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheet);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  XLSX.writeFile(wb, path.join(OUT, name));
  files.push([name, rows.length, header[0]]);
};

/* ---- 1. the creates ---- */
write(`Local36-PAYING-1-CREATE-${creates.length}-new-members.xlsx`,
  ['PeopleSoft Number', 'First Name', 'Last Name', 'Member Status', 'Work Status', 'Paying Active Member', 'Notes'],
  creates.map(c => { tag++; return [c.ps, c.first, c.last, 'Active', 'Active Member', 'Yes',
    `L36NEW${String(tag).padStart(3, '0')} | added from the 25 July 2026 DC payroll dues register, emplid ${c.ps} — ` +
    `confirmed paying, no record in NEP`]; }),
  [18, 18, 20, 14, 14, 20, 100]);

/* ---- 2. anything the staffing roster can add to a new record ---- */
// Run after file 1, or there is no record to add it to. Rank is left out: the
// only one of them on the staffing roster is a recruit, and NEP still has no
// Recruit value on the DC Fire Rank dropdown.
const phone = s => { const d = num(s); return d.length >= 10 ? '+1' + d.slice(-10) : ''; };
const platoons = new Set(N.map(r => L(r['Platoon'])).filter(Boolean));
const extra = creates.map(c => ({ c, p: tsBy.get(c.ps) })).filter(x => x.p && platoons.has(L(x.p.platoon)) && phone(x.p.phone));
if (extra.length) write(`Local36-PAYING-2-platoon-and-phone-${extra.length}.xlsx`,
  ['PeopleSoft Number', 'Platoon', 'Phone Number'],
  extra.map(x => [x.c.ps, L(x.p.platoon), phone(x.p.phone)]), [18, 14, 16]);

/* ---- 3. the two already on the roster: give them their payroll number ---- */
for (const x of links) {
  const a = ALREADY[x.ps];
  const rec = N.find(r => L(r[a.key]).replace(a.key === 'First Name' ? /(?!)/ : /\D/g, '') === a.value || L(r[a.key]) === a.value);
  const header = ['PeopleSoft Number'], row = [x.ps];
  if (L(rec['Paying Active Member']) !== 'Yes') { header.push('Paying Active Member'); row.push('Yes'); }
  const p = tsBy.get(x.ps);
  if (p && !L(rec['Platoon']) && platoons.has(L(p.platoon))) { header.push('Platoon'); row.push(L(p.platoon)); }
  if (p && !L(rec['Phone Number']) && phone(p.phone)) { header.push('Phone Number'); row.push(phone(p.phone)); }
  write(`Local36-PAYING-${files.length + 1}-LINK-${a.who.split(',')[0]}-payroll-number.xlsx`,
    [a.key, ...header], [[a.value, ...row]], [22, 18, 20, 14, 16]);
  console.log(`  link: register "${x.printed}" ${x.ps} -> NEP "${a.who}" via ${a.key} ${a.value}` +
    (header.length > 1 ? ' (also setting ' + header.slice(1).join(', ') + ')' : ''));
}

console.log('\nFILES (one at a time, in order — never as a workbook):');
for (const [name, rows, key] of files) console.log(`  ${name}  —  ${rows} row${rows === 1 ? '' : 's'}, keyed on ${key}`);
