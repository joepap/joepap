'use strict';
/*
 * The deliverable of each run: an import-ready workbook for NEP
 * (ConnectPlus). NEP tracks dues with a per-year checkbox ("2026 Dues") —
 * sheet 1 is the list of people to mark paid for the current year, and the
 * stopped-payers sheet is the follow-up list.
 */
const XLSX = require('xlsx');

function buildNepWorkbook(db, importId) {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId);
  if (!imp) throw new Error('import not found');
  const prev = imp.compared_to
    ? db.prepare('SELECT * FROM imports WHERE id = ?').get(imp.compared_to) : null;
  const year = imp.dues_year || String(new Date().getFullYear());
  const label = i => (i.report_date || i.uploaded_at.slice(0, 10));

  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, note) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: note || 'no rows' }]);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  };

  // Sheet 1 — mark these people paid for the year in NEP.
  addSheet(`Mark Paid - ${year} Dues`, db.prepare(`
    SELECT last_name "Last Name", first_name "First Name", middle_name "Middle Name",
           emplid "Emplid", grade "Grade", step "Step",
           'Yes' "${year} Dues",
           CASE WHEN needs_review = 1 AND reviewed = 0 THEN 'CHECK — low OCR confidence' ELSE '' END "Flag"
    FROM rows WHERE import_id = ? AND excluded = 0
    ORDER BY last_name, first_name`).all(importId));

  const changeRows = kind => db.prepare(`
    SELECT c.name "Name", c.emplid "Emplid", c.detail "Detail",
           c.status "Status", c.note "Treasurer Note"
    FROM changes c WHERE c.import_id = ? AND c.kind = ?
    ORDER BY c.name`).all(importId, kind);

  // Sheet 2 — follow-up list: present last report, missing on this one.
  addSheet('Stopped Payers - FOLLOW UP', changeRows('stopped'),
    prev ? 'no stopped payers 🎉' : 'first import — nothing to compare against');
  addSheet('New Payers', changeRows('new'),
    prev ? 'no new payers' : 'first import — nothing to compare against');
  addSheet('Changes (grade-step-name)', changeRows('changed'),
    prev ? 'no changes' : 'first import — nothing to compare against');

  // Full snapshot for the records.
  addSheet('All Rows (snapshot)', db.prepare(`
    SELECT page "Page", line_no "Line", emplid "Emplid", name "Name (as printed)",
           last_name "Last", first_name "First", middle_name "Middle",
           grade "Grade", step "Step", confidence "OCR Confidence",
           CASE WHEN edited = 1 THEN 'yes' ELSE '' END "Hand-corrected",
           CASE WHEN excluded = 1 THEN 'yes' ELSE '' END "Excluded",
           review_reason "Review Reason"
    FROM rows WHERE import_id = ? ORDER BY page, line_no`).all(importId));

  const stat = (m, v) => ({ metric: m, value: v });
  const one = sql => db.prepare(sql).get(importId);
  addSheet('Summary', [
    stat('Report', imp.filename),
    stat('Report date', label(imp)),
    stat('Imported at', imp.uploaded_at),
    stat('Dues year marked', year),
    stat('Dues payers on this report', one('SELECT COUNT(*) c FROM rows WHERE import_id = ? AND excluded = 0').c),
    stat('Compared against', prev ? `${label(prev)} (${prev.filename})` : '— first import —'),
    stat('Stopped payers', one("SELECT COUNT(*) c FROM changes WHERE import_id = ? AND kind = 'stopped'").c),
    stat('New payers', one("SELECT COUNT(*) c FROM changes WHERE import_id = ? AND kind = 'new'").c),
    stat('Grade/step/name changes', one("SELECT COUNT(*) c FROM changes WHERE import_id = ? AND kind = 'changed'").c),
    stat('Rows hand-corrected in review', one('SELECT COUNT(*) c FROM rows WHERE import_id = ? AND edited = 1').c),
    stat('Rows still flagged (unreviewed)', one('SELECT COUNT(*) c FROM rows WHERE import_id = ? AND excluded = 0 AND needs_review = 1 AND reviewed = 0').c)
  ]);

  return wb;
}

module.exports = { buildNepWorkbook };
