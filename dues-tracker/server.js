'use strict';
/*
 * Local 36 Dues Tracker — the biweekly payroll dues-report workflow:
 *
 *   1. Upload the scanned report PDF  →  OCR  →  parsed rows w/ confidence
 *   2. Review screen: fix uncertain rows by eye against the actual scan
 *   3. Finalize: compare to the previous report — stopped / new / changed
 *   4. Download the NEP (ConnectPlus) import workbook + follow-up lists
 *
 * Separate app from the check-in system: own port (8200), own database
 * (data/dues.db), same passwords convention (staff 3636 / admin 6363).
 *
 * Run:     node server.js
 * Expose:  tailscale funnel --bg --https=10000 8200    (public — the e-board
 *          and union employees check member status here; sign-in is name +
 *          staff password, with a wrong-password lockout). 8080/8443/8090
 *          and Funnel ports 443/8443 are taken by the live check-in +
 *          question-line apps on the same mini; 10000 is the free one.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const { open, getConfig, setConfig, audit, DATA_DIR } = require('./lib/db');
const importer = require('./lib/importer');
const compare = require('./lib/compare');
const nepexport = require('./lib/nepexport');
const reconcile = require('./lib/reconcile');
const mailer = require('./lib/mailer');
const parse = require('./lib/parse');
const match = require('./lib/match');
const tabular = require('./lib/tabular');

const PORT = parseInt(process.env.DUES_PORT || '8200', 10);
const db = open();
importer.failInterrupted(db);

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------- auth (same convention as the check-in app) ----------
function pinsOf(req) {
  return [req.get('X-Admin-Pin') || '', req.get('X-Staff-Pin') || '', String(req.query.pin || '')];
}
function isAdmin(req) {
  const admin = getConfig(db, 'admin_pin');
  return pinsOf(req).some(p => p && p === admin);
}
function isStaff(req) {
  const staff = getConfig(db, 'staff_pin');
  return isAdmin(req) || pinsOf(req).some(p => p && p === staff);
}
/** Who is doing this — the signed-in name, for the activity log. */
function who(req) {
  const n = String(req.get('X-User-Name') || (req.body || {}).name || '')
    .replace(/[^\w .,'-]/g, '').trim().slice(0, 40);
  return n || 'unknown';
}

// Wrong-password lockout. This app faces the public internet permanently
// (the check-in app only did on event day), so brute-forcing the 4-digit
// passwords must be slow: 50 wrong tries = locked out for 15 minutes.
// Keyed by IP where visible; behind Tailscale Funnel everything arrives as
// localhost, so in practice it's one shared bucket — fine for this size
// of team, and it makes a sweep of the PIN space take weeks, not minutes.
const FAILS = new Map();
const FAIL_LIMIT = 50, FAIL_WINDOW_MS = 15 * 60 * 1000;
function lockedOut(req) {
  const f = FAILS.get(req.ip || 'x');
  if (!f) return false;
  if (Date.now() > f.until) { FAILS.delete(req.ip || 'x'); return false; }
  return f.count >= FAIL_LIMIT;
}
function notePinFail(req) {
  const k = req.ip || 'x';
  const f = FAILS.get(k) || { count: 0, until: 0 };
  f.count++; f.until = Date.now() + FAIL_WINDOW_MS;
  FAILS.set(k, f);
  if (f.count === FAIL_LIMIT) audit(db, 'lockout', `too many wrong passwords from ${k}`);
}
const LOCKED_MSG = 'Too many wrong passwords — locked for 15 minutes.';

function requireStaff(req, res, next) {
  if (lockedOut(req)) return res.status(429).json({ error: LOCKED_MSG });
  if (isStaff(req)) return next();
  if (pinsOf(req).some(p => p)) notePinFail(req);
  res.status(401).json({ error: 'PIN required' });
}
function requireAdmin(req, res, next) {
  if (lockedOut(req)) return res.status(429).json({ error: LOCKED_MSG });
  if (isAdmin(req)) return next();
  // A valid staff pin on an admin endpoint is a role problem, not an attack.
  if (!isStaff(req) && pinsOf(req).some(p => p)) notePinFail(req);
  res.status(401).json({ error: 'Admin PIN required' });
}

// ---------- static ----------
const page = name => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', name), { cacheControl: false });
};
app.get('/', page('index.html'));
app.get('/import.html', page('import.html'));
app.get('/review.html', page('review.html'));
app.get('/reconcile.html', page('reconcile.html'));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { cacheControl: false, etag: true }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { cacheControl: false, etag: true }));
app.get('/logo.png', (req, res) => {
  // Same union logo the check-in app uses; either location works.
  for (const p of [path.join(__dirname, 'public', 'logo.png'),
                   path.join(__dirname, '..', 'public', 'logo.png')]) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).end();
});

