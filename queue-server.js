'use strict';
/*
 * Question-line queue for the ratification meeting — a SEPARATE service
 * from check-in, on its own port with its own database, because this one
 * is exposed to the internet (members' phones are on cellular, not the
 * venue LAN). It shares nothing with the ballot system: no roster, no
 * check-in data, no admin endpoints.
 *
 * Flow: a QR code on the projector (/display) points members' phones at
 * the public URL. They enter their name, get a live "N people ahead of
 * you" view. The moderator opens /mod on their phone (PIN), sees the
 * line, and swipes/taps Done or Skip as they call on people.
 *
 * Run:      node queue-server.js            (port 8090)
 * Expose:   tailscale funnel --bg 8090      (public HTTPS URL, see RUNBOOK)
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = parseInt(process.env.QUEUE_PORT || '8090', 10);
const MOD_PIN = process.env.MOD_PIN || '3636';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'queue.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');   // survive concurrent writes (2 mods + members)
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','done','skipped')),
    ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_entries_status ON entries(status);
  CREATE INDEX IF NOT EXISTS ix_entries_token ON entries(token);
`);
if (!db.prepare('PRAGMA table_info(entries)').all().some(c => c.name === 'topic')) {
  db.exec("ALTER TABLE entries ADD COLUMN topic TEXT NOT NULL DEFAULT ''");
}

const app = express();
app.use(express.json({ limit: '16kb' }));

// no-cache (revalidate every load) — same policy as the check-in server, so a
// stale cached page can never outlive a code update.
const page = name => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public-queue', name), { cacheControl: false });
};
app.get('/', page('member.html'));
app.get('/mod', page('mod.html'));
app.get('/display', page('display.html'));
app.get('/meeting', page('meeting.html'));   // one-QR event hub page
app.get('/topics.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript')
    .sendFile(path.join(__dirname, 'public-queue', 'topics.js'), { cacheControl: false });
});

// Shared union logo — same file the check-in app uses (public/logo.png).
// 404s harmlessly until the file is dropped in place.
app.get('/logo.png', (req, res) => {
  const logo = path.join(__dirname, 'public', 'logo.png');
  if (fs.existsSync(logo)) res.sendFile(logo);
  else res.status(404).end();
});

function requireMod(req, res, next) {
  if ((req.get('X-Mod-Pin') || '') === MOD_PIN) return next();
  res.status(401).json({ error: 'PIN required' });
}

function positionOf(entry) {
  if (!entry || entry.status !== 'waiting') return null;
  return db.prepare(
    "SELECT COUNT(*) c FROM entries WHERE status = 'waiting' AND id < ?"
  ).get(entry.id).c + 1;
}

function activeByToken(token) {
  return db.prepare(
    "SELECT * FROM entries WHERE token = ? AND status = 'waiting' ORDER BY id DESC LIMIT 1"
  ).get(token);
}

// Join the line (or update name/topic if this device is already in it).
app.post('/api/join', (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 60);
  const topic = String((req.body || {}).topic || '').trim().slice(0, 80);
  const token = String((req.body || {}).token || '').trim().slice(0, 64);
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (topic.length < 3) return res.status(400).json({ error: 'Say what your question is about — a few words is plenty.' });
  if (!token) return res.status(400).json({ error: 'missing token' });
  let entry = activeByToken(token);
  if (entry) {
    db.prepare('UPDATE entries SET name = ?, topic = ? WHERE id = ?').run(name, topic, entry.id);
  } else {
    const info = db.prepare('INSERT INTO entries (name, token, topic) VALUES (?, ?, ?)').run(name, token, topic);
    entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json({ position: positionOf(entry), waiting: waitingCount() });
});

app.post('/api/leave', (req, res) => {
  const entry = activeByToken(String((req.body || {}).token || ''));
  if (entry) {
    db.prepare("UPDATE entries SET status = 'skipped', resolved_at = datetime('now','localtime') WHERE id = ?")
      .run(entry.id);
  }
  res.json({ ok: true });
});

function waitingCount() {
  return db.prepare("SELECT COUNT(*) c FROM entries WHERE status = 'waiting'").get().c;
}

// Live position for a member's phone (polled).
app.get('/api/status', (req, res) => {
  const entry = activeByToken(String(req.query.token || ''));
  if (!entry) return res.json({ inLine: false, waiting: waitingCount() });
  res.json({
    inLine: true,
    name: entry.name,
    topic: entry.topic,
    position: positionOf(entry),
    ahead: positionOf(entry) - 1,
    waiting: waitingCount()
  });
});

// Public, harmless: how many are waiting (for the projector display).
app.get('/api/display-info', (req, res) => {
  res.json({ waiting: waitingCount() });
});

// Moderator: the full line.
app.get('/api/mod/list', requireMod, (req, res) => {
  res.json({
    waiting: db.prepare("SELECT id, name, topic, ts FROM entries WHERE status = 'waiting' ORDER BY id").all(),
    resolved: db.prepare(
      "SELECT id, name, topic, status, resolved_at FROM entries WHERE status != 'waiting' ORDER BY resolved_at DESC LIMIT 12"
    ).all(),
    counts: {
      waiting: waitingCount(),
      done: db.prepare("SELECT COUNT(*) c FROM entries WHERE status = 'done'").get().c,
      skipped: db.prepare("SELECT COUNT(*) c FROM entries WHERE status = 'skipped'").get().c
    }
  });
});

// Moderator actions: done / skip / undo (put back at the FRONT is not
// possible with id-ordering, so undo restores waiting status and the
// original id keeps their old spot in line).
app.post('/api/mod/action', requireMod, (req, res) => {
  const { id, action } = req.body || {};
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  if (action === 'done' || action === 'skip') {
    db.prepare("UPDATE entries SET status = ?, resolved_at = datetime('now','localtime') WHERE id = ?")
      .run(action === 'done' ? 'done' : 'skipped', id);
  } else if (action === 'undo') {
    db.prepare("UPDATE entries SET status = 'waiting', resolved_at = NULL WHERE id = ?").run(id);
  } else {
    return res.status(400).json({ error: 'bad action' });
  }
  res.json({ ok: true });
});

// Moderator: manually add someone who has no phone / can't scan. They
// take their place at the end of the line like anyone else.
app.post('/api/mod/add', requireMod, (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 60);
  const topic = String((req.body || {}).topic || '').trim().slice(0, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Enter the full name.' });
  const token = 'mod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const info = db.prepare('INSERT INTO entries (name, token, topic) VALUES (?, ?, ?)').run(name, token, topic);
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ok: true, position: positionOf(entry) });
});

// Moderator: clear the whole line (start of meeting / testing).
app.post('/api/mod/reset', requireMod, (req, res) => {
  db.exec('DELETE FROM entries');
  res.json({ ok: true });
});

// QR code PNG of the public URL (for /display). bwip-js is already a dep.
app.get('/qr.png', async (req, res) => {
  const url = String(req.query.url || '').slice(0, 300);
  if (!/^https?:\/\//.test(url)) return res.status(400).send('bad url');
  try {
    const bwipjs = require('bwip-js');
    const png = await bwipjs.toBuffer({
      bcid: 'qrcode', text: url, scale: 12, backgroundcolor: 'FFFFFF', padding: 2
    });
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) {
    res.status(500).send('qr failed');
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Question queue on http://localhost:${PORT}`);
    console.log(`  member page : /        moderator: /mod (PIN ${MOD_PIN})   projector: /display`);
    console.log('  Expose publicly with: tailscale funnel --bg ' + PORT + '   (see RUNBOOK.md)');
  });
}

module.exports = app;
