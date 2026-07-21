'use strict';
/*
 * Build the all-in-one event workbook: a sheet per dataset plus a Summary
 * tab. Used by scripts/export-workbook.js (writes a file on the mini) and by
 * the admin download endpoint (streams it to any browser). Purely read-only.
 */
const XLSX = require('xlsx');

/**
 * @param db   open better-sqlite3 handle for checkin.db
 * @param qdb  open handle for queue.db, or null
 * @param log  optional per-sheet logger (name, rowCount)
 * @returns    an XLSX workbook object
 */
function buildWorkbook(db, qdb, log) {
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, note) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: note || 'no rows recorded' }]);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
    if (log) log(name, rows.length);
  };
  const all = (sql) => db.prepare(sql).all();
  const one = (sql) => db.prepare(sql).get();

  // ---------- Summary ----------
  const summary = [];
  const put = (metric, value) => summary.push({ metric, value });
  put('Roster size (NEP members loaded)', one("SELECT COUNT(*) c FROM members WHERE source IS NULL OR source != 'payroll'").c);
  put('Payroll dues list size', one('SELECT COUNT(*) c FROM payroll_dues').c);
  put('Payroll matched to NEP roster', one('SELECT COUNT(*) c FROM payroll_dues WHERE member_id IS NOT NULL').c);
  put('Checked in / ballots handed out', one('SELECT COUNT(*) c FROM checkins WHERE voided_at IS NULL').c);
  put('Turnout (of payroll dues-payers)', (() => {
    const p = one('SELECT COUNT(*) c FROM payroll_dues').c;
    const ci = one('SELECT COUNT(*) c FROM checkins WHERE voided_at IS NULL').c;
    return p ? Math.round((ci / p) * 1000) / 10 + '%' : 'n/a';
  })());
  put('Voided check-ins', one('SELECT COUNT(*) c FROM checkins WHERE voided_at IS NOT NULL').c);
  put('Payroll-only members who voted', one("SELECT COUNT(*) c FROM checkins c JOIN members m ON m.id = c.member_id WHERE m.source = 'payroll' AND c.voided_at IS NULL").c);
  put('Help Table cases — resolved', one("SELECT COUNT(*) c FROM discrepancies WHERE status = 'resolved'").c);
  put('Help Table cases — still pending', one("SELECT COUNT(*) c FROM discrepancies WHERE status = 'pending'").c);
  put('Not-on-roster people logged', one('SELECT COUNT(*) c FROM not_found').c);
  put('Contact corrections captured', one('SELECT COUNT(*) c FROM contact_corrections').c);
  put('Confirmation emails sent', one("SELECT COUNT(*) c FROM email_log WHERE status = 'sent'").c);
  put('Confirmation emails failed', one("SELECT COUNT(*) c FROM email_log WHERE status = 'failed'").c);
  put('Check-ins with no email on file', one("SELECT COUNT(*) c FROM email_log WHERE status = 'skipped'").c);
  if (qdb) {
    put('Question line — total joined', qdb.prepare('SELECT COUNT(*) c FROM entries').get().c);
    put('Question line — questions handled', qdb.prepare("SELECT COUNT(*) c FROM entries WHERE status = 'done'").get().c);
  }
  for (const r of all('SELECT verification_method, COUNT(*) c FROM checkins WHERE voided_at IS NULL GROUP BY verification_method')) {
    put('Check-ins via ' + r.verification_method, r.c);
  }
  for (const r of all('SELECT station, COUNT(*) c FROM checkins WHERE voided_at IS NULL GROUP BY station ORDER BY c DESC')) {
    put('Check-ins by ' + r.station, r.c);
  }
  addSheet('Summary', summary);

  addSheet('Check-ins', all(
    `SELECT c.ts, c.station volunteer, c.verification_method, c.method_note,
            m.member_no, m.last_name, m.first_name, m.middle_name, m.dues_status,
            CASE WHEN m.source = 'payroll' THEN 'yes' ELSE '' END payroll_only_provisional,
            CASE WHEN c.voided_at IS NOT NULL THEN 'VOID' ELSE '' END voided,
            c.voided_at, c.void_reason
     FROM checkins c JOIN members m ON m.id = c.member_id ORDER BY c.id`));

  addSheet('Help Table log', all(
    `SELECT d.ts sent_at, d.name, d.kind, d.reason, d.from_station, d.status, d.outcome,
            d.resolved_by, d.resolved_at, d.note,
            (SELECT cc.email FROM contact_corrections cc WHERE cc.member_id = d.member_id
             ORDER BY cc.id DESC LIMIT 1) email_captured,
            (SELECT cc.phone FROM contact_corrections cc WHERE cc.member_id = d.member_id
             ORDER BY cc.id DESC LIMIT 1) phone_captured
     FROM discrepancies d ORDER BY d.id`));

  addSheet('Contact corrections', all(
    `SELECT m.member_no, m.last_name, m.first_name, m.email old_email, m.phone old_phone,
            cc.email new_email, cc.phone new_phone, cc.ts, cc.station
     FROM contact_corrections cc JOIN members m ON m.id = cc.member_id ORDER BY cc.id`));

  addSheet('Not on roster', all('SELECT name_entered, notes, ts, station FROM not_found ORDER BY id'));

  addSheet('Email log', all(
    `SELECT e.ts, m.member_no, m.last_name, m.first_name, e.to_email, e.status, e.error
     FROM email_log e LEFT JOIN members m ON m.id = e.member_id ORDER BY e.id`));

  addSheet('Audit log', all('SELECT ts, action, detail, station FROM audit_log ORDER BY id'));

  addSheet('NEP dues-members', all(`
    SELECT COALESCE(m.first_name, p.first_name, '') "First Name",
           COALESCE(m.middle_name, p.middle_name, '') "Middle Name",
           COALESCE(m.last_name, p.last_name, '') "Last Name",
           COALESCE(m.suffix, '') "Suffix",
           COALESCE(m.member_no, '') "Member Number",
           'Active' "Member Status",
           'Active Member' "Work Status",
           COALESCE((SELECT cc.email FROM contact_corrections cc WHERE cc.member_id = m.id AND cc.email != '' ORDER BY cc.id DESC LIMIT 1), m.email, '') "Email",
           COALESCE((SELECT cc.phone FROM contact_corrections cc WHERE cc.member_id = m.id AND cc.phone != '' ORDER BY cc.id DESC LIMIT 1), m.phone, '') "Phone",
           COALESCE(m.addr_street, '') "Address", COALESCE(m.addr_street2, '') "Address 2",
           COALESCE(m.addr_city, '') "City", COALESCE(m.addr_state, '') "State", COALESCE(m.addr_zip, '') "Zip",
           COALESCE(m.rank, '') "Rank", COALESCE(m.platoon, '') "Platoon", COALESCE(m.assignment, '') "Assignment",
           COALESCE(m.appt_date, '') "Appointment Date", COALESCE(m.paramedic, '') "Paramedic",
           COALESCE(m.dob, '') "Date of Birth",
           p.emplid "Emplid", p.grade "Grade", p.step "Step", p.ssn4 "SSN Last 4",
           CASE WHEN p.member_id IS NOT NULL AND (m.source IS NULL OR m.source != 'payroll') THEN 'yes' ELSE 'no' END "Currently in NEP",
           CASE WHEN c.id IS NOT NULL THEN 'yes' ELSE '' END "Checked in at vote"
    FROM payroll_dues p
    LEFT JOIN members m ON m.id = p.member_id
    LEFT JOIN checkins c ON c.member_id = p.member_id AND c.voided_at IS NULL
    ORDER BY COALESCE(m.last_name, p.last_name), COALESCE(m.first_name, p.first_name)`));

  addSheet('Payroll not in NEP', all(
    `SELECT p.last_name, p.first_name, p.middle_name, p.emplid, p.ssn4, p.grade, p.step,
            CASE WHEN c.id IS NOT NULL THEN 'yes' ELSE '' END checked_in_at_vote, c.ts checkin_ts,
            (SELECT cc.email FROM contact_corrections cc WHERE cc.member_id = p.member_id
             ORDER BY cc.id DESC LIMIT 1) email_captured,
            (SELECT cc.phone FROM contact_corrections cc WHERE cc.member_id = p.member_id
             ORDER BY cc.id DESC LIMIT 1) phone_captured
     FROM payroll_dues p
     LEFT JOIN members m ON m.id = p.member_id
     LEFT JOIN checkins c ON c.member_id = p.member_id AND c.voided_at IS NULL
     WHERE p.member_id IS NULL OR m.source = 'payroll'
     ORDER BY p.last_name, p.first_name`));

  addSheet('Payroll list', all(
    `SELECT last_name, first_name, middle_name, emplid, grade, step,
            CASE WHEN member_id IS NOT NULL THEN 'yes' ELSE '' END in_nep
     FROM payroll_dues ORDER BY last_name, first_name`));

  addSheet('Access granted', all(
    `SELECT member_no, last_name, first_name, access_granted_at, access_granted_station
     FROM members WHERE access_granted_at IS NOT NULL ORDER BY access_granted_at`));

  addSheet('Roster snapshot', all(
    `SELECT m.member_no, m.last_name, m.first_name, m.middle_name, m.suffix,
            m.dues_status, m.portal_status,
            CASE WHEN m.payroll_ok = 1 THEN 'yes' ELSE '' END on_payroll,
            CASE WHEN m.dues_block = 1 THEN 'yes' ELSE '' END dues_blocked,
            CASE WHEN m.source = 'payroll' THEN 'yes' ELSE '' END payroll_only_provisional,
            CASE WHEN c.id IS NOT NULL THEN 'yes' ELSE '' END checked_in_at_vote,
            m.email, m.phone, m.addr_street, m.addr_street2, m.addr_city, m.addr_state, m.addr_zip,
            m.rank, m.platoon, m.assignment, m.appt_date, m.paramedic, m.groups, m.last_updated
     FROM members m LEFT JOIN checkins c ON c.member_id = m.id AND c.voided_at IS NULL
     ORDER BY m.last_name, m.first_name`));

  if (qdb) {
    addSheet('Question line', qdb.prepare(
      'SELECT ts joined_at, name, topic, status, resolved_at FROM entries ORDER BY id').all());
  }

  return wb;
}

module.exports = { buildWorkbook };
