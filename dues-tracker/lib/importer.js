'use strict';
/*
 * Import job runner. One import at a time (OCR is CPU-bound); progress is
 * written to the imports row so the UI can poll it. Every import keeps:
 *   - the original upload            data/uploads/import-<id>.pdf
 *   - every rendered page image      data/pages/<id>/p<n>.png
 *   - every parsed row               rows table
 * Nothing is ever overwritten by a later import — full permanent history.
 */
const path = require('path');
const fs = require('fs');
const ocr = require('./ocr');
const parse = require('./parse');
const { getConfig, audit, DATA_DIR } = require('./db');

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

function uploadPath(importId, kind) {
  return path.join(UPLOADS_DIR, `import-${importId}.${kind === 'sheet' ? 'bin' : 'pdf'}`);
}
function pagePath(importId, page) {
  return path.join(PAGES_DIR, String(importId), `p${page}.png`);
}

const queue = [];
let running = false;

function enqueue(db, importId) {
  queue.push(importId);
  pump(db);
}

function pump(db) {
  if (running || !queue.length) return;
  running = true;
  const id = queue.shift();
  processImport(db, id)
    .catch(e => {
      try {
        db.prepare("UPDATE imports SET status = 'failed', error = ? WHERE id = ?")
          .run(String(e && e.message || e).slice(0, 500), id);
        audit(db, 'import_failed', `#${id}: ${e.message}`);
      } catch (_) { /* keep the queue alive */ }
      console.error(`import #${id} failed:`, e);
    })
    .finally(() => { running = false; pump(db); });
}

const insertRow = (db) => db.prepare(`INSERT INTO rows
  (import_id, page, line_no, emplid, name, last_name, first_name, middle_name,
   grade, step, confidence, needs_review, review_reason, ocr_text,
   bx0, by0, bx1, by1, norm_last, norm_first)
  VALUES (@import_id, @page, @line_no, @emplid, @name, @last_name, @first_name, @middle_name,
   @grade, @step, @confidence, @needs_review, @review_reason, @ocr_text,
   @bx0, @by0, @bx1, @by1, @norm_last, @norm_first)`);

