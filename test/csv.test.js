const test = require('node:test');
const assert = require('node:assert');
const csv = require('../lib/csv.js');

test('parses quoted fields with commas, quotes, newlines', () => {
  const rows = csv.parse('a,"b,1","say ""hi""","line1\nline2"\r\nx,y,z,w\r\n');
  assert.deepStrictEqual(rows[0], ['a', 'b,1', 'say "hi"', 'line1\nline2']);
  assert.deepStrictEqual(rows[1], ['x', 'y', 'z', 'w']);
});

test('parseWithHeaders maps records and strips BOM', () => {
  const { headers, records } = csv.parseWithHeaders('﻿Name,Member #\r\n"Smith, Jo",L36-1\r\n');
  assert.deepStrictEqual(headers, ['Name', 'Member #']);
  assert.strictEqual(records[0]['Name'], 'Smith, Jo');
  assert.strictEqual(records[0]['Member #'], 'L36-1');
});

test('serialize round-trips through parse', () => {
  const out = csv.serialize(['a', 'b'], [{ a: 'x,1', b: 'he said "y"' }]);
  const back = csv.parse(out);
  assert.deepStrictEqual(back[1], ['x,1', 'he said "y"']);
});
