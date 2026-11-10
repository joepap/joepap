'use strict';
/*
 * Decide whether two written addresses are the same place.
 *
 * Needed to answer one question honestly: is an address the International
 * holds the same one that already came back undeliverable? A plain string
 * comparison says "different" to "7908 West Wood Court" and "7908 Westwood Ct",
 * and to "1031 Kearney Street NE" and "1031 Kearny St NE" — and those
 * differences are the interesting ones, because the second spelling may be the
 * reason the first one bounced.
 *
 * Three answers, not two:
 *   same       the same line and the same zip. If it bounced once it will again.
 *   near       the same zip and a street line within two characters — one of
 *              the two has a slip in it (a transposed house number, a misspelt
 *              street), or the zip alone differs.
 *   different  another address altogether.
 */
const L = v => String(v == null ? '' : v).trim();
const SUFFIX = { street: 'st', road: 'rd', avenue: 'ave', av: 'ave', drive: 'dr', court: 'ct', lane: 'ln', place: 'pl',
  terrace: 'ter', terr: 'ter', boulevard: 'blvd', circle: 'cir', highway: 'hwy', parkway: 'pkwy', trail: 'trl',
  square: 'sq', point: 'pt', alley: 'aly' };
// A compass word is only sometimes a direction: "West Wood Court" may be W Wood
// Ct or a misspelt Westwood Ct. So the line is reduced twice, once shortening
// compass words and once leaving them, and the two readings are both tried.
const COMPASS = { north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' };
const UNIT = /^(apt|apartment|unit|suite|ste|#|no|ph|lot|rm|room|fl|floor)$/;

const zip5 = z => L(z).replace(/\D/g, '').slice(0, 5);

// The street line reduced to what a carrier uses: no punctuation, standard
// suffixes, nothing from the apartment marker onwards, no spaces. Dropping the
// spaces is what makes "West Wood" and "Westwood" meet.
function compact(street, keepCompass) {
  const s = L(street).toLowerCase().replace(/\./g, '').replace(/#/g, ' # ').replace(/[,;]/g, ' ');
  if (/^(p\s*o\s*)?box\b/.test(s)) return 'pobox' + (s.match(/\d+/) || [''])[0];
  const out = [];
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (UNIT.test(w)) break;
    out.push(SUFFIX[w] || (!keepCompass && COMPASS[w]) || w);
  }
  // a trailing bare unit with no marker ("... dr, 203") is dropped as well
  if (out.length > 2 && /^\d+[a-z]?$/.test(out[out.length - 1]) && !/^\d/.test(out[out.length - 2])) out.pop();
  return out.join('').replace(/[^a-z0-9]/g, '');
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 9;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** a, b: { street, zip }. Returns 'same' | 'near' | 'different'. */
function compare(a, b) {
  const ca = compact(a.street), cb = compact(b.street);
  if (!ca || !cb) return 'different';
  const za = zip5(a.zip), zb = zip5(b.zip);
  const zipSame = !za || !zb || za === zb;
  if (ca === cb) return zipSame ? 'same' : 'near';
  if (/^pobox/.test(ca) || /^pobox/.test(cb)) return 'different';   // box 8 is not box 57
  if (!zipSame) return 'different';
  // A slip is in the house number OR in the street, not a little of each:
  // "1447 U St" and "1440 V St" are two characters apart and two addresses.
  // the house number is the leading digits only: in "1447ustnw" the u is the
  // street, and letting it ride with the number makes U St and V St one place
  const split = c => { const m = c.match(/^(\d+)(.*)$/); return m ? [m[1], m[2]] : ['', c]; };
  const close = (x, y) => {
    const [nx, sx] = split(x), [ny, sy] = split(y);
    return (nx === ny && lev(sx, sy) <= 2) || (sx === sy && lev(nx, ny) <= 2);
  };
  return close(ca, cb) || close(compact(a.street, true), compact(b.street, true)) ? 'near' : 'different';
}

module.exports = { compare, compact, zip5 };
