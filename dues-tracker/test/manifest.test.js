'use strict';
const test = require('node:test');
const assert = require('node:assert');
const m = require('../lib/manifest');

const row = (rel, sha) => ({ rel, source: 'NEP member export', shape: '10 rows × 2 columns', kb: 1, sha: sha || 'aaaaaaaaaaaaaaaa', mtime: '2026-10-12' });

test('a row survives being written and read back', () => {
  const r = row('uploads/roster-71');
  assert.deepEqual(m.parse(m.formatRow(r)), [r]);
});

test('a write on an empty folder keeps every entry — the wipe case', () => {
  // This is the 10 Nov 2026 mistake: the folder was empty, and regenerating
  // the manifest from it threw the record of the rosters away.
  const before = [row('uploads/roster-70'), row('uploads/roster-71')];
  const { rows, kept } = m.merge(before, []);
  assert.deepEqual(rows.map(r => r.rel), ['uploads/roster-70', 'uploads/roster-71']);
  assert.equal(kept.length, 2);
});

test('a new file is added beside the entries whose files are gone', () => {
  const { rows, kept } = m.merge([row('uploads/roster-71')], [row('uploads/register-2026-09-19.pdf', 'bbbbbbbbbbbbbbbb')]);
  assert.deepEqual(rows.map(r => r.rel), ['uploads/register-2026-09-19.pdf', 'uploads/roster-71']);
  assert.deepEqual(kept.map(r => r.rel), ['uploads/roster-71']);
});

test('a file on disk refreshes its own entry', () => {
  const { rows, kept } = m.merge([row('uploads/roster-71', 'aaaaaaaaaaaaaaaa')], [row('uploads/roster-71', 'cccccccccccccccc')]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sha, 'cccccccccccccccc');
  assert.equal(kept.length, 0);
});

test('an entry leaves only when it is named', () => {
  const { rows } = m.merge([row('uploads/roster-70'), row('uploads/roster-71')], [], ['uploads/roster-70']);
  assert.deepEqual(rows.map(r => r.rel), ['uploads/roster-71']);
});

test('roster-9 sorts before roster-10', () => {
  const { rows } = m.merge([row('uploads/roster-10'), row('uploads/roster-9')], []);
  assert.deepEqual(rows.map(r => r.rel), ['uploads/roster-9', 'uploads/roster-10']);
});
