'use strict';
/*
 * Who on the dues register to reach at a DC government address.
 *
 * Joe, 10 Nov 2026, after asking who on the DCHR list is not Active in NEP:
 * "and add to that anyone that we don't have an email address for. I want to
 * send them an email to their dc account."
 *
 * So the list is everyone payroll takes dues from who is either not Active in
 * NEP or has no email address there. NEP holds almost no dc.gov addresses, so
 * the address has to be built from the name, and how far a built address can
 * be trusted is measured on every run rather than assumed: the members whose
 * dc.gov address NEP does hold are put through the same rule and the built
 * address is compared with the real one. Most misses are first.last plus a
 * digit — DC adds the digit when another employee already has the name. So a
 * wrong guess need not bounce: it can reach a different DC employee of the
 * same name. Every row says how sure the address is, and the workbook says
 * how the rule scored.
 *
 *   node scripts/dc-email-list.js <register.json> [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const match = require(path.join(DT, 'lib/match'));
const REG = process.argv[2];
const ROSTER = process.argv[3] || 'roster-73';
const OUT = process.argv[4] || process.cwd();
if (!REG) { console.error('usage: node scripts/dc-email-list.js <register.json> [roster] [outdir]'); process.exit(1); }
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');
const SUFN = /\b(JR|SR|II|III|IV|V)\b/g;
const sur = s => match.normalizeName(L(s)).replace(SUFN, '').replace(/\s+/g, ' ').trim();
const f1 = s => match.normalizeName(L(s)).split(' ')[0] || '';

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;

/* ---- the register joined to NEP: lib/reglink.js, the same join three-way.js uses ---- */
const RG = require(path.join(DT, 'lib/reglink')).link(reg.rows, N);
const payers = RG.payers;
const nepFor = p => RG.link.get(p) || null;

