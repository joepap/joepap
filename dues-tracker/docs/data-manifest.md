# What `data/` should contain

`data/` is gitignored because it holds member PII, so it lives only on the
session container and a wipe takes all of it. This file is the record of what
was there. It carries no member data — a name, a size, a checksum, a row and
column count, and where the file came from.

Regenerate with `node scripts/data-manifest.js --write` after installing any
new source file, and commit it. After a wipe, `node scripts/data-restore.js`
reads this and says exactly what is missing.

A write is a merge: an entry whose file is not on disk is kept, so writing
the manifest on a freshly wiped machine loses nothing. An entry leaves only
with `--forget <path>`.

Last written: 2026-11-10 — 15 files listed, 4 on disk now, 11 not on disk

| file | from | shape | KB | sha256 (first 16) | last modified |
|---|---|---|---|---|---|
| `registers/register-2026-09-19.json` | DERIVED — the register as read; rebuilt from the scan | parsed rows | 311 | `f8eb9deef67fc65a` | 2026-11-10 |
| `registers/register-2026-09-19.read1.json` | DERIVED — the register as read; rebuilt from the scan | parsed rows | 747 | `b43764644f28935b` | 2026-11-10 |
| `uploads/iaff-roll-2026-11-10.csv` | IAFF member roll export | 2512 rows × 20 columns | 984 | `99d57e26a8e741b4` | 2026-11-10 |
| `uploads/movers-1.xls` | MK Elections NCOA (USPS change-of-address) return | 71 rows × 17 columns | 42 | `e2da8fb896f1201e` | 2026-09-27 |
| `uploads/register-2026-09-19.pdf` | DCHR payroll dues deduction register | scanned pages | 3055 | `64386cdad552e9e1` | 2026-11-10 |
| `uploads/returns-1.csv` | MK Elections undeliverables and reprints report | 192 rows × 1 columns | 24 | `eeb35f1ed61747d0` | 2026-09-27 |
| `uploads/roster-65` | NEP member export — Active and Active Retired | 2392 rows × 54 columns | 345 | `648b5274da17f9e9` | 2026-09-27 |
| `uploads/roster-66` | NEP member export — Active and Active Retired | 2392 rows × 54 columns | 349 | `12c01a3965771285` | 2026-09-27 |
| `uploads/roster-67` | NEP member export — Active and Active Retired | 2392 rows × 54 columns | 350 | `78c01343a43b3e05` | 2026-09-27 |
| `uploads/roster-68` | NEP member export — Active and Active Retired | 2391 rows × 54 columns | 351 | `42a4e763622d7ff6` | 2026-09-27 |
| `uploads/roster-69` | NEP member export — Active and Active Retired | 2390 rows × 54 columns | 357 | `0e95709b4c7d41c2` | 2026-10-08 |
| `uploads/roster-70` | NEP member export — Active and Active Retired | 2390 rows × 54 columns | 359 | `b7e7a7d363b34cd7` | 2026-10-12 |
| `uploads/roster-71` | NEP member export — Active and Active Retired | 2389 rows × 54 columns | 359 | `ff7b67bbae7c4a4a` | 2026-10-12 |
| `uploads/roster-72` | NEP member export — Active and Active Retired | 3545 rows × 54 columns | 509 | `0de571bdd9c1ce1e` | 2026-11-10 |
| `uploads/sent-to-mk.xlsx` | the address file we sent MK Elections | 2359 rows × 9 columns | 150 | `7ac5b3ee28702700` | 2026-09-27 |

## Known gaps

Files the project has used and no longer holds. They are named here so a
re-upload request can be specific.

- `dues.db` — the June and July 2026 DCHR registers, parsed and eye-verified.
  Derived, so it is rebuilt by re-importing the registers rather than restored.
  `scripts/ballot-check.js`, `ballot-dupes.js`, `ballot-file-check.js` and
  `paying-*.js` all open it and cannot run without it.
- the DCHR payroll dues registers themselves (June, July, August 2026).
- `telestaff-2.csv` and `telestaff-p1..p4.csv` — the staffing exports.
- the IAFF member roll export.
- roster exports before roster-65.
