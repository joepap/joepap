'use strict';
// Online-safe snapshot of both databases into backups/, keeping the newest
// 30 of each (~5 hours of 10-minute snapshots). Run by the
// com.local36.backup launch agent (see install-autostart.sh) or by hand.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'backups');
fs.mkdirSync(OUT, { recursive: true });

const ts = new Date();
const label = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`;

async function snap(file, prefix) {
  const src = path.join(DATA, file);
  if (!fs.existsSync(src)) return;
  const db = new Database(src, { readonly: true });
  await db.backup(path.join(OUT, `${prefix}-${label}.db`));
  db.close();
  // prune: keep newest 30 per prefix
  const old = fs.readdirSync(OUT).filter(f => f.startsWith(prefix + '-')).sort().reverse().slice(30);
  for (const f of old) fs.unlinkSync(path.join(OUT, f));
}

(async () => {
  await snap('checkin.db', 'checkin');
  await snap('queue.db', 'queue');
  console.log('backup ok', label);
})().catch(e => { console.error('backup failed:', e.message); process.exit(1); });
