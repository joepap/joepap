'use strict';
/*
 * After a wipe: say what is missing, and put back what Joe re-uploads.
 *
 * Re-uploading is the only way to recover `data/`, because it is gitignored and
 * must stay that way. What made the last two recoveries slow was not the
 * uploading, it was not knowing which file was which — a NEP export arrives
 * named `members_export_...2026-10-08-16-07.xlsx`, and the project knows it as
 * `roster-69`.
 *
 * So this does two jobs. With no arguments it reads docs/data-manifest.md and
 * reports what is present, what is missing and what has changed. Given a folder
 * of re-uploaded files it matches each one by checksum and installs it under
 * the name the project expects; a file whose checksum is not in the manifest is
 * reported and left alone, never guessed at.
 *
 *   node scripts/data-restore.js                 # what is missing
 *   node scripts/data-restore.js <folder>        # dry run against a folder
 *   node scripts/data-restore.js <folder> --install
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const fs = require('fs');
const crypto = require('crypto');
const args = process.argv.slice(2).filter(a => a !== '--install');
const INSTALL = process.argv.includes('--install');
const FROM = args[0];
const MAN = path.join(DT, 'docs/data-manifest.md');
const DATA = path.join(DT, 'data');

if (!fs.existsSync(MAN)) {
  console.error('no docs/data-manifest.md — run: node scripts/data-manifest.js --write');
  process.exit(1);
}
const want = [];
for (const line of fs.readFileSync(MAN, 'utf8').split('\n')) {
  const m = line.match(/^\| `([^`]+)` \| (.+?) \| (.+?) \| (\d+) \| `([0-9a-f]+)` \| (\S+) \|$/);
  if (m) want.push({ rel: m[1], source: m[2], shape: m[3], kb: +m[4], sha: m[5], mtime: m[6] });
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

console.log(`manifest lists ${want.length} files\n`);
const missing = [], changed = [], ok = [];
for (const w of want) {
  const p = path.join(DATA, w.rel);
  if (!fs.existsSync(p)) { missing.push(w); continue; }
  (sha(p) === w.sha ? ok : changed).push(w);
}
console.log(`present and unchanged : ${ok.length}`);
if (changed.length) {
  console.log(`present but DIFFERENT : ${changed.length}`);
  changed.forEach(w => console.log(`   ${w.rel} — on disk ${sha(path.join(DATA, w.rel))}, manifest ${w.sha}`));
  console.log('   (a newer export under an old name. Re-run data-manifest.js --write if that is deliberate.)');
}
if (missing.length) {
  console.log(`MISSING               : ${missing.length}`);
  missing.forEach(w => console.log(`   ${w.rel.padEnd(24)} ${w.shape.padEnd(26)} ${w.source}`));
}

// The manifest's own "Known gaps" list — things that were never in a manifest
// because they were lost before this script existed.
const gaps = fs.readFileSync(MAN, 'utf8').split('## Known gaps')[1];
if (gaps && !FROM) {
  console.log('\nAlso needed, and never in a manifest:');
  gaps.split('\n').filter(l => /^- /.test(l)).forEach(l => console.log('   ' + l.slice(2)));
}

if (!FROM) {
  if (!missing.length && !changed.length) console.log('\nNothing to restore.');
  else console.log('\nTo put files back: node scripts/data-restore.js <folder-of-uploads> [--install]');
  process.exit(0);
}

/* ---- match a folder of re-uploads against the manifest ---- */
if (!fs.existsSync(FROM)) { console.error('\nno such folder: ' + FROM); process.exit(1); }
const bySha = new Map(want.map(w => [w.sha, w]));
const found = [], unknown = [];
for (const name of fs.readdirSync(FROM)) {
  const p = path.join(FROM, name);
  if (!fs.statSync(p).isFile()) continue;
  const h = sha(p);
  const w = bySha.get(h);
  if (w) found.push({ p, name, w }); else unknown.push({ p, name, h });
}
console.log(`\n${FROM}: ${found.length} recognised, ${unknown.length} not in the manifest`);
for (const f of found) {
  const dest = path.join(DATA, f.w.rel);
  const already = fs.existsSync(dest) && sha(dest) === f.w.sha;
  console.log(`   ${f.name}\n       -> data/${f.w.rel}   ${already ? '(already there, skipping)' : INSTALL ? 'INSTALLED' : 'would install'}`);
  if (INSTALL && !already) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(f.p, dest); }
}
// Never guessed at. A roster export that is one row different from the one the
// manifest knows is a NEW roster, not the old one, and installing it under the
// old name would quietly rewrite history.
for (const u of unknown)
  console.log(`   ${u.name}  — checksum ${u.h} is not in the manifest. Left alone; install it by hand ` +
    `under the next name in sequence, then re-run data-manifest.js --write.`);
if (!INSTALL && found.length) console.log('\n(dry run — add --install to copy them in)');