// ---------- uploads ----------
fs.mkdirSync(importer.UPLOADS_DIR, { recursive: true });
const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: importer.UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  }),
  limits: { fileSize: 300 * 1024 * 1024 }
});
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ---------- auth check ----------
app.post('/api/auth', (req, res) => {
  if (lockedOut(req)) return res.status(429).json({ error: LOCKED_MSG });
  const pin = String((req.body || {}).pin || '');
  const role = pin === getConfig(db, 'admin_pin') ? 'admin'
    : pin === getConfig(db, 'staff_pin') ? 'staff' : null;
  if (role) {
    audit(db, 'sign_in', `${who(req)} (${role})`);
    return res.json({ role });
  }
  if (pin) notePinFail(req);
  res.status(401).json({ error: 'Wrong password' });
});

// ---------- home state ----------
app.get('/api/state', requireStaff, (req, res) => {
  const imports = db.prepare(`
    SELECT i.*, p.report_date prev_date,
      (SELECT COUNT(*) FROM changes c WHERE c.import_id = i.id AND c.kind = 'stopped') stopped,
      (SELECT COUNT(*) FROM changes c WHERE c.import_id = i.id AND c.kind = 'new') new_payers,
      (SELECT COUNT(*) FROM changes c WHERE c.import_id = i.id AND c.kind = 'changed') changed
    FROM imports i LEFT JOIN imports p ON p.id = i.compared_to
    ORDER BY COALESCE(NULLIF(i.report_date,''), substr(i.uploaded_at,1,10)) DESC, i.id DESC`).all();
  const latest = imports.find(i => i.status === 'ready') || null;
  // Trend for the mini dashboard: oldest → newest finalized imports.
  const trend = imports.filter(i => i.status === 'ready')
    .map(i => ({ label: i.report_date || i.uploaded_at.slice(0, 10), total: i.total_rows,
                 stopped: i.stopped, new_payers: i.new_payers }))
    .reverse();
  const rosterInfo = {};
  for (const src of ['nep', 'iaff']) {
    const r = reconcile.latestRoster(db, src);
    rosterInfo[src] = r ? { id: r.id, total: r.total, loaded: r.uploaded_at.slice(0, 10),
      snapshots: db.prepare('SELECT COUNT(*) c FROM rosters WHERE source = ?').get(src).c } : null;
  }
  res.json({ imports, latest, trend, rosters: rosterInfo, dues_year: getConfig(db, 'dues_year') });
});

// ---------- membership rosters (NEP / IAFF) ----------
app.post('/api/roster/import', requireAdmin, sheetUpload.single('file'), (req, res) => {
  const source = String(req.body.source || '');
  if (source !== 'nep' && source !== 'iaff') return res.status(400).json({ error: 'bad source' });
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch (e) { return res.status(400).json({ error: 'bad mapping' }); }
  if (!(mapping.last_name || mapping.full_name)) {
    return res.status(400).json({ error: 'Map at least Last name (or Full name).' });
  }
  let parsed;
  try { parsed = tabular.parseUpload(req.file.buffer, req.file.originalname); }
  catch (e) { return res.status(400).json({ error: 'Could not read that file: ' + e.message }); }
  if (!parsed.records.length) return res.status(400).json({ error: 'No rows found in that file.' });
  const result = reconcile.importRoster(db, source, parsed.records, mapping, req.file.originalname);
  audit(db, 'roster_imported', `${source.toUpperCase()} #${result.rosterId} ` +
    `${req.file.originalname}: ${result.total} members by ${who(req)}`);
  res.json(result);
});

