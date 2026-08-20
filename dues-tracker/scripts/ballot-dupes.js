'use strict';
/*
 * The duplicate-ballot fix, in the shape the Gooding/Reed merge taught us:
 *
 *   "Before any future merge, send Joe one sheet showing every field of both
 *    records side by side with the keeper marked. Naming the keeper in prose is
 *    not enough when both records look plausible on screen."
 *
 * And the keeper rule from 15 Aug: the APPROVED account wins — it is the
 * member's own login — even when the nonactive record looks richer. Both
 * approved means probably two real people, and we stop.
 *
 * An upload cannot delete a record, so this produces two things: the decision
 * sheet, and a "copy across first" file for values the losing record holds and
 * the keeper does not, so nothing is lost when the loser is deleted by hand.
 *
 *   node scripts/ballot-dupes.js [roster-name] [output-dir]
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
const FIELDS = Object.keys(N[0]);

const VOTING = new Set(['Active', 'Active Retired', 'Retired', 'Life', 'Honorary']);
const eligible = r => VOTING.has(L(r['Member Status']));
const norm = s => L(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const ps8 = v => L(v).replace(/\D/g, '').padStart(8, '0');
const paying = new Set(db.prepare('SELECT emplid FROM rows WHERE import_id=8 AND excluded=0 AND amount_taken>0')
  .all().map(r => String(r.emplid).padStart(8, '0')));
const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);
const filled = r => FIELDS.filter(f => L(r[f])).length;

/* ---- group by every signal, not just the name ----
 * Name alone misses the ones that matter most. "McCoy, James" and
 * "Mccoy, Jr., James M" share payroll 00132282 and do not group by surname,
 * because the suffix makes it a different string. So records are joined if they
 * share a payroll number, or a date of birth with the same surname, or a name —
 * and the joins are followed transitively. */
const SUFFIX = /\b(JR|SR|II|III|IV)\b/g;
const surname = r => norm(r['Last Name']).replace(SUFFIX, '');
const parent = new Map();
const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
N.forEach((_, i) => parent.set(i, i));
const link = (keyFn) => { const seen = new Map();
  N.forEach((r, i) => { const k = keyFn(r); if (!k) return;
    if (seen.has(k)) union(i, seen.get(k)); else seen.set(k, i); }); };
link(r => { const p = L(r['PeopleSoft Number']).replace(/\D/g, ''); return p ? 'ps:' + p : ''; });
link(r => { const n = L(r['IAFF Member Number']).replace(/\D/g, ''); return n ? 'iaff:' + n : ''; });
// A shared birth date is only a link when the first names agree too. Long,
// Keith T and Long, Kenneth W share 12/24/1967 and are two different men with
// two different IAFF numbers — Keith is a line-of-duty death, Kenneth is the
// member carried Active through a suspension. A birthday must not outrank a
// first name; the first draft of this had one of them deleted.
link(r => surname(r) && L(r['Date of Birth'])
  ? 'dob:' + surname(r) + '|' + norm(r['First Name']).slice(0, 4) + '|' + L(r['Date of Birth']) : '');
link(r => surname(r) ? 'nm:' + surname(r) + '|' + norm(r['First Name']).slice(0, 6) : '');
const groups = new Map();
N.forEach((r, i) => { if (!surname(r)) return; const k = find(i);
  (groups.get(k) || groups.set(k, []).get(k)).push(r); });

/* ---- why we think it is one person, or two ---- */
// "Kenneth W" and "Kenneth" are the same first name; "Keith T" is not.
const firstOf = r => norm(r['First Name']);
const compatible = g => {
  const f = g.map(firstOf).filter(Boolean);
  if (f.length < 2) return true;
  const short = f.slice().sort((a, b) => a.length - b.length)[0];
  return f.every(x => x.startsWith(short.slice(0, Math.min(4, short.length))));
};
const sameness = g => {
  const val = f => g.map(r => L(r[f])).filter(Boolean);
  const dupOf = f => { const v = val(f); return v.length > 1 && new Set(v).size < v.length; };
  const out = [];
  const ok = compatible(g);
  if (dupOf('PeopleSoft Number')) out.push('same payroll number');
  if (ok && dupOf('Date of Birth')) out.push('same date of birth');
  if (ok && g.map(r => norm(r['Street Address'])).filter(Boolean).length > 1 &&
      new Set(g.map(r => norm(r['Street Address'])).filter(Boolean)).size <
      g.map(r => norm(r['Street Address'])).filter(Boolean).length) out.push('same street address');
  const conflict = [];
  const distinct = f => { const v = val(f); return v.length > 1 && new Set(v).size === v.length; };
  if (!ok) conflict.push('different first names');
  if (distinct('PeopleSoft Number')) conflict.push('different payroll numbers');
  if (distinct('Date of Birth')) conflict.push('different dates of birth');
  if (distinct('IAFF Member Number')) conflict.push('different IAFF numbers');
  if (distinct('Appointment Date')) conflict.push('different appointment dates');
  return { same: out, conflict };
};

