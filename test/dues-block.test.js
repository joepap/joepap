const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolated DB for this test.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dues-'));
process.env.STATION_PIN = 'testpin';
process.env.ADMIN_PIN = 'adminpin';
const app = require('../server.js');
const { open } = require('../lib/db');

let base;
test.before(async () => {
  // Seed two members: one blocked (but "Active"), one clean.
  const db = open();
  const ins = db.prepare(`INSERT INTO members
    (member_no, last_name, first_name, full_name, dues_status, dues_ok, dues_block, norm_last, norm_first)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  ins.run('1', 'Blocked', 'Bob', 'Bob Blocked', 'Active', 1, 1, 'BLOCKED', 'BOB');
  ins.run('2', 'Clean', 'Cathy', 'Cathy Clean', 'Active', 1, 0, 'CLEAN', 'CATHY');
  await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + s.address().port; s.unref(); r(); }); });
});

const H = { 'Content-Type': 'application/json', 'X-Station-Pin': 'testpin' };
const post = (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) });
const get = (p) => fetch(base + p, { headers: H });

test('blocked member is exposed as dues_block and cannot be issued a ballot', async () => {
  const blocked = await (await get('/api/members/1')).json();
  assert.strictEqual(blocked.member.dues_block, true);
  assert.strictEqual(blocked.member.dues_status, 'Active'); // would otherwise be eligible

  const r = await post('/api/checkin', { member_id: 1, station: 'T1', verification_method: 'portal_id' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual((await r.json()).error, 'dues_block');
});

test('a non-blocked member checks in normally', async () => {
  const r = await post('/api/checkin', { member_id: 2, station: 'T1', verification_method: 'portal_id' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).ok, true);
});