// The sync dashboard: dues vs NEP vs IAFF, computed fresh on every call.
app.get('/api/reconcile', requireStaff, (req, res) => {
  res.json(reconcile.reconcile(db));
});

app.get('/api/reconcile.xlsx', requireStaff, (req, res) => {
  const XLSX = require('xlsx');
  const buf = XLSX.write(reconcile.buildReconcileWorkbook(db), { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Disposition', `attachment; filename="local36-reconcile-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
  audit(db, 'export_reconcile', `by ${who(req)}`);
});

// ---------- create import (PDF scan) ----------
app.post('/api/imports', requireAdmin, pdfUpload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'No file uploaded' });
  const head = Buffer.alloc(5);
  const fd = fs.openSync(f.path, 'r');
  fs.readSync(fd, head, 0, 5, 0);
  fs.closeSync(fd);
  if (head.toString('latin1') !== '%PDF-') {
    fs.unlinkSync(f.path);
    return res.status(400).json({ error: 'That file is not a PDF. Upload the scanned report PDF.' });
  }
  const info = db.prepare(
    'INSERT INTO imports (filename, kind, report_date, dues_year) VALUES (?, ?, ?, ?)')
    .run(f.originalname || 'report.pdf', 'pdf',
         String(req.body.report_date || '').slice(0, 10),
         String(req.body.dues_year || getConfig(db, 'dues_year') || '').replace(/\D/g, '').slice(0, 4));
  const id = info.lastInsertRowid;
  fs.renameSync(f.path, importer.uploadPath(id, 'pdf'));
  audit(db, 'import_uploaded', `#${id} ${f.originalname} (${Math.round(f.size / 1024)} KB) by ${who(req)}`);
  importer.enqueue(db, id);
  res.json({ id });
});

// ---------- create import (spreadsheet — for when an electronic feed exists) ----------
app.post('/api/sheet/preview', requireAdmin, sheetUpload.single('file'), (req, res) => {
  try {
    const { headers, records } = tabular.parseUpload(req.file.buffer, req.file.originalname);
    res.json({ headers, total: records.length, sample: records.slice(0, 5) });
  } catch (e) {
    res.status(400).json({ error: 'Could not read that file: ' + e.message });
  }
});

app.post('/api/sheet/import', requireAdmin, sheetUpload.single('file'), (req, res) => {
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '{}'); }
  catch (e) { return res.status(400).json({ error: 'bad mapping' }); }
  if (!mapping.emplid || !(mapping.name || mapping.last_name)) {
    return res.status(400).json({ error: 'Map at least Emplid and Name (or Last name).' });
  }
  let parsed;
  try { parsed = tabular.parseUpload(req.file.buffer, req.file.originalname); }
  catch (e) { return res.status(400).json({ error: 'Could not read that file: ' + e.message }); }

  const info = db.prepare(
    'INSERT INTO imports (filename, kind, report_date, dues_year, status) VALUES (?, ?, ?, ?, ?)')
    .run(req.file.originalname || 'sheet', 'sheet',
         String(req.body.report_date || '').slice(0, 10),
         String(req.body.dues_year || getConfig(db, 'dues_year') || '').replace(/\D/g, '').slice(0, 4),
         'review');
  const id = info.lastInsertRowid;
  fs.writeFileSync(importer.uploadPath(id, 'sheet'), req.file.buffer);

  const ins = db.prepare(`INSERT INTO rows
    (import_id, page, line_no, emplid, name, last_name, first_name, middle_name, grade, step,
     confidence, needs_review, review_reason, ocr_text, norm_last, norm_first)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?)`);
  const get = (r, k) => String(mapping[k] ? (r[mapping[k]] || '') : '').trim();
  db.transaction(() => {
    parsed.records.forEach((r, i) => {
      const emplid = get(r, 'emplid').replace(/\D/g, '');
      let last = get(r, 'last_name'), first = get(r, 'first_name'), middle = get(r, 'middle_name');
      let name = get(r, 'name');
      if (name && !last) { const nm = parse.splitName(name); last = nm.last; first = nm.first; middle = nm.middle; }
      if (!name) name = [last, first].filter(Boolean).join(',') + (middle ? ' ' + middle : '');
      const bad = !parse.EMPLID_RE.test(emplid);
      ins.run(id, i + 1, emplid, name, last, first, middle, get(r, 'grade'), get(r, 'step'),
        bad ? 1 : 0, bad ? 'emplid not in 0#######  format' : '',
        Object.values(r).join(' '), match.normalizeName(last), match.normalizeName(first));
    });
    db.prepare('INSERT INTO pages (import_id, page, mode) VALUES (?, 1, ?)').run(id, 'sheet');
  })();
  importer.refreshCounts(db, id);
  audit(db, 'sheet_imported', `#${id} ${req.file.originalname}: ${parsed.records.length} rows by ${who(req)}`);
  res.json({ id, rows: parsed.records.length });
});

