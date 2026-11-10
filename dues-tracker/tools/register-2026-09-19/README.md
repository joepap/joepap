# How the 19 Sept 2026 register was read

The working scripts, kept so the reading can be repeated after a wipe without
redoing the eye work. They are one-off: a proper `scripts/register-read.js`
that does all of this for any scan is the next step, for the scan-to-Drive
inbox.

Set `REG_WORK` to a scratch folder holding `register.pdf`, then in order:

1. `first-read.js <pdf> <out.json>` — every page at 300 dpi through
   `lib/ocr.js` and `lib/parse.js`. Save as `ocr.json`.
2. `second-read.js` — the left-hand strip of every page at 600 dpi, read on its
   own. Writes `second.json`.
3. `resolve.js` — settles each payroll number from both reads and NEP.
4. `finalize.js` — applies the numbers read by eye from the page, restores the
   two lines the reader dropped, checks the result against the register's
   printed totals (and throws if it does not match), and writes
   `data/registers/register-2026-09-19.json` with no SSN digits in it.

`finalize.js` holds the eye-read corrections. They are the expensive part.
