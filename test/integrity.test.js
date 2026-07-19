const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integ-'));
process.env.STATION_PIN = 'spin';
process.env.ADMIN_PIN = 'apin';
const app = require('../server.js');
const { open } = require('../lib/db');
const payroll = require('../lib/payroll');

let base, db;
test.before(async () => {
  db = open();
  await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + s.address().port; s.unref(); r(); }); });
});

const S = { 'Content-Type': 'application/json', 'X-Station-Pin': 'spin' };
const A = { 'Content-Type': 'application/json', 'X-Admin-Pin': 'apin' };
const post = (p, b, h) => fetch(base + p, { method: 'POST', headers: h || S, body: JSON.stringify(b) });
const get = (p, h) => fetch(base + p, { headers: h || S });

test('data record (portal nonactive) is auto-queued at the Help Table on check-in', async () => {
  const info = db.prepare(`INSERT INTO members
    (member_no,last_name,first_name,full_name,dues_status,dues_ok,portal_status,norm_last,norm_first)
    VALUES ('dr1','Datarec','Dana','Dana Datarec','Active',1,'nonactive','DATAREC','DANA')`).run();
  const id = info.lastInsertRowid;
  const r = await (await post('/api/checkin', { member_id: id, station: 'T1', verification_method: 'portal_id' })).json();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.collect_contact, true);
  const q = await (await get('/api/discrepancy/list', A)).json();
  const item = q.pending.find(x => x.member_id === id);
  assert.ok(item, 'data record should be in the Help Table queue');
  assert.strictEqual(item.kind, 'collect_contact');
});

test('a portal-active member is NOT auto-queued', async () => {
  const info = db.prepare(`INSERT INTO members
    (member_no,last_name,first_name,full_name,dues_status,dues_ok,portal_status,norm_last,norm_first)
    VALUES ('ok1','Okay','Olive','Olive Okay','Active',1,'approved','OKAY','OLIVE')`).run();
  const id = info.lastInsertRowid;
  await post('/api/checkin', { member_id: id, station: 'T1', verification_method: 'portal_id' });
  const q = await (await get('/api/discrepancy/list', A)).json();
  assert.ok(!q.pending.find(x => x.member_id === id), 'portal-active member should not be queued');
});

test('payroll-only direct check-in: ballot at main table + auto-queued for enrollment', async () => {
  const p = db.prepare(`INSERT INTO payroll_dues (emplid,last_name,first_name,norm_last,norm_first,member_id)
    VALUES ('077','Direct','Dana','DIRECT','DANA',NULL)`).run();
  const pid = p.lastInsertRowid;
  const r1 = await (await post('/api/checkin',
    { payroll_id: pid, station: 'T1', verification_method: 'payroll_dues' })).json();
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.collect_contact, true, 'should be auto-queued at the Help Table');
  assert.strictEqual(r1.member.last_name, 'Direct');
  // Queued as a GOT BALLOT / GET CONTACT item with the enrollment reason.
  const q = await (await get('/api/discrepancy/list', A)).json();
  const item = q.pending.find(x => x.name === 'Direct, Dana');
  assert.ok(item, 'enrollment item should be pending');
  assert.strictEqual(item.kind, 'collect_contact');
  assert.match(item.reason, /enroll in NEP/);
  // Second direct attempt = duplicate, not a second ballot or second member.
  const r2 = await post('/api/checkin', { payroll_id: pid, station: 'T2', verification_method: 'payroll_dues' });
  assert.strictEqual(r2.status, 409);
  assert.strictEqual((await r2.json()).error, 'already_checked_in');
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM members WHERE last_name='Direct'").get().c, 1);
});

test('payroll-only person cannot be sent to the Help Table twice (dedup)', async () => {
  const p = db.prepare(`INSERT INTO payroll_dues (emplid,last_name,first_name,norm_last,norm_first,member_id)
    VALUES ('09','Payonly','Pat','PAYONLY','PAT',NULL)`).run();
  const pid = p.lastInsertRowid;
  const r1 = await (await post('/api/discrepancy', { payroll_id: pid, reason: 'x', station: 'T1' })).json();
  const r2 = await (await post('/api/discrepancy', { payroll_id: pid, reason: 'x', station: 'T2' })).json();
  assert.strictEqual(r1.id, r2.id, 'second send must return the same pending id, not a new one');
  assert.strictEqual(r2.already, true);
});

test('roster re-import re-matches payroll so eligibility is not wiped', () => {
  const d2 = open(path.join(process.env.DATA_DIR, 'rematch-iso.db'));   // isolated DB
  d2.prepare(`INSERT INTO members (member_no,last_name,first_name,full_name,dues_status,dues_ok,norm_last,norm_first)
    VALUES ('r1','Rematch','Rita','Rita Rematch','Active',1,'REMATCH','RITA')`).run();
  payroll.loadAndMatch(d2, [{ last: 'Rematch', first: 'Rita', emplid: '01' }]);
  assert.strictEqual(d2.prepare("SELECT payroll_ok FROM members WHERE member_no='r1'").get().payroll_ok, 1);
  // Simulate a roster REPLACE (payroll_ok back to 0), then rematch.
  d2.exec("DELETE FROM members");
  d2.prepare(`INSERT INTO members (member_no,last_name,first_name,full_name,dues_status,dues_ok,norm_last,norm_first)
    VALUES ('r1','Rematch','Rita','Rita Rematch','Active',1,'REMATCH','RITA')`).run();
  assert.strictEqual(d2.prepare("SELECT payroll_ok FROM members WHERE member_no='r1'").get().payroll_ok, 0);
  const rm = payroll.rematch(d2);
  assert.strictEqual(rm.matched, 1);
  assert.strictEqual(d2.prepare("SELECT payroll_ok FROM members WHERE member_no='r1'").get().payroll_ok, 1);
});

test('NEP dues-members export marks everyone Active / Active Member', async () => {
  const r = await fetch(base + '/api/export/nep-dues-members.csv', { headers: { 'X-Admin-Pin': 'apin' } });
  assert.strictEqual(r.status, 200);
  const text = await r.text();
  assert.match(text, /First Name,Middle Name,Last Name/);
  assert.match(text, /Member Status,Work Status/);
});

test('audit-log export is admin-gated and present', async () => {
  assert.strictEqual((await fetch(base + '/api/export/audit-log.csv', { headers: { 'X-Station-Pin': 'spin' } })).status, 401);
  assert.strictEqual((await fetch(base + '/api/export/audit-log.csv', { headers: { 'X-Admin-Pin': 'apin' } })).status, 200);
});

test('Help Table accepts the staff password; admin endpoints still refuse it', async () => {
  const S2 = { 'X-Station-Pin': 'spin' };
  assert.strictEqual((await fetch(base + '/api/discrepancy/list', { headers: S2 })).status, 200,
    'staff password opens the Help Table queue');
  assert.strictEqual((await fetch(base + '/api/export/checkins.csv', { headers: S2 })).status, 401,
    'staff password must NOT open admin exports');
  assert.strictEqual((await fetch(base + '/api/discrepancy/list', { headers: { 'X-Admin-Pin': 'apin' } })).status, 200,
    'admin PIN still works for the Help Table (admin tab)');
});

test('config never leaks the admin pin but reports collision booleans', async () => {
  const c = await (await get('/api/config')).json();
  assert.strictEqual(c.admin_pin, undefined);
  assert.strictEqual(typeof c.admin_equals_station, 'boolean');
  assert.strictEqual(typeof c.admin_is_default, 'boolean');
});