async function processImport(db, importId) {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId);
  if (!imp || imp.status !== 'processing') return;
  const threshold = parseFloat(getConfig(db, 'review_threshold')) || 85;
  const zoom = parseFloat(getConfig(db, 'ocr_zoom')) || 4.2;
  const log = (m) => db.prepare('UPDATE imports SET error = ? WHERE id = ?').run(`⏳ ${m}`, importId);

  const buf = fs.readFileSync(uploadPath(importId, imp.kind));
  const { mu, doc, pageCount } = await ocr.openPdf(buf);
  db.prepare('UPDATE imports SET pages = ?, error = ? WHERE id = ?').run(pageCount, '', importId);
  fs.mkdirSync(path.join(PAGES_DIR, String(importId)), { recursive: true });

  const ins = insertRow(db);
  const insPage = db.prepare(
    'INSERT INTO pages (import_id, page, width, height, mode, ocr_ms) VALUES (?, ?, ?, ?, ?, ?)');

  try {
    for (let p = 0; p < pageCount; p++) {
      const t0 = Date.now();
      const { png, width, height, textLines } = ocr.renderPage(mu, doc, p, zoom);
      fs.writeFileSync(pagePath(importId, p + 1), png);

      // Text layer first: if this page carries real text with enough
      // emplid-anchored rows, believe it (confidence 100) and skip OCR.
      let rows = [];
      let mode = 'text';
      if (textLines.length) {
        rows = parse.parseTextLines(textLines);
      }
      if (rows.filter(r => r.emplid).length < 3) {
        mode = 'ocr';
        const words = await ocr.ocrPage(png, log);
        rows = parse.parseWords(words);
      }

      db.transaction(() => {
        rows.forEach((r, i) => {
          const needsReview = r.confidence < threshold || !r.emplid || !r.first_name ? 1 : 0;
          ins.run({
            import_id: importId, page: p + 1, line_no: i + 1,
            emplid: r.emplid, name: r.name,
            last_name: r.last_name, first_name: r.first_name, middle_name: r.middle_name,
            grade: r.grade, step: r.step,
            confidence: r.confidence, needs_review: needsReview,
            review_reason: (r.review_reasons || []).join('; '),
            ocr_text: r.ocr_text,
            bx0: Math.round(r.bx0), by0: Math.round(r.by0),
            bx1: Math.round(r.bx1), by1: Math.round(r.by1),
            norm_last: r.norm_last, norm_first: r.norm_first
          });
        });
        insPage.run(importId, p + 1, width, height, mode, Date.now() - t0);
        db.prepare('UPDATE imports SET pages_done = ? WHERE id = ?').run(p + 1, importId);
      })();
    }
  } finally {
    try { doc.destroy(); } catch (e) { /* wasm cleanup */ }
  }

  // Vocabulary cross-check: a report has a small set of real grades, each
  // appearing many times. A grade seen once or twice is almost always a
  // misread ("LI-01" for "LT-01") that sailed past the confidence bar —
  // flag it. A genuinely rare rank costs one extra confirm; a silent
  // misread would cost a phantom "grade changed" finding every import.
  const totalParsed = db.prepare(
    'SELECT COUNT(*) c FROM rows WHERE import_id = ? AND excluded = 0').get(importId).c;
  if (totalParsed >= 60) {
    db.prepare(`UPDATE rows SET needs_review = 1,
        review_reason = CASE WHEN review_reason = '' THEN 'unusual grade — possible misread'
                             ELSE review_reason || '; unusual grade — possible misread' END
      WHERE import_id = ? AND excluded = 0 AND needs_review = 0 AND grade != '' AND grade IN (
        SELECT grade FROM rows WHERE import_id = ? AND excluded = 0 AND grade != ''
        GROUP BY grade HAVING COUNT(*) <= 2)`).run(importId, importId);
  }

  // The same emplid twice in one report is either an OCR misread or a real
  // report anomaly — either way a human should look at both rows.
  db.prepare(`UPDATE rows SET needs_review = 1,
      review_reason = CASE WHEN review_reason = '' THEN 'duplicate emplid in this import'
                           ELSE review_reason || '; duplicate emplid in this import' END
    WHERE import_id = ? AND emplid != '' AND emplid IN (
      SELECT emplid FROM rows WHERE import_id = ? AND emplid != '' AND excluded = 0
      GROUP BY emplid HAVING COUNT(*) > 1)`).run(importId, importId);

  refreshCounts(db, importId);
  db.prepare("UPDATE imports SET status = 'review', error = '' WHERE id = ?").run(importId);
  const c = db.prepare('SELECT total_rows, flagged_rows FROM imports WHERE id = ?').get(importId);
  audit(db, 'import_ocr_done', `#${importId} ${imp.filename}: ${c.total_rows} rows, ${c.flagged_rows} flagged`);
}

function refreshCounts(db, importId) {
  db.prepare(`UPDATE imports SET
      total_rows = (SELECT COUNT(*) FROM rows WHERE import_id = ? AND excluded = 0),
      flagged_rows = (SELECT COUNT(*) FROM rows WHERE import_id = ? AND excluded = 0
                      AND needs_review = 1 AND reviewed = 0)
    WHERE id = ?`).run(importId, importId, importId);
}

/** Imports killed mid-OCR by a server restart can't resume (worker state is
 *  gone) — mark them failed with a plain-language explanation. */
function failInterrupted(db) {
  db.prepare(`UPDATE imports SET status = 'failed',
      error = 'The server restarted while this was processing. Upload the PDF again.'
    WHERE status = 'processing'`).run();
}

module.exports = { enqueue, refreshCounts, failInterrupted, uploadPath, pagePath, UPLOADS_DIR, PAGES_DIR };
