'use strict';
/*
 * Check the NEP export before it is handed to the election ballot vendor.
 *
 * A ballot file fails in three ways that cost money or credibility: one person
 * gets two ballots, somebody who has died gets one, or a paid-up member gets
 * none because there is nowhere to send it. This looks for all three, and
 * writes a workbook of everything needing a decision.
 *
 *   node scripts/ballot-check.js [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-62';
const OUT = process.argv[3] || process.cwd();
const fs = require('fs');
const D = require(path.join(DT, 'node_modules/better-sqlite3'));
const db = new D(path.join(DT, 'data/dues.db'), { readonly: true });
const t = require(path.join(DT, 'lib/tabular'));
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const L = v => String(v == null ? '' : v).trim();
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;

const VOTING = new Set(['Active', 'Active Retired', 'Retired', 'Life', 'Honorary']);
const eligible = r => VOTING.has(L(r['Member Status']));
const mailable = r => L(r['Street Address']) && L(r['City']) && L(r['State']) && L(r['Zip']);
const norm = s => L(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const ps8 = v => L(v).replace(/\D/g, '').padStart(8, '0');
const paying = new Set(db.prepare('SELECT emplid FROM rows WHERE import_id=8 AND excluded=0 AND amount_taken>0')
  .all().map(r => String(r.emplid).padStart(8, '0')));
const pays = r => paying.has(ps8(r['PeopleSoft Number']));
const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);
const addrOf = r => [L(r['Street Address']), L(r['City']), L(r['State']), L(r['Zip'])].filter(Boolean).join(', ');
const ballot = N.filter(eligible);

const sheets = [];
const S = (name, blurb, header, rows, widths) =>
  sheets.push({ name, aoa: [[blurb], [''], header, ...rows], widths, count: rows.length });

/* 1. two ballots to one person */
const groups = new Map();
N.forEach(r => { if (!norm(r['Last Name'])) return;
  const k = norm(r['Last Name']) + '|' + norm(r['First Name']).slice(0, 6);
  (groups.get(k) || groups.set(k, []).get(k)).push(r); });
const dupRows = [];
for (const g of [...groups.values()].filter(g => g.length > 1)) {
  const votes = g.filter(eligible);
  const dob = g.map(r => L(r['Date of Birth'])).filter(Boolean);
  const pn  = g.map(r => L(r['PeopleSoft Number'])).filter(Boolean);
  const ad  = g.map(r => norm(r['Street Address'])).filter(Boolean);
  let why = '';
  if (pn.length > 1 && new Set(pn).size < pn.length) why = 'SAME PAYROLL NUMBER — one person';
  else if (dob.length > 1 && new Set(dob).size < dob.length) why = 'SAME DATE OF BIRTH — one person';
  else if (ad.length > 1 && new Set(ad).size < ad.length) why = 'SAME ADDRESS — likely one person';
  if (!why && votes.length < 2) continue;
  for (const r of g) dupRows.push([who(r), L(r['Member Status']) || '(blank)',
    L(r['PeopleSoft Number']) || '', L(r['Date of Birth']) || '', L(r['IAFF Member Number']) || '',
    addrOf(r) || 'no address', eligible(r) ? 'YES' : '', why]);
  dupRows.push(['', '', '', '', '', '', '', '']);
}
S('1 - two ballots, one person',
  'Records sharing a name. Where the payroll number, date of birth or address also matches it is one person with two records, and the ballot mailing will send two envelopes. The right-hand column says which ones would actually be posted a ballot.',
  ['Name', 'Member status', 'Payroll number', 'Date of birth', 'IAFF number', 'Address on file', 'Gets a ballot?', 'Why we think it is one person'],
  dupRows, [28, 16, 15, 13, 12, 46, 14, 34]);

/* 2. eligible, paid up, nowhere to send it */
const undeliverable = ballot.filter(r => !mailable(r))
  .sort((a, b) => (pays(b) - pays(a)) || who(a).localeCompare(who(b)))
  .map(r => [who(r), L(r['Member Status']), L(r['PeopleSoft Number']) || '',
    pays(r) ? 'YES — pays dues' : '', L(r['Email']) || 'NO EMAIL EITHER',
    L(r['Street Address']) ? 'incomplete: ' + addrOf(r) : 'no address at all',
    /L36NEW/i.test(L(r['Notes'])) ? 'added by us this month' : '']);
S('2 - no address to post to',
  'Ballot-eligible members with no usable mailing address. These are silent disenfranchisements: nothing bounces, the ballot is simply never sent. The ones marked "pays dues" are confirmed on the 25 July payroll register.',
  ['Name', 'Member status', 'Payroll number', 'Paying?', 'Email', 'What is missing', 'Note'],
  undeliverable, [28, 15, 15, 16, 34, 40, 24]);

