const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/match.js');

test('normalizeName strips punctuation, diacritics, case', () => {
  assert.strictEqual(M.normalizeName("O'Brien"), 'OBRIEN');
  assert.strictEqual(M.normalizeName('García-López'), 'GARCIA LOPEZ');
  assert.strictEqual(M.normalizeName('St. James'), 'ST JAMES');
});

test('nameTokens drops suffixes', () => {
  assert.deepStrictEqual(M.nameTokens('Smith Jr'), ['SMITH']);
  assert.deepStrictEqual(M.nameTokens('Davis III'), ['DAVIS']);
});

test('nickname matching: Joe/Joseph, Mike/Michael', () => {
  assert.ok(M.firstNameScore('JOE', 'JOSEPH') >= 95);
  assert.ok(M.firstNameScore('MIKE', 'MICHAEL') >= 95);
  assert.ok(M.firstNameScore('PEGGY', 'MARGARET') >= 95);
  assert.ok(M.firstNameScore('ALICE', 'BRENDA') < 60);
});

test('hyphenated last names match either part', () => {
  assert.ok(M.lastNameScore('GARCIA-LOPEZ', 'GARCIA') >= 90);
  assert.ok(M.lastNameScore('GARCIA', 'GARCIA-LOPEZ') >= 90);
  assert.strictEqual(M.lastNameScore('GARCIA-LOPEZ', 'GARCIA LOPEZ'), 100);
});

test('typo tolerance on last names', () => {
  assert.ok(M.lastNameScore('SULIVAN', 'SULLIVAN') >= 75);
  assert.ok(M.lastNameScore('SMITH', 'JOHNSON') < 45);
});

test('scoreCandidate: license name vs roster member', () => {
  const member = { norm_last: 'OBRIEN', norm_first: 'JOSEPH' };
  // license says O'BRIEN, JOE — roster has O'Brien, Joseph
  const s = M.scoreCandidate({ lastName: "O'BRIEN", firstName: 'JOE' }, member);
  assert.ok(s >= 90, `expected >=90, got ${s}`);
  // completely different person scores low
  const s2 = M.scoreCandidate({ lastName: 'WILLIAMS', firstName: 'TANYA' }, member);
  assert.ok(s2 < M.MATCH_THRESHOLD, `expected <${M.MATCH_THRESHOLD}, got ${s2}`);
});

test('suffix on the license does not break matching', () => {
  const member = { norm_last: 'DAVIS', norm_first: 'ROBERT' };
  const s = M.scoreCandidate({ lastName: 'DAVIS JR', firstName: 'BOB' }, member);
  assert.ok(s >= 90, `expected >=90, got ${s}`);
});
