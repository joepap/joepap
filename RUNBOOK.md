# Local 36 Check-In — Event Runbook

One page. Print this.

## How it runs (internet mode — no router, no special hardware)

The Mac mini serves both apps through its permanent public HTTPS address
(Tailscale Funnel). Volunteers use **their own phones/iPads on cellular** as
check-in stations — camera license-scanning works out of the box because the
public address has a real HTTPS certificate (no cert-trust step needed).

## All the links

Base = `https://dcjoe-claude-macmini.tail5dba36.ts.net`

**Member-facing — wrap in TinyURLs; print/announce ONLY the short links:**

| What | URL |
|---|---|
| Meeting hub — THE event QR | base `/meeting` |
| Question line (also hub item 3) | base (no path) |
| Member login (hub item 1) | `https://district-of-columbia-firefighters-association-local-36.connectplus.app/login` |
| Register (hub item 2 + QR cards) | same site + `/register` |

**Worker-facing — text to the specific person; never printed:**

| What | URL | PIN |
|---|---|---|
| Check-in stations | base `:8443` | station password |
| Discrepancy Table | base `:8443/discrepancy.html` | admin PIN |
| Admin dashboard | base `:8443/admin.html` | admin PIN |
| Question-line moderator | base `/mod` | moderator PIN |
| Projector display | base `/display` | none |

**Print-from-your-browser pages:** base `:8443/payroll-print.html` (payroll
paper reference) and base `:8443/qr-card.html` (registration QR cards).

Three TinyURLs cover everything printed: meeting hub, check-in stations,
question line. Paste the meeting-hub TinyURL into Admin → Check-in email as
the "Meeting page link" so the confirmation emails use it too.

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
Settings): the **station password** (each volunteer enters it once along with
**their own name** — check-ins are logged per volunteer; the current password
is shown in Admin → Settings, ships as 1136) and the **admin PIN**
(dashboard/imports/voids; default 3636). The queue moderator PIN is set when
the queue starts (default 3636).

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
   volunteers only the station password; the Discrepancy worker gets the admin PIN.
4. Ballots are **blind** — numbering is off by default (Settings can verify).
5. **Print**: the payroll reference (`/payroll-print.html`), the registration QR
   cards (`/qr-card.html`), the ONE event QR — a TinyURL pointing at the
   **`/meeting` hub page** on the queue server (login / register / question
   line / email help, all in one) — and both one-page guides. Print all QRs
   from the TinyURL, never the raw ts.net address (see FAILOVER.md).
6. **Check-in email**: Admin → "Check-in confirmation email" — enter the SMTP
   settings (mailbox + app password), paste the meeting-page TinyURL, **Send
   test** to yourself, then tick "Send on every check-in" and Save.
7. **Rehearse**: `npm run seed` loads 300 fake members. Re-import the real
   roster + payroll afterward (order in step 2).
8. Volunteers need nothing installed — just the URL, the station password, and a
   charged phone. Wi-Fi-only iPads need a hotspot to join.

### Updating the app on the mini (after code changes)

In Terminal on the mini:

```
cd ~/Desktop/claude/local36
git pull
npm install
bash scripts/install-autostart.sh    # restarts both servers on the new code
```

Data, settings and PINs are untouched — only the code updates.

## Event day — start of day checks (5 minutes)

1. **Send the NEP/ConnectPlus text blast** to all members: meeting reminder +
   the meeting-page TinyURL. (The check-in app emails each member as they
   check in; the NEP blast is how texts go out.)
2. Admin → **"Clear event data"** (type RESET) to wipe rehearsal check-ins —
   roster, payroll and blocks are kept. Verify counts: roster ~3,398,
   payroll 1,761, zero checked in.
3. Open the check-in URL on your phone: search a name → green member loads.
4. Scan one real license on one phone: match appears.
5. Search a known red case → confirm "Send to Discrepancy Table" appears, and
   it shows up at `/discrepancy.html`. Resolve it, then void that test
   check-in from the admin dashboard.
6. Check-in email: check yourself in (then void it) — confirm the email lands
   and its link opens the meeting page. "Emails sent" counter ticks up.
7. Queue: print/post the QR, moderator opens `/mod`, taps **Clear entire line**.
8. Confirm every check-in phone shows its volunteer's name (top right chip).
9. Backups run automatically every 10 min into `backups/` — nothing to do.
10. On the MacBook: start `bash ~/local36-backup/scripts/pull-backup.sh loop`
   and leave it running — off-machine copies + a warm spare server.
   Full switch procedure: **FAILOVER.md**.

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
| A volunteer's phone dies | Nothing is lost. Any other phone: open the URL, enter their name + station password, keep going. |
| Page won't load on one phone | Their cellular signal. Toggle airplane mode, or move; worst case share another phone's hotspot. |
| Pages load but actions fail with PIN prompt | They typo'd the station password — re-enter it. |
| NOTHING loads on any phone | The mini or its internet is down. If it's at the venue: power-cycle it — everything auto-starts, ~2 min. If at home: call whoever is there. Meanwhile switch to paper sign-in (name + time), reconcile in the app afterward. |
| Wrong person checked in | Admin → Recent check-ins → Void (logged), then check in the right person. |
| Mini must be replaced mid-event | Clone repo on any Mac/PC with internet, `npm install`, copy the `data/` folder over (or re-import the roster), start both servers, set up funnel on that machine's Tailscale. Stations get a new URL — write it on the room's whiteboard. |

Cheap insurance during the event: every ~30 min, copy `data/` to a USB stick.

## After the event — download all eight exports

Admin → Exports:
1. **Check-in log** — every ballot: who, when, station, method, voids.
2. **Contact corrections** — apply to ConnectPlus (includes email-group flags).
3. **Not-found list** — follow up.
4. **Access granted** — who the help lane set up.
5. **Discrepancy log** — every red/yellow case and its outcome (the challenge
   paper trail).
6. **Email log** — every confirmation email: sent, failed, or no address on
   file (the no-address rows are an email-collection follow-up list).
7. **Payroll not in NEP (+attendance)** — the enrollment sheet: import these
   people into NEP; `checked_in_at_vote` column prioritizes the no-shows for
   recruitment.
8. **Payroll list (clean)** — reference copy.

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
