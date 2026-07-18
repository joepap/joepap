'use strict';
// Load the DC payroll union-dues list and reconcile it against the member
// roster. Payroll is the authoritative "currently paying dues" source; a
// member matched here is eligible for a ballot. Payroll rows that match no
// member are "payroll-only" (paying but not in NEP) — still eligible, and
// flagged for enrollment.

const match = require('./match');

const MATCH_THRESHOLD = 88; // strong name match = same person across the two lists

// Bucket members by the first letter of every last-name token, so each
// payroll row is only compared against the handful of members sharing a
// last-name initial (not all 3,000+). At the 88 threshold a match always
// shares a first letter, so this is a ~25x speedup with no accuracy loss.
function buildBuckets(members) {
  const buckets = new Map();
  const addTo = (k, m) => { const a = buckets.get(k); if (a) a.push(m); else buckets.set(k, [m]); };
  for (const m of members) {
    const seen = new Set();
    for (const tok of (m.norm_last || '').split(' ')) {
      const k = tok[0]; if (k && !seen.has(k)) { seen.add(k); addTo(k, m); }
    }
  }
  return buckets;
}

// Best member match for one payroll last/first, with an exact full-scan
// fallback so cross-bucket OCR/prefix variance is never missed.
function bestMatchId(lastName, firstName, buckets, members) {
  const q = { lastName: lastName || '', firstName: firstName || '' };
  const normLast = match.normalizeName(lastName);
  const seen = new Set(), cands = [];
  for (const tok of normLast.split(' ')) {
    const k = tok[0]; if (!k) continue;
    for (const m of (buckets.get(k) || [])) if (!seen.has(m.id)) { seen.add(m.id); cands.push(m); }
  }
  let best = null, bestScore = 0;
  for (const m of cands) {
    const s = match.scoreCandidate(q, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  if (bestScore < MATCH_THRESHOLD) {
    for (const m of members) {
      const s = match.scoreCandidate(q, m);
      if (s > bestScore) { bestScore = s; best = m; }
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best.id : null;
}

/**
 * Replace the payroll_dues table with `records` and recompute matches.
 * records: [{ emplid, last, first, middle, ssn4, grade, step }]
 * Returns { total, matched, payrollOnly }.
 */
function loadAndMatch(db, records) {
  const members = db.prepare(
    'SELECT id, norm_last, norm_first, last_name, first_name FROM members'
  ).all();
  const buckets = buildBuckets(members);

  const tx = db.transaction(() => {
    db.exec('DELETE FROM payroll_dues');
    db.prepare('UPDATE members SET payroll_ok = 0').run();

    const ins = db.prepare(`INSERT INTO payroll_dues
      (emplid, last_name, first_name, middle_name, ssn4, grade, step, norm_last, norm_first, member_id)
      VALUES (@emplid,@last,@first,@middle,@ssn4,@grade,@step,@norm_last,@norm_first,@member_id)`);
    const setOk = db.prepare('UPDATE members SET payroll_ok = 1 WHERE id = ?');

    let matched = 0, payrollOnly = 0;
    for (const r of records) {
      const memberId = bestMatchId(r.last, r.first, buckets, members);
      if (memberId) { setOk.run(memberId); matched++; } else payrollOnly++;
      ins.run({
        emplid: r.emplid || '', last: r.last || '', first: r.first || '',
        middle: r.middle || '', ssn4: r.ssn4 || '', grade: r.grade || '', step: r.step || '',
        norm_last: match.normalizeName(r.last), norm_first: match.normalizeName(r.first),
        member_id: memberId
      });
    }
    return { matched, payrollOnly };
  });

  const res = tx();
  return { total: records.length, ...res };
}

/**
 * Re-match the EXISTING payroll_dues rows against the current member roster,
 * without re-uploading the payroll file. Call this after a roster import so
 * re-importing the roster can never silently wipe payroll eligibility
 * (every member RED). Returns { total, matched, payrollOnly }.
 */
function rematch(db) {
  const rows = db.prepare('SELECT id, last_name, first_name FROM payroll_dues').all();
  if (!rows.length) return { total: 0, matched: 0, payrollOnly: 0 };
  const members = db.prepare(
    'SELECT id, norm_last, norm_first, last_name, first_name FROM members'
  ).all();
  const buckets = buildBuckets(members);

  const tx = db.transaction(() => {
    db.prepare('UPDATE members SET payroll_ok = 0').run();
    const setOk = db.prepare('UPDATE members SET payroll_ok = 1 WHERE id = ?');
    const upd = db.prepare('UPDATE payroll_dues SET member_id = ? WHERE id = ?');
    let matched = 0, payrollOnly = 0;
    for (const r of rows) {
      const memberId = bestMatchId(r.last_name, r.first_name, buckets, members);
      upd.run(memberId, r.id);
      if (memberId) { setOk.run(memberId); matched++; } else payrollOnly++;
    }
    return { matched, payrollOnly };
  });
  const res = tx();
  return { total: rows.length, ...res };
}

/** Search payroll-only rows (member_id IS NULL) by last-name prefix. */
function searchPayrollOnly(db, q) {
  const parts = q.includes(',') ? q.split(',', 2).map(s => s.trim()) : [q, ''];
  const normLast = match.normalizeName(parts[0]);
  const normFirst = match.normalizeName(parts[1]);
  if (!normLast) return [];
  const rows = db.prepare(
    `SELECT * FROM payroll_dues WHERE member_id IS NULL
     AND (norm_last LIKE ? OR norm_last LIKE ?) ORDER BY norm_last, norm_first LIMIT 20`
  ).all(normLast + '%', '% ' + normLast + '%');
  return normFirst ? rows.filter(r => r.norm_first.startsWith(normFirst)) : rows;
}

module.exports = { loadAndMatch, rematch, searchPayrollOnly, MATCH_THRESHOLD };
