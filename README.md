# Local 36 Ratification Check-In

LAN-only membership check-in and ballot issuance for the IAFF Local 36 contract
ratification meeting. One Node.js server on a laptop/Mac mini; 3–5 volunteer
stations (laptops + iPads) connect over a travel router. No internet required
at the venue, no external services, no telemetry.

**Event-day instructions: see [RUNBOOK.md](RUNBOOK.md).**

## Quick start

```
npm install
npm run seed          # 300 fake members + practice barcodes (rehearsal only)
npm start             # http://<lan-ip>:8080  (+ https://…:8443 once certs exist)
npm test              # parser, matcher, CSV, and PDF417-decode tests
npm run certs <LAN-IP>  # HTTPS certs (required for iPad camera scanning)
```

- Check-in stations: `/` — admin dashboard: `/admin.html` (PIN, default `3636`)
- Standalone camera test (verify each iPad before the event): `/barcode-test.html`

## Discovery findings (verified in this repo's tests)

1. **PDF417 via `zxing-wasm` works.** `test/decode-pdf417.test.js` generates a
   synthetic AAMVA license barcode and decodes it byte-exact through the same
   WASM path the browser uses (`ImageData` → `readBarcodes`). Two gotchas are
   encoded in that test:
   - `textMode: 'Plain'` is required — the default escapes control characters
     as literal `<LF>` text, which breaks AAMVA parsing.
   - Barcode images with transparent backgrounds decode as solid black; the
     seed generator sets an explicit white background.
   - The library is **vendored** at `public/vendor/zxing/` (43 KB JS + 1 MB
     wasm) so nothing is fetched from a CDN at the venue.
   - **iPad Safari camera decoding: VERIFIED on-device** (2026-07-11) via
     `/barcode-test.html` — a real Maryland license decoded repeatedly in
     0–3 s at 1920×1080 after initial positioning, with correct AAMVA
     name/age/state extraction. Use the same page to shake down each
     additional iPad. USB scanner and type-ahead remain first-class
     fallback paths.
   - Laptop webcams (fixed focus) struggle with real licenses — expect the
     camera lane to be iPads; laptops should use USB scanners or search.
2. **AAMVA parsing**: `public/js/aamva.js` handles v01 (combined `DAA` name),
   v02–v03 (`DCT` packed given names), and v04+ (`DCS`/`DAC`/`DAD`), US
   (`MMDDCCYY`) and Canadian (`CCYYMMDD`) dates, keyboard-wedge mangling
   (CRLF, dropped `RS`), and placeholder values (`NONE`, `UNAVL`). Tested with
   synthetic strings only.
3. **HTTPS for cameras**: `getUserMedia` requires a secure context off
   localhost. `npm run certs` uses mkcert (or falls back to an openssl
   mini-CA); RUNBOOK.md documents the one-time iPad trust step. The server
   auto-enables HTTPS on :8443 when `certs/` exists.
4. **USB wedge scanners**: captured by a global keydown listener
   (`public/js/wedge.js`) that detects machine-speed keystroke bursts starting
   with `@`, suppresses them from focused inputs, and routes the payload to
   the same AAMVA parser. A slow-configured scanner that lands its payload in
   the search box is caught there as a fallback. No hidden-input focus games
   needed.

## Privacy (hard requirements, enforced in code)

- Raw barcode payloads are parsed **in the browser** (`aamva.js`) and
  discarded. Only `{lastName, firstName}` go to the server for matching.
- DOB is used transiently in the browser for an age display during candidate
  confirmation; it is never sent to the server and never stored.
- License numbers (`DAQ`) are never extracted from the payload at all — the
  parser has an explicit allowlist of fields.
- SQLite file stays in `data/` on the server machine. No external calls.

## Architecture

```
server.js            Express + better-sqlite3 (WAL) — all state server-side
lib/db.js            schema; UNIQUE partial index enforces one active
                     check-in per member (duplicate ballots are impossible
                     at the DB level, not just the UI)
lib/match.js         name normalization, nickname groups (Joe/Joseph…),
                     Levenshtein, hyphen/suffix handling
lib/csv.js           dependency-free RFC-4180 CSV parse/serialize
public/index.html    volunteer station: search / camera / USB scan → confirm
                     → Check In + Issue Ballot (verification_method required)
public/admin.html    live counts, per-station throughput, method breakdown,
                     roster + paper-roll import with column mapping, exports,
                     void (PIN-gated, logged)
public/barcode-test.html  standalone camera decode test for device shakedown
scripts/seed.js      synthetic roster + printable practice barcodes
scripts/make-certs.sh mkcert/openssl LAN certs
queue-server.js      question-line queue for floor debate — SEPARATE process,
public-queue/        port and database, exposed to the internet via Tailscale
                     Funnel (members' phones are cellular); shares nothing with
                     the ballot system. Member page / moderator page / projector
                     QR display. See RUNBOOK.md "Question line".
```

Check-ins record timestamp, station, `verification_method`
(`portal_id` | `license_scan` | `dept_id` | `other`+note), and a sequential
ballot number. Stations set a default method (green lane pre-selects
`portal_id`). "Access granted today" (help lane) is timestamped on the member.
Voids are soft-deletes with reason + actor, and free the member for re-check-in.
