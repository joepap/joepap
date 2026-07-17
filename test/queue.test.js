const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// Isolated queue DB for tests.
process.env.DATA_DIR = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'q36-'));
process.env.MOD_PIN = '9999';
const app = require('../queue-server.js');

let base;
test.before(async () => {
  await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => {
      base = 'http://127.0.0.1:' + srv.address().port;
      srv.unref(); // don't hold the test process open
      resolve();
    });
  });
});

const post = (p, body, pin) => fetch(base + p, {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, pin ? { 'X-Mod-Pin': pin } : {}),
  body: JSON.stringify(body)
}).then(r => r.json());
const get = (p, pin) => fetch(base + p, { headers: pin ? { 'X-Mod-Pin': pin } : {} });

test('queue: join, live position, done advances the line, undo restores spot', async () => {
  assert.strictEqual((await post('/api/join', { name: 'Alpha One', topic: 'pay scale', token: 'a' })).position, 1);
  assert.strictEqual((await post('/api/join', { name: 'Bravo Two', topic: 'healthcare', token: 'b' })).position, 2);
  assert.strictEqual((await post('/api/join', { name: 'Charlie Three', topic: 'staffing', token: 'c' })).position, 3);

  // Topic is required.
  assert.ok((await post('/api/join', { name: 'No Topic', topic: '', token: 'x' })).error);

  // Same device rejoining updates the name/topic but keeps the spot.
  const rejoin = await post('/api/join', { name: 'Alpha Won', topic: 'pay scale', token: 'a' });
  assert.strictEqual(rejoin.position, 1);
  assert.strictEqual(rejoin.waiting, 3);

  // Moderator PIN is enforced.
  assert.strictEqual((await get('/api/mod/list')).status, 401);
  const list = await (await get('/api/mod/list', '9999')).json();
  assert.deepStrictEqual(list.waiting.map(w => w.name), ['Alpha Won', 'Bravo Two', 'Charlie Three']);
  assert.strictEqual(list.waiting[0].topic, 'pay scale');

  // Calling on the first person moves everyone up.
  await post('/api/mod/action', { id: list.waiting[0].id, action: 'done' }, '9999');
  let c = await (await get('/api/status?token=c')).json();
  assert.strictEqual(c.position, 2);
  assert.strictEqual(c.ahead, 1);

  // Undo puts them back in their original spot (front of the line).
  await post('/api/mod/action', { id: list.waiting[0].id, action: 'undo' }, '9999');
  c = await (await get('/api/status?token=c')).json();
  assert.strictEqual(c.position, 3);

  // Leaving the line frees the spot.
  await post('/api/leave', { token: 'b' });
  c = await (await get('/api/status?token=c')).json();
  assert.strictEqual(c.position, 2);

  // Junk name is rejected.
  const bad = await post('/api/join', { name: 'x', topic: 'anything', token: 'z' });
  assert.ok(bad.error);
});
