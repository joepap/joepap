const test = require('node:test');
const assert = require('node:assert');
const AAMVA = require('../public/js/aamva.js');

// Synthetic AAMVA payloads only — never use real license data in tests.
function buildV8(fields) {
  // AAMVA version 08 style payload (modern US licenses).
  const LF = '\n', RS = '\x1e', CR = '\r';
  const elements = Object.entries(fields).map(([k, v]) => k + v).join(LF);
  const subfile = 'DL' + elements + CR;
  const header = '@' + LF + RS + CR + 'ANSI 636000080002DL00410278ZV03190008';
  return header + subfile + 'ZVZVA01' + CR;
}

test('parses a modern (v08) synthetic payload', () => {
  const raw = buildV8({
    DAQ: 'T64235789',            // license number — must NOT appear in output
    DCS: 'SAMPLE',
    DDE: 'N',
    DAC: 'MICHAEL',
    DDF: 'N',
    DAD: 'JOHN',
    DDG: 'N',
    DCU: 'JR',
    DBB: '06061986',             // MMDDCCYY (US)
    DBC: '1',
    DAJ: 'VA',
    DCG: 'USA'
  });
  const p = AAMVA.parse(raw);
  assert.ok(p);
  assert.strictEqual(p.lastName, 'SAMPLE');
  assert.strictEqual(p.firstName, 'MICHAEL');
  assert.strictEqual(p.middleName, 'JOHN');
  assert.strictEqual(p.suffix, 'JR');
  assert.strictEqual(p.dob, '1986-06-06');
  assert.strictEqual(p.state, 'VA');
  // Privacy: license number must never leak through the parser.
  assert.ok(!JSON.stringify(p).includes('T64235789'));
});

test('parses Canadian CCYYMMDD dates via DCG', () => {
  const raw = buildV8({ DCS: 'TREMBLAY', DAC: 'MARIE', DBB: '19901231', DCG: 'CAN', DAJ: 'QC' });
  const p = AAMVA.parse(raw);
  assert.strictEqual(p.dob, '1990-12-31');
});

test('parses old v01-style payload with DAA combined name', () => {
  const raw = '@\n\x1e\rAAMVA6360000102DL00300201DLDAAPUBLIC,JOHN,QUINCY\nDAQ123456789\nDBB19700115\r';
  const p = AAMVA.parse(raw);
  assert.ok(p);
  assert.strictEqual(p.lastName, 'PUBLIC');
  assert.strictEqual(p.firstName, 'JOHN');
  assert.strictEqual(p.middleName, 'QUINCY');
  assert.strictEqual(p.dob, '1970-01-15');
});

test('splits packed given names (DCT, v02 era)', () => {
  const raw = '@\n\x1e\rANSI 6360260201DL00290150DLDCSGARCIA-LOPEZ\nDCTMARIA ELENA\nDBB03251988\nDCGUSA\r';
  const p = AAMVA.parse(raw);
  assert.strictEqual(p.lastName, 'GARCIA-LOPEZ');
  assert.strictEqual(p.firstName, 'MARIA');
  assert.strictEqual(p.middleName, 'ELENA');
  assert.strictEqual(p.dob, '1988-03-25');
});

test('handles keyboard-wedge mangling (CRLF, lost RS)', () => {
  // Wedge scanners often deliver CRLF pairs and drop the RS control char.
  const raw = '@\r\n' + 'ANSI 636000080002DL00410278\r\nDLDCSO\'BRIEN\r\nDACPATRICK\r\nDBB11021979\r\nDCGUSA\r\n';
  const p = AAMVA.parse(raw);
  assert.ok(p);
  assert.strictEqual(p.lastName, "O'BRIEN");
  assert.strictEqual(p.firstName, 'PATRICK');
});

test('treats NONE/UNAVL placeholders as blank', () => {
  const raw = buildV8({ DCS: 'SMITH', DAC: 'ANNA', DAD: 'NONE', DCU: 'UNAVL', DBB: '01011990', DCG: 'USA' });
  const p = AAMVA.parse(raw);
  assert.strictEqual(p.middleName, '');
  assert.strictEqual(p.suffix, '');
});

test('rejects non-AAMVA input', () => {
  assert.strictEqual(AAMVA.parse('hello world'), null);
  assert.strictEqual(AAMVA.parse(''), null);
  assert.strictEqual(AAMVA.parse('https://example.com/qr'), null);
});

test('ageFromDob computes whole years', () => {
  assert.strictEqual(AAMVA.ageFromDob('1986-06-06', '2026-07-11T12:00:00'), 40);
  assert.strictEqual(AAMVA.ageFromDob('1986-08-01', '2026-07-11T12:00:00'), 39);
});
