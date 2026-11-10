'use strict';
/*
 * The three-way comparison: who DC payroll takes dues from, who NEP says is a
 * member, and who the International carries on its roll.
 *
 * Each source answers a different question and none of them is the truth:
 *
 *   the register   money actually deducted this pay period, keyed on the
 *                  payroll number. Authoritative for the number itself — four
 *                  of NEP's turned out to be typos against it.
 *   NEP            the local's own record, and the only one with a status.
 *   the IAFF roll  what the International believes, keyed on the member number.
 *                  It has no payroll number, so it joins through NEP or by name.
 *
 * Nothing here writes to NEP. It produces lists for a person to work.
 *
 *   node scripts/three-way.js <register.json> [roster-name] [iaff.csv] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const match = require(path.join(DT, 'lib/match'));
const REG = process.argv[2];
const ROSTER = process.argv[3] || 'roster-72';
const IAFF = process.argv[4] || 'iaff-roll-2026-11-10.csv';
const OUT = process.argv[5] || process.cwd();
if (!REG) { console.error('usage: node scripts/three-way.js <register.json> [roster] [iaff.csv] [outdir]'); process.exit(1); }

const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');
const SUF = /\b(JR|SR|II|III|IV|V)\b/g;
const sur = s => match.normalizeName(L(s)).replace(SUF, '').replace(/\s+/g, ' ').trim();
const f1 = s => match.normalizeName(L(s)).split(' ')[0] || '';
const mi = s => (match.normalizeName(L(s)).split(' ')[1] || '').slice(0, 1);
const off1 = (x, y) => x.length === 8 && y.length === 8 && [...x].filter((c, i) => c !== y[i]).length === 1;

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const I = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', IAFF)), 'i.csv').records;

/* ---- the register, one entry per person ---- */
// A member can have several lines (Beckham had three charges and two
// reversals); what matters is what the lines net to.
const people = new Map();
for (const r of reg.rows) {
  if (!people.has(r.emplid)) people.set(r.emplid, { emplid: r.emplid, last: r.last_name, first: r.first_name, mid: r.middle_name, lines: [], dept: r.dept });
  people.get(r.emplid).lines.push(r);
}
for (const p of people.values()) {
  p.net = p.lines.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0) / 100;
  p.paying = p.net > 0;
  p.name = p.last + ', ' + p.first + (p.mid ? ' ' + p.mid : '');
}
const P = [...people.values()];
const payers = P.filter(p => p.paying), zeros = P.filter(p => !p.paying);

/* ---- NEP ---- */
const nepName = r => L(r['Last Name']) + ', ' + L(r['First Name']);
const status = r => L(r['Member Status']) || '(no status)';
const byPS = new Map(), byNm = new Map(), byIaffNo = new Map();
for (const r of N) {
  const ps = num(r['PeopleSoft Number']); if (ps) byPS.set(ps, (byPS.get(ps) || []).concat([r]));
  const k = sur(r['Last Name']) + '|' + f1(r['First Name']); byNm.set(k, (byNm.get(k) || []).concat([r]));
  const ia = num(r['IAFF Member Number']); if (ia) byIaffNo.set(ia, (byIaffNo.get(ia) || []).concat([r]));
}
const near = (a, b) => { const x = sur(a), y = sur(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x) || match.lastNameScore(x, y) >= 85); };

