'use strict';
/*
 * The three-database reconciliation:
 *
 *   DCHR payroll dues report  — who is actually paying dues (scanned/OCR'd)
 *   NEP (ConnectPlus)         — our own membership database
 *   IAFF                      — the international's record of our members
 *
 * Every uploaded roster is a permanent snapshot; the newest per source is
 * what the dashboard and reconcile lists use. Matching reuses the fuzzy
 * name engine proven at the ratification event (payroll.js pattern):
 * dues rows -> NEP by name (NEP has no emplid), NEP <-> IAFF by member
 * number first, name as fallback.
 */
const match = require('./match');

const MATCH_THRESHOLD = 88;   // same bar payroll.js used — reliable "same person"

// ---------- roster snapshots ----------

/** Insert a roster snapshot. records = parsed rows, mapping = {field: column}. */
function importRoster(db, source, records, mapping, filename) {
  const get = (r, k) => String(mapping[k] ? (r[mapping[k]] || '') : '').trim();
  const info = db.prepare('INSERT INTO rosters (source, filename, total) VALUES (?, ?, ?)')
    .run(source, filename || '', records.length);
  const rosterId = info.lastInsertRowid;
  const ins = db.prepare(`INSERT INTO roster_members
    (roster_id, member_no, emplid, last_name, first_name, middle_name,
     status, work_status, email, phone, norm_last, norm_first)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    for (const r of records) {
      let last = get(r, 'last_name'), first = get(r, 'first_name'), middle = get(r, 'middle_name');
      const full = get(r, 'full_name');
      if (full && !last) {
        // "LAST, FIRST M" or "FIRST M LAST" — comma decides.
        if (full.includes(',')) {
          const i = full.indexOf(',');
          last = full.slice(0, i).trim();
          const rest = full.slice(i + 1).trim().split(/\s+/);
          first = rest[0] || ''; middle = rest.slice(1).join(' ');
        } else {
          const toks = full.split(/\s+/);
          first = toks[0] || ''; last = toks[toks.length - 1] || '';
          middle = toks.slice(1, -1).join(' ');
        }
      }
      ins.run(rosterId, get(r, 'member_no'), get(r, 'emplid').replace(/\D/g, ''),
        last, first, middle, get(r, 'status'), get(r, 'work_status'),
        get(r, 'email'), get(r, 'phone'),
        match.normalizeName(last), match.normalizeName(first));
    }
  });
  tx();
  return { rosterId, total: records.length };
}

function latestRoster(db, source) {
  return db.prepare(
    'SELECT * FROM rosters WHERE source = ? ORDER BY id DESC LIMIT 1').get(source);
}

function rosterMembers(db, rosterId) {
  return db.prepare('SELECT * FROM roster_members WHERE roster_id = ?').all(rosterId);
}

/** Counts by status value — the dashboard breakdown ("Active", "Active
 *  Retired", …). Uses status, falling back to work_status when blank. */
function statusBreakdown(db, rosterId) {
  return db.prepare(`
    SELECT CASE WHEN status != '' THEN status
                WHEN work_status != '' THEN work_status
                ELSE '(blank)' END AS label, COUNT(*) c
    FROM roster_members WHERE roster_id = ?
    GROUP BY label ORDER BY c DESC`).all(rosterId);
}

const isRetired = m => /retire/i.test(m.status + ' ' + m.work_status);
const isActiveish = m => /active/i.test(m.status + ' ' + m.work_status) && !isRetired(m);

// ---------- fuzzy matching (payroll.js pattern) ----------

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

/**
 * ONE-TO-ONE name matching between two lists. Two different people with
 * the same name are a certainty at department size (the test data grew two
 * JENNIFER STEVENSes by chance and caught this): a naive best-match lets
 * both A-side rows claim the same B-side person, making the second one
 * look unmatched. Here every pair ≥ threshold is scored, then assigned
 * greedily best-first, each side used at most once.
 *
 * as: [{ id, last_name, first_name }], bs: roster-member-shaped rows.
 * Returns Map(a.id -> b).
 */
function assignOneToOne(as, bs) {
  const buckets = buildBuckets(bs);
  const pairs = [];
  for (const a of as) {
    const q = { lastName: a.last_name || '', firstName: a.first_name || '' };
    const normLast = match.normalizeName(a.last_name || '');
    const seen = new Set();
    let any = false;
    for (const tok of normLast.split(' ')) {
      const k = tok[0]; if (!k) continue;
      for (const b of (buckets.get(k) || [])) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        const s = match.scoreCandidate(q, b);
        if (s >= MATCH_THRESHOLD) { pairs.push({ a, b, s }); any = true; }
      }
    }
    if (!any) {
      // Cross-bucket fallback (first letter of the last name misread/changed).
      for (const b of bs) {
        if (seen.has(b.id)) continue;
        const s = match.scoreCandidate(q, b);
        if (s >= MATCH_THRESHOLD) pairs.push({ a, b, s });
      }
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  const out = new Map(), usedB = new Set();
  for (const p of pairs) {
    if (out.has(p.a.id) || usedB.has(p.b.id)) continue;
    out.set(p.a.id, p.b);
    usedB.add(p.b.id);
  }
  return out;
}

// ---------- the reconciliation ----------

/**
 * Compare the latest finalized dues import, the latest NEP roster, and the
 * latest IAFF roster (whichever exist). Returns dashboard numbers plus the
 * action lists. Pure read — recomputed on demand, always current.
 */
function reconcile(db) {
  const duesImport = db.prepare(
    "SELECT * FROM imports WHERE status = 'ready' ORDER BY " +
    "COALESCE(NULLIF(report_date,''), substr(uploaded_at,1,10)) DESC, id DESC LIMIT 1").get();
  const duesRows = duesImport
    ? db.prepare('SELECT * FROM rows WHERE import_id = ? AND excluded = 0').all(duesImport.id) : [];
  const nepRoster = latestRoster(db, 'nep');
  const nep = nepRoster ? rosterMembers(db, nepRoster.id) : [];
  const iaffRoster = latestRoster(db, 'iaff');
  const iaff = iaffRoster ? rosterMembers(db, iaffRoster.id) : [];

  const out = {
    sources: {
      dues: duesImport ? { id: duesImport.id, label: duesImport.report_date || duesImport.uploaded_at.slice(0, 10), total: duesRows.length } : null,
      nep: nepRoster ? { id: nepRoster.id, label: nepRoster.uploaded_at.slice(0, 10), total: nep.length, breakdown: statusBreakdown(db, nepRoster.id) } : null,
      iaff: iaffRoster ? { id: iaffRoster.id, label: iaffRoster.uploaded_at.slice(0, 10), total: iaff.length, breakdown: statusBreakdown(db, iaffRoster.id) } : null
    },
    payingNotInNep: [], nepActiveNotPaying: [], payingButRetiredInNep: [],
    inNepNotIaff: [], inIaffNotNep: [],
    counts: {}
  };

  // ---- dues vs NEP (matched by name, one-to-one; NEP has no emplid) ----
  if (duesRows.length && nep.length) {
    const assigned = assignOneToOne(duesRows, nep);
    const matchedNepIds = new Set([...assigned.values()].map(m => m.id));
    for (const r of duesRows) {
      const m = assigned.get(r.id);
      if (!m) {
        out.payingNotInNep.push({ emplid: r.emplid, name: r.name, grade: r.grade, step: r.step });
      } else if (isRetired(m)) {
        out.payingButRetiredInNep.push({ emplid: r.emplid, name: r.name,
          member_no: m.member_no, nep_status: m.status || m.work_status });
      }
    }
    for (const m of nep) {
      if (!matchedNepIds.has(m.id) && isActiveish(m)) {
        out.nepActiveNotPaying.push({ member_no: m.member_no,
          name: m.last_name + ',' + m.first_name, status: m.status || m.work_status,
          email: m.email, phone: m.phone });
      }
    }
    out.nepActiveNotPaying.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- NEP vs IAFF: member number pins the pair; names (one-to-one)
  // catch the rest. ----
  if (nep.length && iaff.length) {
    const iaffByNo = new Map();
    for (const m of iaff) {
      const no = m.member_no.replace(/\D/g, '');
      if (no && !iaffByNo.has(no)) iaffByNo.set(no, m);
    }
    const pairedIaff = new Set(), pairedNep = new Set();
    for (const m of nep) {
      const hit = m.member_no ? iaffByNo.get(m.member_no.replace(/\D/g, '')) : null;
      if (hit && !pairedIaff.has(hit.id)) { pairedIaff.add(hit.id); pairedNep.add(m.id); }
    }
    const nepLeft = nep.filter(m => !pairedNep.has(m.id));
    const iaffLeft = iaff.filter(m => !pairedIaff.has(m.id));
    const byName = assignOneToOne(nepLeft, iaffLeft);
    const nameClaimedIaff = new Set([...byName.values()].map(m => m.id));
    for (const m of nepLeft) {
      if (!byName.has(m.id) && (isActiveish(m) || isRetired(m))) {
        out.inNepNotIaff.push({ member_no: m.member_no,
          name: m.last_name + ',' + m.first_name, status: m.status || m.work_status });
      }
    }
    for (const m of iaffLeft) {
      if (!nameClaimedIaff.has(m.id)) {
        out.inIaffNotNep.push({ member_no: m.member_no,
          name: m.last_name + ',' + m.first_name, status: m.status || m.work_status });
      }
    }
    out.inNepNotIaff.sort((a, b) => a.name.localeCompare(b.name));
    out.inIaffNotNep.sort((a, b) => a.name.localeCompare(b.name));
  }

  out.counts = {
    dues_payers: duesRows.length,
    nep_members: nep.length,
    nep_active: nep.filter(isActiveish).length,
    nep_retired: nep.filter(isRetired).length,
    iaff_members: iaff.length,
    iaff_active: iaff.filter(isActiveish).length,
    iaff_retired: iaff.filter(isRetired).length,
    paying_not_in_nep: out.payingNotInNep.length,
    nep_active_not_paying: out.nepActiveNotPaying.length,
    paying_but_retired: out.payingButRetiredInNep.length,
    in_nep_not_iaff: out.inNepNotIaff.length,
    in_iaff_not_nep: out.inIaffNotNep.length
  };
  return out;
}

/** The reconcile workbook: one sheet per action list + a summary. */
function buildReconcileWorkbook(db) {
  const XLSX = require('xlsx');
  const r = reconcile(db);
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, note) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: note || 'no rows' }]);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  };
  const s = [];
  const put = (metric, value) => s.push({ metric, value });
  put('Dues payers (DCHR payroll)', r.sources.dues ? `${r.counts.dues_payers} (report ${r.sources.dues.label})` : 'no report loaded');
  put('NEP members', r.sources.nep ? `${r.counts.nep_members} (loaded ${r.sources.nep.label})` : 'not loaded');
  put('NEP — active', r.counts.nep_active || 0);
  put('NEP — retired', r.counts.nep_retired || 0);
  put('IAFF members (per cap)', r.sources.iaff ? `${r.counts.iaff_members} (loaded ${r.sources.iaff.label})` : 'not loaded');
  put('IAFF — active', r.counts.iaff_active || 0);
  put('IAFF — retired', r.counts.iaff_retired || 0);
  put('Paying dues but NOT in NEP (enroll!)', r.counts.paying_not_in_nep);
  put('Active in NEP but not paying', r.counts.nep_active_not_paying);
  put('Paying but marked retired in NEP', r.counts.paying_but_retired);
  put('In NEP, missing from IAFF', r.counts.in_nep_not_iaff);
  put('In IAFF, missing from NEP', r.counts.in_iaff_not_nep);
  addSheet('Summary', s);
  addSheet('Paying - not in NEP', r.payingNotInNep, 'everyone paying is in NEP');
  addSheet('NEP active - not paying', r.nepActiveNotPaying, 'every active NEP member pays');
  addSheet('Paying but retired in NEP', r.payingButRetiredInNep, 'none');
  addSheet('In NEP - missing from IAFF', r.inNepNotIaff, 'IAFF roster not loaded or complete');
  addSheet('In IAFF - missing from NEP', r.inIaffNotNep, 'IAFF roster not loaded or complete');
  return wb;
}

module.exports = { importRoster, latestRoster, statusBreakdown, reconcile, buildReconcileWorkbook, MATCH_THRESHOLD };
