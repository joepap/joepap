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
// A record holding the payroll number but carrying no surname is a stub: NEP
// makes one when an upload is keyed on a payroll number that does not exist yet.
// It is repaired in place, never created a second time.
const stubPS = new Set(N.filter(r => !L(r['Last Name'])).map(r => ps8(r['PeopleSoft Number'])).filter(Boolean));
const creates = [], repairs = [], links = [], blocked = [];
for (const x of list) {
  if (ALREADY[x.ps]) { links.push(x); continue; }
  const reg = db.prepare('SELECT last_name, first_name FROM rows WHERE import_id=8 AND emplid=? AND excluded=0').get(x.ps);
  if (!reg) { blocked.push([x, 'not on the 25 July register — cannot confirm they pay']); continue; }
  if (stubPS.has(x.ps)) {
    const i0 = x.printed.indexOf(',');
    repairs.push({ ...x, last: L(x.printed.slice(0, i0)), first: L(x.printed.slice(i0 + 1)) });
    continue;
  }
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
  // Never declare a width for a column that has no data. NEP counts the columns
  // from this block, not from the sheet's dimension, so a spare width becomes a
  // phantom blank header on its mapping screen — and several of them collide as
  // "duplicate column headers". Clamp here rather than at each call site.
  ws['!cols'] = widths.slice(0, header.length).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  XLSX.writeFile(wb, path.join(OUT, name));
  files.push([name, rows.length, header[0]]);
};

// The wizard asks which column is the primary key at step 3 — it does not work
// it out. Naming the key in the filename is what stopped the earlier PSFILL
// batches misfiring, and its absence is what let a payroll-number key be chosen
// for a number that did not exist yet, so NEP made a nameless stub instead of
// updating anybody. Every filename says its key from here on.
const KEYNAME = { 'PeopleSoft Number': 'PeopleSoft-Number', 'IAFF Member Number': 'IAFF-Member-Number',
                  'Email': 'Email', 'Last Name': 'Last-Name', 'First Name': 'First-Name' };
const named = (n, what, key) => `Local36-PAYING-${n}-${what}-KEY-ON-${KEYNAME[key]}.xlsx`;
const NEWCOLS = ['PeopleSoft Number', 'First Name', 'Last Name', 'Member Status', 'Work Status', 'Paying Active Member', 'Notes'];
const NEWWIDE = [18, 18, 20, 14, 14, 20, 100];
const newRow = c => { tag++; return [c.ps, c.first, c.last, 'Active', 'Active Member', 'Yes',
  `L36NEW${String(tag).padStart(3, '0')} | added from the 25 July 2026 DC payroll dues register, emplid ${c.ps} — ` +
  `confirmed paying, no record in NEP`]; };

/* ---- 1. repair any stub first: it already holds the payroll number ---- */
// Keyed on a number that now exists, so this updates and cannot create. Run it
// before the creates, or the same person is made twice.
let n = 0;
if (repairs.length) {
  write(named(++n, `REPAIR-${repairs.length}-nameless-record${repairs.length === 1 ? '' : 's'}`, 'PeopleSoft Number'),
    NEWCOLS, repairs.map(newRow), NEWWIDE);
  for (const r of repairs) console.log(`  repair: NEP holds a nameless record on ${r.ps} — filling it in as ${r.printed}`);
}

/* ---- 2. the creates ---- */
write(named(++n, `CREATE-${creates.length}-new-members`, 'PeopleSoft Number'),
  NEWCOLS, creates.map(newRow), NEWWIDE);

/* ---- 3. anything the staffing roster can add, once the record exists ---- */
// Rank is left out: the only one of them on the staffing roster is a recruit,
// and NEP still has no Recruit value on the DC Fire Rank dropdown.
const phone = s => { const d = num(s); return d.length >= 10 ? '+1' + d.slice(-10) : ''; };
const platoons = new Set(N.map(r => L(r['Platoon'])).filter(Boolean));
const extra = creates.map(c => ({ c, p: tsBy.get(c.ps) }))
  .filter(x => x.p && platoons.has(L(x.p.platoon)) && phone(x.p.phone));
if (extra.length) write(named(++n, `platoon-and-phone-${extra.length}`, 'PeopleSoft Number'),
  ['PeopleSoft Number', 'Platoon', 'Phone Number'],
  extra.map(x => [x.c.ps, L(x.p.platoon), phone(x.p.phone)]), [18, 14, 16]);

/* ---- 4. the ones already on the roster under another spelling ---- */
// These set a payroll number on a record that has none, so the key MUST be the
// other column. Anything extra is left off: the fewer key-shaped columns in the
// file, the less there is to pick wrongly at step 3.
const byHand = [];
for (const x of links) {
  const a = ALREADY[x.ps];
  // The key has to pick out one record. A stub sharing the value makes it
  // ambiguous, and no upload can resolve that — it is a deletion first.
  const hits = N.filter(r => L(r[a.key]).replace(/^0+/, '') === L(a.value).replace(/^0+/, ''));
  if (hits.length !== 1) {
    byHand.push([x, a, hits, `${a.key} "${a.value}" matches ${hits.length} records, so no upload can pick one`]);
    continue;
  }
  write(named(++n, `LINK-${a.who.split(',')[0]}-payroll-number`, a.key),
    [a.key, 'PeopleSoft Number'], [[a.value, x.ps]], [22, 18]);
  console.log(`  link: register "${x.printed}" ${x.ps} -> NEP "${a.who}" — key on ${a.key} ${a.value}, NOT on the payroll number`);
}
if (byHand.length) {
  console.log('\nNO FILE BUILT — these have to be done by hand in NEP:');
  for (const [x, a, hits, why] of byHand) {
    console.log(`  ${a.who} — ${why}`);
    hits.forEach(h => console.log(`      "${L(h['Last Name'])}, ${L(h['First Name'])}" ` +
      `payroll "${L(h['PeopleSoft Number']) || '(blank)'}" ` +
      `${L(h['Current Company']) || 'no company'} ${L(h['Appointment Date']) || ''}`.trimEnd()));
    console.log(`      delete the stub, then type ${x.ps} onto the record that has the history.`);
  }
}

console.log('\nFILES (one at a time, in this order — never as a workbook):');
for (const [name, rows, key] of files) console.log(`  ${name}\n      ${rows} row${rows === 1 ? '' : 's'} · at step 3 choose primary key: ${key}`);
