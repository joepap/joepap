'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const dblib = require('../lib/db');
const compare = require('../lib/compare');
const match = require('../lib/match');

function freshDb() {
  return dblib.open(':memory:');
}

function addImport(db, reportDate, status) {
  return db.prepare(
    "INSERT INTO imports (filename, report_date, status, uploaded_at) VALUES (?, ?, ?, datetime('now','localtime'))")
    .run('r-' + reportDate + '.pdf', reportDate, status || 'review').lastInsertRowid;
}

function addRow(db, importId, r) {
  db.prepare(`INSERT INTO rows (import_id, emplid, name, last_name, first_name, grade, step,
      confidence, norm_last, norm_first)
    VALUES (?, ?, ?, ?, ?, ?, ?, 100, ?, ?)`)
    .run(importId, r.emplid, (r.last || '') + ',' + (r.first || ''), r.last || '', r.first || '',
      r.grade || 'FF-01', r.step || '5',
      match.normalizeName(r.last || ''), match.normalizeName(r.first || ''));
}

test('first import becomes the baseline — no changes', () => {
  const db = freshDb();
  const a = addImport(db, '2026-07-04');
  addRow(db, a, { emplid: '01111111', last: 'SMITH', first: 'JOHN' });
  const s = compare.runCompare(db, a);
  assert.equal(s.comparedTo, null);
  assert.equal(s.stopped + s.new + s.changed, 0);
  assert.equal(db.prepare('SELECT status FROM imports WHERE id = ?').get(a).status, 'ready');
});

test('stopped, new, and grade/step changes are detected by emplid', () => {
  const db = freshDb();
  const a = addImport(db, '2026-07-04');
  addRow(db, a, { emplid: '01111111', last: 'SMITH', first: 'JOHN' });
  addRow(db, a, { emplid: '02222222', last: 'GARCIA', first: 'MARIA' });
  addRow(db, a, { emplid: '03333333', last: 'JONES', first: 'PAT', step: '4' });
  compare.runCompare(db, a);

  const b = addImport(db, '2026-07-18');
  addRow(db, b, { emplid: '02222222', last: 'GARCIA', first: 'MARIA' });     // unchanged
  addRow(db, b, { emplid: '03333333', last: 'JONES', first: 'PAT', step: '5' }); // step up
  addRow(db, b, { emplid: '04444444', last: 'NGUYEN', first: 'LINH' });      // new
  const s = compare.runCompare(db, b);

  assert.deepEqual({ stopped: s.stopped, nw: s.new, changed: s.changed },
    { stopped: 1, nw: 1, changed: 1 });
  const ch = db.prepare("SELECT * FROM changes WHERE import_id = ? AND kind = 'stopped'").get(b);
  assert.equal(ch.emplid, '01111111');
  const st = db.prepare("SELECT * FROM changes WHERE import_id = ? AND kind = 'changed'").get(b);
  assert.match(st.detail, /step 4 → 5/);
});

test('OCR-mangled emplid is rescued by fuzzy name match — no false stop/new pair', () => {
  const db = freshDb();
  const a = addImport(db, '2026-07-04');
  addRow(db, a, { emplid: '01111111', last: 'PAPARIELLO', first: 'JOSEPH' });
  compare.runCompare(db, a);

  const b = addImport(db, '2026-07-18');
  // Same person; OCR read a digit wrong this time.
  addRow(db, b, { emplid: '01111117', last: 'PAPARIELLO', first: 'JOE' });   // nickname too
  const s = compare.runCompare(db, b);

  assert.equal(s.stopped, 0, 'no false stopped');
  assert.equal(s.new, 0, 'no false new');
  assert.equal(s.changed, 1);
  const ch = db.prepare("SELECT * FROM changes WHERE import_id = ?").get(b);
  assert.equal(ch.matched_by, 'name');
  assert.match(ch.detail, /emplid read differs/);
});

test('treasurer notes survive a re-run of the comparison', () => {
  const db = freshDb();
  const a = addImport(db, '2026-07-04');
  addRow(db, a, { emplid: '01111111', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);
  const b = addImport(db, '2026-07-18');
  compare.runCompare(db, b);   // SMITH stopped
  const ch = db.prepare('SELECT * FROM changes WHERE import_id = ?').get(b);
  db.prepare("UPDATE changes SET status = 'handled', note = 'retired in June' WHERE id = ?").run(ch.id);

  compare.runCompare(db, b);   // re-run
  const again = db.prepare('SELECT * FROM changes WHERE import_id = ?').get(b);
  assert.equal(again.status, 'handled');
  assert.equal(again.note, 'retired in June');
});

test('excluded rows are invisible to the comparison', () => {
  const db = freshDb();
  const a = addImport(db, '2026-07-04');
  addRow(db, a, { emplid: '01111111', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);
  const b = addImport(db, '2026-07-18');
  addRow(db, b, { emplid: '01111111', last: 'SMITH', first: 'JOHN' });
  addRow(db, b, { emplid: '', last: 'JUNKLINE', first: 'X' });
  db.prepare("UPDATE rows SET excluded = 1 WHERE last_name = 'JUNKLINE'").run();
  const s = compare.runCompare(db, b);
  assert.equal(s.stopped + s.new + s.changed, 0);
});
