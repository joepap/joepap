'use strict';
// Dues-tracker database. Every biweekly report import is a PERMANENT
// snapshot — rows are never overwritten by a later import; comparisons are
// derived data that can always be recomputed from the snapshots.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function open(file) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(file || path.join(DATA_DIR, 'dues.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');   // treasurer's books — never lose a committed write
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- One row per uploaded report (PDF scan or spreadsheet).
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf','sheet')),
      report_date TEXT NOT NULL DEFAULT '',
      dues_year TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      -- processing: OCR running   review: rows in, human review open
      -- ready: finalized + compared   failed: see error
      status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing','review','ready','failed')),
      pages INTEGER NOT NULL DEFAULT 0,
      pages_done INTEGER NOT NULL DEFAULT 0,
      total_rows INTEGER NOT NULL DEFAULT 0,
      flagged_rows INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      finalized_at TEXT,
      compared_to INTEGER REFERENCES imports(id)
    );

    -- Rendered page images (kept on disk under data/pages/<import>/) —
    -- width/height let the review screen compute crop positions.
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id),
      page INTEGER NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'ocr' CHECK (mode IN ('ocr','text','sheet')),
      ocr_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_pages_import ON pages(import_id);

    -- One parsed report line. bbox (bx0..by1) is in pixels on the stored
    -- page image so the review screen can crop the original scan.
    CREATE TABLE IF NOT EXISTS rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id),
      page INTEGER NOT NULL DEFAULT 0,
      line_no INTEGER NOT NULL DEFAULT 0,
      emplid TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      middle_name TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      step TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      reviewed INTEGER NOT NULL DEFAULT 0,
      edited INTEGER NOT NULL DEFAULT 0,
      excluded INTEGER NOT NULL DEFAULT 0,
      review_reason TEXT NOT NULL DEFAULT '',
      ocr_text TEXT NOT NULL DEFAULT '',
      bx0 INTEGER NOT NULL DEFAULT 0, by0 INTEGER NOT NULL DEFAULT 0,
      bx1 INTEGER NOT NULL DEFAULT 0, by1 INTEGER NOT NULL DEFAULT 0,
      norm_last TEXT NOT NULL DEFAULT '',
      norm_first TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS ix_rows_import ON rows(import_id);
    CREATE INDEX IF NOT EXISTS ix_rows_emplid ON rows(emplid);
    CREATE INDEX IF NOT EXISTS ix_rows_review ON rows(import_id, needs_review, reviewed);

    -- Comparison results for an import vs the previous one. Derived data —
    -- recomputable — but persisted so the treasurer's notes and "handled"
    -- checkmarks stick to each finding.
    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id),
      kind TEXT NOT NULL CHECK (kind IN ('stopped','new','changed')),
      emplid TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      prev_row_id INTEGER,
      cur_row_id INTEGER,
      matched_by TEXT NOT NULL DEFAULT 'emplid',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','handled')),
      note TEXT NOT NULL DEFAULT '',
      handled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_changes_import ON changes(import_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );

    -- Membership databases for reconciliation: NEP (ConnectPlus), the
    -- IAFF's own record of our members, and telestaff, the department's
    -- staffing export. Every upload is a permanent snapshot, same rule as
    -- dues imports; the newest per source is "current" for the reconcile
    -- screen.
    CREATE TABLE IF NOT EXISTS rosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK (source IN ('nep','iaff','telestaff')),
      filename TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      total INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS roster_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roster_id INTEGER NOT NULL REFERENCES rosters(id),
      member_no TEXT NOT NULL DEFAULT '',
      emplid TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      middle_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      work_status TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      norm_last TEXT NOT NULL DEFAULT '',
      norm_first TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS ix_roster_members_roster ON roster_members(roster_id);
    CREATE INDEX IF NOT EXISTS ix_roster_members_norm ON roster_members(norm_last);
  `);

  // Databases created before telestaff was a source carry the old two-source
  // CHECK constraint, and CREATE TABLE IF NOT EXISTS will not replace it.
  // SQLite cannot alter a constraint, so rebuild the table in place. The
  // snapshots themselves are copied across untouched — losing one would
  // break the "history is never overwritten" rule the whole app rests on.
  const rostersSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='rosters'").get();
  if (rostersSql && !/telestaff/.test(rostersSql.sql)) {
    // SQLite's documented table-rebuild procedure. `foreign_keys` must be
    // turned off OUTSIDE the transaction — inside one it is silently ignored,
    // and dropping the old table then fails because roster_members points at
    // it. `foreign_key_check` before the commit proves nothing was orphaned.
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE rosters_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL CHECK (source IN ('nep','iaff','telestaff')),
            filename TEXT NOT NULL DEFAULT '',
            uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            total INTEGER NOT NULL DEFAULT 0
          );
          INSERT INTO rosters_new (id, source, filename, uploaded_at, total)
            SELECT id, source, filename, uploaded_at, total FROM rosters;
          DROP TABLE rosters;
          ALTER TABLE rosters_new RENAME TO rosters;`);
        const orphans = db.pragma('foreign_key_check');
        if (orphans.length) throw new Error('roster rebuild would orphan ' + orphans.length + ' rows');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // Telestaff is the authority on rank and platoon; the other two sources
  // simply leave these blank. Additive, so an existing database keeps every
  // row it had.
  const cols = new Set(db.prepare('PRAGMA table_info(roster_members)').all().map(c => c.name));
  if (!cols.has('rank')) db.exec("ALTER TABLE roster_members ADD COLUMN rank TEXT NOT NULL DEFAULT ''");
  if (!cols.has('platoon')) db.exec("ALTER TABLE roster_members ADD COLUMN platoon TEXT NOT NULL DEFAULT ''");

  // Why a payer stopped, decided against telestaff — 'promoted-out',
  // 'left-department' or 'still-working'. Kept as its own column, not just
  // buried in the detail sentence, so the follow-up list can group by it.
  const chg = new Set(db.prepare('PRAGMA table_info(changes)').all().map(c => c.name));
  if (!chg.has('reason')) db.exec("ALTER TABLE changes ADD COLUMN reason TEXT NOT NULL DEFAULT ''");

  const defaults = {
    // Same convention as the check-in app: staff password for viewing,
    // organizer/admin PIN for imports, edits and settings.
    staff_pin: process.env.STAFF_PIN || '3636',
    admin_pin: process.env.ADMIN_PIN || '6363',
    // Rows below this OCR confidence go to the review screen. Calibrated
    // against noisy 200-dpi test scans: catches every real misread while
    // keeping the queue reviewable. Raise it if errors slip through.
    review_threshold: '80',
    // The NEP checkbox year to mark paid ("2026 Dues"). Editable in settings.
    dues_year: String(new Date().getFullYear()),
    // Page render zoom: 72dpi PDF points x 4.2 ≈ 300dpi, the OCR sweet spot.
    ocr_zoom: '4.2',
    // "Report imported — N stopped payers" email (off until configured).
    mail_enabled: 'off',
    mail_port: '587',
    mail_to: ''
  };
  const ins = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
}

function getConfig(db, key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(db, key, value) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function audit(db, action, detail) {
  db.prepare('INSERT INTO audit_log (action, detail) VALUES (?, ?)').run(action, detail || '');
}

module.exports = { open, getConfig, setConfig, audit, DATA_DIR };
