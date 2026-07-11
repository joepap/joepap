/*
 * Discovery verification: round-trip a synthetic AAMVA payload through a
 * real PDF417 barcode image and decode it with zxing-wasm via the ImageData
 * path — the exact same input type the browser camera scanner feeds it
 * (video frame -> canvas -> getImageData -> readBarcodes).
 *
 * Gotchas this test encodes (found during discovery):
 *  - bwip-js renders a TRANSPARENT background by default; zxing sees all
 *    black and decodes nothing. backgroundcolor:'FFFFFF' is required.
 *  - zxing-wasm's default textMode escapes control chars as literal "<LF>"
 *    strings; AAMVA parsing needs textMode:'Plain' for raw bytes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const bwipjs = require('bwip-js');
const { PNG } = require('pngjs');
const AAMVA = require('../public/js/aamva.js');

const SYNTHETIC_AAMVA =
  '@\n\x1e\rANSI 636000080002DL00410278ZV03190008DL' +
  ['DAQT64235789', 'DCSSAMPLE', 'DDEN', 'DACMICHAEL', 'DDFN', 'DADJOHN',
   'DDGN', 'DCUJR', 'DBB06061986', 'DBC1', 'DAJVA', 'DCGUSA'].join('\n') + '\r';

test('zxing-wasm decodes a PDF417 barcode containing AAMVA data', async () => {
  const { readBarcodes, prepareZXingModule } = require('zxing-wasm/reader');

  // In Node there is no fetch-able wasm URL; hand the module the binary.
  prepareZXingModule({
    overrides: {
      wasmBinary: fs.readFileSync(path.join(
        __dirname, '..', 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm'
      )).buffer
    }
  });

  const png = PNG.sync.read(await bwipjs.toBuffer({
    bcid: 'pdf417',
    text: SYNTHETIC_AAMVA,
    scale: 3,
    padding: 10,
    backgroundcolor: 'FFFFFF'
  }));

  const imageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height
  };

  const results = await readBarcodes(imageData, {
    formats: ['PDF417'],
    tryHarder: true,
    textMode: 'Plain'
  });

  assert.strictEqual(results.length, 1, 'expected exactly one barcode');
  assert.strictEqual(results[0].format, 'PDF417');
  assert.ok(results[0].isValid);
  assert.strictEqual(results[0].text, SYNTHETIC_AAMVA, 'byte-exact round trip');

  const parsed = AAMVA.parse(results[0].text);
  assert.ok(parsed, 'decoded text should parse as AAMVA');
  assert.strictEqual(parsed.lastName, 'SAMPLE');
  assert.strictEqual(parsed.firstName, 'MICHAEL');
  assert.strictEqual(parsed.dob, '1986-06-06');
  // Privacy: the license number from the barcode must never survive parsing.
  assert.ok(!JSON.stringify(parsed).includes('T64235789'));
});
