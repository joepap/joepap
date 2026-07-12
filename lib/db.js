'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function open(file) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(file || path.join(DATA_DIR, 'checkin.db'));
  db.pragma('journal_mode = WAL');      // concurrent stations read while one writes
  db.pragma('synchronous = NORMAL');
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

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_no TEXT,
      last_name TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      middle_name TEXT NOT NULL DEFAULT '',
      suffix TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      dues_status TEXT NOT NULL DEFAULT '',
      dues_ok INTEGER NOT NULL DEFAULT 1,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      last_updated TEXT NOT NULL DEFAULT '',
      info_stale INTEGER NOT NULL DEFAULT 0,
      on_paper_roll INTEGER NOT NULL DEFAULT 0,
      access_granted_at TEXT,
      access_granted_station TEXT,
      norm_last TEXT NOT NULL DEFAULT '',
      norm_first TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_members_norm_last ON members(norm_last);
    CREATE INDEX IF NOT EXISTS ix_members_member_no ON members(member_no);

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES members(id),
      ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      station TEXT NOT NULL DEFAULT '',
      verification_method TEXT NOT NULL
        CHECK (verification_method IN ('portal_id','license_scan','dept_id','other')),
      method_note TEXT NOT NULL DEFAULT '',
      ballot_no INTEGER,
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT
    );
    -- One member, one ballot: only one non-voided check-in per member. This
    -- is enforced by the database, not just the UI.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_checkins_active
      ON checkins(member_id) WHERE voided_at IS NULL;
    CREATE INDEX IF NOT EXISTS ix_checkins_station ON checkins(station);

    CREATE TABLE IF NOT EXISTS contact_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES members(id),
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      station TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS not_found (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_entered TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      station TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      station TEXT NOT NULL DEFAULT ''
    );
  `);

  // Additive migrations for databases created before these columns existed.
  const memberCols = db.prepare('PRAGMA table_info(members)').all().map(c => c.name);
  if (!memberCols.includes('portal_status')) {
    db.exec("ALTER TABLE members ADD COLUMN portal_status TEXT NOT NULL DEFAULT ''");
  }
  if (!memberCols.includes('dept_id')) {
    // Fire-department ID / pat tag number — matched exactly when a dept ID
    // barcode is scanned or its number typed into search.
    db.exec("ALTER TABLE members ADD COLUMN dept_id TEXT NOT NULL DEFAULT ''");
    db.exec('CREATE INDEX IF NOT EXISTS ix_members_dept_id ON members(dept_id)');
  }
  if (!memberCols.includes('dob')) {
    // Roster DOB (from the org's own membership export, if the admin chooses
    // to map it) — used to disambiguate same-name members against a license
    // scan. This is NOT barcode data; barcode DOB is never persisted.
    db.exec('ALTER TABLE members ADD COLUMN dob TEXT');
  }

  for (const col of ['groups', 'addr_street', 'addr_street2', 'addr_city', 'addr_state', 'addr_zip',
                     'rank', 'platoon', 'assignment']) {
    if (!memberCols.includes(col)) {
      db.exec(`ALTER TABLE members ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
  const corrCols = db.prepare('PRAGMA table_info(contact_corrections)').all().map(c => c.name);
  for (const col of ['new_first_name', 'new_middle_name', 'new_last_name', 'new_street', 'new_street2',
                     'new_city', 'new_state', 'new_zip', 'new_rank', 'new_platoon', 'new_assignment',
                     'receiving_emails']) {
    if (!corrCols.includes(col)) {
      db.exec(`ALTER TABLE contact_corrections ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
  if (!corrCols.includes('fix_email_group')) {
    db.exec('ALTER TABLE contact_corrections ADD COLUMN fix_email_group INTEGER NOT NULL DEFAULT 0');
  }

  const defaults = {
    stale_days: '365',          // last_updated older than this => info_stale
    ballot_numbering: 'on',     // sequential ballot numbers
    next_ballot_no: '1',
    admin_pin: process.env.ADMIN_PIN || '3636',
    // ConnectPlus email-distribution groups (comma lists, case-insensitive):
    // membership in an ok-group = on the email list; membership in a
    // bad-group = known email problem (bounced / opted out).
    email_ok_groups: 'Active Members,Retired Members',
    email_bad_groups: 'Active Members - No Emails,Retired Members - NO Emails,2024 returned mail'
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

function audit(db, action, detail, station) {
  db.prepare('INSERT INTO audit_log (action, detail, station) VALUES (?, ?, ?)')
    .run(action, detail || '', station || '');
}

module.exports = { open, getConfig, setConfig, audit, DATA_DIR };
