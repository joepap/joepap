'use strict';
/*
 * Telestaff — the department's own staffing export, and the authority on
 * employee (PeopleSoft) numbers.
 *
 * The dues report is a photocopy read by OCR. Telestaff is typed. Where they
 * disagree about an employee number, telestaff is right: cross-checking the
 * two found 48 numbers the scanner had misread by a single digit, and 43 of
 * those were a `9` read as 3, 8, 5 or 2. Left alone, those would have gone
 * into NEP as permanent keys pointing at the wrong person.
 *
 * So: take the number from telestaff, fall back to the scan only when
 * telestaff has never heard of the member. And use the typed name alongside
 * it to repair what the scanner made of the name on the page.
 */
const match = require('./match');

const L = s => String(s == null ? '' : s).trim();
const EMPLID_RE = /^0\d{7}$/;

/** Telestaff writes "Long, Kenneth W. {E18}" or "Albright, Julian (FTO/PM) {E03}".
 *  The braces are the house assignment and the parens are qualifications —
 *  neither belongs in a name. It also HTML-escapes apostrophes, so O'Neil
 *  arrives as "O&#39;Neil" and scores 89 against himself. */
function cleanName(raw) {
  return L(raw)
    .replace(/&#0*39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/\{[^}]*\}/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function splitName(raw) {
  const n = cleanName(raw);
  const i = n.indexOf(',');
  if (i === -1) return { last: n, first: '' };
  return { last: n.slice(0, i).trim(), first: n.slice(i + 1).trim() };
}

/** Employee IDs are eight digits starting with a zero; telestaff drops the
 *  leading zeros. Twelve rows in the August export have shifted columns and
 *  carry a qualification list here instead — "EMTB,FF/TECH,FF/EMT", and once
 *  "0000EMTB", which stripped down to "0000" would pad into the plausible-
 *  looking but entirely fake 00000000. Reject anything that is not an
 *  employee ID rather than invent one. */
function padEmplid(v) {
  const raw = L(v);
  if (/[A-Za-z]/.test(raw)) return '';
  const d = raw.replace(/\D/g, '');
  if (!d || d.length > 8) return '';
  const padded = d.padStart(8, '0');
  return EMPLID_RE.test(padded) ? padded : '';
}

const PLATOON = { '1': 'Platoon 1', '2': 'Platoon 2', '3': 'Platoon 3', '4': 'Platoon 4', DW: 'Day Work' };

/**
 * Collapse the raw export to one entry per person. Telestaff repeats a member
 * once per shift, trade, detail or leave entry; name, rank, phone and shift
 * are identical across those rows (checked: 526 of the 528 people with more
 * than one row), so the first is representative.
 */
function collapse(records) {
  const out = new Map();
  for (const r of records) {
    if (L(r.Name) === 'Name') continue;            // the export repeats its header
    const emplid = padEmplid(r['Employee ID']);
    if (!emplid || out.has(emplid)) continue;
    const { last, first } = splitName(r.Name);
    if (!last) continue;
    out.set(emplid, {
      emplid, last_name: last, first_name: first,
      rank: L(r.Rank),
      platoon: PLATOON[L(r['Formula ID'])] || '',
      phone: L(r['First Contact']),
      norm_last: match.normalizeName(last), norm_first: match.normalizeName(first)
    });
  }
  return [...out.values()];
}

/**
 * Compare parsed dues rows against telestaff.
 *
 * Returns, for each dues row we can speak to:
 *   confirmed — the scan's employee ID matches telestaff exactly
 *   idFix     — same person by name, different number; telestaff's wins
 *   nameFix   — number agrees, but the scanned name differs from the typed one
 *
 * A row only earns an idFix on a strong name match to exactly one telestaff
 * person who no other dues row already claims. A weak match must not be
 * allowed to move somebody's payroll number.
 */
function crossCheck(duesRows, people, { nameThreshold = 95 } = {}) {
  const byEmplid = new Map(people.map(p => [p.emplid, p]));
  const claimed = new Set();
  const confirmed = [], idFixes = [], nameFixes = [], unknown = [];

  // First pass: exact number matches. These are settled, and they take their
  // telestaff person out of play before any name matching happens.
  const pending = [];
  for (const d of duesRows) {
    const p = byEmplid.get(d.emplid);
    if (!p) { pending.push(d); continue; }
    claimed.add(p.emplid);
    confirmed.push({ row: d, person: p });
    const same = match.scoreCandidate(
      { lastName: d.last_name || '', firstName: d.first_name || '' }, p);
    if (same < nameThreshold) {
      nameFixes.push({ row: d, person: p, score: same,
        was: L(d.last_name) + ', ' + L(d.first_name),
        now: p.last_name + ', ' + p.first_name });
    }
  }

  // Second pass: the scan's number found nobody. Try the name.
  for (const d of pending) {
    if (!L(d.last_name)) { unknown.push(d); continue; }
    const q = { lastName: d.last_name, firstName: d.first_name || '' };
    const hits = people
      .filter(p => !claimed.has(p.emplid))
      .map(p => ({ p, s: match.scoreCandidate(q, p) }))
      .filter(x => x.s >= nameThreshold)
      .sort((a, b) => b.s - a.s);
    if (hits.length !== 1 && !(hits.length > 1 && hits[0].s > hits[1].s)) { unknown.push(d); continue; }
    const best = hits[0];
    claimed.add(best.p.emplid);
    idFixes.push({ row: d, person: best.p, score: best.s,
      was: d.emplid || '(unreadable)', now: best.p.emplid,
      digitsDiffer: EMPLID_RE.test(d.emplid)
        ? [...best.p.emplid].filter((c, i) => c !== d.emplid[i]).length : null });
  }
  return { confirmed, idFixes, nameFixes, unknown };
}

/** The number to store for a dues row: telestaff's if it knows them. */
function peoplesoftNumber(duesRow, crossCheckResult) {
  const fix = crossCheckResult.idFixes.find(f => f.row === duesRow);
  if (fix) return fix.now;
  const ok = crossCheckResult.confirmed.find(c => c.row === duesRow);
  if (ok) return ok.person.emplid;
  return EMPLID_RE.test(duesRow.emplid) ? duesRow.emplid : '';
}

/**
 * Decide which NEP members may be given a payroll number, and refuse the rest.
 *
 * Two rules, both learned the hard way. Thirteen numbers ended up on two
 * members each — every pair a father and his son — because the matcher put a
 * payroll row on the retired father and nothing stopped the write. Clearing
 * them without this guard just means writing them back on the next run.
 *
 *   1. Only a serving member may hold one. A retired, deceased, dropped or
 *      alumni member does not have a payroll number, so a value on their
 *      record came from the wrong generation. A *blank* status is not the
 *      same thing — 94 members with no status are on the payroll report,
 *      which is how they got a number, so they are allowed.
 *   2. One number, one member. If two candidates want the same number the
 *      write is refused for both and a human decides; silently picking one
 *      is how a father ends up wearing his son's number.
 *
 * `candidates` are { member, number } where member is a raw NEP record.
 * Returns { write, refused } — refused carries the reason, to be reported.
 */
const NOT_SERVING = new Set(['active retired', 'retired', 'deceased', 'drop', 'dropped', 'alumni', 'life']);

function planPeoplesoftWrites(candidates) {
  const write = [], refused = [];
  const wanted = new Map();
  for (const c of candidates) {
    const status = L(c.member['Member Status']).toLowerCase();
    if (NOT_SERVING.has(status)) {
      refused.push({ ...c, reason: 'Member Status is "' + L(c.member['Member Status'])
        + '" — a payroll number belongs to a serving employee.' });
      continue;
    }
    if (!EMPLID_RE.test(L(c.number))) {
      refused.push({ ...c, reason: 'not an employee number: "' + L(c.number) + '"' });
      continue;
    }
    if (!wanted.has(c.number)) wanted.set(c.number, []);
    wanted.get(c.number).push(c);
  }
  for (const [num, list] of wanted) {
    if (list.length === 1) { write.push(list[0]); continue; }
    for (const c of list) {
      refused.push({ ...c, reason: num + ' is claimed by ' + list.length
        + ' members (' + list.map(x => L(x.member['Last Name']) + ', ' + L(x.member['First Name'])).join(' / ')
        + '). One number, one member — a human decides.' });
    }
  }
  return { write, refused };
}

/**
 * Is this rank outside Local 36?
 *
 * Chief officers — battalion, deputy, assistant and the Fire Chief — are not
 * in our bargaining unit. A member who is promoted into one of those ranks
 * stops paying dues and should become `Drop` in NEP, the way Weinroth and
 * Schott did. Honorary is a separate decision and stays a human's call.
 *
 * Deliberately narrow. "Battalion EMS Supervisor" and "Captain - ROCC
 * Manager" read like chief titles and are not; matching loosely would drop
 * paying members. Only the four real chief grades count, and `Fire Chief`
 * must be the whole rank so that `Assistant Fire Chief` is not matched twice
 * and `Deputy Fire Chief Aide` — a sergeant's job — is not matched at all.
 */
const CHIEF_RE = /^(battalion|deputy|assistant)\s+(fire\s+)?chief\b|^assistant\s+chief\b|^fire\s+chief$/i;

function isOutsideLocal(rank) {
  const r = cleanName(rank).replace(/\s+/g, ' ').trim();
  if (/\baide\b/i.test(r)) return false;      // a chief's aide is one of ours
  return CHIEF_RE.test(r);
}

/**
 * Why did this person stop appearing on the dues report?
 *
 * Answering it by hand is most of the work in the stopped-payer list, and
 * telestaff already knows: it says whether they are still employed and what
 * they are employed as. Three outcomes, and the first is the one that keeps
 * catching us out — Botwin was still on the June report, already a battalion
 * chief, and looked like a paying member right up until the next payroll.
 *
 * Returns null when there is no telestaff snapshot to consult, so the caller
 * can tell "nothing to say" apart from "still working, no idea why".
 */
function explainStopped(person) {
  if (person === undefined) return null;
  if (!person) {
    return { code: 'left-department', action: 'Retired or resigned — check, then set NEP to Active Retired or Drop.',
      detail: 'not on the current telestaff export, so no longer employed' };
  }
  if (isOutsideLocal(person.rank)) {
    return { code: 'promoted-out', action: 'Promoted out of the union — set NEP Member Status to Drop.',
      detail: 'telestaff now has them as ' + person.rank + ', which is outside Local 36' };
  }
  return { code: 'still-working', action: 'Still employed in the unit — payroll error, or they withdrew. Ask.',
    detail: 'telestaff still has them as ' + (person.rank || 'employed') +
      (person.platoon ? ', ' + person.platoon : '') };
}

module.exports = { collapse, crossCheck, peoplesoftNumber, planPeoplesoftWrites,
  isOutsideLocal, explainStopped, cleanName, splitName, padEmplid };