/* ---- register -> NEP ---- */
const link = new Map();           // register person -> NEP record
const used = new Set();           // NEP records claimed by a register person
const A = { noRecord: [], addNumber: [], typo: [], ambiguous: [], twoRecords: [], statusWrong: [], flagWrong: [], zeroButPaying: [] };
// Links no rule can find, settled by evidence and written down. Belle: the DC
// payroll spells him Belle, NEP and the International spell him Bell, IAFF
// 1318785 (settled 17 Aug 2026; the upload that was to add his payroll number
// never landed).
const KNOWN = { '00079233': r => num(r['IAFF Member Number']) === '1318785' };
// A member who has left the job does not come back onto the payroll. A paying
// member whose only namesake in NEP is retired, deceased or honorary is a
// different person — White, Daniel, hired 2026, is not White, Daniel J, retired.
const GONE = /^(Retired|Deceased|Alumni|Honorary|Life)$/;
for (const p of P) {
  const hits = (byPS.get(num(p.emplid)) || []);
  let rec = null;
  if (hits.length) {
    // The payroll number decides, whatever the spelling: "Rooke" is Brooke.
    rec = hits.find(h => near(h['Last Name'], p.last)) || hits[0];
    if (hits.length > 1) A.twoRecords.push([p, hits]);
  } else if (KNOWN[p.emplid] && N.filter(KNOWN[p.emplid]).length === 1) {
    rec = N.filter(KNOWN[p.emplid])[0]; A.addNumber.push([p, rec]);
  } else {
    const c = byNm.get(sur(p.last) + '|' + f1(p.first)) || [];
    const noNum = c.filter(h => !num(h['PeopleSoft Number']) && !used.has(h) && !GONE.test(status(h)));
    const typo = c.filter(h => num(h['PeopleSoft Number']) && off1(L(h['PeopleSoft Number']).padStart(8, '0'), p.emplid)
      && !people.has(L(h['PeopleSoft Number']).padStart(8, '0')));
    if (typo.length === 1) { rec = typo[0]; A.typo.push([p, rec]); }
    else if (noNum.length === 1) { rec = noNum[0]; A.addNumber.push([p, rec]); }
    else if (noNum.length > 1) { A.ambiguous.push([p, noNum]); }
    else A.noRecord.push([p, c]);
  }
  if (rec) {
    link.set(p, rec); used.add(rec);
    if (p.paying && status(rec) !== 'Active') A.statusWrong.push([p, rec]);
    else if (p.paying && L(rec['Paying Active Member']) !== 'Yes') A.flagWrong.push([p, rec]);
    if (!p.paying && L(rec['Paying Active Member']) === 'Yes') A.zeroButPaying.push([p, rec]);
  }
}

/* ---- NEP -> register ---- */
// Marked as a paying active member, and payroll took nothing this period.
const notOnRegister = N.filter(r => status(r) === 'Active' && L(r['Paying Active Member']) === 'Yes' && !used.has(r));

/* ---- the International's roll ---- */
const iName = r => L(r['Last Name']) + (L(r['Suffix']) ? ' ' + L(r['Suffix']) : '') + ', ' + L(r['First Name']) + (L(r['Middle Name']) ? ' ' + L(r['Middle Name']) : '');
const TYPE = { MEM: 'active', MRM: 'retired', HMM: 'honorary' };
const iById = new Map(I.map(r => [num(r['Id']), r]));
const iByNm = new Map();
for (const r of I) { const k = sur(r['Last Name']) + '|' + f1(r['First Name']); iByNm.set(k, (iByNm.get(k) || []).concat([r])); }

// NEP record -> roll entry. By number first; by name only when the number is
// missing and exactly one unclaimed roll entry of that name agrees on the
// middle initial (where both have one). A father and son share everything else.
const nepToRoll = new Map(), rollClaimed = new Map();
const B = { fill: [], numberNotOnRoll: [], nameAmbiguous: [] };
for (const r of N) {
  const ia = num(r['IAFF Member Number']);
  if (ia && iById.has(ia)) { nepToRoll.set(r, iById.get(ia)); rollClaimed.set(iById.get(ia), (rollClaimed.get(iById.get(ia)) || []).concat([r])); }
  else if (ia) B.numberNotOnRoll.push(r);
}
for (const r of N) {
  if (num(r['IAFF Member Number'])) continue;
  const c = (iByNm.get(sur(r['Last Name']) + '|' + f1(r['First Name'])) || []).filter(x => !rollClaimed.has(x));
  const m = mi(r['First Name']);
  const ok = c.filter(x => !m || !L(x['Middle Name']) || L(x['Middle Name']).slice(0, 1).toUpperCase() === m);
  if (ok.length === 1) { nepToRoll.set(r, ok[0]); rollClaimed.set(ok[0], [r]); B.fill.push([r, ok[0]]); }
  else if (ok.length > 1) B.nameAmbiguous.push([r, ok]);
}
const rollNotInNep = I.filter(x => !rollClaimed.has(x));

