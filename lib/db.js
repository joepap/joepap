'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function open(file) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(file || path.join(DATA_DIR, 'checkin.db'));
  db.pragma('journal_mode = WAL');      // concurrent stations read while one writes
  // FULL (not NORMAL): at this volume the fsync cost is negligible, and it
  // closes the power-loss window where a committed ballot could be lost.
  db.pragma('synchronous = FULL');
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
        CHECK (verification_method IN ('portal_id','license_scan','dept_id','other','payroll_dues','discrepancy')),
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
                     'rank', 'platoon', 'assignment', 'appt_date', 'paramedic', 'dues_block_note']) {
    if (!memberCols.includes(col)) {
      db.exec(`ALTER TABLE members ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
  // dues_block: member is on the union's non-dues-paying list and may NOT be
  // issued a ballot, regardless of ConnectPlus Member Status. Set by
  // scripts/apply-dues-block.js. INTEGER (0/1) — NOT text, so 0 stays falsy.
  if (!memberCols.includes('dues_block')) {
    db.exec('ALTER TABLE members ADD COLUMN dues_block INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE INDEX IF NOT EXISTS ix_members_dues_block ON members(dues_block)');
  }
  // Rebuild checkins if it still carries the old 4-method CHECK constraint
  // (adds payroll_dues + discrepancy). Preserves existing rows.
  const ckSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='checkins'").get() || {}).sql || '';
  if (ckSql.includes("'other'") && !ckSql.includes('payroll_dues')) {
    db.exec(`
      ALTER TABLE checkins RENAME TO checkins_old;
      CREATE TABLE checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL REFERENCES members(id),
        ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        station TEXT NOT NULL DEFAULT '',
        verification_method TEXT NOT NULL
          CHECK (verification_method IN ('portal_id','license_scan','dept_id','other','payroll_dues','discrepancy')),
        method_note TEXT NOT NULL DEFAULT '',
        ballot_no INTEGER, voided_at TEXT, voided_by TEXT, void_reason TEXT
      );
      INSERT INTO checkins SELECT * FROM checkins_old;
      DROP TABLE checkins_old;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_checkins_active ON checkins(member_id) WHERE voided_at IS NULL;
      CREATE INDEX IF NOT EXISTS ix_checkins_station ON checkins(station);
    `);
  }

  // payroll_ok: this member's name matched a row on the DC payroll union-dues
  // report (the authoritative "currently paying dues" list). Set when the
  // payroll list is imported. Not on payroll => eligibility must be verified.
  if (!memberCols.includes('payroll_ok')) {
    db.exec('ALTER TABLE members ADD COLUMN payroll_ok INTEGER NOT NULL DEFAULT 0');
  }
  // source: 'nep' (imported roster) or 'payroll' (provisional record created
  // when a payroll-only person checks in — needs adding to NEP after the vote).
  if (!memberCols.includes('source')) {
    db.exec("ALTER TABLE members ADD COLUMN source TEXT NOT NULL DEFAULT 'nep'");
  }

  // The payroll dues list itself. Rows with member_id NULL are "payroll-only"
  // — paying dues but not in the NEP roster (searchable at check-in so they
  // still get a ballot and can be enrolled).
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_dues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emplid TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      middle_name TEXT NOT NULL DEFAULT '',
      ssn4 TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      step TEXT NOT NULL DEFAULT '',
      norm_last TEXT NOT NULL DEFAULT '',
      norm_first TEXT NOT NULL DEFAULT '',
      member_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS ix_payroll_norm_last ON payroll_dues(norm_last);
    CREATE INDEX IF NOT EXISTS ix_payroll_member ON payroll_dues(member_id);
  `);

  // Discrepancy Table queue: people flagged red at the main check-in and sent
  // to the secondary table for a human to resolve (paper-payroll check, etc.).
  db.exec(`
    CREATE TABLE IF NOT EXISTS discrepancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      from_station TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'verify',
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
      outcome TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      resolved_by TEXT NOT NULL DEFAULT '',
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_disc_status ON discrepancies(status);
  `);
  // 'kind' distinguishes queue item types (added to existing DBs):
  //   'verify'          — flagged at check-in, needs a human to decide on a ballot
  //   'collect_contact' — already checked in & got a ballot, but is a "data
  //                       record" in NEP (no portal); collect email/phone so we
  //                       can send a portal invite after the meeting.
  if (!db.prepare('PRAGMA table_info(discrepancies)').all().some(c => c.name === 'kind')) {
    db.exec("ALTER TABLE discrepancies ADD COLUMN kind TEXT NOT NULL DEFAULT 'verify'");
  }
  // Every check-in confirmation email attempt (sent / failed / skipped) —
  // the paper trail for "did we reach them", exportable from admin.
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      checkin_id INTEGER,
      to_email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '' CHECK (status IN ('sent','failed','skipped')),
      error TEXT NOT NULL DEFAULT '',
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS ix_email_log_status ON email_log(status);
  `);

  const corrCols = db.prepare('PRAGMA table_info(contact_corrections)').all().map(c => c.name);
  for (const col of ['new_first_name', 'new_middle_name', 'new_last_name', 'new_street', 'new_street2',
                     'new_city', 'new_state', 'new_zip', 'new_rank', 'new_platoon', 'new_assignment',
                     'new_appt_date', 'new_paramedic', 'receiving_emails']) {
    if (!corrCols.includes(col)) {
      db.exec(`ALTER TABLE contact_corrections ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
  if (!corrCols.includes('fix_email_group')) {
    db.exec('ALTER TABLE contact_corrections ADD COLUMN fix_email_group INTEGER NOT NULL DEFAULT 0');
  }

  const defaults = {
    stale_days: '365',          // last_updated older than this => info_stale
    ballot_numbering: 'off',    // blind ballots — no numbers (Local 36 rule)
    next_ballot_no: '1',
    admin_pin: process.env.ADMIN_PIN || '3636',
    // Required by every station request — the check-in app may be exposed
    // to the internet (volunteers' phones on cellular), so nothing about
    // the roster is reachable without it. Change it before the event.
    station_pin: process.env.STATION_PIN || '3636',
    // ConnectPlus email-distribution groups (comma lists, case-insensitive):
    // membership in an ok-group = on the email list; membership in a
    // bad-group = known email problem (bounced / opted out).
    email_ok_groups: 'Active Members,Retired Members',
    email_bad_groups: 'Active Members - No Emails,Retired Members - NO Emails,2024 returned mail',
    // Check-in confirmation email (SMTP settings entered in admin; off until
    // credentials are in and the admin flips it on).
    mail_enabled: 'off',
    mail_port: '587',
    meeting_link: '',
    // When a "data record" (member in NEP with no active portal account)
    // checks in, auto-queue them at the Help Table to collect email/phone for
    // a post-meeting portal invite. Toggle off if it overwhelms that table.
    collect_datarecord_contact: 'on'
  };
  const ins = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  // The station password shipped as 1136 in early builds; the event standard
  // is 3636 (uniform with the other PINs). Upgrade only the untouched default
  // — a password someone deliberately set stays as-is.
  if (!process.env.STATION_PIN) {
    db.prepare("UPDATE config SET value = '3636' WHERE key = 'station_pin' AND value = '1136'").run();
  }

  // Local 36 ballots are BLIND — physical ballots carry no numbers, so the
  // app must never announce one ("hand them ballot #7"). Numbering is forced
  // off on every boot; the count of ballots handed out = the check-in count.
  db.prepare("UPDATE config SET value = 'off' WHERE key = 'ballot_numbering'").run();
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
