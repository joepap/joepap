'use strict';
/*
 * Read the money columns back out of every stored row's OCR text.
 *
 * Imports taken before Aug 2026 never captured the deduction amount, so every
 * line on them looked like a payer — including the 13 on the 13 June 2026
 * report that print $0.00. Re-parsing ocr_text costs nothing and needs no
 * re-scan, since the words were kept verbatim.
 *
 *   node scripts/backfill-amounts.js            # report only
 *   node scripts/backfill-amounts.js --write    # save
 */
const path = require('path');
const { open } = require(path.join(__dirname, '..', 'lib', 'db'));
const parse = require(path.join(__dirname, '..', 'lib', 'parse'));

const write = process.argv.includes('--write');
const db = open();
const rows = db.prepare('SELECT id, import_id, name, emplid, ocr_text FROM rows').all();
const upd = db.prepare(
  'UPDATE rows SET amount_goal=?, amount_taken=?, zero_deduction=? WHERE id=?');
// A $0.00 line found by the backfill needs the same look a freshly imported
// one gets, so send it to the review screen with the reason spelled out.
const flag = db.prepare(`UPDATE rows SET needs_review = 1, reviewed = 0,
  review_reason = CASE WHEN review_reason = '' THEN ? ELSE review_reason || '; ' || ? END
  WHERE id = ? AND review_reason NOT LIKE '%$0.00%'`);
const ZERO_REASON = 'deduction is $0.00 — on the register but not paying';

let read = 0, zero = 0, unread = 0;
const zeros = [];
const apply = db.transaction(() => {
  for (const r of rows) {
    const m = parse.readMoney(String(r.ocr_text || '').split(/\s+/).filter(Boolean));
    if (!m) { unread++; if (write) upd.run(-1, -1, 0, r.id); continue; }
    read++;
    if (m.zero) { zero++; zeros.push(r); }
    if (write) {
      upd.run(m.goal, m.taken, m.zero ? 1 : 0, r.id);
      if (m.zero) flag.run(ZERO_REASON, ZERO_REASON, r.id);
    }
  }
});
apply();

console.log(`${rows.length} stored rows`);
console.log(`  money read        ${read}`);
console.log(`  of those, $0.00   ${zero}`);
console.log(`  not legible       ${unread}`);
if (zeros.length) {
  console.log('\nlines with nothing coming out of the check:');
  zeros.forEach(r => console.log(`   import #${r.import_id}  ${(r.name || '(name unreadable)').padEnd(30)}${r.emplid || '—'}`));
}
console.log(write ? '\nsaved.' : '\ndry run — pass --write to save.');