/* ---- register <-> roll ---- */
const C = { payerNotOnRoll: [], payerRollRetired: [], activeNotPaying: [] };
const rollPaying = new Set();
for (const p of payers) {
  let roll = link.has(p) ? nepToRoll.get(link.get(p)) : null;
  if (!roll) {      // no NEP link, or NEP has no roll entry: try the roll by name
    const c = (iByNm.get(sur(p.last) + '|' + f1(p.first)) || []).filter(x => !rollClaimed.has(x) && !rollPaying.has(x));
    if (c.length === 1) roll = c[0];
  }
  if (!roll) C.payerNotOnRoll.push([p, link.get(p)]);
  else { rollPaying.add(roll); if (L(roll['Member Type']) !== 'MEM') C.payerRollRetired.push([p, roll, link.get(p)]); }
}
for (const x of I) if (L(x['Member Type']) === 'MEM' && !rollPaying.has(x)) C.activeNotPaying.push([x, (rollClaimed.get(x) || [])[0]]);

/* ---- where NEP and the roll disagree about a person ---- */
const D = { goneButOnRoll: [], typeMismatch: [] };
for (const [r, x] of nepToRoll) {
  const s = status(r), ty = L(x['Member Type']);
  if (/^(Deceased|Drop)$/.test(s)) D.goneButOnRoll.push([r, x]);
  else if (s === 'Active' && ty === 'MRM') D.typeMismatch.push([r, x, 'NEP Active, International has retired']);
  else if (/^(Retired|Active Retired)$/.test(s) && ty === 'MEM') D.typeMismatch.push([r, x, 'NEP ' + s + ', International has active']);
}

/* ---- addresses the International holds and NEP does not ---- */
const E = [];
for (const [r, x] of nepToRoll) {
  if (!/^(Active|Active Retired)$/.test(status(r)) || L(r['Street Address'])) continue;
  if (!L(x['Home Address 1'])) continue;
  // An address NEP already tried and had returned is not a new address.
  const bounced = /returned undeliverable/i.test(L(r['Notes'])) &&
    L(r['Notes']).toLowerCase().includes(L(x['Home Address 1']).toLowerCase().slice(0, 12));
  E.push([r, x, L(x['Invalid Address']) ? 'the International marks it INVALID' : bounced ? 'same address that was returned in September' : 'usable']);
}

/* ---- the workbook ---- */
const wb = XLSX.utils.book_new();
const sheet = (name, header, rows, widths) => {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h, i) => ({ wch: (widths && widths[i]) || 20 }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
};
const nepCols = r => r ? [nepName(r), status(r), L(r['Paying Active Member']) || '(blank)', L(r['PeopleSoft Number']), L(r['IAFF Member Number']), L(r['Current Company'])] : ['', '', '', '', '', ''];
const NEPH = ['NEP name', 'NEP status', 'NEP paying flag', 'NEP payroll no.', 'NEP IAFF no.', 'NEP company'];
const amt = p => p.lines.length > 1 ? p.lines.map(l => l.amount).join(' / ') + ' = ' + p.net.toFixed(2) : p.lines[0].amount;

