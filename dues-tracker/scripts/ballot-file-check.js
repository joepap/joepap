'use strict';
/*
 * Check the file that is actually going to the election company — the
 * Notification of Nominations export — rather than the NEP roster it came from.
 *
 * The only question that matters for a mailed ballot is whether it arrives.
 * Three ways it does not: no address on the file, an address our own groups
 * already record as wrong or returned, or the member missing from the file
 * altogether.
 *
 *   node scripts/ballot-file-check.js <nominations.xlsx> [roster-name] [outdir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const FILE = process.argv[2];
const ROSTER = process.argv[3] || 'roster-62';
const OUT = process.argv[4] || process.cwd();
if (!FILE) { console.error('usage: node scripts/ballot-file-check.js <nominations.xlsx> [roster] [outdir]'); process.exit(1); }
const fs = require('fs');
const D = require(path.join(DT, 'node_modules/better-sqlite3'));
const db = new D(path.join(DT, 'data/dues.db'), { readonly: true });
const t = require(path.join(DT, 'lib/tabular'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const wbIn = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(wbIn.Sheets[wbIn.SheetNames[0]], { defval: '', raw: false });
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;

const norm = s => L(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const key = r => norm(r['Last Name']) + '|' + norm(r['First Name']);
const mailable = r => L(r['Street Address']) && L(r['City']) && L(r['State']) && L(r['Zip']);
const ps8 = v => L(v).replace(/\D/g, '').padStart(8, '0');
const paying = new Set(db.prepare('SELECT emplid FROM rows WHERE import_id=8 AND excluded=0 AND amount_taken>0')
  .all().map(r => String(r.emplid).padStart(8, '0')));
const WRONG = 'Known Wrong addresses that need updating', RET = '2024 returned mail', UPD = '2024 updated members';
const inGroup = (r, g) => L(r['Groups']).split(',').map(s => s.trim()).includes(g);

// Match each line back to its NEP record so the groups and payroll number can be read.
const nep = new Map();
N.forEach(r => { const k = key(r); (nep.get(k) || nep.set(k, []).get(k)).push(r); });
const nepOf = r => { const m = nep.get(key(r)); return m && m.length === 1 ? m[0] : null; };

const bad = [];
for (const r of rows) {
  const x = nepOf(r);
  const why = [];
  if (!L(r['Street Address'])) why.push('no address on the file');
  else if (!mailable(r)) why.push('address incomplete — missing ' + ['City', 'State', 'Zip'].filter(f => !L(r[f])).join(' and '));
  if (x && inGroup(x, WRONG) && !inGroup(x, UPD)) why.push('in "Known Wrong addresses that need updating"');
  if (x && inGroup(x, RET) && !inGroup(x, UPD)) why.push('in "2024 returned mail"');
  if (!why.length) continue;
  bad.push([L(r['Last Name']) + ', ' + L(r['First Name']), L(r['Member Status']),
    x && paying.has(ps8(x['PeopleSoft Number'])) ? 'YES' : '',
    L(r['Email']) || 'NO EMAIL EITHER',
    [L(r['Street Address']), L(r['City']), L(r['State']), L(r['Zip'])].filter(Boolean).join(', ') || '—',
    why.join(' · '),
    x && inGroup(x, UPD) ? 'but marked updated in 2024' : '']);
}

// Eligible in NEP, absent from the file.
const ELIG = new Set(['Active', 'Active Retired', 'Life']);
const onFile = new Map(); rows.forEach(r => onFile.set(key(r), (onFile.get(key(r)) || 0) + 1));
const seen = new Map(); const missing = [];
for (const r of N) {
  if (!ELIG.has(L(r['Member Status']))) continue;
  const k = key(r), c = (seen.get(k) || 0) + 1; seen.set(k, c);
  if (c > (onFile.get(k) || 0)) missing.push(r);
}
// A second record of the same person under a fuller name is not a missing member.
const realMissing = missing.filter(r => {
  const bare = norm(r['Last Name']) + '|' + norm(r['First Name']).slice(0, 5);
  return ![...onFile.keys()].some(k => k.startsWith(bare.split('|')[0] + '|') &&
    k.split('|')[1].startsWith(norm(r['First Name']).slice(0, 5)));
});

const wb = XLSX.utils.book_new();
const add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.slice(0, (aoa[2] || aoa[0]).length).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name); };

add('Start here', [
  ['Local 36 — the ballot file, checked before it goes to the election company'],
  [path.basename(FILE) + ' · ' + rows.length + ' members'],
  [''],
  [rows.filter(mailable).length + ' have an address a ballot can be posted to.'],
  [bad.length + ' will not reach anyone as the file stands — ' + Math.round(bad.length / rows.length * 100) + '% of the mailing.'],
  [''],
  ['That splits three ways:'],
  ['  no address on the file at all', rows.filter(r => !L(r['Street Address'])).length],
  ['  an address, but missing city, state or zip', rows.filter(r => L(r['Street Address']) && !mailable(r)).length],
  ['  a full address our own groups already record as wrong or returned', bad.filter(b => /Known Wrong|returned mail/.test(b[5])).length],
  [''],
  ['Of the ' + bad.length + ' unreachable, ' + bad.filter(b => b[2] === 'YES').length + ' are confirmed paying dues on the 25 July payroll register,'],
  ['and ' + bad.filter(b => b[3] === 'NO EMAIL EITHER').length + ' have no email address either — there is no way to reach them at all.'],
  [''],
  ['No member appears twice on this file.'],
  [realMissing.length ? realMissing.length + ' member(s) eligible in NEP are missing from the file — see the last tab.' : 'No eligible member is missing from the file.'],
], [96, 10]);

add('Will not arrive', [
  ['Every member on the ballot file whose ballot will not reach them. Sorted with dues payers first.'], [''],
  ['Name', 'Member status', 'Paying dues?', 'Email', 'Address on the file', 'Why it will not arrive', 'Note'],
  ...bad.sort((a, b) => (b[2] === 'YES') - (a[2] === 'YES') || a[0].localeCompare(b[0])),
], [28, 15, 13, 34, 46, 52, 26]);

if (realMissing.length) add('Missing from the file', [
  ['Eligible to vote in NEP but not on the ballot file — they would be sent nothing at all.'], [''],
  ['Name', 'Member status', 'Login', 'Payroll', 'Address', 'Groups'],
  ...realMissing.map(r => [L(r['Last Name']) + ', ' + L(r['First Name']), L(r['Member Status']), L(r['Status']),
    L(r['PeopleSoft Number']) || '', L(r['Street Address']) || 'no address', L(r['Groups'])]),
], [26, 16, 12, 12, 40, 56]);

const name = 'Local36-BALLOT-file-will-not-arrive.xlsx';
XLSX.writeFile(wb, path.join(OUT, name));
console.log(name);
console.log('  ' + rows.length + ' on the file · ' + rows.filter(mailable).length + ' mailable · ' + bad.length + ' will not arrive (' + Math.round(bad.length / rows.length * 100) + '%)');
console.log('  of the unreachable: ' + bad.filter(b => b[2] === 'YES').length + ' pay dues · ' + bad.filter(b => b[3] === 'NO EMAIL EITHER').length + ' have no email either');
console.log('  eligible but missing from the file: ' + realMissing.length +
  (realMissing.length ? ' — ' + realMissing.map(r => L(r['Last Name']) + ', ' + L(r['First Name'])).join('; ') : ''));
