'use strict';
/*
 * Compare an import against the previous one: who stopped paying, who's
 * new, what changed. Keyed on emplid (stable per person). Fallback: fuzzy
 * name matching (same engine the check-in app used) pairs up rows whose
 * emplids the OCR mangled, so a misread digit never turns one real person
 * into a false "stopped" + false "new" pair.
 */
const match = require('./match');
const telestaff = require('./telestaff');
const { audit } = require('./db');

// Same bar payroll.js used to link payroll rows to roster members: at 88+
// a name match is reliably the same person.
const NAME_THRESHOLD = 88;
const VALID_EMPLID = /^0\d{7}$/;

function activeRows(db, importId) {
  return db.prepare(
    'SELECT * FROM rows WHERE import_id = ? AND excluded = 0').all(importId);
}

/** The import this one should be compared against: the most recent
 *  finalized import that comes before it (by report date, then upload). */
function previousImport(db, imp) {
  return db.prepare(`
    SELECT * FROM imports WHERE status = 'ready' AND id != ?
      AND (COALESCE(NULLIF(report_date,''), substr(uploaded_at,1,10)) || '~' || id)
        < (COALESCE(NULLIF(?,''), substr(?,1,10)) || '~' || ?)
    ORDER BY COALESCE(NULLIF(report_date,''), substr(uploaded_at,1,10)) DESC, id DESC
    LIMIT 1`).get(imp.id, imp.report_date, imp.uploaded_at, imp.id);
}

function displayName(r) {
  return r.name || [r.last_name, r.first_name].filter(Boolean).join(', ');
}

const money = r => (r.amount_taken >= 0 ? `$${r.amount_taken.toFixed(2)}` : 'an unreadable amount');

/**
 * A member can stop paying without leaving the report: the line stays, the
 * deduction drops to $0.00. Presence alone would call that "no change", so
 * the money is compared too — and a switch either way outranks a grade or
 * step change, because it decides whether the person counts as a payer.
 * Returns 'stopped', 'new' or null. A column we could not read is not a
 * change; -1 means illegible, not zero.
 */
function duesSwitch(prev, cur) {
  if (prev.amount_taken < 0 || cur.amount_taken < 0) return null;
  if (!prev.zero_deduction && cur.zero_deduction) return 'stopped';
  if (prev.zero_deduction && !cur.zero_deduction) return 'new';
  return null;
}

function diffDetail(prev, cur) {
  const bits = [];
  if (prev.grade !== cur.grade) bits.push(`grade ${prev.grade || '—'} → ${cur.grade || '—'}`);
  if (prev.step !== cur.step) bits.push(`step ${prev.step || '—'} → ${cur.step || '—'}`);
  const nameScore = match.scoreCandidate(
    { lastName: prev.last_name, firstName: prev.first_name },
    { norm_last: cur.norm_last, norm_first: cur.norm_first });
  if (nameScore < NAME_THRESHOLD) {
    bits.push(`name "${displayName(prev)}" → "${displayName(cur)}"`);
  }
  return bits;
}

/**
 * The current telestaff snapshot, as a lookup by employee number plus a
 * by-name fallback. Returns null when telestaff has never been uploaded, so
 * a stopped payer stays unexplained rather than being called "left the
 * department" on the strength of a file we do not have.
 */
function telestaffIndex(db) {
  const r = db.prepare(
    "SELECT id FROM rosters WHERE source = 'telestaff' ORDER BY id DESC LIMIT 1").get();
  if (!r) return null;
  const people = db.prepare('SELECT * FROM roster_members WHERE roster_id = ?').all(r.id);
  if (!people.length) return null;
  return { byEmplid: new Map(people.map(p => [p.emplid, p])), people };
}

/**
 * Why a payer stopped. Telestaff knows: it says whether they still work here
 * and what as. Look them up by employee number, and fall back to a strong
 * name match only when that number is one telestaff has never heard of —
 * a weak match here would put a wrong explanation next to a member's name,
 * which is worse than no explanation at all.
 */
function explainStop(idx, row) {
  if (!idx) return null;
  let person = VALID_EMPLID.test(row.emplid) ? idx.byEmplid.get(row.emplid) : undefined;
  if (!person && row.last_name) {
    const hits = idx.people
      .map(p => ({ p, s: match.scoreCandidate(
        { lastName: row.last_name, firstName: row.first_name || '' }, p) }))
      .filter(x => x.s >= 95)
      .sort((a, b) => b.s - a.s);
    // One clear winner only. Two people scoring the same is a family, and
    // guessing between them is how a father gets his son's record.
    if (hits.length === 1 || (hits.length > 1 && hits[0].s > hits[1].s)) person = hits[0].p;
  }
  return telestaff.explainStopped(person || null);
}

