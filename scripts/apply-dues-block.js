'use strict';
/*
 * Flag non-dues-paying members so they cannot be issued a ballot.
 *
 * Reads scripts/non-dues-payers.json, matches each entry to a roster member
 * in the database (exact same fuzzy matcher the check-in screen uses), and
 * sets members.dues_block = 1. Re-runnable and idempotent: it clears every
 * existing block first, then re-applies the current list — so editing the
 * JSON (e.g. someone paid up) and re-running is the way to update.
 *
 * Usage:
 *   node scripts/apply-dues-block.js          apply and report
 *   node scripts/apply-dues-block.js --dry    report only, change nothing
 *
 * Entries marked "expect_absent" are people confirmed NOT in the roster; they
 * are already blocked by having no record to check in with. The script warns
 * if one of them unexpectedly matches (name may have been added since).
 */
const fs = require('fs');
const path = require('path');
const { open } = require('../lib/db');
const match = require('../lib/match');

const DRY = process.argv.includes('--dry');
const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'non-dues-payers.json'), 'utf8'));
const NOTE = list.note || 'Non-dues-paying — not eligible';

const db = open(process.env.DB_FILE);
const all = db.prepare('SELECT id, last_name, first_name, member_no, dues_status, norm_last, norm_first FROM members').all();

function bestMatches(entry) {
  const q = { lastName: entry.last, firstName: entry.first };
  return all
    .map(m => ({ m, s: match.scoreCandidate(q, m) }))
    .filter(x => x.s >= 60)
    .sort((a, b) => b.s - a.s);
}

const toBlock = new Set();          // member ids
const report = { matched: [], sameName: [], weak: [], absent: [], unexpected: [] };

for (const entry of list.people) {
  const scored = bestMatches(entry);
  const best = scored[0];

  if (entry.expect_absent) {
    if (best && best.s >= 90) report.unexpected.push({ entry, hit: best.m, score: best.s });
    else report.absent.push(entry);
    continue;
  }
  if (!best) { report.absent.push(entry); continue; }

  // Exact name match: flag EVERY roster record tied at 100. A volunteer can't
  // distinguish identical names on screen, so if one is a non-dues-payer, block
  // all same-name records and let the resolution table sort out identity. This
  // is what handles the two James McCoys, and is the safe default generally.
  const exact = scored.filter(x => x.s === 100);
  if (exact.length) {
    exact.forEach(x => toBlock.add(x.m.id));
    if (exact.length > 1) report.sameName.push({ entry, hits: exact.map(x => x.m) });
    else report.matched.push({ entry, hit: exact[0].m, score: 100 });
    continue;
  }
  // Strong-but-not-exact unique match (typo/suffix), no close runner-up.
  const tie = scored[1] && (best.s - scored[1].s) < 8;
  if (best.s >= 90 && !tie) {
    toBlock.add(best.m.id);
    report.matched.push({ entry, hit: best.m, score: best.s });
  } else {
    report.weak.push({ entry, options: scored.slice(0, 3).map(x => ({ m: x.m, s: x.s })) });
  }
}

// ---- report ----
const nm = e => `${e.last}, ${e.first}`;
console.log(`\nNon-dues-payer block — ${DRY ? 'DRY RUN (no changes)' : 'APPLYING'}\n`);
console.log(`MATCHED & flagged (${report.matched.length}):`);
for (const r of report.matched)
  console.log(`  ${nm(r.entry).padEnd(24)} -> ${r.hit.last_name}, ${r.hit.first_name} (#${r.hit.member_no || '—'}, ${r.hit.dues_status || 'no status'})  [${r.score}]`);

if (report.sameName.length) {
  console.log(`\nSAME-NAME — flagged ALL matching records (${report.sameName.length}):`);
  for (const r of report.sameName) {
    console.log(`  ${nm(r.entry)} -> ${r.hits.length} records: ` +
      r.hits.map(m => `${m.last_name}, ${m.first_name} (#${m.member_no || '—'})`).join(' + '));
  }
}
if (report.weak.length) {
  console.log(`\nWEAK / NO CONFIDENT MATCH — NOT flagged, review (${report.weak.length}):`);
  for (const r of report.weak) {
    console.log(`  ${nm(r.entry)}:`);
    for (const o of r.options) console.log(`      ${o.m.last_name}, ${o.m.first_name} (#${o.m.member_no || '—'}) [${o.s}]`);
  }
}
console.log(`\nCONFIRMED ABSENT — already blocked (no roster record) (${report.absent.length}):`);
console.log('  ' + report.absent.map(nm).join(' · '));

if (report.unexpected.length) {
  console.log(`\n⚠ EXPECTED ABSENT BUT NOW MATCHES — review (${report.unexpected.length}):`);
  for (const r of report.unexpected)
    console.log(`  ${nm(r.entry)} -> ${r.hit.last_name}, ${r.hit.first_name} (#${r.hit.member_no || '—'}) [${r.score}]  (not flagged automatically)`);
}

if (!DRY) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE members SET dues_block = 0, dues_block_note = \'\'').run();
    const upd = db.prepare('UPDATE members SET dues_block = 1, dues_block_note = ? WHERE id = ?');
    for (const id of toBlock) upd.run(NOTE, id);
  });
  tx();
  console.log(`\n✓ Flagged ${toBlock.size} member records as non-dues-paying (cleared previous flags first).`);
} else {
  console.log(`\nWould flag ${toBlock.size} member records. Re-run without --dry to apply.`);
}
