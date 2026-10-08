'use strict';
/*
 * Two records for one member, found from the roster alone.
 *
 * The earlier duplicate work leaned on the dues register to settle who was
 * real. That database does not survive a container wipe, and the question in
 * front of a ballot file does not need it: two records for one person means
 * two ballots whatever the register says.
 *
 * Grouping is union-find over several handles, because no single one catches
 * everything — "Mccoy, Jr." is not the string "McCoy", and a self-registered
 * record often carries no payroll number at all. The rules that cost us before
 * are kept:
 *
 *   - a payroll number or an IAFF number shared by two records joins them
 *   - an email address shared by two records joins them
 *   - a birth date or an address only joins when the FIRST names agree. A
 *     shared birth date once put Long Keith T on a delete list against Long
 *     Kenneth W.
 *   - a surname is compared with punctuation and suffixes stripped, so
 *     "Mccoy, Jr." and "McCoy" meet
 *
 *   node scripts/roster-dupes.js [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-69';
const OUT = process.argv[3] || process.cwd();
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;

// Suffixes and punctuation are how the same surname gets written two ways.
const SUF = /\b(jr|sr|ii|iii|iv|v)\b\.?/gi;
const bare = s => L(s).toLowerCase().replace(SUF, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const last = r => bare(r['Last Name']);
// Only the first word of a first name: "James M" and "James" are one person,
// and the middle initial is exactly what a member drops when they self-register.
const first1 = r => bare(r['First Name']).split(' ')[0] || '';
const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);

const parent = N.map((_, i) => i);
const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const join = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };

const bucket = (keyOf, why) => {
  const m = new Map();
  N.forEach((r, i) => { const k = keyOf(r, i); if (!k) return; m.set(k, (m.get(k) || []).concat([i])); });
  for (const [, g] of m) for (let x = 1; x < g.length; x++) { join(g[0], g[x]); reasons.push([g[0], g[x], why]); }
};
const reasons = [];
bucket(r => num(r['PeopleSoft Number']) && 'ps' + num(r['PeopleSoft Number']), 'same payroll number');
bucket(r => num(r['IAFF Member Number']) && 'ia' + num(r['IAFF Member Number']), 'same IAFF number');
bucket(r => /@/.test(L(r['Email'])) && 'em' + L(r['Email']).toLowerCase(), 'same email');
// Name-based handles need the first names to agree, so they carry it in the key.
bucket(r => last(r) && first1(r) && L(r['Date of Birth']) && 'db' + last(r) + '|' + first1(r) + '|' + L(r['Date of Birth']), 'same name and birth date');
bucket(r => last(r) && first1(r) && L(r['Appointment Date']) && 'ap' + last(r) + '|' + first1(r) + '|' + L(r['Appointment Date']), 'same name and appointment date');
bucket(r => last(r) && first1(r) && L(r['Street Address']) && 'ad' + last(r) + '|' + first1(r) + '|' + L(r['Street Address']).toLowerCase(), 'same name and street address');
// A bare name match is the weakest handle and is reported, never trusted: the
// roll holds real father-and-son pairs and unrelated namesakes.
bucket(r => last(r) && first1(r) && 'nm' + last(r) + '|' + first1(r), 'same first and last name');

const groups = new Map();
N.forEach((r, i) => { const k = find(i); groups.set(k, (groups.get(k) || []).concat([i])); });
const dupes = [...groups.values()].filter(g => g.length > 1)
  .sort((a, b) => who(N[a[0]]).localeCompare(who(N[b[0]])));

const strong = new Set(['same payroll number', 'same IAFF number', 'same email',
                        'same name and birth date', 'same name and appointment date', 'same name and street address']);
const whyFor = g => [...new Set(reasons.filter(([a, b]) => g.includes(a) && g.includes(b)).map(([, , w]) => w))];

const COLS = ['Last Name', 'First Name', 'Member Status', 'Status', 'PeopleSoft Number', 'IAFF Member Number',
  'Email', 'Phone Number', 'DC Fire Rank', 'Current Company', 'Platoon', 'Appointment Date', 'Date of Birth',
  'Street Address', 'City', 'State', 'Zip', 'Paying Active Member', 'Groups', 'Notes'];
const F = ['Street Address', 'City', 'State', 'Zip'];
const mail = r => F.every(f => L(r[f]));

let both = 0;
const rows = [['Group', 'Why they were grouped', 'Confidence', ...COLS]];
for (const [n, g] of dupes.entries()) {
  const w = whyFor(g);
  const conf = w.some(x => strong.has(x)) ? 'STRONG' : 'name only — check';
  if (g.filter(i => mail(N[i])).length > 1) both++;
  for (const i of g) rows.push([n + 1, w.join('; '), conf, ...COLS.map(c => L(N[i][c]))]);
}
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [7, 46, 18, ...COLS.map(c => /Notes|Groups|Email|Street/.test(c) ? 34 : 16)].map(x => ({ wch: x }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Possible duplicates');
const out = path.join(OUT, `Local36-DUPES-${ROSTER}.xlsx`);
XLSX.writeFile(wb, out);

console.log(`${ROSTER}: ${N.length} records · ${dupes.length} possible duplicate groups · ` +
  `${both} groups where MORE THAN ONE record has a mailable address\n`);
for (const [n, g] of dupes.entries()) {
  const w = whyFor(g);
  console.log(`${String(n + 1).padStart(3)}. ${w.some(x => strong.has(x)) ? 'STRONG' : 'name  '}  ${w.join('; ')}`);
  for (const i of g) {
    const r = N[i];
    console.log('      ' + who(r).padEnd(26) + '| ' + L(r['Member Status']).padEnd(15) +
      '| ' + L(r['Status']).padEnd(10) + '| PS ' + (L(r['PeopleSoft Number']) || '-').padEnd(10) +
      '| IAFF ' + (L(r['IAFF Member Number']) || '-').padEnd(9) +
      '| ' + (L(r['Current Company']) || 'no company').padEnd(14) +
      '| appt ' + (L(r['Appointment Date']) || '-').padEnd(11) +
      '| ' + (mail(r) ? 'MAILABLE' : 'no address'));
  }
}
console.log('\nWORKBOOK  ' + path.basename(out));