/**
 * Run (or re-run) the comparison for an import. Existing treasurer notes /
 * "handled" checkmarks survive a re-run — they're carried over by
 * (kind, emplid-or-name) key. Returns a summary object.
 */
function runCompare(db, importId) {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId);
  if (!imp) throw new Error('import not found');
  const prev = previousImport(db, imp);

  const curRows = activeRows(db, importId);
  const findings = [];   // {kind, emplid, name, detail, prev_row_id, cur_row_id, matched_by}

  if (prev) {
    const prevRows = activeRows(db, prev.id);
    const prevBy = new Map(), curBy = new Map();
    const prevLoose = [], curLoose = [];   // rows whose emplid isn't trustworthy
    for (const r of prevRows) {
      if (VALID_EMPLID.test(r.emplid) && !prevBy.has(r.emplid)) prevBy.set(r.emplid, r);
      else prevLoose.push(r);
    }
    for (const r of curRows) {
      if (VALID_EMPLID.test(r.emplid) && !curBy.has(r.emplid)) curBy.set(r.emplid, r);
      else curLoose.push(r);
    }

    // Same emplid on both reports — look for a dues switch first, then for
    // grade/step/name changes.
    const tsIdxEarly = telestaffIndex(db);
    for (const [emplid, p] of prevBy) {
      const c = curBy.get(emplid);
      if (!c) continue;
      const sw = duesSwitch(p, c);
      if (sw === 'stopped') {
        const why = explainStop(tsIdxEarly, c);
        findings.push({ kind: 'stopped', emplid, name: displayName(c),
          detail: `still on the report, but the deduction went from ${money(p)} to $0.00` +
                  (why ? ` — ${why.detail}. ${why.action}` : ''),
          reason: why ? why.code : null,
          prev_row_id: p.id, cur_row_id: c.id, matched_by: 'emplid' });
        continue;
      }
      if (sw === 'new') {
        findings.push({ kind: 'new', emplid, name: displayName(c),
          detail: `was on the report at $0.00, now paying ${money(c)}`,
          prev_row_id: p.id, cur_row_id: c.id, matched_by: 'emplid' });
        continue;
      }
      const bits = diffDetail(p, c);
      if (bits.length) {
        findings.push({ kind: 'changed', emplid, name: displayName(c),
          detail: bits.join('; '), prev_row_id: p.id, cur_row_id: c.id, matched_by: 'emplid' });
      }
    }

    // Candidates for stopped/new, before the fuzzy rescue pass.
    const stopPool = [...[...prevBy.values()].filter(p => !curBy.has(p.emplid)), ...prevLoose];
    const newPool = [...[...curBy.values()].filter(c => !prevBy.has(c.emplid)), ...curLoose];

    // Fuzzy rescue: a strong name match across the pools = same person whose
    // emplid was OCR-mangled on one of the two reports.
    const pairs = [];
    for (let i = 0; i < stopPool.length; i++) {
      for (let j = 0; j < newPool.length; j++) {
        const s = match.scoreCandidate(
          { lastName: stopPool[i].last_name, firstName: stopPool[i].first_name },
          { norm_last: newPool[j].norm_last, norm_first: newPool[j].norm_first });
        if (s >= NAME_THRESHOLD) pairs.push({ i, j, s });
      }
    }
    pairs.sort((a, b) => b.s - a.s);
    const usedI = new Set(), usedJ = new Set();
    for (const pr of pairs) {
      if (usedI.has(pr.i) || usedJ.has(pr.j)) continue;
      usedI.add(pr.i); usedJ.add(pr.j);
      const p = stopPool[pr.i], c = newPool[pr.j];
      const sw = duesSwitch(p, c);
      if (sw) {
        const why = sw === 'stopped' ? explainStop(tsIdxEarly, c) : null;
        findings.push({ kind: sw, emplid: c.emplid || p.emplid, name: displayName(c),
          detail: sw === 'stopped'
            ? `still on the report, but the deduction went from ${money(p)} to $0.00` +
              (why ? ` — ${why.detail}. ${why.action}` : '')
            : `was on the report at $0.00, now paying ${money(c)}`,
          reason: why ? why.code : null,
          prev_row_id: p.id, cur_row_id: c.id, matched_by: 'name' });
        continue;
      }
      const bits = diffDetail(p, c);
      if (p.emplid !== c.emplid) {
        bits.unshift(`emplid read differs (likely OCR): was "${p.emplid || '?'}", now "${c.emplid || '?'}"`);
      }
      findings.push({ kind: 'changed', emplid: c.emplid || p.emplid, name: displayName(c),
        detail: bits.join('; ') || 'matched by name across reports',
        prev_row_id: p.id, cur_row_id: c.id, matched_by: 'name' });
    }

    // Why each one stopped is most of the work in this list, and telestaff
    // can answer it. The case that keeps catching us out is a promotion:
    // a member made battalion chief still shows on the report he was paid
    // under, then vanishes from the next one, and nothing said why.
    stopPool.forEach((p, i) => {
      if (usedI.has(i)) return;
      // Someone who was already at $0.00 has not stopped paying — they were
      // never paying. Say that, rather than sending the treasurer after dues
      // that were never coming out.
      if (p.zero_deduction) {
        findings.push({ kind: 'stopped', emplid: p.emplid, name: displayName(p),
          detail: `off the report now, but was already at $0.00 on the ` +
                  `${prev.report_date || prev.uploaded_at.slice(0, 10)} report — ` +
                  'no dues were being deducted then either',
          reason: 'was-not-paying',
          prev_row_id: p.id, cur_row_id: null, matched_by: 'emplid' });
        return;
      }
      const why = explainStop(tsIdxEarly, p);
      findings.push({ kind: 'stopped', emplid: p.emplid, name: displayName(p),
        detail: `on the ${prev.report_date || prev.uploaded_at.slice(0, 10)} report` +
                ` (grade ${p.grade || '—'} step ${p.step || '—'}), missing now` +
                (why ? ` — ${why.detail}. ${why.action}` : ''),
        reason: why ? why.code : null,
        prev_row_id: p.id, cur_row_id: null, matched_by: 'emplid' });
    });
    newPool.forEach((c, j) => {
      if (usedJ.has(j)) return;
      findings.push({ kind: c.zero_deduction ? 'changed' : 'new', emplid: c.emplid, name: displayName(c),
        detail: c.zero_deduction
          ? 'first seen on this report, but at $0.00 — on the register, not paying'
          : `first seen on this report (grade ${c.grade || '—'} step ${c.step || '—'})`,
        prev_row_id: null, cur_row_id: c.id, matched_by: 'emplid' });
    });
  }

  // Preserve treasurer bookkeeping across re-runs.
  const old = db.prepare('SELECT * FROM changes WHERE import_id = ?').all(importId);
  const oldKey = new Map(old.map(o => [`${o.kind}|${o.emplid}|${o.name}`, o]));

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM changes WHERE import_id = ?').run(importId);
    const ins = db.prepare(`INSERT INTO changes
      (import_id, kind, emplid, name, detail, reason, prev_row_id, cur_row_id, matched_by, status, note, handled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const f of findings) {
      const o = oldKey.get(`${f.kind}|${f.emplid}|${f.name}`);
      ins.run(importId, f.kind, f.emplid, f.name, f.detail, f.reason || '',
        f.prev_row_id, f.cur_row_id,
        f.matched_by, o ? o.status : 'open', o ? o.note : '', o ? o.handled_at : null);
    }
    db.prepare(`UPDATE imports SET status = 'ready', compared_to = ?,
        finalized_at = COALESCE(finalized_at, datetime('now','localtime')) WHERE id = ?`)
      .run(prev ? prev.id : null, importId);
  });
  tx();

  const count = k => findings.filter(f => f.kind === k).length;
  const why = c => findings.filter(f => f.reason === c).length;
  const summary = {
    comparedTo: prev ? { id: prev.id, label: prev.report_date || prev.uploaded_at.slice(0, 10) } : null,
    stopped: count('stopped'), new: count('new'), changed: count('changed'),
    stoppedBecause: {
      promotedOut: why('promoted-out'),
      leftDepartment: why('left-department'),
      stillWorking: why('still-working'),
      wasNotPaying: why('was-not-paying'),
      unexplained: findings.filter(f => f.kind === 'stopped' && !f.reason).length
    },
    // Lines on the report is not the same number as payers, and the second
    // is the one the IAFF is billed against.
    total: curRows.length,
    payers: curRows.filter(r => !r.zero_deduction).length,
    zeroDeduction: curRows.filter(r => r.zero_deduction).length
  };
  audit(db, 'compare', `#${importId} vs #${prev ? prev.id : '—'}: ` +
    `${summary.stopped} stopped, ${summary.new} new, ${summary.changed} changed` +
    (summary.stoppedBecause.promotedOut
      ? ` (${summary.stoppedBecause.promotedOut} promoted out of the union)` : ''));
  return summary;
}

module.exports = { runCompare, previousImport, NAME_THRESHOLD };