/* 3. should not get a ballot at all */
const wrong = [];
for (const r of ballot) {
  let why = '';
  if (L(r['Work Status']) === 'Deceased') why = 'Work Status says Deceased';
  else if (/local 36|sepeartation|separation status|^admin$/i.test(L(r['Last Name']) + ' ' + L(r['First Name'])))
    why = 'not a person — an office or data-entry record';
  if (why) wrong.push([who(r), L(r['Member Status']), L(r['Work Status']) || '',
    mailable(r) ? 'YES — would be posted' : 'no address', addrOf(r), why]);
}
S('3 - should not get a ballot',
  'Records that pass the eligibility rule but should not be sent anything.',
  ['Name', 'Member status', 'Work status', 'Would be posted?', 'Address', 'Why'],
  wrong, [30, 16, 14, 20, 46, 40]);

/* 4. no status, so no rule reaches them */
const nostatus = N.filter(r => !L(r['Member Status']))
  .map(r => [who(r) === ', ' ? '(no name at all)' : who(r), L(r['PeopleSoft Number']) || '',
    L(r['Work Status']) || '', pays(r) ? 'YES — pays dues' : '',
    mailable(r) ? addrOf(r) : 'no address', L(r['Email']) || '']);
S('4 - blank member status',
  'No Member Status at all, so no eligibility rule can include or exclude them. Each needs a status before the file goes, or they are left out by default.',
  ['Name', 'Payroll number', 'Work status', 'Paying?', 'Address', 'Email'],
  nostatus, [28, 15, 16, 16, 46, 32]);

/* 5. pays dues, no ballot */
const eligPS = new Set(ballot.map(r => ps8(r['PeopleSoft Number'])));
const match = require(path.join(DT, 'lib/match'));
const orphan = [];
for (const p of db.prepare('SELECT emplid,name,last_name,first_name FROM rows WHERE import_id=8 AND excluded=0 AND amount_taken>0').all()) {
  if (eligPS.has(String(p.emplid).padStart(8, '0'))) continue;
  const hit = ballot.filter(r => match.scoreCandidate({ lastName: p.last_name, firstName: p.first_name },
    { norm_last: match.normalizeName(L(r['Last Name'])), norm_first: match.normalizeName(L(r['First Name'])) }) >= 92);
  if (hit.length === 1) continue;
  orphan.push([p.emplid, p.name, hit.length === 0 ? 'no eligible record at all' : hit.length + ' records match the name — cannot tell which',
    hit.map(who).join(' | ')]);
}
S('5 - pays dues, no ballot',
  'On the 25 July payroll register paying dues, but their payroll number is on no ballot-eligible record. Every other payer was matched by name; these could not be.',
  ['Payroll number', 'Name on the register', 'Problem', 'Candidates in NEP'],
  orphan, [16, 30, 44, 50]);

/* 6. addresses shared by more than one ballot */
const addr = new Map();
ballot.filter(r => mailable(r)).forEach(r => {
  const k = norm(r['Street Address']) + '|' + norm(r['Zip']);
  (addr.get(k) || addr.set(k, []).get(k)).push(r); });
const sharedRows = [];
for (const g of [...addr.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length))
  for (const r of g) sharedRows.push([addrOf(r), g.length, who(r), L(r['Member Status']), L(r['Date of Birth']) || '']);
S('6 - one address, many ballots',
  'Usually a married couple or family and completely legitimate — listed only so the mail house does not merge them into one envelope by mistake.',
  ['Address', 'Ballots to it', 'Name', 'Member status', 'Date of birth'],
  sharedRows, [46, 13, 28, 16, 13]);

/* summary first */
const wb = XLSX.utils.book_new();
const sum = [
  ['Local 36 — checks before the roll goes to the ballot vendor'],
  [`${ROSTER === 'roster-62' ? 'NEP export of 20 August 2026, 3:16pm' : ROSTER} · ${N.length} records`],
  [''],
  [`Counting Active, Active Retired, Retired, Life and Honorary as eligible, ${ballot.length} members would be sent a ballot.`],
  [`${ballot.filter(mailable).length} of them have an address it can be posted to. ${ballot.length - ballot.filter(mailable).length} do not.`],
  [''],
  ['Sheet', 'What it holds', 'Rows'],
];
for (const s of sheets) sum.push([s.name, s.aoa[0][0].split('.')[0] + '.', s.count]);
sum.push(['']);
sum.push(['Eligibility here is an assumption, not a rule anyone has agreed. Confirm who votes before this is used.']);
const ws0 = XLSX.utils.aoa_to_sheet(sum);
ws0['!cols'] = [34, 88, 8].map(w => ({ wch: w }));
XLSX.utils.book_append_sheet(wb, ws0, 'Start here');
for (const s of sheets) {
  const ws = XLSX.utils.aoa_to_sheet(s.aoa);
  ws['!cols'] = s.widths.slice(0, s.aoa[2].length).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, s.name);
}
const name = 'Local36-BALLOT-file-check.xlsx';
XLSX.writeFile(wb, path.join(OUT, name));
console.log(name);
console.log(`  eligible ${ballot.length} · mailable ${ballot.filter(mailable).length} · not mailable ${ballot.length - ballot.filter(mailable).length}`);
for (const s of sheets) console.log(`  ${s.name}: ${s.count} rows`);
