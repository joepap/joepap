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

test('reports an entry that stops matching, instead of silently doing nothing', () => {
  assert.deepEqual(be.isStale([fowler]), []);
  const stale = be.isStale([]);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].hits, 0);
  // Two records answering to one entry is equally a fault.
  assert.equal(be.isStale([fowler, { ...fowler }])[0].hits, 2);
});
