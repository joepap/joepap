# What `data/` should contain

`data/` is gitignored because it holds member PII, so it lives only on the
session container and a wipe takes all of it. This file is the record of what
was there. It carries no member data — a name, a size, a checksum, a row and
column count, and where the file came from.

Regenerate with `node scripts/data-manifest.js --write` after installing any
new source file, and commit it. After a wipe, `node scripts/data-restore.js`
reads this and says exactly what is missing.

Last written: 2026-10-08 — 8 files, 1.9 MB

| file | from | shape | KB | sha256 (first 16) | last modified |
|---|---|---|---|---|---|
| `uploads/movers-1.xls` | MK Elections NCOA (USPS change-of-address) return | 71 rows × 17 columns | 42 | `e2da8fb896f1201e` | 2026-09-27 |
| `uploads/returns-1.csv` | MK Elections undeliverables and reprints report | 192 rows × 1 columns | 24 | `eeb35f1ed61747d0` | 2026-09-27 |
| `uploads/roster-65` | NEP member export — Active and Active Retired | 2392 rows × 54 columns | 345 | `648b5274da17f9e9` | 2026-09-27 |
| `uploads/roster-66` | NEP member export — Active and Active Retired | 2392 rows × 54 columns | 349 | `12c01a3965771285` | 2026-09-27 |
| `uploads/roster-67` | NEP member export — Active and Active Retired | 2392 rows × 54 columns | 350 | `78c01343a43b3e05` | 2026-09-27 |
| `uploads/roster-68` | NEP member export — Active and Active Retired | 2391 rows × 54 columns | 351 | `42a4e763622d7ff6` | 2026-09-27 |
| `uploads/roster-69` | NEP member export — Active and Active Retired | 2390 rows × 54 columns | 357 | `0e95709b4c7d41c2` | 2026-10-08 |
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
