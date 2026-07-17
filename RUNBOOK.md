# Local 36 Check-In — Event Runbook

One page. Print this.

## How it runs (internet mode — no router, no special hardware)

The Mac mini serves both apps through its permanent public HTTPS address
(Tailscale Funnel). Volunteers use **their own phones/iPads on cellular** as
check-in stations — camera license-scanning works out of the box because the
public address has a real HTTPS certificate (no cert-trust step needed).

- Check-in stations: **https://dcjoe-claude-macmini.tail5dba36.ts.net:8443**
- Admin dashboard: same address + `/admin.html`
- **Discrepancy Table**: same address + `/discrepancy.html` (admin PIN)
- Question line (members): **https://dcjoe-claude-macmini.tail5dba36.ts.net**
- Question line moderator: same + `/mod` · projector QR: same + `/display`

## Eligibility model (payroll is the authority)

- 🟢 **GREEN — on the payroll dues list** → ballot at the main table.
- 🔴 **RED — in NEP but NOT on payroll** → no ballot at the main table; "Send to
  Discrepancy Table," where a human checks the printed payroll and can override.
  (NEP can be stale — promoted out, etc.)
- 🟡 **YELLOW — on payroll but not in NEP** → confirmed dues-payer; sent to the
  Discrepancy Table for a ballot + enrollment (capture personal email/phone —
  @dc.gov is rejected — and hand a registration QR card).
- 🔴 **Known non-payers** (the union's highlighted list) → blocked outright.
- See DISCREPANCY-TABLE-GUIDE.md — print it for that table's worker.

Two PINs protect everything (change both before the event in `/admin.html` →
Settings): the **station PIN** (volunteers enter it once with their station
name; default 1136) and the **admin PIN** (dashboard/imports/voids; default 3636).
The queue moderator PIN is set when the queue starts (default 3636).

## One-time server setup (already done, listed for rebuild)

1. Clone the repo, `npm install`
2. `bash scripts/install-autostart.sh` — both servers start at boot, restart on crash
3. `sudo pmset -a sleep 0 disksleep 0` — never sleep
4. Funnel (persists across reboots):
   ```
   tailscale funnel --bg 8090                    # question line on 443
   tailscale funnel --bg --https=8443 8080       # check-in on 8443
   ```
   (`tailscale` = `/Applications/Tailscale.app/Contents/MacOS/Tailscale`)
5. Logo at `public/logo.png`

## Before the event

1. **Decide where the mini lives on event day.**
   - *At the venue with a hotspot* (recommended): you can see it, power-cycle it,
     and venue check-in doesn't depend on your home internet. Join its Wi-Fi to a
     phone hotspot before leaving home and confirm the public URLs still load.
   - *At home*: zero setup, but if home power/internet blips mid-meeting, nobody
     is there to fix it.
2. **Import the roster** (`/admin.html` → Roster import, Replace ✓), then the
   **payroll dues list** (Payroll section), then re-run the non-payer block if
   the roster changed: `node scripts/apply-dues-block.js` in the project folder.
   Order matters: roster → payroll → dues block.
3. **Change all PINs** from defaults (station, admin, queue moderator). Tell
   volunteers only the station PIN; the Discrepancy worker gets the admin PIN.
4. Ballots are **blind** — numbering is off by default (Settings can verify).
5. **Print**: the payroll reference (`/payroll-print.html`), the registration QR
   cards (`/qr-card.html` — needs the NEP registration link), the question-line
   QR (`/display` on the queue), and both one-page guides.
6. **Rehearse**: `npm run seed` loads 300 fake members. Re-import the real
   roster + payroll afterward (order in step 2).
7. Volunteers need nothing installed — just the URL, the station PIN, and a
   charged phone. Wi-Fi-only iPads need a hotspot to join.

## Event day — start of day checks (5 minutes)

1. Admin → **"Clear event data"** (type RESET) to wipe rehearsal check-ins —
   roster, payroll and blocks are kept. Verify counts: roster ~3,398,
   payroll 1,761, zero checked in.
2. Open the check-in URL on your phone: search a name → green member loads.
3. Scan one real license on one phone: match appears.
4. Search a known red case → confirm "Send to Discrepancy Table" appears, and
   it shows up at `/discrepancy.html`. Resolve it, then void that test
   check-in from the admin dashboard.
5. Queue: print/post the QR, moderator opens `/mod`, taps **Clear entire line**.
6. Confirm every station device shows its station name (top right chip).
7. Backups run automatically every 10 min into `backups/` — nothing to do.

## During the event

- **Camera**: tap "Scan ID", point at the barcode on the BACK of the license.
- **No scan?** Type 2+ letters of the last name. `smith, j` narrows by first name.
- **Green ACTIVE pill** = eligible, issue ballot. **Red NOT ELIGIBLE** = no ballot
  without a conversation. **Gray NO STATUS** = blank in NEP; resolution table.
- **Duplicate** = full red screen with original time/station. No ballot;
  disputes go to the resolution table.
- **Verify member info** (open on every card): read it back, fix anything wrong,
  ask "are you getting our emails?", Save. Never blocks check-in. A green
  "corrections already captured" note means another station already did it.
- **Yellow portal banner** = hand them a portal card / help lane after check-in.
- **Not on roster** = log via the button, send to resolution table. No ballot.
- **Help lane**: tick "Portal access granted today" after setting them up.
- **Question line**: see QUESTION-LINE-GUIDE.md (one page for the moderator).

## If things break

| Problem | Fix |
|---|---|
| A volunteer's phone dies | Nothing is lost. Any other phone: open the URL, enter station name + PIN, keep going. |
| Page won't load on one phone | Their cellular signal. Toggle airplane mode, or move; worst case share another phone's hotspot. |
| Pages load but actions fail with PIN prompt | They typo'd the station PIN — re-enter it. |
| NOTHING loads on any phone | The mini or its internet is down. If it's at the venue: power-cycle it — everything auto-starts, ~2 min. If at home: call whoever is there. Meanwhile switch to paper sign-in (name + time), reconcile in the app afterward. |
| Wrong person checked in | Admin → Recent check-ins → Void (logged), then check in the right person. |
| Mini must be replaced mid-event | Clone repo on any Mac/PC with internet, `npm install`, copy the `data/` folder over (or re-import the roster), start both servers, set up funnel on that machine's Tailscale. Stations get a new URL — write it on the room's whiteboard. |

Cheap insurance during the event: every ~30 min, copy `data/` to a USB stick.

## After the event — download all seven exports

Admin → Exports:
1. **Check-in log** — every ballot: who, when, station, method, voids.
2. **Contact corrections** — apply to ConnectPlus (includes email-group flags).
3. **Not-found list** — follow up.
4. **Access granted** — who the help lane set up.
5. **Discrepancy log** — every red/yellow case and its outcome (the challenge
   paper trail).
6. **Payroll not in NEP (+attendance)** — the enrollment sheet: import these
   people into NEP; `checked_in_at_vote` column prioritizes the no-shows for
   recruitment.
7. **Payroll list (clean)** — reference copy.

Then archive `data/` + `backups/` somewhere safe and delete both from the
mini — they hold the full member roster and payroll list.

---

### Appendix: offline LAN mode (if you ever get a travel router)

The original design: router + mini on a static LAN IP, stations on the router's
Wi-Fi, zero internet needed. Requires `npm run certs <static-ip>` and a one-time
cert-trust on each iPad (mkcert root CA → install profile → Settings → General →
About → Certificate Trust Settings). Stations then use `https://<ip>:8443`.
Everything else works identically. More resilient (no internet dependency), more
setup. The code supports both modes simultaneously.
