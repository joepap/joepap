# Local 36 Dues Tracker

The biweekly payroll dues-report workflow, until an electronic feed exists —
and the member-status dashboard for the executive board and union employees.
A separate app from the check-in system: its own port (**8200**), its own
database (`dues-tracker/data/dues.db`), same sign-in convention (your name +
the staff password **3636** to view; the admin PIN **6363** to import/edit —
both changeable in Settings). Every sign-in and every edit is logged with
the name entered.

## What it does

Every ~two weeks the union receives a ~52-page **scanned paper report** of
payroll dues-payers (emplid, name, grade, step — ~1,700 rows). This app:

1. **Import** — upload the scan (PDF). The app reads every page with OCR.
   Rows it isn't confident about go to a **review screen** that shows the
   actual scanned line (zoomed image crop) next to editable fields, so the
   treasurer fixes them by eye in a minute or two.
2. **Compare** — against the previous report, keyed on emplid (with a fuzzy
   name-match fallback for OCR-mangled emplids): **stopped payers** (follow
   up!), **new payers**, and **grade/step/name changes**. Every import is a
   permanent snapshot — nothing is ever overwritten.
3. **NEP export** — one click downloads an import-ready workbook: who to
   mark paid for the year (NEP's "2026 Dues" checkbox), the stopped-payers
   follow-up sheet, new payers, and the full snapshot.
4. Optional email: "report imported — N stopped payers" (Settings).

If an electronic feed ever arrives, the same screen imports a CSV/Excel
version directly (no OCR) — see "Have it as a spreadsheet instead?".

## Setup on the Mac mini

```bash
cd ~/Desktop/claude/local36-dues        # clone of this branch
cd dues-tracker
npm install
node scripts/fetch-tessdata.js          # one-time OCR language data (~15 MB)
node server.js                          # http://localhost:8200
```

Autostart at boot (runs alongside the check-in app's own autostart):

```bash
bash scripts/install-autostart.sh
```

Make it public so the e-board and employees can open it from anywhere —
same Funnel setup as the check-in app (persists across reboots):

```bash
tailscale funnel --bg --https=10000 8200
# → https://<mini-name>.ts.net:10000   (wrap in a TinyURL before sharing)
```

(`tailscale` = `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
Funnel only offers three HTTPS ports: 443 and 8443 already carry the
question line and check-in; 10000 is the free one.)

Because this sits on the public internet permanently, the sign-in asks for
a **name + password** (the name goes in the activity log, like check-in
stations), and 50 wrong passwords lock sign-in for 15 minutes so the
4-digit password can't be guessed by a bot. The **staff password views;
only the admin PIN can import, edit, or change settings** — share 3636
with the board, keep 6363 to yourself.

## Where things live

| Path | What |
|---|---|
| `data/dues.db` | the database (every import, every row, every note) |
| `data/uploads/` | every original PDF, kept forever |
| `data/pages/<import>/` | rendered page scans (the review-screen crops) |
| `data/tessdata/` | OCR language data (auto-downloaded from GitHub) |

`data/` is **gitignored** — member PII never goes to GitHub. Same discipline
as the check-in app: back up `data/` itself (Time Machine / USB), never
commit it.

## OCR notes (for future maintainers)

- Pages render at ~300 dpi via **mupdf** (WASM, no native installs), OCR is
  **tesseract.js** with the `tessdata_best` English model.
- Language data downloads from **GitHub raw**, not tesseract.js's default
  CDN — that CDN is blocked on some networks (real bug, lost an afternoon).
- Row parsing anchors on the **emplid pattern `0#######`**. Department
  numbers on the same report start with **1** — anchoring on "any 8-digit
  number" grabs those and shifts every column (also a real bug, from the
  first prototype). `lib/parse.js` carries both scars.
- If a PDF has a text layer (scanner-side OCR / digital export), the app
  trusts it and skips tesseract for that page.
- Rehearse with fakes: `node scripts/make-test-scan.js` writes two
  realistic "scanned" reports + ground truth into `seed-output/`.

## Wall dashboard (phase 2 — designed, not built)

The trend data (dues-payers per report) already accumulates in the imports
table and shows as a sparkline on the home page. A `/dashboard` page for a
wall screen in the treasurer's office — active dues count, retired dues,
non-payers vs the NEP roster, trend — can be added without schema changes:
retired/non-payer counts need an NEP roster import (the spreadsheet-import
path plus a `roster` table is the designed route).
