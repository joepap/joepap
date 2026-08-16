'use strict';
/*
 * PDF rendering + OCR for the scanned dues report.
 *
 * - Pages are rendered to PNG with mupdf (WASM — no native binaries) at
 *   ~300 dpi and kept on disk forever: the review screen crops these exact
 *   images so the treasurer can compare OCR output against the real scan.
 * - OCR is tesseract.js. Language data comes from GitHub raw (the jsDelivr
 *   CDN tesseract.js defaults to is blocked on some networks — a lesson
 *   from the first prototype), downloaded once into data/tessdata/ and
 *   loaded from that local cache on every later run.
 * - If a page has a usable text layer (digital PDF, or the scanner already
 *   OCR'd it), we trust that instead — confidence 100, no tesseract pass.
 */
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('./db');

const TESSDATA_DIR = path.join(DATA_DIR, 'tessdata');
// tessdata_best = float LSTM models, the most accurate — right choice for a
// financial record read twice a month. (tessdata_fast would be ~2x quicker.)
const TESSDATA_URL = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata';

let _mupdf = null;
async function mupdf() {
  if (!_mupdf) _mupdf = await import('mupdf');   // ESM module from CJS
  return _mupdf;
}

async function ensureTessdata(log) {
  const file = path.join(TESSDATA_DIR, 'eng.traineddata');
  if (fs.existsSync(file) && fs.statSync(file).size > 1e6) return file;
  fs.mkdirSync(TESSDATA_DIR, { recursive: true });
  if (log) log('downloading OCR language data (one time, ~15 MB)…');
  const res = await fetch(TESSDATA_URL);
  if (!res.ok) throw new Error(`tessdata download failed: HTTP ${res.status} — check the mini's internet and retry`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1e6) throw new Error('tessdata download came back too small — retry');
  fs.writeFileSync(file + '.tmp', buf);
  fs.renameSync(file + '.tmp', file);
  if (log) log('OCR language data ready');
  return file;
}

/** Open a PDF buffer; returns { doc, pageCount, mu }. */
async function openPdf(buffer) {
  const mu = await mupdf();
  const doc = mu.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
  return { mu, doc, pageCount: doc.countPages() };
}

/**
 * Render page `idx` (0-based) at `zoom` and return
 * { png (Buffer), width, height, textLines } where textLines are the page's
 * embedded text-layer lines (empty for a pure scan) with boxes already
 * scaled to image pixels.
 */
function renderPage(mu, doc, idx, zoom, rotated) {
  const page = doc.loadPage(idx);
  try {
    // A duplex scanner feeds the back of each sheet through upside down —
    // the July 2026 report arrived that way, every even page rotated 180°.
    // Rendering righted keeps the review-screen crops readable too.
    const matrix = rotated
      ? mu.Matrix.concat(mu.Matrix.scale(zoom, zoom), mu.Matrix.rotate(180))
      : mu.Matrix.scale(zoom, zoom);
    const pix = page.toPixmap(matrix, mu.ColorSpace.DeviceRGB, false, true);
    const png = Buffer.from(pix.asPNG());
    const width = pix.getWidth(), height = pix.getHeight();
    pix.destroy();

    const textLines = [];
    // Text-layer boxes come out in unrotated coordinates, so a rotated
    // render skips the text layer — rotation only ever happens for pure
    // scans anyway.
    try {
      if (rotated) throw new Error('skip');
      const st = page.toStructuredText('preserve-whitespace');
      const j = JSON.parse(st.asJSON(zoom));   // scale puts boxes in image px
      st.destroy();
      for (const block of j.blocks || []) {
        for (const line of block.lines || []) {
          const text = String(line.text || '').trim();
          if (!text) continue;
          const b = line.bbox || {};
          textLines.push({
            text,
            x0: b.x || 0, y0: b.y || 0,
            x1: (b.x || 0) + (b.w || 0), y1: (b.y || 0) + (b.h || 0)
          });
        }
      }
    } catch (e) { /* no text layer — OCR it */ }

    return { png, width, height, textLines };
  } finally {
    page.destroy();
  }
}

/**
 * Shared tesseract worker, created on first use, reused across pages and
 * imports (worker startup costs seconds). PSM 6 = "one uniform block" —
 * right for a full-page table; we re-cluster rows from word boxes anyway.
 */
let _worker = null;
async function worker(log) {
  if (_worker) return _worker;
  await ensureTessdata(log);
  const { createWorker, OEM } = require('tesseract.js');
  _worker = await createWorker('eng', OEM.LSTM_ONLY, {
    cachePath: TESSDATA_DIR,           // pre-seeded — no network fetch
    langPath: path.dirname(TESSDATA_URL),
    gzip: false
  });
  await _worker.setParameters({ tessedit_pageseg_mode: '6' });
  return _worker;
}

/** OCR a PNG buffer → [{ text, conf, x0, y0, x1, y1 }] */
async function ocrPage(png, log) {
  const w = await worker(log);
  const { data } = await w.recognize(png);
  return (data.words || []).map(wd => ({
    text: wd.text,
    conf: wd.confidence,
    x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1
  }));
}

async function shutdown() {
  if (_worker) { try { await _worker.terminate(); } catch (e) { /* exiting */ } _worker = null; }
}

module.exports = { openPdf, renderPage, ocrPage, ensureTessdata, shutdown, TESSDATA_DIR };
