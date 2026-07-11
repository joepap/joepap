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
const match = require('./lib/match');

const db = open(process.env.DB_FILE);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

// ---------- helpers ----------

function requireAdmin(req, res, next) {
  const pin = req.get('X-Admin-Pin') || req.query.pin || '';
  if (pin && pin === getConfig(db, 'admin_pin')) return next();
  res.status(401).json({ error: 'admin PIN required' });
}

function memberPublic(m) {
  const active = db.prepare(
    'SELECT id, ts, station, verification_method, ballot_no FROM checkins WHERE member_id = ? AND voided_at IS NULL'
  ).get(m.id);
  return {
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

// Dues status text -> good/bad. Configurable-ish: anything matching these
// patterns is "not in good standing"; everything else is green.
const BAD_DUES = /(suspend|delinq|arrear|expell|lapsed|inactive|not.?in.?good|owe[sd]?)/i;
function duesOk(status) { return BAD_DUES.test(status || '') ? 0 : 1; }

// ---------- roster import ----------

// Step 1: preview headers + sample rows so the admin can map columns.
app.post('/api/import/preview', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const { headers, records } = csv.parseWithHeaders(req.file.buffer.toString('utf8'));
  res.json({ headers, sample: records.slice(0, 5), total: records.length });
});

// Step 2: import with a column mapping.
// mapping: { full_name?, last_name?, first_name?, member_no?, dues_status?,
//            email?, phone?, last_updated? }  (values are CSV header names)
app.post('/api/import/roster', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch { return res.status(400).json({ error: 'bad mapping JSON' }); }
  if (!mapping.full_name && !mapping.last_name) {
    return res.status(400).json({ error: 'mapping needs full_name or last_name' });
  }
  const replace = req.body.replace === 'true';
  const staleDays = parseInt(getConfig(db, 'stale_days'), 10) || 365;
  const { records } = csv.parseWithHeaders(req.file.buffer.toString('utf8'));

  const get = (rec, key) => mapping[key] ? (rec[mapping[key]] || '').trim() : '';

  const tx = db.transaction(() => {
    if (replace) {
      db.exec('DELETE FROM checkins; DELETE FROM contact_corrections; DELETE FROM members;');
      setConfig(db, 'next_ballot_no', '1');
    }
    const ins = db.prepare(`INSERT INTO members
      (member_no, last_name, first_name, middle_name, suffix, full_name,
       dues_status, dues_ok, email, phone, last_updated, info_stale,
       norm_last, norm_first)
      VALUES (@member_no, @last_name, @first_name, @middle_name, @suffix, @full_name,
       @dues_status, @dues_ok, @email, @phone, @last_updated, @info_stale,
       @norm_last, @norm_first)`);
    let count = 0;
    for (const rec of records) {
      let last = get(rec, 'last_name'), first = get(rec, 'first_name');
      let full = get(rec, 'full_name');
      let suffix = '', middle = '';
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
        dues_status: dues, dues_ok: duesOk(dues),
        email, phone, last_updated: lastUpdated,
        info_stale: computeStale(email, phone, lastUpdated, staleDays),
        norm_last: match.normalizeName(last),
        norm_first: match.normalizeName(first)
      });
      count++;
    }
    return count;
  });
  const count = tx();
  audit(db, 'roster_import', `imported ${count} members (replace=${replace})`, 'admin');
  res.json({ imported: count });
});

// Optional paper dues roll: flags members found on it; reports non-matches.
app.post('/api/import/paper', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch { return res.status(400).json({ error: 'bad mapping JSON' }); }
  const { records } = csv.parseWithHeaders(req.file.buffer.toString('utf8'));
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

// ---------- lookup ----------

// Type-ahead: last-name prefix (or "last, first"), min 2 chars.
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ members: [] });
  let lastPart = q, firstPart = '';
  if (q.includes(',')) [lastPart, firstPart] = q.split(',', 2).map(s => s.trim());
  const normLast = match.normalizeName(lastPart);
  const normFirst = match.normalizeName(firstPart);
  if (!normLast) return res.json({ members: [] });
  // Prefix match on any token of the normalized last name.
  const rows = db.prepare(
    `SELECT * FROM members
     WHERE norm_last LIKE ? OR norm_last LIKE ? OR member_no = ?
     ORDER BY norm_last, norm_first LIMIT 30`
  ).all(normLast + '%', '% ' + normLast + '%', q);
  let out = rows;
  if (normFirst) out = rows.filter(m => m.norm_first.startsWith(normFirst) ||
    match.firstNameScore(normFirst, m.norm_first.split(' ')[0] || '') >= 85);
  res.json({ members: out.map(memberPublic) });
});

