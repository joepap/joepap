'use strict';
/*
 * Join the payroll dues register to NEP — one place, used by everything that
 * needs it.
 *
 * This lived inside scripts/three-way.js until a second script re-implemented
 * a simpler version of it and came back with 14 paying members "not Active in
 * NEP" where the first had said 9. The five extra were four NEP payroll-number
 * typos and one known spelling difference that only the full join knows about.
 * Two answers to one question is worse than either, so the join is here.
 *
 * A register person is matched to a NEP record, in order:
 *   1. the payroll number, whatever the spelling of the name
 *   2. a link settled by evidence and written down (KNOWN)
 *   3. a NEP record of the same name whose payroll number is one digit away
 *      and belongs to nobody else on the register — a typo in NEP
 *   4. the one NEP record of the same name that has no payroll number, unless
 *      that record is retired, deceased or honorary: a member who has left
 *      the job does not come back onto the payroll
 */
const match = require('./match');
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');
const SUF = /\b(JR|SR|II|III|IV|V)\b/g;
const sur = s => match.normalizeName(L(s)).replace(SUF, '').replace(/\s+/g, ' ').trim();
const f1 = s => match.normalizeName(L(s)).split(' ')[0] || '';
const off1 = (x, y) => x.length === 8 && y.length === 8 && [...x].filter((c, i) => c !== y[i]).length === 1;
const status = r => L(r['Member Status']) || '(no status)';
const near = (a, b) => { const x = sur(a), y = sur(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x) || match.lastNameScore(x, y) >= 85); };

// Belle: the DC payroll spells him Belle, NEP and the International spell him
// Bell, IAFF 1318785 (settled 17 Aug 2026; the upload that was to add his
// payroll number never landed).
const KNOWN = { '00079233': r => num(r['IAFF Member Number']) === '1318785' };
// White, Daniel, hired 2026, is not White, Daniel J, retired.
const GONE = /^(Retired|Deceased|Alumni|Honorary|Life)$/;

/** One entry per person on the register: several lines net to one figure. */
function peopleOf(rows) {
  const people = new Map();
  for (const r of rows) {
    if (!people.has(r.emplid)) people.set(r.emplid, { emplid: r.emplid, last: r.last_name, first: r.first_name, mid: r.middle_name, lines: [], dept: r.dept });
    people.get(r.emplid).lines.push(r);
  }
  for (const p of people.values()) {
    p.net = p.lines.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0) / 100;
    p.paying = p.net > 0;
    p.name = p.last + ', ' + p.first + (p.mid ? ' ' + p.mid : '');
  }
  return people;
}

function link(rows, N) {
  const people = peopleOf(rows);
  const P = [...people.values()];
  const byPS = new Map(), byNm = new Map();
  for (const r of N) {
    const ps = num(r['PeopleSoft Number']); if (ps) byPS.set(ps, (byPS.get(ps) || []).concat([r]));
    const k = sur(r['Last Name']) + '|' + f1(r['First Name']); byNm.set(k, (byNm.get(k) || []).concat([r]));
  }
  const linked = new Map(), used = new Set();
  const A = { noRecord: [], addNumber: [], typo: [], ambiguous: [], twoRecords: [], statusWrong: [], flagWrong: [], zeroButPaying: [] };
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
      linked.set(p, rec); used.add(rec);
      if (p.paying && status(rec) !== 'Active') A.statusWrong.push([p, rec]);
      else if (p.paying && L(rec['Paying Active Member']) !== 'Yes') A.flagWrong.push([p, rec]);
      if (!p.paying && L(rec['Paying Active Member']) === 'Yes') A.zeroButPaying.push([p, rec]);
    }
  }
  const ambiguous = new Set(A.ambiguous.map(([p]) => p));
  const nepStatusOf = p => linked.has(p) ? status(linked.get(p)) : ambiguous.has(p) ? 'two NEP records could be theirs' : 'no NEP record';
  return { people, P, payers: P.filter(p => p.paying), zeros: P.filter(p => !p.paying), link: linked, used, A, nepStatusOf };
}

module.exports = { link, peopleOf, status, sur, f1, num };
