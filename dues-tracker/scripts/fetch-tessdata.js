'use strict';
// One-time setup: download the OCR language data so the first real import
// doesn't have to. Safe to re-run; skips if already present.
const { ensureTessdata } = require('../lib/ocr');
ensureTessdata(m => console.log(m))
  .then(f => console.log('ready:', f))
  .catch(e => { console.error('failed:', e.message); process.exit(1); });