// ---------- import detail ----------
app.get('/api/imports/:id', requireStaff, (req, res) => {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(req.params.id);
  if (!imp) return res.status(404).json({ error: 'not found' });
  const counts = db.prepare(`SELECT
      COUNT(*) FILTER (WHERE excluded = 0) total,
      COUNT(*) FILTER (WHERE excluded = 0 AND needs_review = 1 AND reviewed = 0) flagged,
      COUNT(*) FILTER (WHERE excluded = 0 AND needs_review = 1 AND reviewed = 1) fixed,
      COUNT(*) FILTER (WHERE excluded = 1) excluded,
      COUNT(*) FILTER (WHERE edited = 1) edited,
      ROUND(AVG(confidence) FILTER (WHERE excluded = 0), 1) avg_conf
    FROM rows WHERE import_id = ?`).get(imp.id);
  const changes = db.prepare(
    'SELECT * FROM changes WHERE import_id = ? ORDER BY kind, name').all(imp.id);
  const prev = imp.compared_to
    ? db.prepare('SELECT id, filename, report_date, uploaded_at FROM imports WHERE id = ?').get(imp.compared_to)
    : null;
  const wouldCompareTo = imp.status === 'review' ? compare.previousImport(db, imp) : null;
  res.json({
    import: imp, counts, changes, prev,
    would_compare_to: wouldCompareTo
      ? { id: wouldCompareTo.id, label: wouldCompareTo.report_date || wouldCompareTo.uploaded_at.slice(0, 10) }
      : null
  });
});

app.get('/api/imports/:id/rows', requireStaff, (req, res) => {
  const impId = parseInt(req.params.id, 10);
  const filter = String(req.query.filter || 'all');
  const q = String(req.query.q || '').trim();
  let where = 'import_id = ?';
  const args = [impId];
  if (filter === 'flagged') where += ' AND excluded = 0 AND needs_review = 1 AND reviewed = 0';
  else if (filter === 'excluded') where += ' AND excluded = 1';
  else if (filter === 'edited') where += ' AND edited = 1';
  else where += ' AND excluded = 0';
  if (q) {
    where += " AND (emplid LIKE ? OR name LIKE ? OR norm_last LIKE ? OR norm_first LIKE ?)";
    const like = '%' + q.toUpperCase() + '%';
    args.push('%' + q + '%', like, like, like);
  }
  const rows = db.prepare(
    `SELECT * FROM rows WHERE ${where} ORDER BY page, line_no LIMIT 2500`).all(...args);
  const pages = db.prepare('SELECT page, width, height, mode FROM pages WHERE import_id = ?').all(impId);
  res.json({ rows, pages });
});

// Page scan image (PII — PIN-gated; <img> tags pass the pin in the query).
app.get('/api/imports/:id/page/:n.png', requireStaff, (req, res) => {
  const p = importer.pagePath(parseInt(req.params.id, 10), parseInt(req.params.n, 10));
  if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(p);
});

