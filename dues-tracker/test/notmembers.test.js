'use strict';
const test = require('node:test');
const assert = require('node:assert');
const nm = require('../lib/notmembers');

test('a known non-member is recognised by employee number', () => {
  assert.equal(nm.isNotMember('00078079'), true);
  assert.equal(nm.isNotMember(' 00078079 '), true);   // whitespace from a sheet
  assert.equal(nm.isNotMember('00078078'), false);
});

test('non-members are dropped from a people list', () => {
  const people = [{ emplid: '00078079' }, { emplid: '00035373' }, { emplid: '00127967' }];
  assert.deepEqual(nm.withoutNonMembers(people).map(p => p.emplid),
    ['00035373', '00127967']);
});

test('the reason survives, so a report can say why somebody was dropped', () => {
  const why = nm.whyNotMember('00078079');
  assert.match(why.name, /O'Byrne/);
  assert.match(why.why, /single-role EMS/);
  assert.equal(nm.whyNotMember('00000000'), null);
});

test('a non-member ON a dues register is surfaced, never silently filtered', () => {
  // Rank cannot identify these people, so the registry is a human judgement —
  // and a human judgement contradicted by a paycheck has to reach a person.
  const register = [{ emplid: '00035373' }, { emplid: '00078079' }];
  const surprises = nm.shouldHaveNoDues(register);
  assert.equal(surprises.length, 1);
  assert.match(surprises[0].name, /O'Byrne/);
  assert.equal(nm.shouldHaveNoDues([{ emplid: '00035373' }]).length, 0);
});
