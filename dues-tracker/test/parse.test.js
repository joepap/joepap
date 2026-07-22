'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const parse = require('../lib/parse');

function words(str, conf) {
  // Fake a row of OCR words with plausible boxes.
  let x = 10;
  return str.split(/\s+/).map(t => {
    const w = { text: t, conf: conf == null ? 95 : conf, x0: x, y0: 100, x1: x + t.length * 9, y1: 118 };
    x += t.length * 9 + 12;
    return w;
  });
}

test('emplid anchor: accepts 0-leading, rejects dept numbers starting with 1', () => {
  assert.ok(parse.asEmplid('01234567'));
  assert.equal(parse.asEmplid('11234567'), null);   // dept-number trap
  assert.equal(parse.asEmplid('1234567'), null);    // 7 digits
  assert.equal(parse.asEmplid('012345678'), null);  // 9 digits
});

test('emplid anchor: fixes common OCR confusions', () => {
  const e = parse.asEmplid('O12345б7'.replace('б', 'S'));  // O→0, S→5
  assert.ok(e);
  assert.equal(e.value, '01234557');
  assert.equal(e.fixes, 2);
});

test('parses a clean report row, ignoring the dept number', () => {
  const r = parse.parseRow(words('01234567 SMITH,JOHN A 15551 FF-01 5'));
  assert.equal(r.emplid, '01234567');
  assert.equal(r.last_name, 'SMITH');
  assert.equal(r.first_name, 'JOHN');
  assert.equal(r.middle_name, 'A');
  assert.equal(r.grade, 'FF-01');
  assert.equal(r.step, '5');
  assert.ok(r.confidence > 85);
});

test('dept number before the emplid never becomes the anchor', () => {
  const r = parse.parseRow(words('15551 01234567 SMITH,JOHN FF-01 5'));
  assert.equal(r.emplid, '01234567');
  assert.equal(r.last_name, 'SMITH');
});

test('header and footer lines are dropped', () => {
  assert.equal(parse.parseRow(words('EMPLID NAME DEPT GRADE STEP')), null);
  assert.equal(parse.parseRow(words('PAGE 3 OF 52 RUN DATE 07/04/2026')), null);
  assert.equal(parse.parseRow(words('UNION DUES DEDUCTION REGISTER')), null);
});

test('a name-like line with a mangled emplid is kept and flagged, not dropped', () => {
  const r = parse.parseRow(words('R723A567 GARCIA,MARIA L 14421 FF-02 3'));
  assert.ok(r, 'row must survive');
  assert.equal(r.emplid, '');
  assert.ok(r.review_reasons.some(x => /no emplid/.test(x)));
  assert.ok(r.confidence <= 40);
});

test('missing grade/step caps confidence below review threshold', () => {
  const r = parse.parseRow(words('01234567 SMITH,JOHN'));
  assert.ok(r.confidence <= 70);
  assert.ok(r.review_reasons.some(x => /grade|step/.test(x)));
});

test('splitName handles LAST,FIRST M and flags missing commas', () => {
  assert.deepEqual(
    (({ last, first, middle }) => ({ last, first, middle }))(parse.splitName('DE LA CRUZ,JOSE A')),
    { last: 'DE LA CRUZ', first: 'JOSE', middle: 'A' });
  const noComma = parse.splitName('SMITH JOHN');
  assert.equal(noComma.last, 'SMITH');
  assert.ok(noComma.reasons.length > 0);
});

test('clusterRows groups words by line and sorts left-to-right', () => {
  const rows = parse.clusterRows([
    { text: 'B', conf: 90, x0: 50, y0: 100, x1: 60, y1: 115 },
    { text: 'A', conf: 90, x0: 10, y0: 102, x1: 20, y1: 117 },
    { text: 'C', conf: 90, x0: 10, y0: 140, x1: 20, y1: 155 }
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].map(w => w.text), ['A', 'B']);
});

test('low word confidence flows into row confidence', () => {
  // Structurally perfect (so it earns the +10 cross-check bonus) but the
  // pixels were barely readable — must still land under the 80 threshold.
  const r = parse.parseRow(words('01234567 SMITH,JOHN A 15551 FF-01 5', 52));
  assert.ok(r.confidence < 80);
});
