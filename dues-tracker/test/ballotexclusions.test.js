'use strict';
const test = require('node:test');
const assert = require('node:assert');
const be = require('../lib/ballotexclusions');

const fowler = { 'Last Name': 'Fowler', 'First Name': 'Charles L', 'Date of Birth': '07/14/1944' };

test('leaves out the member Joe marked deceased', () => {
  const e = be.excludedReason(fowler);
  assert.ok(e);
  assert.equal(e.reason, 'deceased');
  assert.match(e.who, /Joe/);
});

test('a name alone is not enough — every field an entry names must agree', () => {
  // Same name, different man. The roll holds real father-and-son pairs, so a
  // surname and a first name must never be sufficient on their own.
  assert.equal(be.excludedReason({ ...fowler, 'Date of Birth': '01/01/1960' }), null);
  assert.equal(be.excludedReason({ 'Last Name': 'Fowler', 'First Name': 'Charles' }), null);
  assert.equal(be.excludedReason({ 'Last Name': 'Fowler' }), null);
});

test('excludes nobody it was not told about', () => {
  assert.equal(be.excludedReason({ 'Last Name': 'Papariello', 'First Name': 'Joseph' }), null);
  assert.equal(be.excludedReason({}), null);
});

test('a resolved entry is expected to match nothing', () => {
  // Fowler left the roster once he was marked deceased, so his entry matching
  // no record is the correct end state, not a fault to report every run.
  assert.ok(be.EXCLUDED.every(e => !e.resolved || e.reason));
  assert.deepEqual(be.isStale([]), []);
});

test('but reports a resolved entry whose record has come back', () => {
  const back = be.isStale([fowler]);
  assert.equal(back.length, 1);
  assert.equal(back[0].hits, 1);
});

test('reports an unresolved entry that matches the wrong number of records', () => {
  const open = { lastName: 'Nobody', firstName: 'At All', reason: 'test', who: 'test' };
  const saved = be.EXCLUDED.slice();
  be.EXCLUDED.length = 0; be.EXCLUDED.push(open);
  try {
    assert.equal(be.isStale([]).length, 1, 'matching none is a fault while unresolved');
    const one = [{ 'Last Name': 'Nobody', 'First Name': 'At All' }];
    assert.equal(be.isStale(one).length, 0, 'matching exactly one is right');
    assert.equal(be.isStale([...one, ...one])[0].hits, 2, 'matching two is a fault');
  } finally { be.EXCLUDED.length = 0; be.EXCLUDED.push(...saved); }
});
