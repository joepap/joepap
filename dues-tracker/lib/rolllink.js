'use strict';
/*
 * Join NEP records to the International's roll.
 *
 * The roll has no payroll number, so there are only two ways across: the IAFF
 * member number, and the name. The number is proof. The name is not — the roll
 * and NEP both hold fathers and sons who share everything but a middle initial
 * and a suffix — so a name link is made only when exactly one unclaimed roll
 * entry carries that surname and first name and the middle initials do not
 * disagree, and every link records which way it was made so that anything
 * built on it can decide how far to trust it.
 */
const match = require('./match');
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');
const SUF = /\b(JR|SR|II|III|IV|V)\b/g;
const sur = s => match.normalizeName(L(s)).replace(SUF, '').replace(/\s+/g, ' ').trim();
const f1 = s => match.normalizeName(L(s)).split(' ')[0] || '';
const mi = s => (match.normalizeName(L(s)).split(' ')[1] || '').slice(0, 1);

function link(N, I) {
  const iById = new Map(I.map(r => [num(r['Id']), r]));
  const iByNm = new Map();
  for (const r of I) { const k = sur(r['Last Name']) + '|' + f1(r['First Name']); iByNm.set(k, (iByNm.get(k) || []).concat([r])); }
  const nepToRoll = new Map(), how = new Map(), rollClaimed = new Map();
  const fill = [], numberNotOnRoll = [], nameAmbiguous = [];
  for (const r of N) {
    const ia = num(r['IAFF Member Number']);
    if (ia && iById.has(ia)) {
      const x = iById.get(ia);
      nepToRoll.set(r, x); how.set(r, 'number'); rollClaimed.set(x, (rollClaimed.get(x) || []).concat([r]));
    } else if (ia) numberNotOnRoll.push(r);
  }
  for (const r of N) {
    if (num(r['IAFF Member Number'])) continue;
    const c = (iByNm.get(sur(r['Last Name']) + '|' + f1(r['First Name'])) || []).filter(x => !rollClaimed.has(x));
    const m = mi(r['First Name']);
    const ok = c.filter(x => !m || !L(x['Middle Name']) || L(x['Middle Name']).slice(0, 1).toUpperCase() === m);
    if (ok.length === 1) { nepToRoll.set(r, ok[0]); how.set(r, 'name'); rollClaimed.set(ok[0], [r]); fill.push([r, ok[0]]); }
    else if (ok.length > 1) nameAmbiguous.push([r, ok]);
  }
  return { nepToRoll, how, rollClaimed, fill, numberNotOnRoll, nameAmbiguous, iByNm, iById };
}

module.exports = { link, sur, f1, mi, num };
