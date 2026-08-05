'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const parse = require('../lib/parse');
const match = require('../lib/match');

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

// Real name shapes from the DC report, found by reconciling against NEP.
test('splitName: suffix in its own comma field does not become the first name', () => {
  const n = parse.splitName('Robinson,Jr.,Karl H');
  assert.equal(n.last, 'Robinson Jr.');
  assert.equal(n.first, 'Karl');
  assert.equal(n.middle, 'H');
});

test('splitName: middle-initial-first rows are read in the right order', () => {
  const a = parse.splitName('Ordile,K. Gregory');   // = Gregory K. Ordile
  assert.equal(a.first, 'Gregory');
  assert.equal(a.middle, 'K.');
  assert.ok(a.reasons.some(r => /middle-initial-first/.test(r)));
  const b = parse.splitName('Mastri,G Nicholas');   // = Nicholas G. Mastri
  assert.equal(b.first, 'Nicholas');
  assert.equal(b.middle, 'G');
});

test('splitName: ordinary LAST,FIRST MIDDLE is untouched by the initial rule', () => {
  const n = parse.splitName('Artz,Randolph Stuart');
  assert.equal(n.first, 'Randolph');
  assert.equal(n.middle, 'Stuart');
  assert.equal(n.reasons.length, 0);
  const m = parse.splitName('Smith,John A');        // trailing initial stays middle
  assert.equal(m.first, 'John');
  assert.equal(m.middle, 'A');
});