// ---------- row corrections (the review screen) ----------
app.post('/api/rows/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM rows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const action = String(b.action || 'save');

  if (action === 'exclude') {
    db.prepare('UPDATE rows SET excluded = 1, reviewed = 1 WHERE id = ?').run(row.id);
    audit(db, 'row_excluded', `#${row.id} (${row.name || row.ocr_text.slice(0, 40)}) by ${who(req)}`);
  } else if (action === 'restore') {
    db.prepare('UPDATE rows SET excluded = 0 WHERE id = ?').run(row.id);
  } else if (action === 'confirm') {
    db.prepare('UPDATE rows SET reviewed = 1, needs_review = 0 WHERE id = ?').run(row.id);
  } else if (action === 'save') {
    const emplid = String(b.emplid || '').replace(/\D/g, '');
    if (emplid && !parse.EMPLID_RE.test(emplid)) {
      return res.status(400).json({ error: 'Emplid must be 8 digits starting with 0 (or empty if unreadable).' });
    }
    const name = String(b.name || '').trim().slice(0, 80);
    const nm = parse.splitName(name);
    db.prepare(`UPDATE rows SET emplid = ?, name = ?, last_name = ?, first_name = ?, middle_name = ?,
        grade = ?, step = ?, norm_last = ?, norm_first = ?,
        confidence = 100, edited = 1, reviewed = 1, needs_review = 0 WHERE id = ?`)
      .run(emplid, name, nm.last, nm.first, nm.middle,
        String(b.grade || '').trim().slice(0, 12), String(b.step || '').trim().slice(0, 4),
        match.normalizeName(nm.last), match.normalizeName(nm.first), row.id);
    audit(db, 'row_corrected', `#${row.id}: "${row.ocr_text.slice(0, 50)}" → ${emplid} ${name} by ${who(req)}`);
  } else {
    return res.status(400).json({ error: 'bad action' });
  }
  importer.refreshCounts(db, row.import_id);
  // If this import was already finalized, edits change the comparison.
  const imp = db.prepare('SELECT status FROM imports WHERE id = ?').get(row.import_id);
  if (imp.status === 'ready' && action !== 'confirm') compare.runCompare(db, row.import_id);
  res.json({ row: db.prepare('SELECT * FROM rows WHERE id = ?').get(row.id) });
});

// ---------- auto-verify low-confidence rows against the member databases ----------
app.post('/api/imports/:id/autoverify', requireAdmin, (req, res) => {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(req.params.id);
  if (!imp) return res.status(404).json({ error: 'not found' });
  const result = reconcile.verifyRowsAgainstRosters(db, imp.id);
  importer.refreshCounts(db, imp.id);
  audit(db, 'autoverify', `#${imp.id}: ${result.verified}/${result.checked} cleared by ${who(req)}`);
  res.json(result);
});

// ---------- finalize + compare ----------
app.post('/api/imports/:id/finalize', requireAdmin, async (req, res) => {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(req.params.id);
  if (!imp) return res.status(404).json({ error: 'not found' });
  if (imp.status === 'processing' || imp.status === 'failed') {
    return res.status(400).json({ error: 'This import is not ready to finalize.' });
  }
  const summary = compare.runCompare(db, imp.id);
  const mailResult = await mailer.sendImportEmail(db, imp, summary);
  if (mailResult !== 'skipped') audit(db, 'mail_import_summary', `#${imp.id}: ${mailResult}`);
  res.json({ summary, mail: mailResult });
  // Cheap insurance: snapshot the whole database after each finalize.
  // Biweekly cadence -> a handful of small files a year in data/backups/.
  try {
    const bdir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    await db.backup(path.join(bdir, `dues-${new Date().toISOString().slice(0, 10)}.db`));
  } catch (e) { audit(db, 'backup_failed', e.message); }
});

