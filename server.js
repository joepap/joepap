'use strict';
/*
 * Local 36 ratification check-in server.
 * Single process: Express + SQLite (WAL). Binds to the LAN; stations are
 * plain browsers. No external services, no telemetry, no internet required.
 *
 * PRIVACY: raw AAMVA barcode data is parsed in the BROWSER (public/js/aamva.js)
 * and only {lastName, firstName, dob} ever reach this server, for matching.
 * DOB is used transiently for candidate disambiguation and is never stored —
 * see /api/match below. License numbers never leave the parser.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const multer = require('multer');

const { open, getConfig, setConfig, audit } = require('./lib/db');
const csv = require('./lib/csv');
const tabular = require('./lib/tabular');
const match = require('./lib/match');
const payroll = require('./lib/payroll');
const mailer = require('./lib/mailer');

const db = open(process.env.DB_FILE);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
// Serve the app with revalidation always on (etag + must-revalidate, no
// stored copy). During the event the code changes between pulls; a browser
// must never run a stale cached page/script — that class of "why isn't my
// fix live?" bug is closed here at the cost of a tiny 304 round-trip.
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  etag: true,
  setHeaders: function (res) { res.set('Cache-Control', 'no-cache'); }
}));

// ---------- helpers ----------

function requireAdmin(req, res, next) {
  const pin = req.get('X-Admin-Pin') || req.query.pin || '';
  if (pin && pin === getConfig(db, 'admin_pin')) return next();
  res.status(401).json({ error: 'admin PIN required' });
}

// Every station request needs the station PIN (or the admin PIN). The app
// may be served over the public internet (volunteer phones on cellular via
// Tailscale Funnel), so member data must never be reachable un-PINned.
function requireStation(req, res, next) {
  const spin = req.get('X-Station-Pin') || '';
  const apin = req.get('X-Admin-Pin') || req.query.pin || '';
  if ((spin && spin === getConfig(db, 'station_pin')) ||
      (apin && apin === getConfig(db, 'admin_pin'))) return next();
  res.status(401).json({ error: 'station PIN required' });
}

// Gate the whole API except the health check; admin routes additionally
// check requireAdmin on their own.
app.use('/api', (req, res, next) => {
  if (req.path === '/ping') return next();
  requireStation(req, res, next);
});

function portalOk(status) {
  if (!status) return null; // portal status not imported
  const okValues = (getConfig(db, 'portal_ok_values') || 'approved')
    .split(',').map(s => s.trim().toLowerCase());
  return okValues.includes(String(status).trim().toLowerCase());
}

function ageFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const n = new Date();
  let age = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() ||
      (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) age--;
  return age;
}

// 'ok' = in an email distribution group; 'bad' = in a known-problem group
// (bounced / no-email); 'missing' = in neither; null = groups not imported.
function emailListStatus(groupsRaw) {
  if (!groupsRaw) return null;
  const list = groupsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const parse = key => (getConfig(db, key) || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parse('email_bad_groups').some(g => list.includes(g))) return 'bad';
  if (parse('email_ok_groups').some(g => list.includes(g))) return 'ok';
  return 'missing';
}

// Eligibility for an NEP member. Payroll is the authority: on the payroll
// dues list => eligible; not on it => must be verified at the Discrepancy
// Table (NEP may be stale — e.g. promoted out of the unit). The union's
// known non-dues-payer list is an absolute block.
let _payrollLoaded = null;
function payrollLoaded() {
  if (_payrollLoaded === null) _payrollLoaded = !!db.prepare('SELECT 1 FROM payroll_dues LIMIT 1').get();
  return _payrollLoaded;
}
function invalidatePayrollCache() { _payrollLoaded = null; }

function eligibilityOf(m) {
  if (Number(m.dues_block) === 1) {
    return { ballot: false, color: 'red', state: 'blocked',
      label: 'NON DUES-PAYING MEMBER — NOT ELIGIBLE' };
  }
  if (payrollLoaded()) {
    // Payroll list present => it is the authority.
    if (Number(m.payroll_ok) === 1) {
      return { ballot: true, color: 'green', state: 'verified', label: 'DUES VERIFIED ✓' };
    }
    return { ballot: false, color: 'red', state: 'verify',
      label: 'DUES NOT VERIFIED — send to Discrepancy Table' };
  }
  // No payroll list loaded => fall back to NEP Member Status.
  if (Number(m.dues_ok) === 1) {
    return { ballot: true, color: 'green', state: 'status_ok',
      label: m.dues_status ? '✓ ' + m.dues_status.toUpperCase() : 'ELIGIBLE' };
  }
  return { ballot: false, color: 'red', state: 'status_bad',
    label: m.dues_status ? 'NOT ELIGIBLE — ' + m.dues_status.toUpperCase() : 'NOT ELIGIBLE' };
}

function memberPublic(m) {
  const active = db.prepare(
    'SELECT id, ts, station, verification_method, ballot_no FROM checkins WHERE member_id = ? AND voided_at IS NULL'
  ).get(m.id);
  const lastCorrection = db.prepare(
    'SELECT ts, station FROM contact_corrections WHERE member_id = ? ORDER BY id DESC LIMIT 1'
  ).get(m.id);
  return {
    portal_status: m.portal_status || '',
    portal_ok: portalOk(m.portal_status),
    dues_block: Number(m.dues_block) === 1,
    dues_block_note: m.dues_block_note || '',
    payroll_ok: Number(m.payroll_ok) === 1,
    eligibility: eligibilityOf(m),
    dept_id: m.dept_id || '',
    groups: m.groups || '',
    email_list: emailListStatus(m.groups),
    rank: m.rank || '',
    platoon: m.platoon || '',
    assignment: m.assignment || '',
    appt_date: m.appt_date || '',
    paramedic: m.paramedic || '',
    last_correction: lastCorrection || null,
    addr_street: m.addr_street || '',
    addr_street2: m.addr_street2 || '',
    addr_city: m.addr_city || '',
    addr_state: m.addr_state || '',
    addr_zip: m.addr_zip || '',
    age: ageFromIso(m.dob), // display-only; raw roster DOB is never sent
    id: m.id,
    member_no: m.member_no,
    last_name: m.last_name,
    first_name: m.first_name,
    middle_name: m.middle_name,
    suffix: m.suffix,
    full_name: m.full_name,
    dues_status: m.dues_status,
    dues_ok: !!m.dues_ok,
    email: m.email,
    phone: m.phone,
    info_stale: !!m.info_stale,
    on_paper_roll: !!m.on_paper_roll,
    access_granted_at: m.access_granted_at,
    checked_in: active ? {
      checkin_id: active.id, ts: active.ts, station: active.station,
      verification_method: active.verification_method, ballot_no: active.ballot_no
    } : null
  };
}

function computeStale(email, phone, lastUpdated, staleDays) {
  if (!email && !phone) return 1;
  if (lastUpdated) {
    const d = new Date(lastUpdated);
    if (!isNaN(d.getTime())) {
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      if (ageDays > staleDays) return 1;
    }
  }
  return 0;
}

// Dues status text -> good/bad. The import UI sends an explicit list of
// which status values count as good (dues_good_values); this regex is only
// the fallback default used to pre-check that list.
const BAD_DUES = /(suspend|delinq|arrear|expell|lapsed|inactive|not.?in.?good|owe[sd]?|drop|deceased|resign|quit|alumni)/i;
function duesOk(status, goodValues) {
  if (Array.isArray(goodValues) && goodValues.length) {
    return goodValues.some(v => v.trim().toLowerCase() === String(status || '').trim().toLowerCase()) ? 1 : 0;
  }
  return BAD_DUES.test(status || '') ? 0 : 1;
}

// Flexible date -> ISO (roster exports use M/D/YYYY or ISO-ish timestamps).
function toIsoDate(s) {
  s = (s || '').trim();
  if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

// ---------- roster import ----------

// Step 1: preview headers + sample rows so the admin can map columns.
// Accepts CSV or .xlsx. `distincts` lists value counts for low-cardinality
// columns so the UI can offer "which values count as good standing".
app.post('/api/import/preview', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const { headers, records } = tabular.parseUpload(req.file.buffer, req.file.originalname);
  res.json({
    headers,
    sample: records.slice(0, 3),
    total: records.length,
    distincts: tabular.distincts(headers, records)
  });
});

// Step 2: import with a column mapping.
// mapping: { full_name?, last_name?, first_name?, member_no?, dues_status?,
//            email?, phone?, last_updated?, portal_status?, dob? }
//            (values are column header names)
// body.dues_good_values: JSON array of status values that count as good.
app.post('/api/import/roster', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  let mapping, duesGood = null;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch { return res.status(400).json({ error: 'bad mapping JSON' }); }
  try { if (req.body.dues_good_values) duesGood = JSON.parse(req.body.dues_good_values); }
  catch { return res.status(400).json({ error: 'bad dues_good_values JSON' }); }
  if (!mapping.full_name && !mapping.last_name) {
    return res.status(400).json({ error: 'mapping needs full_name or last_name' });
  }
  const replace = req.body.replace === 'true';
  const staleDays = parseInt(getConfig(db, 'stale_days'), 10) || 365;
  const { records } = tabular.parseUpload(req.file.buffer, req.file.originalname);

  const get = (rec, key) => mapping[key] ? (rec[mapping[key]] || '').trim() : '';

  const tx = db.transaction(() => {
    if (replace) {
      db.exec('DELETE FROM checkins; DELETE FROM contact_corrections; DELETE FROM members;');
      setConfig(db, 'next_ballot_no', '1');
    }
    const ins = db.prepare(`INSERT INTO members
      (member_no, last_name, first_name, middle_name, suffix, full_name,
       dues_status, dues_ok, email, phone, last_updated, info_stale,
       portal_status, dept_id, dob, groups, rank, platoon, assignment, appt_date, paramedic,
       addr_street, addr_street2, addr_city, addr_state, addr_zip,
       norm_last, norm_first)
      VALUES (@member_no, @last_name, @first_name, @middle_name, @suffix, @full_name,
       @dues_status, @dues_ok, @email, @phone, @last_updated, @info_stale,
       @portal_status, @dept_id, @dob, @groups, @rank, @platoon, @assignment, @appt_date, @paramedic,
       @addr_street, @addr_street2, @addr_city, @addr_state, @addr_zip,
       @norm_last, @norm_first)`);
    let count = 0;
    for (const rec of records) {
      let last = get(rec, 'last_name'), first = get(rec, 'first_name');
      let full = get(rec, 'full_name');
      let suffix = '', middle = get(rec, 'middle_name');
      if (!last && full) {
        // "Last, First Middle" or "First Middle Last"
        if (full.includes(',')) {
          const [l, rest] = full.split(',', 2);
          const lastParts = l.trim().split(/\s+/).filter(Boolean);
          const lastTok = lastParts[lastParts.length - 1] || '';
          if (/^(JR|SR|II|III|IV|V)\.?$/i.test(lastTok) && lastParts.length > 1) {
            suffix = lastTok.replace('.', '').toUpperCase();
            lastParts.pop();
          }
          last = lastParts.join(' ');
          const parts = (rest || '').trim().split(/\s+/).filter(Boolean);
          first = parts[0] || '';
          middle = parts.slice(1).join(' ');
        } else {
          const parts = full.trim().split(/\s+/).filter(Boolean);
          const lastTok = parts[parts.length - 1] || '';
          if (/^(JR|SR|II|III|IV|V)\.?$/i.test(lastTok) && parts.length > 2) {
            suffix = lastTok.replace('.', '').toUpperCase();
            parts.pop();
          }
          last = parts.pop() || '';
          first = parts.shift() || '';
          middle = parts.join(' ');
        }
      }
      if (!full) full = [first, middle, last].filter(Boolean).join(' ') + (suffix ? ' ' + suffix : '');
      if (!last && !first) continue;
      const email = get(rec, 'email'), phone = get(rec, 'phone');
      const lastUpdated = get(rec, 'last_updated');
      const dues = get(rec, 'dues_status');
      ins.run({
        member_no: get(rec, 'member_no'),
        last_name: last, first_name: first, middle_name: middle, suffix,
        full_name: full,
        dues_status: dues, dues_ok: duesOk(dues, duesGood),
        email, phone, last_updated: lastUpdated,
        info_stale: computeStale(email, phone, lastUpdated, staleDays),
        portal_status: get(rec, 'portal_status'),
        dept_id: get(rec, 'dept_id'),
        dob: toIsoDate(get(rec, 'dob')),
        groups: get(rec, 'groups'),
        rank: get(rec, 'rank'),
        platoon: get(rec, 'platoon'),
        assignment: get(rec, 'assignment'),
        appt_date: get(rec, 'appt_date'),
        paramedic: get(rec, 'paramedic'),
        addr_street: get(rec, 'street'),
        addr_street2: get(rec, 'street2'),
        addr_city: get(rec, 'city'),
        addr_state: get(rec, 'state'),
        addr_zip: get(rec, 'zip'),
        norm_last: match.normalizeName(last),
        norm_first: match.normalizeName(first)
      });
      count++;
    }
    return count;
  });
  const count = tx();
  // CRITICAL: re-importing the roster re-inserts everyone with payroll_ok=0.
  // If a payroll list is loaded, re-match it against the fresh roster now —
  // otherwise every member would read RED ("not on payroll") until someone
  // remembered to re-import payroll. This makes the order roster→payroll safe.
  let rematch = null;
  if (db.prepare('SELECT 1 FROM payroll_dues LIMIT 1').get()) {
    rematch = payroll.rematch(db);
    invalidatePayrollCache();
  }
  audit(db, 'roster_import',
    `imported ${count} members (replace=${replace})` +
    (rematch ? ` — re-matched payroll: ${rematch.matched} eligible` : ''), 'admin');
  res.json({ imported: count, rematch });
});

// Optional paper dues roll: flags members found on it; reports non-matches.
app.post('/api/import/paper', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch { return res.status(400).json({ error: 'bad mapping JSON' }); }
  const { records } = tabular.parseUpload(req.file.buffer, req.file.originalname);
  const all = db.prepare('SELECT id, norm_last, norm_first, member_no FROM members').all();
  const byNo = new Map(all.filter(m => m.member_no).map(m => [String(m.member_no).trim(), m]));
  const flag = db.prepare('UPDATE members SET on_paper_roll = 1, updated_at = datetime(\'now\') WHERE id = ?');
  const unmatched = [];
  let flagged = 0;
  const tx = db.transaction(() => {
    for (const rec of records) {
      const no = mapping.member_no ? (rec[mapping.member_no] || '').trim() : '';
      if (no && byNo.has(no)) { flag.run(byNo.get(no).id); flagged++; continue; }
      const name = mapping.full_name ? (rec[mapping.full_name] || '').trim()
        : [(rec[mapping.first_name] || ''), (rec[mapping.last_name] || '')].join(' ').trim();
      if (!name) continue;
      let q;
      if (name.includes(',')) {
        const [l, f] = name.split(',', 2);
        q = { lastName: l.trim(), firstName: (f || '').trim().split(/\s+/)[0] || '' };
      } else {
        const parts = name.split(/\s+/);
        q = { lastName: parts[parts.length - 1], firstName: parts[0] };
      }
      let best = null, bestScore = 0;
      for (const m of all) {
        const s = match.scoreCandidate(q, m);
        if (s > bestScore) { best = m; bestScore = s; }
      }
      if (best && bestScore >= 80) { flag.run(best.id); flagged++; }
      else unmatched.push(name);
    }
  });
  tx();
  audit(db, 'paper_import', `flagged ${flagged}, unmatched ${unmatched.length}`, 'admin');
  res.json({ flagged, unmatched });
});

// Dept ID / pat-tag list: fills members.dept_id by matching member number
// or name. mapping: { dept_id (required), member_no?, full_name?,
// last_name?, first_name? }
app.post('/api/import/deptids', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch { return res.status(400).json({ error: 'bad mapping JSON' }); }
  if (!mapping.dept_id) return res.status(400).json({ error: 'mapping needs dept_id' });
  const { records } = tabular.parseUpload(req.file.buffer, req.file.originalname);
  const all = db.prepare('SELECT id, norm_last, norm_first, member_no FROM members').all();
  const byNo = new Map(all.filter(m => m.member_no).map(m => [String(m.member_no).trim(), m]));
  const setId = db.prepare("UPDATE members SET dept_id = ?, updated_at = datetime('now') WHERE id = ?");
  const unmatched = [];
  let updated = 0;
  db.transaction(() => {
    for (const rec of records) {
      const deptId = (rec[mapping.dept_id] || '').trim();
      if (!deptId) continue;
      const no = mapping.member_no ? (rec[mapping.member_no] || '').trim() : '';
      if (no && byNo.has(no)) { setId.run(deptId, byNo.get(no).id); updated++; continue; }
      const name = mapping.full_name ? (rec[mapping.full_name] || '').trim()
        : [(rec[mapping.first_name] || ''), (rec[mapping.last_name] || '')].join(' ').trim();
      if (!name) { unmatched.push(deptId + ' (no name)'); continue; }
      let q;
      if (name.includes(',')) {
        const [l, f] = name.split(',', 2);
        q = { lastName: l.trim(), firstName: (f || '').trim().split(/\s+/)[0] || '' };
      } else {
        const parts = name.split(/\s+/);
        q = { lastName: parts[parts.length - 1], firstName: parts[0] };
      }
      let best = null, bestScore = 0, ties = 0;
      for (const m of all) {
        const s = match.scoreCandidate(q, m);
        if (s > bestScore) { best = m; bestScore = s; ties = 1; }
        else if (s === bestScore && s > 0) ties++;
      }
      // Require a strong, unambiguous match before attaching an ID.
      if (best && bestScore >= 85 && ties === 1) { setId.run(deptId, best.id); updated++; }
      else unmatched.push(name + ' (' + deptId + ')');
    }
  })();
  audit(db, 'deptid_import', `updated ${updated}, unmatched ${unmatched.length}`, 'admin');
  res.json({ updated, unmatched });
});

// Payroll union-dues list import (the authoritative "paying dues" source).
// CSV/xlsx columns: emplid, last, first, middle, ssn4, grade, step
// (header names are case-insensitive; extras ignored).
app.post('/api/import/payroll', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const { headers, records } = tabular.parseUpload(req.file.buffer, req.file.originalname);
  const h = {};
  headers.forEach(x => { h[x.toLowerCase().replace(/[^a-z0-9]/g, '')] = x; });
  const col = (rec, ...keys) => { for (const k of keys) if (h[k]) return (rec[h[k]] || '').trim(); return ''; };
  const recs = records.map(r => ({
    emplid: col(r, 'emplid', 'employeeid', 'empid'),
    last: col(r, 'lastname', 'last'),
    first: col(r, 'firstname', 'first'),
    middle: col(r, 'middle', 'middlename', 'mi'),
    ssn4: col(r, 'ssnlast4', 'ssn4', 'ssn'),
    grade: col(r, 'grade'),
    step: col(r, 'step')
  })).filter(r => r.last || r.first);
  const result = payroll.loadAndMatch(db, recs);
  invalidatePayrollCache();
  audit(db, 'payroll_import',
    `${result.total} rows: ${result.matched} matched NEP, ${result.payrollOnly} payroll-only`, 'admin');
  res.json(result);
});

// ---------- lookup ----------

// Type-ahead: last-name prefix (or "last, first"), min 2 chars.
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ members: [] });
  // Exact ID hits first: dept ID (pat tag) or member number, typed or
  // scanned in. Runs before name parsing since pure numbers aren't names.
  const idHit = db.prepare(
    'SELECT * FROM members WHERE (dept_id != \'\' AND dept_id = ?) OR member_no = ? LIMIT 5'
  ).all(q, q);
  if (idHit.length) return res.json({ members: idHit.map(memberPublic), id_match: true });

  // Last-name (prefix, any token) + optional first-name filter.
  const byLastFirst = (normLast, normFirst) => {
    if (!normLast) return [];
    const rows = db.prepare(
      `SELECT * FROM members WHERE norm_last LIKE ? OR norm_last LIKE ?
       ORDER BY norm_last, norm_first LIMIT 30`
    ).all(normLast + '%', '% ' + normLast + '%');
    if (!normFirst) return rows;
    return rows.filter(m => m.norm_first.startsWith(normFirst) ||
      match.firstNameScore(normFirst, m.norm_first.split(' ')[0] || '') >= 85);
  };

  let out = [];
  if (q.includes(',')) {
    // "Last, First" — the canonical form.
    const [lp, fp] = q.split(',', 2).map(s => s.trim());
    out = byLastFirst(match.normalizeName(lp), match.normalizeName(fp));
  } else {
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      // One word: match it as a last-name OR first-name prefix, so typing a
      // member's FIRST name (a very common habit) still finds them.
      const w = match.normalizeName(words[0]);
      if (!w) return res.json({ members: [] });
      out = db.prepare(
        `SELECT * FROM members WHERE norm_last LIKE ? OR norm_last LIKE ? OR norm_first LIKE ?
         ORDER BY norm_last, norm_first LIMIT 30`
      ).all(w + '%', '% ' + w + '%', w + '%');
    } else {
      // Multiple words with no comma: try BOTH "First … Last" and
      // "Last First …" so natural first-last order works, then merge.
      const first = match.normalizeName(words[0]);
      const last = match.normalizeName(words[words.length - 1]);
      const merged = byLastFirst(last, first)
        .concat(byLastFirst(first, match.normalizeName(words.slice(1).join(' '))));
      const seen = new Set();
      for (const m of merged) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
      out = out.slice(0, 30);
    }
  }
  // Also surface payroll-only people (paying dues but not in NEP) — YELLOW,
  // they still get a ballot but need enrollment. Shown alongside NEP results.
  let poRows = payroll.searchPayrollOnly(db, q);
  if (!poRows.length && !q.includes(',')) {
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1) poRows = payroll.searchPayrollOnly(db, words[words.length - 1] + ', ' + words[0]);
  }
  res.json({ members: out.map(memberPublic), payroll_only: poRows.map(payrollOnlyPublic) });
});

// A payroll-only person (on the dues list, not in NEP) rendered like a member
// card. YELLOW eligibility: gets a ballot, but flagged for enrollment. Once
// checked in they become a provisional member (payroll_dues.member_id set),
// so a NULL member_id here means "not yet checked in".
function payrollOnlyPublic(p) {
  return {
    payroll_id: p.id,
    source: 'payroll',
    last_name: p.last_name, first_name: p.first_name, middle_name: p.middle_name,
    member_no: '', dept_id: '', grade: p.grade, step: p.step, ssn4: p.ssn4, emplid: p.emplid,
    dues_block: false, payroll_ok: true,
    eligibility: { ballot: true, color: 'green', state: 'payroll_only',
      label: 'DUES VERIFIED ✓' },
    checked_in: null
  };
}

// Fuzzy match for scanned IDs. Body: { lastName, firstName, dob? }.
// The scanned dob is used TRANSIENTLY here to rank same-name members
// against roster DOB (when the admin imported one) and is NEVER stored —
// it exists only for the lifetime of this request (privacy requirement).
app.post('/api/match', (req, res) => {
  const { lastName, firstName, dob } = req.body || {};
  if (!lastName && !firstName) return res.status(400).json({ error: 'no name' });
  const q = { lastName: lastName || '', firstName: firstName || '' };
  const all = db.prepare('SELECT * FROM members').all();
  const scored = [];
  for (const m of all) {
    let s = match.scoreCandidate(q, m);
    let dobMatch = null;
    if (s > 0 && dob && m.dob) {
      dobMatch = (m.dob === dob);
      // Exact DOB agreement is a near-certain identity signal; disagreement
      // on an otherwise-strong name match usually means a same-name relative.
      s = dobMatch ? Math.min(100, s + 15) : s - 12;
    }
    if (s >= match.MATCH_THRESHOLD) scored.push([s, m, dobMatch]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  res.json({
    candidates: scored.slice(0, 8).map(([score, m, dobMatch]) =>
      ({ score, dob_match: dobMatch, member: memberPublic(m) }))
  });
});

app.get('/api/members/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  res.json({ member: memberPublic(m) });
});

// ---------- check-in ----------

app.post('/api/checkin', (req, res) => {
  const { member_id, station, verification_method, method_note } = req.body || {};
  const methods = ['portal_id', 'license_scan', 'dept_id', 'other', 'payroll_dues', 'discrepancy'];
  if (!member_id || !station || !methods.includes(verification_method)) {
    return res.status(400).json({ error: 'member_id, station, verification_method required' });
  }
  if (verification_method === 'other' && !(method_note || '').trim()) {
    return res.status(400).json({ error: 'note required for method "other"' });
  }
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
  if (!m) return res.status(404).json({ error: 'member not found' });

  // Eligibility gate (enforced here, not just in the UI). The main table only
  // issues ballots to GREEN members (on payroll). Anything red — a known
  // non-payer, or an NEP member not on the payroll list — must be resolved at
  // the Discrepancy Table, which has its own authenticated override path.
  // req.body.override (with the admin PIN) is how the Discrepancy Table issues.
  const overridden = req.body.override === true &&
    (req.get('X-Admin-Pin') || '') === getConfig(db, 'admin_pin');
  const elig = eligibilityOf(m);
  if (!elig.ballot && !overridden) {
    audit(db, 'checkin_blocked', `member ${member_id} (${m.last_name}, ${m.first_name}) — ${elig.state}`, station);
    return res.status(409).json({ error: elig.state === 'blocked' ? 'dues_block' : 'needs_verification',
      eligibility: elig, member: memberPublic(m) });
  }

  try {
    const result = db.transaction(() => {
      let ballotNo = null;
      if (getConfig(db, 'ballot_numbering') === 'on') {
        ballotNo = parseInt(getConfig(db, 'next_ballot_no'), 10) || 1;
        setConfig(db, 'next_ballot_no', ballotNo + 1);
      }
      const info = db.prepare(
        `INSERT INTO checkins (member_id, station, verification_method, method_note, ballot_no)
         VALUES (?, ?, ?, ?, ?)`
      ).run(member_id, station, verification_method, method_note || '', ballotNo);
      return { checkin_id: info.lastInsertRowid, ballot_no: ballotNo };
    })();
    audit(db, 'checkin', `member ${member_id} (${m.last_name}, ${m.first_name}) via ${verification_method}`, station);
    // "Data record" (in NEP, no active portal account) → queue at the Help
    // Table to collect email/phone for a post-meeting portal invite. They
    // already have their ballot; this never blocks or slows check-in.
    if (getConfig(db, 'collect_datarecord_contact') === 'on' && portalOk(m.portal_status) === false) {
      const dup = db.prepare("SELECT id FROM discrepancies WHERE member_id = ? AND status = 'pending'").get(member_id);
      if (!dup) {
        db.prepare(`INSERT INTO discrepancies (member_id, name, reason, from_station, kind)
          VALUES (?, ?, 'Data record — collect contact for portal invite', ?, 'collect_contact')`)
          .run(member_id, `${m.last_name}, ${m.first_name}`, station);
      }
      result.collect_contact = true;
    }
    // Confirmation email AFTER the response — a mail problem can never slow
    // the line. sendCheckinEmail logs its own outcome and never throws.
    setImmediate(() => mailer.sendCheckinEmail(db, m, result.checkin_id));
    res.json({ ok: true, ...result, member: memberPublic(m) });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e.message).includes('UNIQUE')) {
      // One member, one ballot — enforced by ux_checkins_active.
      const existing = db.prepare(
        'SELECT ts, station, ballot_no FROM checkins WHERE member_id = ? AND voided_at IS NULL'
      ).get(member_id);
      audit(db, 'checkin_duplicate_blocked', `member ${member_id} already checked in`, station);
      return res.status(409).json({ error: 'already_checked_in', existing, member: memberPublic(m) });
    }
    throw e;
  }
});

app.post('/api/checkin/:id/void', requireAdmin, (req, res) => {
  const { reason, by } = req.body || {};
  const row = db.prepare('SELECT * FROM checkins WHERE id = ? AND voided_at IS NULL').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'active check-in not found' });
  db.prepare(
    "UPDATE checkins SET voided_at = datetime('now', 'localtime'), voided_by = ?, void_reason = ? WHERE id = ?"
  ).run(by || 'admin', reason || '', row.id);
  audit(db, 'checkin_void', `checkin ${row.id} member ${row.member_id}: ${reason || ''}`, by || 'admin');
  res.json({ ok: true });
});

// ---------- Discrepancy Table (secondary/"yellow-red" table) ----------

// A main-table station sends a flagged person over. Body:
//   { member_id? | payroll_id?, reason, station }
app.post('/api/discrepancy', (req, res) => {
  const b = req.body || {};
  let name = '', member_id = null, payroll_id = null;
  if (b.member_id) {
    const m = db.prepare('SELECT * FROM members WHERE id = ?').get(b.member_id);
    if (!m) return res.status(404).json({ error: 'member not found' });
    member_id = m.id; name = `${m.last_name}, ${m.first_name}`;
  } else if (b.payroll_id) {
    const p = db.prepare('SELECT * FROM payroll_dues WHERE id = ?').get(b.payroll_id);
    if (!p) return res.status(404).json({ error: 'payroll row not found' });
    payroll_id = p.id; name = `${p.last_name}, ${p.first_name}`;
  } else {
    name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'member_id, payroll_id or name required' });
  }
  // Avoid duplicate pending entries for the same person — by member_id, and
  // (critical for vote integrity) by payroll_id too, so a payroll-only person
  // sent over twice can't be resolved into two ballots.
  if (member_id) {
    const dup = db.prepare("SELECT id FROM discrepancies WHERE member_id = ? AND status = 'pending'").get(member_id);
    if (dup) return res.json({ ok: true, id: dup.id, already: true });
  }
  if (payroll_id) {
    const dup = db.prepare("SELECT id FROM discrepancies WHERE note = ? AND status = 'pending'").get('payroll_id:' + payroll_id);
    if (dup) return res.json({ ok: true, id: dup.id, already: true });
    // Already enrolled from this payroll row in a prior resolution? Then a
    // member exists — point at that member instead of making a second one.
    const p = db.prepare('SELECT member_id FROM payroll_dues WHERE id = ?').get(payroll_id);
    if (p && p.member_id) {
      const dupm = db.prepare("SELECT id FROM discrepancies WHERE member_id = ? AND status = 'pending'").get(p.member_id);
      if (dupm) return res.json({ ok: true, id: dupm.id, already: true });
    }
  }
  const info = db.prepare(
    `INSERT INTO discrepancies (member_id, name, reason, from_station)
     VALUES (?, ?, ?, ?)`
  ).run(member_id, name, String(b.reason || '').slice(0, 200), String(b.station || '').slice(0, 40));
  // Stash payroll_id in the note field prefix so resolve can find it.
  if (payroll_id) db.prepare('UPDATE discrepancies SET note = ? WHERE id = ?')
    .run('payroll_id:' + payroll_id, info.lastInsertRowid);
  audit(db, 'discrepancy_sent', `${name} — ${b.reason || ''}`, b.station);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// The queue for the Discrepancy Table dashboard.
app.get('/api/discrepancy/list', requireAdmin, (req, res) => {
  const pending = db.prepare(
    "SELECT * FROM discrepancies WHERE status = 'pending' ORDER BY id"
  ).all().map(d => ({ ...d, detail: discrepancyDetail(d) }));
  const resolved = db.prepare(
    "SELECT * FROM discrepancies WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 15"
  ).all();
  res.json({
    pending, resolved,
    counts: {
      pending: pending.length,
      resolved: db.prepare("SELECT COUNT(*) c FROM discrepancies WHERE status = 'resolved'").get().c
    }
  });
});

// Full member/payroll detail for a queued person, so the worker sees why they
// were flagged and what to check.
function discrepancyDetail(d) {
  if (d.member_id) {
    const m = db.prepare('SELECT * FROM members WHERE id = ?').get(d.member_id);
    return m ? { kind: 'member', member: memberPublic(m) } : null;
  }
  const pm = /payroll_id:(\d+)/.exec(d.note || '');
  if (pm) {
    const p = db.prepare('SELECT * FROM payroll_dues WHERE id = ?').get(pm[1]);
    return p ? { kind: 'payroll', person: payrollOnlyPublic(p) } : null;
  }
  return { kind: 'name' };
}

// Resolve a queued person. Body:
//   { outcome, issue_ballot, email, phone, note, by, station }
// If issue_ballot: a payroll-only person becomes a provisional member, then a
// check-in is recorded with method 'discrepancy'. Contact is captured too.
app.post('/api/discrepancy/:id/resolve', requireAdmin, (req, res) => {
  const b = req.body || {};
  const d = db.prepare("SELECT * FROM discrepancies WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!d) return res.status(404).json({ error: 'pending discrepancy not found' });

  // Reject DC government emails — enrollment needs a personal address.
  const email = String(b.email || '').trim();
  if (email && /@dc\.gov\s*$/i.test(email)) {
    return res.status(400).json({ error: 'dc_gov_email', message: 'Enter a personal (non-@dc.gov) email.' });
  }

  const by = String(b.by || 'discrepancy').slice(0, 40);
  const station = String(b.station || 'Discrepancy').slice(0, 40);
  let result = { ok: true };

  const tx = db.transaction(() => {
    let member_id = d.member_id;

    // Payroll-only person getting a ballot → create a provisional member —
    // BUT only if one wasn't already created for this payroll row in an
    // earlier resolution. Re-using the existing member_id means the unique
    // active-check-in index will (correctly) block a second ballot.
    const pm = /payroll_id:(\d+)/.exec(d.note || '');
    if (!member_id && pm && b.issue_ballot) {
      const p = db.prepare('SELECT * FROM payroll_dues WHERE id = ?').get(pm[1]);
      if (p && p.member_id) {
        member_id = p.member_id;              // already enrolled — reuse, don't duplicate
      } else if (p) {
        const full = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
        const info = db.prepare(`INSERT INTO members
          (member_no, last_name, first_name, middle_name, full_name, dues_status, dues_ok,
           payroll_ok, source, norm_last, norm_first)
          VALUES ('', ?, ?, ?, ?, 'Payroll dues', 1, 1, 'payroll', ?, ?)`)
          .run(p.last_name, p.first_name, p.middle_name, full,
            match.normalizeName(p.last_name), match.normalizeName(p.first_name));
        member_id = info.lastInsertRowid;
        db.prepare('UPDATE payroll_dues SET member_id = ? WHERE id = ?').run(member_id, p.id);
      }
    }

    // Capture contact for the enrollment follow-up.
    if (member_id && (email || (b.phone || '').trim())) {
      db.prepare(`INSERT INTO contact_corrections (member_id, email, phone, station)
        VALUES (?, ?, ?, ?)`).run(member_id, email, String(b.phone || '').trim(), station);
    }

    // Issue the ballot (records the check-in) if the worker chose to.
    if (b.issue_ballot && member_id) {
      // Guard first so a duplicate never burns a ballot number (the number is
      // only allocated once we know the INSERT will land).
      const active = db.prepare('SELECT 1 FROM checkins WHERE member_id = ? AND voided_at IS NULL').get(member_id);
      if (active) {
        result.already_checked_in = true;
      } else {
        let ballotNo = null;
        if (getConfig(db, 'ballot_numbering') === 'on') {
          ballotNo = parseInt(getConfig(db, 'next_ballot_no'), 10) || 1;
          setConfig(db, 'next_ballot_no', ballotNo + 1);
        }
        try {
          const ci = db.prepare(`INSERT INTO checkins (member_id, station, verification_method, method_note, ballot_no)
            VALUES (?, ?, 'discrepancy', ?, ?)`).run(member_id, station, String(b.outcome || '').slice(0, 120), ballotNo);
          result.ballot_no = ballotNo;
          result._email = { member_id, checkin_id: ci.lastInsertRowid };
        } catch (e) {
          if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e.message).includes('UNIQUE')) result.already_checked_in = true; else throw e;
        }
      }
    }

    db.prepare(`UPDATE discrepancies SET status = 'resolved', outcome = ?, note = ?,
      resolved_by = ?, resolved_at = datetime('now','localtime') WHERE id = ?`)
      .run(String(b.outcome || '').slice(0, 120),
        (d.note ? d.note + ' | ' : '') + String(b.note || '').slice(0, 200), by, d.id);
  });
  tx();
  audit(db, 'discrepancy_resolved', `${d.name} — ${b.outcome || ''}${result.ballot_no ? ' ballot #' + result.ballot_no : ''}`, station);
  if (result._email) {
    const em = db.prepare('SELECT * FROM members WHERE id = ?').get(result._email.member_id);
    const cid = result._email.checkin_id;
    delete result._email;
    if (em) setImmediate(() => mailer.sendCheckinEmail(db, em, cid));
  }
  res.json(result);
});

// ---------- member updates ----------

// Verify-and-update: records whatever the member corrected at the table,
// plus the "are you receiving our emails?" answer and whether their
// ConnectPlus email group needs fixing. Applied to ConnectPlus after the
// event via the corrections export — nothing here writes to NEP.
app.post('/api/members/:id/contact', (req, res) => {
  const b = req.body || {};
  const m = db.prepare('SELECT id FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  db.prepare(
    `INSERT INTO contact_corrections
     (member_id, email, phone, new_first_name, new_middle_name, new_last_name,
      new_street, new_street2, new_city, new_state, new_zip,
      new_rank, new_platoon, new_assignment, new_appt_date, new_paramedic,
      receiving_emails, fix_email_group, station)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(m.id, b.email || '', b.phone || '', b.first_name || '', b.middle_name || '', b.last_name || '',
    b.street || '', b.street2 || '', b.city || '', b.state || '', b.zip || '',
    b.rank || '', b.platoon || '', b.assignment || '', b.appt_date || '', b.paramedic || '',
    b.receiving_emails || '', b.fix_email_group ? 1 : 0, b.station || '');
  audit(db, 'contact_correction', `member ${m.id}`, b.station);
  res.json({ ok: true });
});

app.post('/api/members/:id/access-granted', (req, res) => {
  const { station } = req.body || {};
  const m = db.prepare('SELECT id FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  db.prepare(
    "UPDATE members SET access_granted_at = datetime('now', 'localtime'), access_granted_station = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(station || '', m.id);
  audit(db, 'access_granted', `member ${m.id}`, station);
  res.json({ ok: true });
});

app.post('/api/notfound', (req, res) => {
  const { name_entered, notes, station } = req.body || {};
  if (!(name_entered || '').trim()) return res.status(400).json({ error: 'name required' });
  db.prepare('INSERT INTO not_found (name_entered, notes, station) VALUES (?, ?, ?)')
    .run(name_entered.trim(), notes || '', station || '');
  audit(db, 'not_found', name_entered.trim(), station);
  res.json({ ok: true });
});

// ---------- dashboard / stats ----------

app.get('/api/stats', (req, res) => {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  res.json({
    members_total: one('SELECT COUNT(*) c FROM members').c,
    checked_in: one('SELECT COUNT(*) c FROM checkins WHERE voided_at IS NULL').c,
    ballots_issued: one('SELECT COUNT(*) c FROM checkins WHERE voided_at IS NULL AND ballot_no IS NOT NULL').c,
    voided: one('SELECT COUNT(*) c FROM checkins WHERE voided_at IS NOT NULL').c,
    not_found: one('SELECT COUNT(*) c FROM not_found').c,
    access_granted_today: one('SELECT COUNT(*) c FROM members WHERE access_granted_at IS NOT NULL').c,
    contact_corrections: one('SELECT COUNT(*) c FROM contact_corrections').c,
    email_group_flags: one('SELECT COUNT(DISTINCT member_id) c FROM contact_corrections WHERE fix_email_group = 1').c,
    discrepancy_pending: one("SELECT COUNT(*) c FROM discrepancies WHERE status = 'pending'").c,
    discrepancy_resolved: one("SELECT COUNT(*) c FROM discrepancies WHERE status = 'resolved'").c,
    payroll_total: one('SELECT COUNT(*) c FROM payroll_dues').c,
    payroll_matched: one('SELECT COUNT(*) c FROM payroll_dues WHERE member_id IS NOT NULL').c,
    payroll_only_checked_in: one(`SELECT COUNT(*) c FROM checkins c
      JOIN members m ON m.id = c.member_id WHERE m.source = 'payroll' AND c.voided_at IS NULL`).c,
    emails_sent: one("SELECT COUNT(*) c FROM email_log WHERE status = 'sent'").c,
    emails_failed: one("SELECT COUNT(*) c FROM email_log WHERE status = 'failed'").c,
    emails_skipped: one("SELECT COUNT(*) c FROM email_log WHERE status = 'skipped'").c,
    mail_enabled: getConfig(db, 'mail_enabled') === 'on',
    by_method: all(`SELECT verification_method, COUNT(*) c FROM checkins
                    WHERE voided_at IS NULL GROUP BY verification_method`),
    by_station: all(`SELECT station, COUNT(*) c,
                     MAX(ts) last_ts,
                     SUM(CASE WHEN ts >= datetime('now', 'localtime', '-10 minutes') THEN 1 ELSE 0 END) last_10min
                     FROM checkins WHERE voided_at IS NULL GROUP BY station ORDER BY c DESC`),
    recent: all(`SELECT c.id, c.ts, c.station, c.verification_method, c.ballot_no,
                 m.last_name, m.first_name, m.member_no
                 FROM checkins c JOIN members m ON m.id = c.member_id
                 WHERE c.voided_at IS NULL ORDER BY c.id DESC LIMIT 15`)
  });
});

// ---------- exports ----------

function sendCsv(res, filename, headers, rows) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv.serialize(headers, rows));
}

app.get('/api/export/checkins.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT c.ts, c.station, c.verification_method, c.method_note, c.ballot_no,
            m.member_no, m.last_name, m.first_name, m.dues_status AS member_status,
            CASE WHEN m.access_granted_at IS NOT NULL THEN 'yes' ELSE '' END access_granted_today,
            CASE WHEN c.voided_at IS NOT NULL THEN 'VOID' ELSE '' END voided,
            c.voided_at, c.void_reason
     FROM checkins c JOIN members m ON m.id = c.member_id ORDER BY c.id`
  ).all();
  sendCsv(res, 'checkins.csv',
    ['ts', 'station', 'verification_method', 'method_note', 'ballot_no', 'member_no',
     'last_name', 'first_name', 'member_status', 'access_granted_today', 'voided', 'voided_at', 'void_reason'],
    rows);
});

app.get('/api/export/contact-corrections.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT m.member_no, m.last_name, m.first_name,
            m.email old_email, m.phone old_phone,
            cc.email new_email, cc.phone new_phone,
            cc.new_first_name, cc.new_middle_name, cc.new_last_name,
            cc.new_street, cc.new_street2, cc.new_city, cc.new_state, cc.new_zip,
            cc.new_rank, cc.new_platoon, cc.new_assignment, cc.new_appt_date, cc.new_paramedic,
            cc.receiving_emails,
            CASE WHEN cc.fix_email_group = 1 THEN 'yes' ELSE '' END fix_email_group,
            m.groups current_groups, cc.ts, cc.station
     FROM contact_corrections cc JOIN members m ON m.id = cc.member_id ORDER BY cc.id`
  ).all();
  sendCsv(res, 'contact-corrections.csv',
    ['member_no', 'last_name', 'first_name', 'old_email', 'old_phone',
     'new_email', 'new_phone', 'new_first_name', 'new_middle_name', 'new_last_name',
     'new_street', 'new_street2', 'new_city', 'new_state', 'new_zip',
     'new_rank', 'new_platoon', 'new_assignment', 'new_appt_date', 'new_paramedic',
     'receiving_emails', 'fix_email_group', 'current_groups', 'ts', 'station'], rows);
});

app.get('/api/export/notfound.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT name_entered, notes, ts, station FROM not_found ORDER BY id').all();
  sendCsv(res, 'notfound.csv', ['name_entered', 'notes', 'ts', 'station'], rows);
});

app.get('/api/export/access-granted.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT member_no, last_name, first_name, access_granted_at, access_granted_station
     FROM members WHERE access_granted_at IS NOT NULL ORDER BY access_granted_at`
  ).all();
  sendCsv(res, 'access-granted.csv',
    ['member_no', 'last_name', 'first_name', 'access_granted_at', 'access_granted_station'], rows);
});

// Every Discrepancy Table case and its outcome — the paper trail for any
// post-vote challenge ("who was overridden and why").
app.get('/api/export/discrepancies.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT d.ts sent_at, d.name, d.reason, d.from_station, d.status, d.outcome,
            d.resolved_by, d.resolved_at, d.note,
            (SELECT cc.email FROM contact_corrections cc WHERE cc.member_id = d.member_id
             ORDER BY cc.id DESC LIMIT 1) email_captured,
            (SELECT cc.phone FROM contact_corrections cc WHERE cc.member_id = d.member_id
             ORDER BY cc.id DESC LIMIT 1) phone_captured
     FROM discrepancies d ORDER BY d.id`
  ).all();
  sendCsv(res, 'discrepancy-log.csv',
    ['sent_at', 'name', 'reason', 'from_station', 'status', 'outcome',
     'resolved_by', 'resolved_at', 'email_captured', 'phone_captured', 'note'], rows);
});

// Payroll dues-payers NOT in NEP, with attendance — the NEP enrollment /
// recruitment sheet. checked_in_at_vote lets the office prioritize no-shows.
app.get('/api/export/payroll-gap.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT p.last_name, p.first_name, p.middle_name, p.emplid, p.ssn4, p.grade, p.step,
            CASE WHEN c.id IS NOT NULL THEN 'yes' ELSE '' END checked_in_at_vote,
            c.ts checkin_ts,
            (SELECT cc.email FROM contact_corrections cc WHERE cc.member_id = p.member_id
             ORDER BY cc.id DESC LIMIT 1) email_captured,
            (SELECT cc.phone FROM contact_corrections cc WHERE cc.member_id = p.member_id
             ORDER BY cc.id DESC LIMIT 1) phone_captured
     FROM payroll_dues p
     LEFT JOIN members m ON m.id = p.member_id
     LEFT JOIN checkins c ON c.member_id = p.member_id AND c.voided_at IS NULL
     WHERE p.member_id IS NULL OR m.source = 'payroll'
     ORDER BY p.last_name, p.first_name`
  ).all();
  sendCsv(res, 'payroll-not-in-NEP.csv',
    ['last_name', 'first_name', 'middle_name', 'emplid', 'ssn4', 'grade', 'step',
     'checked_in_at_vote', 'checkin_ts', 'email_captured', 'phone_captured'], rows);
});

// Full payroll list, alphabetical — for a clean printed reference at the
// Discrepancy Table (replaces flipping through the 52-page scan).
// Every confirmation-email attempt: who we reached, who bounced, who had no
// address on file (a follow-up list in its own right).
app.get('/api/export/email-log.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT e.ts, m.member_no, m.last_name, m.first_name, e.to_email, e.status, e.error
     FROM email_log e LEFT JOIN members m ON m.id = e.member_id ORDER BY e.id`
  ).all();
  sendCsv(res, 'email-log.csv',
    ['ts', 'member_no', 'last_name', 'first_name', 'to_email', 'status', 'error'], rows);
});

app.get('/api/export/payroll-list.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT last_name, first_name, middle_name, emplid, grade, step,
            CASE WHEN member_id IS NOT NULL THEN 'yes' ELSE '' END in_nep
     FROM payroll_dues ORDER BY last_name, first_name`
  ).all();
  sendCsv(res, 'payroll-dues-list.csv',
    ['last_name', 'first_name', 'middle_name', 'emplid', 'grade', 'step', 'in_nep'], rows);
});

// Every dues-paying member (= everyone on the payroll list), formatted to
// match the NEP/ConnectPlus database download so it can be re-imported to
// keep the membership database current after the vote. Every row is marked
// Member Status = Active, Work Status = Active Member (per the union's rule
// that all current dues-payers are active members). NEP data is used when the
// person is already in NEP; payroll-only people fill the name/emplid columns.
// NOTE: confirm the exact NEP header names against one real export row and
// tell me if any differ — the labels here mirror the roster-import fields.
app.get('/api/export/nep-dues-members.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.emplid, p.ssn4, p.grade, p.step,
           p.last_name p_last, p.first_name p_first, p.middle_name p_middle,
           m.member_no, m.last_name m_last, m.first_name m_first, m.middle_name m_middle, m.suffix,
           m.email m_email, m.phone m_phone,
           m.addr_street, m.addr_street2, m.addr_city, m.addr_state, m.addr_zip,
           m.rank, m.platoon, m.assignment, m.appt_date, m.paramedic, m.dob,
           (SELECT cc.email FROM contact_corrections cc WHERE cc.member_id = m.id AND cc.email != '' ORDER BY cc.id DESC LIMIT 1) cc_email,
           (SELECT cc.phone FROM contact_corrections cc WHERE cc.member_id = m.id AND cc.phone != '' ORDER BY cc.id DESC LIMIT 1) cc_phone,
           CASE WHEN p.member_id IS NOT NULL AND (m.source IS NULL OR m.source != 'payroll') THEN 'yes' ELSE 'no' END in_nep
    FROM payroll_dues p LEFT JOIN members m ON m.id = p.member_id
    ORDER BY COALESCE(m.last_name, p.last_name), COALESCE(m.first_name, p.first_name)`).all();
  const H = ['First Name', 'Middle Name', 'Last Name', 'Suffix', 'Member Number',
    'Member Status', 'Work Status', 'Email', 'Phone', 'Address', 'Address 2',
    'City', 'State', 'Zip', 'Rank', 'Platoon', 'Assignment', 'Appointment Date',
    'Paramedic', 'Date of Birth', 'Emplid', 'Grade', 'Step', 'SSN Last 4', 'Currently in NEP'];
  const out = rows.map(r => ({
    'First Name': r.m_first || r.p_first || '',
    'Middle Name': r.m_middle || r.p_middle || '',
    'Last Name': r.m_last || r.p_last || '',
    'Suffix': r.suffix || '',
    'Member Number': r.member_no || '',
    'Member Status': 'Active',
    'Work Status': 'Active Member',
    'Email': r.cc_email || r.m_email || '',
    'Phone': r.cc_phone || r.m_phone || '',
    'Address': r.addr_street || '',
    'Address 2': r.addr_street2 || '',
    'City': r.addr_city || '',
    'State': r.addr_state || '',
    'Zip': r.addr_zip || '',
    'Rank': r.rank || '',
    'Platoon': r.platoon || '',
    'Assignment': r.assignment || '',
    'Appointment Date': r.appt_date || '',
    'Paramedic': r.paramedic || '',
    'Date of Birth': r.dob || '',
    'Emplid': r.emplid || '',
    'Grade': r.grade || '',
    'Step': r.step || '',
    'SSN Last 4': r.ssn4 || '',
    'Currently in NEP': r.in_nep
  }));
  sendCsv(res, 'nep-dues-members.csv', H, out);
});

// The audit log — every check-in, blocked attempt, duplicate attempt, void,
// override, reset. The evidence trail for a contested vote.
app.get('/api/export/audit-log.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT ts, action, detail, station FROM audit_log ORDER BY id').all();
  sendCsv(res, 'audit-log.csv', ['ts', 'action', 'detail', 'station'], rows);
});

// ---------- event reset ----------

// Wipe EVENT data (check-ins, corrections, not-found, discrepancies, audit,
// provisional members) while KEEPING the roster, payroll list, dues blocks
// and settings. For clearing rehearsal/test data the morning of the vote.
app.post('/api/admin/reset-event', requireAdmin, (req, res) => {
  if ((req.body || {}).confirm !== 'RESET') {
    return res.status(400).json({ error: 'confirm required' });
  }
  const tx = db.transaction(() => {
    db.exec(`DELETE FROM checkins; DELETE FROM contact_corrections;
             DELETE FROM not_found; DELETE FROM discrepancies; DELETE FROM email_log;`);
    // Unlink + remove provisional members created by Discrepancy resolutions.
    db.prepare(`UPDATE payroll_dues SET member_id = NULL WHERE member_id IN
                (SELECT id FROM members WHERE source = 'payroll')`).run();
    db.prepare("DELETE FROM members WHERE source = 'payroll'").run();
    db.prepare("UPDATE members SET access_granted_at = NULL, access_granted_station = NULL").run();
    setConfig(db, 'next_ballot_no', '1');
  });
  tx();
  audit(db, 'event_reset', 'event data cleared (roster/payroll/settings kept)', 'admin');
  res.json({ ok: true });
});

// ---------- config ----------

app.get('/api/config', (req, res) => {
  res.json({
    stale_days: getConfig(db, 'stale_days'),
    ballot_numbering: getConfig(db, 'ballot_numbering'),
    email_ok_groups: getConfig(db, 'email_ok_groups'),
    email_bad_groups: getConfig(db, 'email_bad_groups'),
    // The station password is shown in admin so the organizer knows what to
    // tell volunteers. (Anyone who can call this endpoint already has it.)
    station_pin: getConfig(db, 'station_pin'),
    // Booleans only — never echo the admin PIN itself.
    admin_equals_station: getConfig(db, 'admin_pin') === getConfig(db, 'station_pin'),
    admin_is_default: getConfig(db, 'admin_pin') === '3636',
    // Check-in email settings — the password itself never leaves the server,
    // only whether one is stored.
    mail_enabled: getConfig(db, 'mail_enabled'),
    mail_host: getConfig(db, 'mail_host') || '',
    mail_port: getConfig(db, 'mail_port') || '587',
    mail_user: getConfig(db, 'mail_user') || '',
    mail_pass_set: !!getConfig(db, 'mail_pass'),
    mail_from: getConfig(db, 'mail_from') || '',
    mail_subject: getConfig(db, 'mail_subject') || mailer.DEFAULT_SUBJECT,
    mail_body: getConfig(db, 'mail_body') || mailer.DEFAULT_BODY,
    meeting_link: getConfig(db, 'meeting_link') || ''
  });
});

app.post('/api/config', requireAdmin, (req, res) => {
  const allowed = ['stale_days', 'ballot_numbering', 'admin_pin', 'station_pin', 'email_ok_groups', 'email_bad_groups',
    'mail_enabled', 'mail_host', 'mail_port', 'mail_user', 'mail_from', 'mail_subject', 'mail_body', 'meeting_link'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) setConfig(db, k, req.body[k]);
  }
  // Blank password field on save = keep the stored one.
  if (typeof req.body.mail_pass === 'string' && req.body.mail_pass !== '') {
    setConfig(db, 'mail_pass', req.body.mail_pass);
  }
  // Recompute staleness if the rule changed.
  if (req.body.stale_days !== undefined) {
    const staleDays = parseInt(getConfig(db, 'stale_days'), 10) || 365;
    const members = db.prepare('SELECT id, email, phone, last_updated FROM members').all();
    const upd = db.prepare('UPDATE members SET info_stale = ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const m of members) upd.run(computeStale(m.email, m.phone, m.last_updated, staleDays), m.id);
    });
    tx();
  }
  res.json({ ok: true });
});

// Admin: send a test check-in email to any address (verifies SMTP settings
// end-to-end before the event).
app.post('/api/admin/mail-test', requireAdmin, async (req, res) => {
  const to = String((req.body || {}).to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    await mailer.sendTest(db, to);
    audit(db, 'mail_test', `test email sent to ${to}`, 'admin');
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e.message).slice(0, 300) });
  }
});

app.get('/api/ping', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// QR code PNG of a URL — used by /qr-card.html to print NEP registration
// invite cards. Harmless generator; no member data involved.
app.get('/qr.png', async (req, res) => {
  const url = String(req.query.url || '').slice(0, 300);
  if (!/^https?:\/\//.test(url)) return res.status(400).send('bad url');
  try {
    const bwipjs = require('bwip-js');
    const png = await bwipjs.toBuffer({
      bcid: 'qrcode', text: url, scale: 8, backgroundcolor: 'FFFFFF', padding: 2
    });
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) { res.status(500).send('qr failed'); }
});

// ---------- startup ----------

function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface: name, address: a.address });
    }
  }
  return out;
}

if (require.main === module) {
  const HTTP_PORT = parseInt(process.env.PORT || '8080', 10);
  const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '8443', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  http.createServer(app).listen(HTTP_PORT, HOST, () => {
    console.log(`HTTP  : http://localhost:${HTTP_PORT}`);
    for (const a of lanAddresses()) console.log(`        http://${a.address}:${HTTP_PORT}  (${a.iface})`);
  });

  const certDir = process.env.CERT_DIR || path.join(__dirname, 'certs');
  const keyFile = path.join(certDir, 'server-key.pem');
  const certFile = path.join(certDir, 'server-cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app)
      .listen(HTTPS_PORT, HOST, () => {
        console.log(`HTTPS : https://localhost:${HTTPS_PORT}`);
        for (const a of lanAddresses()) console.log(`        https://${a.address}:${HTTPS_PORT}  (${a.iface})`);
        console.log('iPads must use the HTTPS URL for camera scanning (see RUNBOOK.md).');
      });
  } else {
    console.log('No certs found in ./certs — HTTPS disabled.');
    console.log('Camera scanning on iPads REQUIRES HTTPS. Run: npm run certs   (see RUNBOOK.md)');
  }
}

module.exports = app;
