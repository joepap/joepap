'use strict';
/*
 * A committable record of what `data/` is supposed to contain.
 *
 * `data/` is gitignored on purpose — it holds member PII and must never be in
 * the repository. The cost of that rule is that the folder lives only on a
 * disposable container disk, and two wipes (22 Aug, 27 Sep 2026) took all of
 * it. Each time, the loss was discovered by a script failing rather than by
 * anyone noticing.
 *
 * This writes a manifest that carries no member data at all — a filename, a
 * size, a checksum, a row and column count, and where the file came from — so
 * that after the next wipe the gap can be named in one command instead of
 * found by accident. It is safe to commit and is meant to be.
 *
 * The checksum also answers the question re-uploading always raises: is this
 * the same file I had before, or a newer export?
 *
 *   node scripts/data-manifest.js [--write]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const crypto = require('crypto');
const WRITE = process.argv.includes('--write');
const OUT = path.join(DT, 'docs/data-manifest.md');
const L = v => String(v == null ? '' : v).trim();

// Where each kind of file comes from, so a re-upload request can name the
// source rather than the filename. Matched in order.
const SOURCE = [
  [/^roster-\d+$/, 'NEP member export — Active and Active Retired'],
  [/^telestaff/i, 'TeleStaff staffing export — one platoon per file'],
  [/^movers/i, 'MK Elections NCOA (USPS change-of-address) return'],
  [/^returns/i, 'MK Elections undeliverables and reprints report'],
  [/^sent-to-mk/i, 'the address file we sent MK Elections'],
  [/^SO.*\.pdf$/i, 'DC Fire & EMS Special Order (personnel actions)'],
  [/register|dues|payroll/i, 'DCHR payroll dues deduction register'],
  [/^iaff/i, 'IAFF member roll export'],
  [/\.db$/, 'DERIVED — rebuilt by importing the registers, not re-uploaded'],
];
const sourceOf = n => (SOURCE.find(([re]) => re.test(n)) || [, 'unknown — ask Joe where this came from'])[1];

// Row and column counts are structure, not content. They are the cheapest way
// to tell a truncated re-upload from a good one.
function shape(file) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.db') return 'sqlite database';
    const buf = fs.readFileSync(file);
    const t = require(path.join(DT, 'lib/tabular'));
    const recs = t.parseUpload(buf, path.basename(file).replace(/^[^.]*$/, '$&.xlsx')).records;
    if (!recs.length) return 'no rows';
    return `${recs.length} rows × ${Object.keys(recs[0]).length} columns`;
  } catch (e) { return 'not read as a table (' + L(e.message).slice(0, 40) + ')'; }
}

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const root = path.join(DT, 'data');
if (!fs.existsSync(root)) { console.error('no data/ directory — nothing to describe'); process.exit(1); }
const files = walk(root).filter(f => !/\.db-(wal|shm)$/.test(f)).sort();

const rows = files.map(f => {
  const st = fs.statSync(f);
  return {
    rel: path.relative(root, f),
    kb: Math.round(st.size / 1024),
    sha: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16),
    mtime: st.mtime.toISOString().slice(0, 10),
    shape: shape(f),
    source: sourceOf(path.basename(f)),
  };
});

const md = [
  '# What `data/` should contain',
  '',
  '`data/` is gitignored because it holds member PII, so it lives only on the',
  'session container and a wipe takes all of it. This file is the record of what',
  'was there. It carries no member data — a name, a size, a checksum, a row and',
  'column count, and where the file came from.',
  '',
  'Regenerate with `node scripts/data-manifest.js --write` after installing any',
  'new source file, and commit it. After a wipe, `node scripts/data-restore.js`',
  'reads this and says exactly what is missing.',
  '',
  `Last written: ${new Date().toISOString().slice(0, 10)} — ${rows.length} files, ` +
    `${Math.round(rows.reduce((a, r) => a + r.kb, 0) / 1024 * 10) / 10} MB`,
  '',
  '| file | from | shape | KB | sha256 (first 16) | last modified |',
  '|---|---|---|---|---|---|',
  ...rows.map(r => `| \`${r.rel}\` | ${r.source} | ${r.shape} | ${r.kb} | \`${r.sha}\` | ${r.mtime} |`),
  '',
  '## Known gaps',
  '',
  'Files the project has used and no longer holds. They are named here so a',
  're-upload request can be specific.',
  '',
  '- `dues.db` — the June and July 2026 DCHR registers, parsed and eye-verified.',
  '  Derived, so it is rebuilt by re-importing the registers rather than restored.',
  '  `scripts/ballot-check.js`, `ballot-dupes.js`, `ballot-file-check.js` and',
  '  `paying-*.js` all open it and cannot run without it.',
  '- the DCHR payroll dues registers themselves (June, July, August 2026).',
  '- `telestaff-2.csv` and `telestaff-p1..p4.csv` — the staffing exports.',
  '- the IAFF member roll export.',
  '- roster exports before roster-65.',
].join('\n');

if (WRITE) { fs.writeFileSync(OUT, md + '\n'); console.log('wrote ' + path.relative(DT, OUT)); }
console.log(`${rows.length} files in data/, ${Math.round(rows.reduce((a, r) => a + r.kb, 0) / 1024 * 10) / 10} MB`);
for (const r of rows) console.log(`  ${r.rel.padEnd(24)} ${String(r.kb).padStart(5)} KB  ${r.shape.padEnd(26)} ${r.source}`);
if (!WRITE) console.log('\n(nothing written — pass --write to update docs/data-manifest.md)');
