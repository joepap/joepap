'use strict';
/*
 * "Report imported" notification email — same Gmail-SMTP pattern as the
 * check-in app's mailer. Fire-and-forget on finalize: a mail outage never
 * blocks the workflow. Off until configured in Settings.
 */
const { getConfig } = require('./db');

let _transport = null;
let _transportKey = '';

function settings(db) {
  return {
    enabled: getConfig(db, 'mail_enabled') === 'on',
    host: (getConfig(db, 'mail_host') || '').trim(),
    port: parseInt(getConfig(db, 'mail_port'), 10) || 587,
    user: (getConfig(db, 'mail_user') || '').trim(),
    pass: getConfig(db, 'mail_pass') || '',
    from: (getConfig(db, 'mail_from') || '').trim(),
    to: (getConfig(db, 'mail_to') || '').trim()
  };
}

function isConfigured(db) {
  const s = settings(db);
  return !!(s.host && s.user && s.pass && s.from && s.to);
}

function transportFor(db) {
  const s = settings(db);
  const key = [s.host, s.port, s.user, s.pass].join(' ');
  if (!_transport || key !== _transportKey) {
    const nodemailer = require('nodemailer');
    if (_transport) _transport.close();
    _transport = nodemailer.createTransport({
      host: s.host, port: s.port, secure: s.port === 465,
      auth: { user: s.user, pass: s.pass },
      connectionTimeout: 15000, socketTimeout: 30000
    });
    _transportKey = key;
  }
  return _transport;
}

function summaryText(imp, summary) {
  const label = imp.report_date || imp.uploaded_at.slice(0, 10);
  const lines = [
    `The ${label} dues report is imported and compared.`,
    '',
    `  Dues payers on the report: ${summary.total}`,
    `  Stopped paying:            ${summary.stopped}${summary.stopped ? '  ← follow up' : ''}`,
    `  New payers:                ${summary.new}`,
    `  Grade/step/name changes:   ${summary.changed}`,
    ''
  ];
  if (!summary.comparedTo) lines.push('This was the first import — nothing to compare against yet.');
  else lines.push(`Compared against the ${summary.comparedTo.label} report.`);
  lines.push('', 'Open the dues tracker to download the NEP import sheet.',
    '', 'Local 36 Dues Tracker');
  return lines.join('\n');
}

// Never throws; returns 'sent' | 'skipped' | 'failed: …' for the audit log.
async function sendImportEmail(db, imp, summary) {
  try {
    const s = settings(db);
    if (!s.enabled) return 'skipped';
    if (!isConfigured(db)) return 'failed: mail not fully configured';
    const label = imp.report_date || imp.uploaded_at.slice(0, 10);
    await transportFor(db).sendMail({
      from: s.from, to: s.to,
      subject: `Dues report imported — ${label}: ${summary.stopped} stopped payer${summary.stopped === 1 ? '' : 's'}`,
      text: summaryText(imp, summary)
    });
    return 'sent';
  } catch (e) {
    return 'failed: ' + e.message;
  }
}

async function sendTest(db, to) {
  const s = settings(db);
  if (!(s.host && s.user && s.pass && s.from)) {
    throw new Error('Fill in host, username, password and From first.');
  }
  await transportFor(db).sendMail({
    from: s.from, to,
    subject: '[TEST] Local 36 Dues Tracker email works',
    text: 'This is the test email from the dues tracker. Sending is set up correctly.'
  });
}

module.exports = { settings, isConfigured, sendImportEmail, sendTest };
