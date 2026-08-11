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

// ---- explaining why a payer stopped ---------------------------------------

function addTelestaff(db, people) {
  const id = db.prepare("INSERT INTO rosters (source, filename, total) VALUES ('telestaff','t.csv',?)")
    .run(people.length).lastInsertRowid;
  const ins = db.prepare(`INSERT INTO roster_members
    (roster_id, emplid, last_name, first_name, rank, platoon, norm_last, norm_first)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of people) {
    ins.run(id, p.emplid, p.last, p.first, p.rank || 'Firefighter', p.platoon || '',
      match.normalizeName(p.last), match.normalizeName(p.first));
  }
  return id;
}

// Botwin, August 2026: on the June report as a paying member, already a
// battalion chief in telestaff, gone from the next report. Nothing in the app
// said why, so he sat in NEP as Active.
test('a payer who stopped after being promoted out is named as such', () => {
  const db = freshDb();
  const a = addImport(db, '2026-06-13', 'ready');
  addRow(db, a, { emplid: '00007652', last: 'BOTWIN', first: 'JONATHAN' });
  addRow(db, a, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);

  addTelestaff(db, [
    { emplid: '00007652', last: 'Botwin', first: 'Jonathan M', rank: 'Battalion Fire Chief' },
    { emplid: '00099407', last: 'Smith', first: 'John', rank: 'Firefighter', platoon: 'Platoon 1' }
  ]);

  const b = addImport(db, '2026-06-27');
  addRow(db, b, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  const s = compare.runCompare(db, b);

  assert.equal(s.stopped, 1);
  assert.equal(s.stoppedBecause.promotedOut, 1);
  const f = db.prepare("SELECT * FROM changes WHERE import_id = ? AND kind = 'stopped'").get(b);
  assert.equal(f.reason, 'promoted-out');
  assert(/Battalion Fire Chief/.test(f.detail));
  assert(/set NEP Member Status to Drop/.test(f.detail));
});

test('a payer telestaff has never heard of has left the department', () => {
  const db = freshDb();
  const a = addImport(db, '2026-06-13', 'ready');
  addRow(db, a, { emplid: '00007652', last: 'RETIREE', first: 'ROBERT' });
  compare.runCompare(db, a);
  addTelestaff(db, [{ emplid: '00099407', last: 'Smith', first: 'John' }]);
  const b = addImport(db, '2026-06-27');
  addRow(db, b, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  const s = compare.runCompare(db, b);
  assert.equal(s.stoppedBecause.leftDepartment, 1);
});

test('still working and still in the unit is a real question, not an answer', () => {
  const db = freshDb();
  const a = addImport(db, '2026-06-13', 'ready');
  addRow(db, a, { emplid: '00007652', last: 'WITHDREW', first: 'WILLIAM' });
  addRow(db, a, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);
  addTelestaff(db, [
    { emplid: '00007652', last: 'Withdrew', first: 'William', rank: 'Sergeant', platoon: 'Platoon 3' },
    { emplid: '00099407', last: 'Smith', first: 'John' }
  ]);
  const b = addImport(db, '2026-06-27');
  addRow(db, b, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  const s = compare.runCompare(db, b);
  assert.equal(s.stoppedBecause.stillWorking, 1);
  const f = db.prepare("SELECT * FROM changes WHERE import_id = ? AND kind = 'stopped'").get(b);
  assert(/payroll error, or they withdrew/.test(f.detail));
});

// Without a telestaff upload the old behaviour must survive unchanged —
// silence, not a guess.
test('no telestaff snapshot leaves stopped payers unexplained', () => {
  const db = freshDb();
  const a = addImport(db, '2026-06-13', 'ready');
  addRow(db, a, { emplid: '00007652', last: 'GONE', first: 'GEORGE' });
  addRow(db, a, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);
  const b = addImport(db, '2026-06-27');
  addRow(db, b, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  const s = compare.runCompare(db, b);
  assert.equal(s.stopped, 1);
  assert.equal(s.stoppedBecause.unexplained, 1);
  assert.equal(s.stoppedBecause.leftDepartment, 0);
});

// The scan mangles employee numbers, so the name is the fallback — but only
// when it points at exactly one person. Two brothers must not resolve.
test('a mangled employee number falls back to a clear name match', () => {
  const db = freshDb();
  const a = addImport(db, '2026-06-13', 'ready');
  addRow(db, a, { emplid: '00007653', last: 'BOTWIN', first: 'JONATHAN' });
  addRow(db, a, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);
  addTelestaff(db, [
    { emplid: '00007652', last: 'Botwin', first: 'Jonathan M', rank: 'Battalion Fire Chief' },
    { emplid: '00099407', last: 'Smith', first: 'John' }
  ]);
  const b = addImport(db, '2026-06-27');
  addRow(db, b, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  assert.equal(compare.runCompare(db, b).stoppedBecause.promotedOut, 1);
});

test('two people with the same name settle nothing', () => {
  const db = freshDb();
  const a = addImport(db, '2026-06-13', 'ready');
  addRow(db, a, { emplid: '00007653', last: 'HARRIS', first: 'JASON' });
  addRow(db, a, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  compare.runCompare(db, a);
  addTelestaff(db, [
    { emplid: '00113839', last: 'Harris', first: 'Jason', rank: 'Battalion Fire Chief' },
    { emplid: '00118028', last: 'Harris', first: 'Jason', rank: 'Firefighter' },
    { emplid: '00099407', last: 'Smith', first: 'John' }
  ]);
  const b = addImport(db, '2026-06-27');
  addRow(db, b, { emplid: '00099407', last: 'SMITH', first: 'JOHN' });
  const s = compare.runCompare(db, b);
  assert.equal(s.stoppedBecause.promotedOut, 0, 'must not pick one of two Jason Harrises');
  assert.equal(s.stoppedBecause.leftDepartment, 1);
});