app.post('/api/changes/:id', requireAdmin, (req, res) => {
  const ch = db.prepare('SELECT * FROM changes WHERE id = ?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const status = b.status === 'handled' ? 'handled' : 'open';
  db.prepare(`UPDATE changes SET status = ?, note = ?,
      handled_at = CASE WHEN ? = 'handled' THEN datetime('now','localtime') ELSE NULL END
    WHERE id = ?`)
    .run(status, String(b.note || '').slice(0, 300), status, ch.id);
  res.json({ ok: true });
});

// ---------- exports ----------
app.get('/api/imports/:id/nep.xlsx', requireStaff, (req, res) => {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(req.params.id);
  if (!imp) return res.status(404).json({ error: 'not found' });
  const XLSX = require('xlsx');
  const wb = nepexport.buildNepWorkbook(db, imp.id);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const label = (imp.report_date || imp.uploaded_at.slice(0, 10)).replace(/[^0-9-]/g, '');
  res.set('Content-Disposition', `attachment; filename="dues-nep-import-${label}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
  audit(db, 'export_nep', `#${imp.id} by ${who(req)}`);
});

// ---------- settings ----------
app.get('/api/config', requireAdmin, (req, res) => {
  res.json({
    staff_pin: getConfig(db, 'staff_pin'),
    review_threshold: getConfig(db, 'review_threshold'),
    dues_year: getConfig(db, 'dues_year'),
    mail_enabled: getConfig(db, 'mail_enabled'),
    mail_host: getConfig(db, 'mail_host') || '',
    mail_port: getConfig(db, 'mail_port') || '587',
    mail_user: getConfig(db, 'mail_user') || '',
    mail_from: getConfig(db, 'mail_from') || '',
    mail_to: getConfig(db, 'mail_to') || '',
    mail_pass_set: !!getConfig(db, 'mail_pass')
  });
});

app.post('/api/config', requireAdmin, (req, res) => {
  const allowed = ['staff_pin', 'admin_pin', 'review_threshold', 'dues_year',
    'mail_enabled', 'mail_host', 'mail_port', 'mail_user', 'mail_pass', 'mail_from', 'mail_to'];
  for (const k of allowed) {
    if (req.body[k] !== undefined && String(req.body[k]) !== '') {
      setConfig(db, k, String(req.body[k]).trim());
    }
  }
  audit(db, 'config_changed', Object.keys(req.body).filter(k => k !== 'mail_pass').join(', ') + ` by ${who(req)}`);
  res.json({ ok: true });
});

app.post('/api/mail-test', requireAdmin, async (req, res) => {
  try {
    await mailer.sendTest(db, String((req.body || {}).to || '').trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- delete a botched upload ----------
app.post('/api/imports/:id/delete', requireAdmin, (req, res) => {
  if ((req.body || {}).confirm !== 'DELETE') {
    return res.status(400).json({ error: 'confirmation missing' });
  }
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(req.params.id);
  if (!imp) return res.status(404).json({ error: 'not found' });
  if (db.prepare('SELECT COUNT(*) c FROM imports WHERE compared_to = ?').get(imp.id).c) {
    return res.status(400).json({ error: 'A later import was compared against this one — it stays.' });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM changes WHERE import_id = ?').run(imp.id);
    db.prepare('DELETE FROM rows WHERE import_id = ?').run(imp.id);
    db.prepare('DELETE FROM pages WHERE import_id = ?').run(imp.id);
    db.prepare('DELETE FROM imports WHERE id = ?').run(imp.id);
  })();
  for (const kind of ['pdf', 'sheet']) {
    try { fs.unlinkSync(importer.uploadPath(imp.id, kind)); } catch (e) { /* absent */ }
  }
  fs.rmSync(path.join(importer.PAGES_DIR, String(imp.id)), { recursive: true, force: true });
  audit(db, 'import_deleted', `#${imp.id} ${imp.filename} (${imp.total_rows} rows) by ${who(req)}`);
  res.json({ ok: true });
});

// ---------- boot ----------
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Local 36 Dues Tracker on http://localhost:${PORT}`);
    console.log(`  data: ${DATA_DIR}`);
    console.log('  staff password / admin PIN: same convention as the check-in app');
  });
}

module.exports = { app, db };
