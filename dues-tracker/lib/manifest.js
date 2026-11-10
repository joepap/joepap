'use strict';
/*
 * The data manifest's own logic, kept apart from the script so it can be tested.
 *
 * The manifest is the record of what `data/` SHOULD hold. Its whole value is
 * after a wipe, when the folder is empty — which is also exactly when
 * regenerating it from the folder would erase it. That happened on 10 Nov 2026:
 * a `--write` on a freshly wiped container replaced ten roster entries with the
 * three files that happened to be on disk.
 *
 * So a write is a MERGE. A file on disk refreshes or adds its entry; an entry
 * whose file is not on disk is kept exactly as it was. Nothing leaves the
 * manifest unless it is named explicitly.
 */
const ROW_RE = /^\| `([^`]+)` \| (.+?) \| (.+?) \| (\d+) \| `([0-9a-f]+)` \| (\S+) \|$/;

function parse(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(ROW_RE);
    if (m) rows.push({ rel: m[1], source: m[2], shape: m[3], kb: +m[4], sha: m[5], mtime: m[6] });
  }
  return rows;
}

const formatRow = r => `| \`${r.rel}\` | ${r.source} | ${r.shape} | ${r.kb} | \`${r.sha}\` | ${r.mtime} |`;

/**
 * Merge what the manifest already lists with what is on disk now.
 * Returns { rows, kept } where `kept` are the entries carried forward because
 * their file is absent. `forget` is a list of paths to drop on purpose.
 */
function merge(existing, onDisk, forget) {
  const drop = new Set(forget || []);
  const disk = new Map(onDisk.map(r => [r.rel, r]));
  const out = new Map();
  const kept = [];
  for (const r of existing) {
    if (drop.has(r.rel)) continue;
    if (disk.has(r.rel)) continue;          // refreshed from disk below
    out.set(r.rel, r); kept.push(r);
  }
  for (const r of onDisk) if (!drop.has(r.rel)) out.set(r.rel, r);
  const rows = [...out.values()].sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  return { rows, kept };
}

module.exports = { parse, merge, formatRow, ROW_RE };