const S = [
  ['Local 36 — payroll register, NEP and the International\'s roll', ''],
  ['', ''],
  [`Register: pay period ${reg.payPeriod}, check date ${reg.checkDate}`, ''],
  [`NEP export: ${ROSTER} · International roll: ${IAFF}`, ''],
  ['', ''],
  ['THE THREE COUNTS', ''],
  ['People DC payroll took dues from', payers.length],
  ['People on the register at $0.00', zeros.length],
  ['NEP records marked Active and Paying = Yes', N.filter(r => status(r) === 'Active' && L(r['Paying Active Member']) === 'Yes').length],
  ['Active members on the International\'s roll (MEM)', I.filter(x => L(x['Member Type']) === 'MEM').length],
  ['Retired members on the International\'s roll (MRM)', I.filter(x => L(x['Member Type']) === 'MRM').length],
  ['', ''],
  ['PAYROLL AGAINST NEP', ''],
  ['Paying dues, no NEP record at all', A.noRecord.filter(([p]) => p.paying).length],
  ['Paying dues, NEP record has no payroll number — add it', A.addNumber.filter(([p]) => p.paying).length],
  ['Paying dues, NEP payroll number is a typo', A.typo.length],
  ['Paying dues, more than one NEP record could be theirs', A.ambiguous.length],
  ['Paying dues, NEP status is not Active', A.statusWrong.length],
  ['Paying dues, NEP paying flag is not Yes', A.flagWrong.length],
  ['One payroll number on two NEP records', A.twoRecords.length],
  ['Marked paying in NEP, nothing deducted this period', notOnRegister.length],
  ['At $0.00 on the register, NEP still says paying', A.zeroButPaying.length],
  ['', ''],
  ['PAYROLL AGAINST THE INTERNATIONAL', ''],
  ['Paying dues, not on the International\'s roll', C.payerNotOnRoll.length],
  ['Paying dues, the International has them as retired', C.payerRollRetired.length],
  ['Active on the International\'s roll, not paying through payroll', C.activeNotPaying.length],
  ['', ''],
  ['NEP AGAINST THE INTERNATIONAL', ''],
  ['IAFF numbers NEP is missing that the roll supplies', B.fill.length],
  ['NEP holds an IAFF number the roll does not list', B.numberNotOnRoll.length],
  ['On the International\'s roll, no NEP record found', rollNotInNep.length],
  ['Deceased or dropped in NEP, still on the International\'s roll', D.goneButOnRoll.length],
  ['Active in one, retired in the other', D.typeMismatch.length],
  ['', ''],
  ['ADDRESSES', ''],
  ['Members with no address in NEP where the International holds one', E.length],
  ['   of those, usable', E.filter(e => e[2] === 'usable').length],
];
sheet('Start here', S[0], S.slice(1), [70, 12]);

sheet('Paying - no NEP record', ['Payroll no.', 'Name on the register', 'Deducted', 'Others in NEP with that surname and first name'],
  A.noRecord.filter(([p]) => p.paying).map(([p, c]) => [p.emplid, p.name, amt(p), c.map(h => nepName(h) + ' [' + status(h) + ', ' + (L(h['PeopleSoft Number']) || 'no payroll no.') + ']').join(' / ')]), [14, 34, 16, 70]);
sheet('Paying - add payroll no.', ['Payroll no. to add', 'Name on the register', 'Deducted', ...NEPH],
  A.addNumber.filter(([p]) => p.paying).map(([p, r]) => [p.emplid, p.name, amt(p), ...nepCols(r)]), [18, 34, 12, 30, 16, 14, 14, 14, 18]);
sheet('NEP payroll no. typos', ['Number on the register', 'Number in NEP', 'Name on the register', ...NEPH],
  A.typo.map(([p, r]) => [p.emplid, L(r['PeopleSoft Number']), p.name, ...nepCols(r)]), [20, 16, 34, 30, 16, 14, 14, 14, 18]);
sheet('Paying - which NEP record', ['Payroll no.', 'Name on the register', 'NEP records it could be'],
  A.ambiguous.map(([p, c]) => [p.emplid, p.name, c.map(h => nepName(h) + ' [' + status(h) + ', acct ' + L(h['Status']) + ']').join(' / ')]), [14, 34, 90]);
sheet('Paying - NEP status wrong', ['Payroll no.', 'Name on the register', 'Deducted', ...NEPH],
  A.statusWrong.map(([p, r]) => [p.emplid, p.name, amt(p), ...nepCols(r)]), [14, 34, 12, 30, 16, 14, 14, 14, 18]);
sheet('Paying - NEP flag not Yes', ['Payroll no.', 'Name on the register', 'Deducted', ...NEPH],
  A.flagWrong.map(([p, r]) => [p.emplid, p.name, amt(p), ...nepCols(r)]), [14, 34, 12, 30, 16, 14, 14, 14, 18]);
sheet('One number, two NEP records', ['Payroll no.', 'Name on the register', 'NEP records'],
  A.twoRecords.map(([p, hits]) => [p.emplid, p.name, hits.map(h => nepName(h) + ' [' + status(h) + ', acct ' + L(h['Status']) + ', IAFF ' + (L(h['IAFF Member Number']) || 'none') + ']').join(' / ')]), [14, 34, 100]);
