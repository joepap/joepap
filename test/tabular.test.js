const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const tabular = require('../lib/tabular.js');

test('parseUpload reads xlsx buffers (ConnectPlus export format)', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['First Name', 'Last Name', 'Member Status', 'Status', 'Date of Birth'],
    ['Joseph', 'Sample', 'Active', 'approved', '6/6/1986'],
    ['Maria', 'Garcia-Lopez', 'Drop', 'invited', ''],
    ['', '', '', '', ''] // trailing empty row must be dropped
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const { headers, records } = tabular.parseUpload(buf, 'members_export.xlsx');
  assert.deepStrictEqual(headers.slice(0, 2), ['First Name', 'Last Name']);
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0]['Last Name'], 'Sample');
  assert.strictEqual(records[1]['Member Status'], 'Drop');
});

test('parseUpload still handles CSV buffers', () => {
  const { headers, records } = tabular.parseUpload(Buffer.from('a,b\r\n1,2\r\n'), 'x.csv');
  assert.deepStrictEqual(headers, ['a', 'b']);
  assert.strictEqual(records[0].a, '1');
});

test('distincts reports low-cardinality columns only', () => {
  const headers = ['status', 'name'];
  const records = [];
  for (let i = 0; i < 100; i++) {
    records.push({ status: i % 2 ? 'Active' : 'Drop', name: 'n' + i });
  }
  const d = tabular.distincts(headers, records, 20);
  assert.deepStrictEqual(d.status.map(v => v.value).sort(), ['Active', 'Drop']);
  assert.strictEqual(d.name, undefined); // 100 distinct values — omitted
});
