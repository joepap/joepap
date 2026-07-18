const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolated DB for this test.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-'));
process.env.STATION_PIN = 'testpin';
process.env.ADMIN_PIN = 'adminpin';
const app = require('../server.js');
const { open } = require('../lib/db');
const mailer = require('../lib/mailer');

let base, db;
test.before(async () => {
  db = open();
  db.prepare(`INSERT INTO members
    (member_no, last_name, first_name, full_name, dues_status, dues_ok, email, norm_last, norm_first)
    VALUES ('1','Mailer','Molly','Molly Mailer','Active',1,'molly@example.com','MAILER','MOLLY')`).run();
  await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + s.address().port; s.unref(); r(); }); });
});

const admin = { 'Content-Type': 'application/json', 'X-Admin-Pin': 'adminpin' };
const post = (p, b, h) => fetch(base + p, { method: 'POST', headers: h || admin, body: JSON.stringify(b) });
const get = (p) => fetch(base + p, { headers: { 'X-Station-Pin': 'testpin' } });

test('mail settings round-trip; password is stored but never echoed back', async () => {
  const save = await post('/api/config', {
    mail_host: 'smtp.example.com', mail_port: '587', mail_user: 'info@iaff36.org',
    mail_pass: 'secret-app-password', mail_from: 'Local 36 <info@iaff36.org>',
    meeting_link: 'https://tinyurl.com/local36-meeting', mail_enabled: 'off'
  });
  assert.strictEqual(save.status, 200);
  const c = await (await get('/api/config')).json();
  assert.strictEqual(c.mail_host, 'smtp.example.com');
  assert.strictEqual(c.mail_pass_set, true);
  assert.strictEqual(c.mail_pass, undefined);          // never leaves the server
  assert.strictEqual(JSON.stringify(c).includes('secret-app-password'), false);

  // Saving again with a blank password keeps the stored one.
  await post('/api/config', { mail_host: 'smtp2.example.com', mail_pass: '' });
  const c2 = await (await get('/api/config')).json();
  assert.strictEqual(c2.mail_pass_set, true);
  assert.strictEqual(c2.mail_host, 'smtp2.example.com');
});

test('disabled mail sends nothing and logs nothing on check-in', async () => {
  const r = await post('/api/checkin',
    { member_id: 1, station: 'T1', verification_method: 'portal_id' },
    { 'Content-Type': 'application/json', 'X-Station-Pin': 'testpin' });
  assert.strictEqual(r.status, 200);
  await new Promise(r2 => setTimeout(r2, 50));         // let setImmediate run
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM email_log').get().c, 0);
});

test('enabled mail with no address on file logs a skip (not a crash)', async () => {
  db.prepare(`INSERT INTO members
    (member_no, last_name, first_name, full_name, dues_status, dues_ok, email, norm_last, norm_first)
    VALUES ('2','Noemail','Ned','Ned Noemail','Active',1,'','NOEMAIL','NED')`).run();
  await post('/api/config', { mail_enabled: 'on' });
  const m = db.prepare('SELECT * FROM members WHERE member_no = ?').get('2');
  await mailer.sendCheckinEmail(db, m, 999);
  const row = db.prepare('SELECT * FROM email_log WHERE member_id = ?').get(m.id);
  assert.strictEqual(row.status, 'skipped');
  assert.match(row.error, /no email/);
  await post('/api/config', { mail_enabled: 'off' });
});

test('template renders name and link into subject/body defaults', () => {
  const s = mailer.settings(db);
  assert.match(s.body, /\{first_name\}/);
  assert.match(s.body, /\{link\}/);
});

test('mail-test endpoint validates the address and requires admin', async () => {
  const bad = await post('/api/admin/mail-test', { to: 'not-an-email' });
  assert.strictEqual(bad.status, 400);
  const noAuth = await post('/api/admin/mail-test', { to: 'a@b.com' },
    { 'Content-Type': 'application/json', 'X-Station-Pin': 'testpin' });
  assert.strictEqual(noAuth.status, 401);
});

test('email log export exists and is admin-only', async () => {
  const noAuth = await fetch(base + '/api/export/email-log.csv', { headers: { 'X-Station-Pin': 'testpin' } });
  assert.strictEqual(noAuth.status, 401);
  const ok = await fetch(base + '/api/export/email-log.csv', { headers: { 'X-Admin-Pin': 'adminpin' } });
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /to_email,status/);
});
