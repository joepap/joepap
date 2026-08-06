'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const dblib = require('../lib/db');
const reconcile = require('../lib/reconcile');
const match = require('../lib/match');

function freshDb() { return dblib.open(':memory:'); }

function addDues(db, rows) {
  const id = db.prepare(
    "INSERT INTO imports (filename, report_date, status) VALUES ('r.pdf', '2026-07-18', 'ready')")
    .run().lastInsertRowid;
  const ins = db.prepare(`INSERT INTO rows (import_id, emplid, name, last_name, first_name,
      grade, step, confidence, norm_last, norm_first) VALUES (?, ?, ?, ?, ?, 'FF-01', '5', 100, ?, ?)`);
  rows.forEach(r => ins.run(id, r.emplid, r.last + ',' + r.first, r.last, r.first,
    match.normalizeName(r.last), match.normalizeName(r.first)));
  return id;
}

function addRoster(db, source, members) {
  const recs = members.map(m => ({
    'Member Number': m.no || '', 'Last Name': m.last, 'First Name': m.first,
    'Member Status': m.status || 'Active', 'Work Status': m.work || 'Active Member'
  }));
  return reconcile.importRoster(db, source, recs, {
    member_no: 'Member Number', last_name: 'Last Name', first_name: 'First Name',
    status: 'Member Status', work_status: 'Work Status'
  }, source + '.csv');
}

test('full_name splitting handles both comma and natural order', () => {
  const db = freshDb();
  reconcile.importRoster(db, 'nep',
    [{ N: 'GARCIA, MARIA L' }, { N: 'John Q Smith' }], { full_name: 'N' }, 'x.csv');
  const rows = db.prepare('SELECT * FROM roster_members ORDER BY id').all();
  assert.deepEqual([rows[0].last_name, rows[0].first_name, rows[0].middle_name], ['GARCIA', 'MARIA', 'L']);
  assert.deepEqual([rows[1].last_name, rows[1].first_name, rows[1].middle_name], ['Smith', 'John', 'Q']);
});

test('dues vs NEP: enroll list, not-paying list, retired-but-paying', () => {
  const db = freshDb();
  addDues(db, [
    { emplid: '01111111', last: 'SMITH', first: 'JOHN' },      // in NEP (as nickname JACK)
    { emplid: '02222222', last: 'NGUYEN', first: 'LINH' },     // NOT in NEP -> enroll
    { emplid: '03333333', last: 'ROSSI', first: 'MARIO' }      // in NEP but marked retired
  ]);
  addRoster(db, 'nep', [
    { no: '100', last: 'SMITH', first: 'JACK' },               // nickname of JOHN
    { no: '101', last: 'ROSSI', first: 'MARIO', status: 'Retired', work: 'Retired Member' },
    { no: '102', last: 'DAVIS', first: 'ANNE' },               // active, not paying
    { no: '103', last: 'OLDMAN', first: 'GARY', status: 'Retired', work: 'Retired Member' } // retired, fine
  ]);
  const r = reconcile.reconcile(db);
  assert.deepEqual(r.payingNotInNep.map(x => x.emplid), ['02222222']);
  assert.deepEqual(r.nepActiveNotPaying.map(x => x.name), ['DAVIS,ANNE']);
  assert.deepEqual(r.payingButRetiredInNep.map(x => x.name), ['ROSSI,MARIO']);
  assert.equal(r.counts.nep_active, 2);
  assert.equal(r.counts.nep_retired, 2);
});

test('NEP vs IAFF: member number wins, name is fallback, gaps listed', () => {
  const db = freshDb();
  addRoster(db, 'nep', [
    { no: '100', last: 'SMITH', first: 'JOHN' },
    { no: '101', last: 'GARCIA', first: 'MARIA' },
    { no: '102', last: 'ONLYNEP', first: 'PAT' }
  ]);
  addRoster(db, 'iaff', [
    { no: '100', last: 'SMITH', first: 'JOHN' },
    { no: '999', last: 'GARCIA', first: 'MARIA' },   // different number, same person -> name match
    { no: '500', last: 'ONLYIAFF', first: 'SAM' }
  ]);
  const r = reconcile.reconcile(db);
  assert.deepEqual(r.inNepNotIaff.map(x => x.name), ['ONLYNEP,PAT']);
  assert.deepEqual(r.inIaffNotNep.map(x => x.name), ['ONLYIAFF,SAM']);
});

test('two different people with the same name both match (one-to-one)', () => {
  const db = freshDb();
  addDues(db, [
    { emplid: '01111111', last: 'STEVENS', first: 'JENNIFER' },
    { emplid: '02222222', last: 'STEVENS', first: 'JENNIFER' }   // a second, different Jennifer
  ]);
  addRoster(db, 'nep', [
    { no: '100', last: 'STEVENS', first: 'JENNIFER' },
    { no: '101', last: 'STEVENS', first: 'JENNIFER' }
  ]);
  const r = reconcile.reconcile(db);
  assert.equal(r.payingNotInNep.length, 0, 'both dues rows find a NEP member');
  assert.equal(r.nepActiveNotPaying.length, 0, 'both NEP members are claimed');
});

test('latest snapshot wins; history is kept', () => {
  const db = freshDb();
  addRoster(db, 'nep', [{ no: '1', last: 'OLD', first: 'DATA' }]);
  addRoster(db, 'nep', [{ no: '2', last: 'NEW', first: 'DATA' }, { no: '3', last: 'ALSO', first: 'NEW' }]);
  const r = reconcile.reconcile(db);
  assert.equal(r.counts.nep_members, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM rosters').get().c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM roster_members').get().c, 3);
});

test('workbook builds with all six sheets', () => {
  const db = freshDb();
  addDues(db, [{ emplid: '01111111', last: 'SMITH', first: 'JOHN' }]);
  addRoster(db, 'nep', [{ no: '100', last: 'SMITH', first: 'JOHN' }]);
  const wb = reconcile.buildReconcileWorkbook(db);
  assert.equal(wb.SheetNames.length, 6);
  assert.equal(wb.SheetNames[0], 'Summary');
});

test('a tie is never won by an empty leftover record', () => {
  // The payroll's "Wheeler,Berl D" landed on a blank "Wheeler Sr., Berl"
  // instead of the live "Wheeler, Berl D", and that misassignment then read
  // as evidence the two records were one person. Five payroll rows were
  // sitting on a hollow record this way before it was caught.
  const db = freshDb();
  addDues(db, [{ emplid: '00006229', last: 'Wheeler', first: 'Berl' }]);
  // the empty leftover is inserted FIRST, so insertion order alone favours it
  reconcile.importRoster(db, 'nep', [
    { 'Member Number': '', 'Last Name': 'Wheeler Sr.', 'First Name': 'Berl',
      'Member Status': '', 'Work Status': '' },
    { 'Member Number': '1115948', 'Last Name': 'Wheeler', 'First Name': 'Berl D',
      'Member Status': 'Active', 'Work Status': 'Active Member' }
  ], { member_no: 'Member Number', last_name: 'Last Name', first_name: 'First Name',
       status: 'Member Status', work_status: 'Work Status' }, 'nep.csv');

  const r = reconcile.reconcile(db);
  // the live record is the one that got the dues line, so it is not on the
  // "active but not paying" list; the hollow one has no status so it is not
  // active-ish and never appears either way
  assert.equal(r.payingNotInNep.length, 0, 'Berl should match somebody');
  assert.deepEqual(r.nepActiveNotPaying.map(x => x.name), [],
    'the live Wheeler record must be the one holding the dues line');
});