/* ---- the keeper ---- */
const decide = (g) => {
  const approved = g.filter(r => L(r['Status']) === 'approved');
  const { same, conflict } = sameness(g);
  if (approved.length > 1)
    return { keep: null, verdict: 'STOP — two approved logins, so probably two real people', same, conflict };
  if (conflict.length && !same.length)
    return { keep: null, verdict: 'STOP — ' + conflict.join(' and ') + ', so probably two real people', same, conflict };
  if (approved.length === 1 && g.length === 2 && !conflict.length &&
      g.some(r => filled(r) <= 6) && g.some(r => filled(r) > 12))
    return { keep: approved[0], verdict: 'KEEP the approved login — the other record is a near-empty shell', same, conflict };
  if (approved.length === 1)
    return { keep: approved[0], verdict: 'KEEP the approved login (the member signs in to it)', same, conflict };
  // Nobody has logged in. Fall back to whichever record can actually be proved.
  const score = r => (paying.has(ps8(r['PeopleSoft Number'])) ? 8000 : 0) +
    (L(r['PeopleSoft Number']) ? 4000 : 0) + (L(r['IAFF Member Number']) ? 2000 : 0) +
    (L(r['Appointment Date']) ? 1000 : 0) + (L(r['Street Address']) ? 500 : 0) + filled(r);
  const best = g.slice().sort((a, b) => score(b) - score(a));
  if (score(best[0]) === score(best[1]))
    return { keep: null, verdict: 'STOP — no login on either and nothing separates them', same, conflict };
  return { keep: best[0], verdict: 'no login on either — keep the one with the stronger identity', same, conflict };
};

/* ---- build the sheet ---- */
const rows = [];
const copyFirst = [];      // values the loser holds and the keeper does not
const stops = [], decided = [];
for (const g of [...groups.values()].filter(x => x.length > 1)) {
  const votes = g.filter(eligible).length;
  const d = decide(g);
  // Two records with the identical name and nothing to compare — no payroll
  // number, no birth date, no address on one side — show no "same" evidence and
  // no conflict either. They are still the clearest duplicates on the roster,
  // so an exact name match counts on its own.
  const exactName = new Set(g.map(r => surname(r) + '|' + norm(r['First Name']))).size === 1;
  // A group with only one ballot today is still one person twice: give it a
  // status and it becomes two. Kept, but marked so the urgent ones stand out.
  if (votes < 2 && !d.same.length && !d.conflict.length && !exactName) continue;
  const urgent = votes > 1;
  (d.keep ? decided : stops).push([g, d, urgent]);

  rows.push([(urgent ? 'TWO BALLOTS TODAY — ' : 'one ballot today — ') + who(g[0]).toUpperCase(), '', '', '', '']);
  rows.push([d.verdict, '', '', '', '']);
  if (d.same.length) rows.push(['evidence it is one person: ' + d.same.join(', '), '', '', '', '']);
  else if (exactName && !d.conflict.length) rows.push(['evidence it is one person: the names are identical and there is nothing on either record that separates them', '', '', '', '']);
  if (d.conflict.length) rows.push(['evidence it is two people: ' + d.conflict.join(', '), '', '', '', '']);
  rows.push(['Field', ...g.map((r, i) => (d.keep === r ? '>> KEEP <<  ' : d.keep ? 'delete  ' : '') + 'record ' + (i + 1)), 'differs?']);
  rows.push(['Ballot?', ...g.map(r => eligible(r) ? 'YES — gets one' : 'no'), votes > 1 ? 'TWO BALLOTS' : '']);
  rows.push(['Pays dues?', ...g.map(r => paying.has(ps8(r['PeopleSoft Number'])) ? 'YES' : ''), '']);
  rows.push(['Fields filled in', ...g.map(r => String(filled(r))), '']);
  for (const f of FIELDS) {
    const v = g.map(r => L(r[f]));
    if (!v.some(Boolean)) continue;
    const distinct = new Set(v.filter(Boolean));
    rows.push([f, ...v.map(x => x || '—'),
      distinct.size > 1 ? 'DIFFERENT' : (v.filter(Boolean).length < v.length ? 'only one has it' : '')]);
  }
  if (d.keep) for (const r of g) {
    if (r === d.keep) continue;
    for (const f of FIELDS) {
      if (['Role', 'Status', 'Groups', 'Member Status'].includes(f)) continue;
      if (L(r[f]) && !L(d.keep[f])) copyFirst.push([who(d.keep), f, L(r[f]),
        L(d.keep['Email']) || '', L(d.keep['PeopleSoft Number']) || '', L(d.keep['IAFF Member Number']) || '']);
    }
  }
  rows.push(['', '', '', '', '']);
}