// Fuzzy match for scanned IDs. Body: { lastName, firstName, dob? }.
// dob is echoed back per-candidate as AGE ONLY for disambiguation and is
// NEVER stored (privacy requirement).
app.post('/api/match', (req, res) => {
  const { lastName, firstName } = req.body || {};
  if (!lastName && !firstName) return res.status(400).json({ error: 'no name' });
  const q = { lastName: lastName || '', firstName: firstName || '' };
  // Narrow by first letter(s) then score. Roster is a few hundred rows, so a
  // full scan is also fine — keep it simple and scan all.
  const all = db.prepare('SELECT * FROM members').all();
  const scored = [];
  for (const m of all) {
    const s = match.scoreCandidate(q, m);
    if (s >= match.MATCH_THRESHOLD) scored.push([s, m]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  res.json({
    candidates: scored.slice(0, 8).map(([score, m]) => ({ score, member: memberPublic(m) }))
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
  const methods = ['portal_id', 'license_scan', 'dept_id', 'other'];
  if (!member_id || !station || !methods.includes(verification_method)) {
    return res.status(400).json({ error: 'member_id, station, verification_method required' });
  }
  if (verification_method === 'other' && !(method_note || '').trim()) {
    return res.status(400).json({ error: 'note required for method "other"' });
  }
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
  if (!m) return res.status(404).json({ error: 'member not found' });

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
    res.json({ ok: true, ...result, member: memberPublic(m) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
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

// ---------- member updates ----------

app.post('/api/members/:id/contact', (req, res) => {
  const { email, phone, station } = req.body || {};
  const m = db.prepare('SELECT id FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  db.prepare('INSERT INTO contact_corrections (member_id, email, phone, station) VALUES (?, ?, ?, ?)')
    .run(m.id, email || '', phone || '', station || '');
  audit(db, 'contact_correction', `member ${m.id}`, station);
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
            m.member_no, m.last_name, m.first_name, m.dues_status,
            CASE WHEN m.access_granted_at IS NOT NULL THEN 'yes' ELSE '' END access_granted_today,
            CASE WHEN c.voided_at IS NOT NULL THEN 'VOID' ELSE '' END voided,
            c.voided_at, c.void_reason
     FROM checkins c JOIN members m ON m.id = c.member_id ORDER BY c.id`
  ).all();
  sendCsv(res, 'checkins.csv',
    ['ts', 'station', 'verification_method', 'method_note', 'ballot_no', 'member_no',
     'last_name', 'first_name', 'dues_status', 'access_granted_today', 'voided', 'voided_at', 'void_reason'],
    rows);
});

app.get('/api/export/contact-corrections.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT m.member_no, m.last_name, m.first_name,
            m.email old_email, m.phone old_phone,
            cc.email new_email, cc.phone new_phone, cc.ts, cc.station
     FROM contact_corrections cc JOIN members m ON m.id = cc.member_id ORDER BY cc.id`
  ).all();
  sendCsv(res, 'contact-corrections.csv',
    ['member_no', 'last_name', 'first_name', 'old_email', 'old_phone',
     'new_email', 'new_phone', 'ts', 'station'], rows);
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

// ---------- config ----------

app.get('/api/config', (req, res) => {
  res.json({
    stale_days: getConfig(db, 'stale_days'),
    ballot_numbering: getConfig(db, 'ballot_numbering')
  });
});

app.post('/api/config', requireAdmin, (req, res) => {
  const allowed = ['stale_days', 'ballot_numbering', 'admin_pin'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) setConfig(db, k, req.body[k]);
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

app.get('/api/ping', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

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