test('nickname groups cover the names this local actually uses', () => {
  assert.ok(match.firstNameScore('RANDOLPH', 'RANDY') >= 95);
  assert.ok(match.firstNameScore('TERRENCE', 'TERRY') >= 95);
  assert.ok(match.firstNameScore('JEREMIAH', 'JEREMY') >= 95);
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

// The REAL DC report layout (structure verbatim from a live scan, names
// invented): Dept-ID, masked SSN, emplid, Emp Rec, mixed-case Name,
// deduction code, three money columns, bargaining unit, SRV, grade, step.
test('real DCHR layout: full row with SRV code and 2-digit grade', () => {
  const r = parse.parseRow(words('FB-11520007 xxx-xx-0777 00035373 0 Doe,Michael B DU0405 49.19 49.09 0.10 LAA D13 04 5'));
  assert.equal(r.emplid, '00035373');
  assert.equal(r.name, 'Doe,Michael B');
  assert.equal(r.last_name, 'Doe');
  assert.equal(r.first_name, 'Michael');
  assert.equal(r.grade, '04');
  assert.equal(r.step, '5');
});

test('real DCHR layout: blank SRV column, letter-digit grade', () => {
  const r = parse.parseRow(words('FB-11350003 xxx-xx-4007 00127994 0 Poe,Andrew DU0405 49.19 49.09 0.10 LAA 1C 4'));
  assert.equal(r.emplid, '00127994');
  assert.equal(r.name, 'Poe,Andrew');
  assert.equal(r.grade, '1C');
  assert.equal(r.step, '4');
});

test('real DCHR layout: suffix in name, hyphenated, multi-token given names', () => {
  const r = parse.parseRow(words('FB-11300003 xxx-xx-3726 00002951 0 Adkins Jr.,Donald L DU0405 49.19 49.09 0.10 LAA D13 1B 9'));
  assert.equal(r.name, 'Adkins Jr.,Donald L');
  assert.equal(r.last_name, 'Adkins Jr.');
  assert.equal(r.first_name, 'Donald');
  const r2 = parse.parseRow(words('FB-11500002 xxx-xx-7038 00061004 0 Roe-Babin,Nigel Halim Babatunde DU0405 49.19 49.09 0.10 LAA A01 1D 7'));
  assert.equal(r2.first_name, 'Nigel');
  assert.equal(r2.middle_name, 'Halim Babatunde');
  assert.equal(r2.grade, '1D');
});

test('real DCHR layout: ** grade is a legit blank, not a misread', () => {
  const r = parse.parseRow(words('FB-11620003 xxx-xx-8941 00126644 0 Albright,Julian DU0405 49.19 49.09 0.10 LAA ** 4'));
  assert.equal(r.grade, '');
  assert.equal(r.step, '4');
  assert.ok(!r.review_reasons.some(x => /grade/.test(x)), 'no grade complaint for **');
});

test('real DCHR layout: OCR junk in the Emp Rec column never pollutes the name', () => {
  for (const junk of ['[¢}', 'Q', '8}', '[o}', 'a', '0}']) {
    const r = parse.parseRow(words(`FB-11420000 xxx-xx-3740 00127980 ${junk} Sullivan,Jason Michael DU0405 49.19 49.09 0.10 LAA 01 4`));
    assert.equal(r.name, 'Sullivan,Jason Michael', 'junk: ' + junk);
  }
  // …but real short/apostrophe surnames survive the junk filter.
  const r2 = parse.parseRow(words("FB-11420000 xxx-xx-3740 00127980 0 O'Brien,Sean DU0405 49.19 49.09 0.10 LAA 01 4"));
  assert.equal(r2.last_name, "O'Brien");
  const r3 = parse.parseRow(words('FB-11420000 xxx-xx-3740 00127980 0 Ng,Amy DU0405 49.19 49.09 0.10 LAA 1C 2'));
  assert.equal(r3.last_name, 'Ng');
});

test('real DCHR layout: misread deduction codes stop the name; surnames do not', () => {
  const r = parse.parseRow(words('FB-11330005 xxx-xx-1338 00133041 0 Sullivan,Kevin James DU040S 49.19 49.09 0.10 LAA 01 3'));
  assert.equal(r.name, 'Sullivan,Kevin James');
  const r2 = parse.parseRow(words('FB-11330005 xxx-xx-1338 00133041 0 Bliss,Mark DU0405 49.19 49.09 0.10 LAA 1B 5'));
  assert.equal(r2.name, 'Bliss,Mark');
});

test('grade OCR confusions normalize to the real DC vocabulary', () => {
  const g = s => parse.parseRow(words(`FB-1 xxx-xx-1 00133041 0 Doe,Jane DU0405 49.19 49.09 0.10 LAA ${s} 3`)).grade;
  assert.equal(g('IC'), '1C');
  assert.equal(g('IB'), '1B');
  assert.equal(g('OL'), '01');
  assert.equal(g('0S'), '05');
});

test('real DCHR layout: bank/vendor header lines are dropped', () => {
  assert.equal(parse.parseRow(words('FIRE FIGHTERS ASSOC. LOCAL#36')), null);
  assert.equal(parse.parseRow(words('Government Of The District Of Columbia')), null);
  assert.equal(parse.parseRow(words('Pay Period : 05/31/2026 To: 06/13/2026')), null);
});

test('low word confidence flows into row confidence', () => {
  // Structurally perfect (so it earns the +10 cross-check bonus) but the
  // pixels were barely readable — must still land under the 80 threshold.
  const r = parse.parseRow(words('01234567 SMITH,JOHN A 15551 FF-01 5', 52));
  assert.ok(r.confidence < 80);
});

// Emp Rec debris vs real name parts — found while reconciling the June
// report against NEP, where 28 rows had lost their names entirely.
test('real DCHR layout: SSN fallback recovers the name when the emplid is unreadable', () => {
  // The scan read "00099503" as "000939503" (an extra digit), so the emplid
  // anchor failed. The name must still come through.
  const r = parse.parseRow(words('FB-11450003 XXX-XX-6665 000939503 [4] Allen, Jordin A DU0405 49.19 49.09 0.10 LAA LBR 01 7'));
  assert.equal(r.last_name, 'Allen');
  assert.equal(r.first_name, 'Jordin');
  assert.equal(r.emplid, '');
  assert.ok(r.review_reasons.some(x => /employee ID unreadable/.test(x)));
});

test('real DCHR layout: leading scan debris is stripped, real name parts are not', () => {
  const junk = parse.parseRow(words('FB-1 xxx-xx-1 00099503 Qa MacFawn,Owen Daniel DU0405 49.19 49.09 0.10 LAA 01 5'));
  assert.equal(junk.name, 'MacFawn,Owen Daniel');
  const brace = parse.parseRow(words('FB-1 xxx-xx-1 00099504 jo} Ryan,Gene T DU0405 49.19 49.09 0.10 LAA 1B 9'));
  assert.equal(brace.name, 'Ryan,Gene T');
  // …but a surname before the comma token survives
  const suffix = parse.parseRow(words('FB-1 xxx-xx-1 00002951 0 Adkins Jr.,Donald L DU0405 49.19 49.09 0.10 LAA D13 1B 9'));
  assert.equal(suffix.last_name, 'Adkins Jr.');
  const particle = parse.parseRow(words('FB-1 xxx-xx-1 00099508 0 Van Hagen,John E DU0405 49.19 49.09 0.10 LAA 01 6'));
  assert.equal(particle.last_name, 'Van Hagen');
});