const wb = XLSX.utils.book_new();
const add = (name, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name);
};
add('Start here', [
  ['Local 36 — the duplicate-ballot fix'],
  [`${ROSTER} · ${decided.length + stops.length} name groups where one person would be sent two ballots, or where two records share a payroll number, birth date or address.`],
  [''],
  ['An upload cannot delete a record, so this is hand work in NEP. The order matters:'],
  ['1. Read the side-by-side sheet. Every field of every record, keeper marked.'],
  ['2. Run the "copy across first" file, so nothing the deleted record holds is lost.'],
  ['3. Delete the records marked "delete" by hand.'],
  [''],
  ['The keeper is the APPROVED account — the one the member logs in to — even where the other record looks richer. That rule comes from the Gooding/Reed merge on 14 Aug, which was done the wrong way round and cost a rank, a company, an appointment date, an IAFF number and two years of paid marks.'],
  ['Two approved logins means two real people. Those are marked STOP and nothing should be deleted.'],
  [''],
  ['Groups with a keeper decided', decided.length],
  ['Groups marked STOP — look before touching', stops.length],
  ['Values to copy across before deleting', copyFirst.length],
], [120, 10]);
add('Side by side', rows, [24, 40, 40, 40, 16]);
add('Copy across first',
  [['Values held only by the record being deleted. Move these onto the keeper BEFORE deleting, or they are gone.'], [''],
   ['Keeper', 'Field', 'Value to move across', 'Keeper email', 'Keeper payroll', 'Keeper IAFF'],
   ...copyFirst], [26, 24, 44, 30, 16, 14]);
add('STOP - do not delete',
  [['Two records, and the evidence says two different people. Left alone deliberately.'], [''],
   ['Name', 'Why', 'Record detail'],
   ...stops.flatMap(([g, d, u]) => g.map(r => [who(r), u ? 'YES' : 'no', d.verdict,
     `${L(r['Member Status']) || 'blank'} · login ${L(r['Status'])} · payroll ${L(r['PeopleSoft Number']) || '—'} · IAFF ${L(r['IAFF Member Number']) || '—'} · ${L(r['Street Address']) || 'no address'}`]))],
  [26, 18, 56, 90]);

/* ---- where the two records disagree about where the member lives ---- */
// Merging the wrong way here posts the ballot to an address the member left.
// Case and "Pl" vs "Place" do not count; a different street does.
const addrClash = [];
for (const [g, d] of decided) {
  if (!d.keep) continue;
  const streets = [...new Set(g.map(r => norm(r['Street Address'])).filter(Boolean))];
  if (streets.length < 2) continue;
  const short = streets.slice().sort((a, b) => a.length - b.length)[0];
  if (streets.every(x => x.startsWith(short) || short.startsWith(x))) continue;   // Pl / Place
  addrClash.push([who(d.keep),
    L(d.keep['Street Address']) + ', ' + L(d.keep['City']) + ' ' + L(d.keep['Zip']),
    g.filter(r => r !== d.keep).map(r => L(r['Street Address']) + ', ' + L(r['City']) + ' ' + L(r['Zip'])).join(' / '),
    'the keeper keeps its own address unless you say otherwise']);
}
add('Which address gets it', [
  ['Both records name a home, and they are different places. Merging keeps the first column, so if the second is the current one, change it before the file goes out — otherwise the ballot is posted somewhere the member no longer lives.'], [''],
  ['Member', 'Address on the record we keep', 'Address on the record being deleted', 'What happens by default'],
  ...addrClash], [26, 46, 46, 46]);

const name = 'Local36-BALLOT-duplicate-fix.xlsx';
XLSX.writeFile(wb, path.join(OUT, name));
console.log(name);
console.log(`  ${decided.length} groups with a keeper decided, ${stops.length} marked STOP, ${copyFirst.length} values to copy across first, ${addrClash.length} address clashes`);
console.log('\n--- decided ---');
decided.sort((a,b)=>b[2]-a[2]).forEach(([g, d, u]) => console.log('  ' + (u?'[2 ballots] ':'[cleanup]   ') + 'KEEP ' + who(d.keep).padEnd(26) + '(' + L(d.keep['Status']) + ') — delete ' +
  (g.length - 1) + ' other — ' + (d.same.join(', ') || d.verdict)));
console.log('\n--- STOP ---');
stops.sort((a,b)=>b[2]-a[2]).forEach(([g, d, u]) => console.log('  ' + (u?'[2 ballots] ':'[cleanup]   ') + who(g[0]).padEnd(26) + d.verdict));