sheet('Marked paying - not deducted', [...NEPH, 'NEP account', 'Appointed'],
  notOnRegister.sort((a, b) => nepName(a).localeCompare(nepName(b))).map(r => [...nepCols(r), L(r['Status']), L(r['Appointment Date'])]), [30, 14, 14, 14, 14, 20, 12, 12]);
sheet('Register at zero', ['Payroll no.', 'Name on the register', ...NEPH],
  zeros.map(p => [p.emplid, p.name, ...nepCols(link.get(p))]), [14, 34, 30, 16, 14, 14, 14, 18]);
sheet('IAFF numbers to fill in', ['NEP name', 'NEP status', 'NEP payroll no.', 'IAFF number from the roll', 'Name on the roll', 'Roll type'],
  B.fill.map(([r, x]) => [nepName(r), status(r), L(r['PeopleSoft Number']), L(x['Id']), iName(x), TYPE[L(x['Member Type'])] || L(x['Member Type'])]), [30, 16, 14, 22, 34, 12]);
sheet('Paying - not on Intl roll', ['Payroll no.', 'Name on the register', ...NEPH],
  C.payerNotOnRoll.map(([p, r]) => [p.emplid, p.name, ...nepCols(r)]), [14, 34, 30, 16, 14, 14, 14, 18]);
sheet('Intl active - not paying', ['IAFF number', 'Name on the roll', ...NEPH],
  C.activeNotPaying.map(([x, r]) => [L(x['Id']), iName(x), ...nepCols(r)]), [14, 34, 30, 16, 14, 14, 14, 18]);
sheet('On Intl roll - not in NEP', ['IAFF number', 'Name on the roll', 'Roll type', 'City', 'State'],
  rollNotInNep.map(x => [L(x['Id']), iName(x), TYPE[L(x['Member Type'])] || L(x['Member Type']), L(x['City']), L(x['State Province'])]), [14, 36, 12, 22, 8]);
sheet('NEP IAFF no. not on roll', ['NEP name', 'NEP status', 'NEP IAFF no.', 'NEP payroll no.', 'NEP company'],
  B.numberNotOnRoll.map(r => [nepName(r), status(r), L(r['IAFF Member Number']), L(r['PeopleSoft Number']), L(r['Current Company'])]), [30, 16, 14, 14, 20]);
sheet('Gone in NEP - still on roll', ['NEP name', 'NEP status', 'IAFF number', 'Name on the roll', 'Roll type'],
  D.goneButOnRoll.map(([r, x]) => [nepName(r), status(r), L(x['Id']), iName(x), TYPE[L(x['Member Type'])] || L(x['Member Type'])]), [30, 14, 14, 34, 12]);
sheet('Active vs retired mismatch', ['NEP name', 'NEP status', 'IAFF number', 'Name on the roll', 'What disagrees'],
  D.typeMismatch.map(([r, x, why]) => [nepName(r), status(r), L(x['Id']), iName(x), why]), [30, 16, 14, 34, 44]);
sheet('Addresses from the Intl', ['NEP name', 'NEP status', 'NEP payroll no.', 'IAFF number', 'Street', 'Line 2', 'City', 'State', 'Zip', 'Can it be used'],
  E.map(([r, x, why]) => [nepName(r), status(r), L(r['PeopleSoft Number']), L(x['Id']), L(x['Home Address 1']), L(x['Home Address 2']), L(x['City']), L(x['State Province']), L(x['Zip/Postal Code']), why]),
  [30, 16, 14, 12, 34, 16, 20, 8, 12, 40]);

const stamp = new Date().toISOString().slice(0, 10);
const file = path.join(OUT, `Local36-THREE-WAY-${stamp}.xlsx`);
XLSX.writeFile(wb, file);
for (const [label, n] of S.slice(1)) if (label) console.log(n === '' ? '\n' + label : '  ' + String(n).padStart(5) + '  ' + label);
console.log('\nWORKBOOK  ' + path.basename(file));