/* ---- the dc.gov address, and how far to trust it ---- */
const plain = s => L(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SUF_ALL = /\b(jr|sr|ii|iii|iv|v)\b\.?/gi;   // for replace
const SUF_ANY = /\b(jr|sr|ii|iii|iv|v)\b\.?/i;    // for test: a /g regex remembers where it stopped
function dcAddress(first, last) {
  const f0 = plain(first).split(/\s+/)[0];
  const l = plain(last).replace(SUF_ALL, '').replace(/[.,]/g, '').trim();
  return { address: f0.replace(/[^a-z]/g, '') + '.' + l.replace(/[^a-z]/g, '') + '@dc.gov',
    compound: /[\s'’`-]/.test(l) || SUF_ANY.test(plain(last)) || /[^a-z]/.test(f0) };
}
// How many DC employees are likely to share a first.last. All we can see is our
// own people: a name that occurs twice among them is certainly numbered for at
// least one. "Our people" is every NEP record plus anyone on the payroll NEP
// has no record of — Sean Burton, hired 2026 and not yet in NEP, shares his
// name with Sean A. Burton, and counting NEP alone gave both men one address.
const nameCount = new Map();
const bump = k => nameCount.set(k, (nameCount.get(k) || 0) + 1);
for (const r of N) bump(f1(r['First Name']) + '.' + sur(r['Last Name']));
for (const p of RG.P) if (RG.nepStatusOf(p) === 'no NEP record') bump(f1(p.first) + '.' + sur(p.last));

// Which of four kinds a built address is. The same function sorts the list and
// scores the rule, so the score describes the rows it is printed beside.
function kindOf(p, r) {
  const g = dcAddress(p.first, p.last);
  const twins = nameCount.get(f1(p.first) + '.' + sur(p.last)) || 0;
  // NEP's first name and the payroll's should agree; where they do not, one of
  // them is a nickname or a misreading and the built address inherits the doubt.
  const nameDiffers = !!r && f1(r['First Name']) !== f1(p.first);
  return { g, twins, kind: twins > 1 ? 'shared' : g.compound ? 'compound' : nameDiffers ? 'nameDiffers' : 'likely' };
}

/* ---- score the rule on the members whose real dc.gov address NEP holds ---- */
const SCORE = { all: { n: 0, exact: 0, digit: 0 }, likely: { n: 0, exact: 0, digit: 0 }, guess: { n: 0, exact: 0, digit: 0 } };
for (const p of payers) {
  const r = nepFor(p); if (!r) continue;
  const real = L(r['Email']).toLowerCase();
  if (!/@dc\.gov$/.test(real)) continue;
  const { g, kind } = kindOf(p, r);
  const hit = real === g.address ? 'exact' : real.replace(/\d+@/, '@') === g.address ? 'digit' : null;
  for (const b of [SCORE.all, kind === 'likely' ? SCORE.likely : SCORE.guess]) { b.n++; if (hit) b[hit]++; }
}
const likelyNote = SCORE.likely.n >= 20
  ? `likely — ${SCORE.likely.exact} of the ${SCORE.likely.n} like it that could be checked were exactly right`
  : 'likely — too few known addresses to say how often';

const rows = [];
for (const p of payers) {
  const r = nepFor(p);
  const status = RG.nepStatusOf(p);
  const email = r ? L(r['Email']) : '';
  const notActive = status !== 'Active', noEmail = !/@/.test(email);
  if (!notActive && !noEmail) continue;
  const { g, twins, kind } = kindOf(p, r);
  const held = /@dc\.gov$/i.test(email) ? email.toLowerCase() : '';
  const sure = held ? 'held in NEP'
    : kind === 'shared' ? `guess — ${twins} people on the payroll or in NEP share this first and last name, so DC has numbered at least one`
    : kind === 'compound' ? 'guess — the name has a space, hyphen, apostrophe or suffix, and DC\'s handling of those is not known'
    : kind === 'nameDiffers' ? `guess — NEP spells the first name "${L(r['First Name'])}"`
    : likelyNote;
  rows.push({
    why: notActive && noEmail ? 'not Active in NEP, and no email' : notActive ? 'not Active in NEP' : 'no email in NEP',
    name: p.last + ', ' + p.first + (p.mid ? ' ' + p.mid : ''), emplid: p.emplid, status,
    company: r ? L(r['Current Company']) : '', platoon: r ? L(r['Platoon']) : '', phone: r ? L(r['Phone Number']) : '',
    email, dc: held || g.address, sure,
  });
}
// Whatever the reason, one address cannot belong to two people.
const builtBy = new Map();
for (const r of rows) builtBy.set(r.dc, (builtBy.get(r.dc) || 0) + 1);
for (const r of rows) if (builtBy.get(r.dc) > 1 && !/^guess/.test(r.sure) && r.sure !== 'held in NEP')
  r.sure = `guess — ${builtBy.get(r.dc)} people on this list come out to this same address`;
for (const r of rows) if (!/^[a-z]+\.[a-z]+@dc\.gov$/.test(r.dc))
  { console.error(`REFUSING TO WRITE: ${r.name} came out as "${r.dc}" — a name is missing or unreadable`); process.exit(1); }
rows.sort((a, b) => (a.why === 'no email in NEP') - (b.why === 'no email in NEP') || a.name.localeCompare(b.name));

const count = f => rows.filter(f).length;
const summary = [
  ['Local 36 — members on the dues register to reach at a DC address', ''],
  ['', ''],
  [`Register: pay period ${reg.payPeriod} · NEP export: ${ROSTER}`, ''],
  ['', ''],
  ['People payroll took dues from', payers.length],
  ['On this list', rows.length],
  ['   not Active in NEP', count(r => /not Active/.test(r.why))],
  ['   no email address in NEP', count(r => /no email/.test(r.why))],
  ['', ''],
  ['How sure the DC address is', ''],
  ['   held in NEP already', count(r => r.sure === 'held in NEP')],
  ['   likely', count(r => /^likely/.test(r.sure))],
  ['   a guess', count(r => /^guess/.test(r.sure))],
  ['', ''],
  ['Have a phone number in NEP', count(r => r.phone)],
  ['', ''],
  ['READ THIS BEFORE SENDING', ''],
  ['The DC addresses are built from the name on the payroll as first.last@dc.gov.', ''],
  [`The rule was scored on the ${SCORE.all.n} paying members whose real dc.gov address NEP holds:`, ''],
  ['   of those the rule calls likely', SCORE.likely.n],
  ['      exactly right', SCORE.likely.exact],
  ['      right but for a digit DC added (first.last2@dc.gov)', SCORE.likely.digit],
  ['      wrong some other way', SCORE.likely.n - SCORE.likely.exact - SCORE.likely.digit],
  ['   of those the rule calls a guess', SCORE.guess.n],
  ['      exactly right', SCORE.guess.exact],
  ['DC adds the digit when another employee already has the name. So a wrong', ''],
  ['address need not bounce: it can reach a different DC employee of the same', ''],
  ['name. Keep the message free of anything personal, and send it BCC.', ''],
];
const wb = XLSX.utils.book_new();
const s1 = XLSX.utils.aoa_to_sheet(summary); s1['!cols'] = [{ wch: 78 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, s1, 'Start here');
const HEAD = ['Why on the list', 'Name on the payroll', 'Payroll no.', 'NEP status', 'Company', 'Platoon', 'Phone in NEP', 'Email in NEP', 'DC address', 'How sure'];
const s2 = XLSX.utils.aoa_to_sheet([HEAD, ...rows.map(r => [r.why, r.name, r.emplid, r.status, r.company, r.platoon, r.phone, r.email, r.dc, r.sure])]);
s2['!cols'] = [30, 34, 12, 16, 18, 12, 16, 30, 36, 70].map(w => ({ wch: w }));
XLSX.utils.book_append_sheet(wb, s2, 'The list');
// one column, ready to paste into a BCC line — the likely ones only
const s3 = XLSX.utils.aoa_to_sheet([['DC addresses that are held or likely — paste into BCC'], ...rows.filter(r => !/^guess/.test(r.sure)).map(r => [r.dc])]);
s3['!cols'] = [{ wch: 44 }];
XLSX.utils.book_append_sheet(wb, s3, 'BCC - likely');
const s4 = XLSX.utils.aoa_to_sheet([['Name on the payroll', 'DC address (a guess)', 'Why it is a guess', 'Phone in NEP'], ...rows.filter(r => /^guess/.test(r.sure)).map(r => [r.name, r.dc, r.sure.replace(/^guess — /, ''), r.phone])]);
s4['!cols'] = [34, 38, 76, 16].map(w => ({ wch: w }));
XLSX.utils.book_append_sheet(wb, s4, 'Guesses - check first');
const file = path.join(OUT, `Local36-DC-EMAIL-LIST-${new Date().toISOString().slice(0, 10)}.xlsx`);
XLSX.writeFile(wb, file);
for (const [a, b] of summary.slice(4, 16).concat(summary.slice(18, 25))) if (a) console.log((b === '' ? '' : String(b).padStart(5) + '  ') + a);
console.log('\nWORKBOOK  ' + path.basename(file));
