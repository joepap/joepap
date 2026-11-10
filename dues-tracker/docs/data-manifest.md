# What `data/` should contain

`data/` is gitignored because it holds member PII, so it lives only on the
session container and a wipe takes all of it. This file is the record of what
was there. It carries no member data — a name, a size, a checksum, a row and
column count, and where the file came from.

Regenerate with `node scripts/data-manifest.js --write` after installing any
new source file, and commit it. After a wipe, `node scripts/data-restore.js`
reads this and says exactly what is missing.

Last written: 2026-11-10 — 3 files, 18.4 MB

| file | from | shape | KB | sha256 (first 16) | last modified |
|---|---|---|---|---|---|
| `registers/register-2026-09-19.read1.json` | DCHR payroll dues deduction register | no rows | 747 | `b43764644f28935b` | 2026-11-10 |
| `tessdata/eng.traineddata` | unknown — ask Joe where this came from | 30483 rows × 1 columns | 15040 | `8280aed0782fe272` | 2026-11-10 |
| `uploads/register-2026-09-19.pdf` | DCHR payroll dues deduction register | 10172 rows × 1 columns | 3055 | `64386cdad552e9e1` | 2026-11-10 |

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
