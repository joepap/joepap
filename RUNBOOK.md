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

**Staff — ONE link for the whole team (TinyURL this):**

| What | URL |
|---|---|
| **Staff hub** — pick your station | base `:8443/staff` |

The hub is a menu: Check-in table · Help Table · Admin Dashboard · Line
Moderator (+ projector / question-line shortcuts). Each still asks for its
password (staff 3636; Admin needs the organizer PIN 6363), so it's safe that
everyone sees every button. The moderator /
display / question-line links build from the address bar, so they survive a
failover to the laptop. This one link replaces the individual worker URLs
below — those still work if you want them:

| What | URL | PIN |
|---|---|---|
| Check-in stations | base `:8443` | staff password (3636) |
| Help Table | base `:8443/discrepancy.html` — the address still says "discrepancy", same page. Also a tab inside Admin. | staff password (3636) |
| Admin dashboard | base `:8443/admin.html` | organizer PIN (6363) |
| Question-line moderator | base `/mod` | staff password (3636) |
| Projector display | base `/display` | none |

**Print-from-your-browser pages:** base `:8443/payroll-print.html` (payroll
paper reference) and base `:8443/qr-card.html` (registration QR cards).

**Two TinyURLs cover it:** the members' question-line/meeting link, and the
**staff hub** (`:8443/staff`). Paste the meeting-hub TinyURL into Admin →
Check-in email as the "Meeting page link" so the confirmation emails use it too.

## Eligibility model (payroll is the authority)

- 🟢 **GREEN — on the payroll dues list** → ballot at the main table.
- 🔴 **RED — in NEP but NOT on payroll** → no ballot at the main table; "Send to
  Help Table," where a human checks the printed payroll and can override.
  (NEP can be stale — promoted out, etc.)
- 🟡 **YELLOW — on payroll but not in NEP** → confirmed dues-payer; **issue the
  ballot at the main table** (green button on their card). They're auto-added
  to the Help Table list — point them there to enroll (personal email/phone —
  @dc.gov is rejected — plus a registration QR card).
- 🟢➜🚩 **Data record** (in NEP, no portal account) → gets the ballot at the main
  table AND is auto-added to the Help Table queue; just point them to that
  table so their email/phone gets collected for a portal invite.
- 🔴 **Known non-payers** (the union's highlighted list) → blocked outright.
- See DISCREPANCY-TABLE-GUIDE.md (the Help Table worker guide) — print it.

Two passwords: the **staff password 3636** covers every worker station —
check-in tables, the Help Table, and the question-line moderator (each
volunteer enters it once along with their own name at check-in). The **Admin
Dashboard has its own organizer PIN: 6363** (live counts, settings, imports,
exports, voids — organizer only). Both can be changed in Admin → Settings;
the moderator PIN is set on the mini itself.

**Volunteer briefing (the whole thing):** open the check-in link → type YOUR
NAME → password 3636 → pick your table ("Check-in table" or "Secondary Help
Table" — the Help option jumps straight to the Help Table screen). Sounds:
one bright beep + buzz = checked in, hand over the ballot; a low double-beep
+ long buzz = STOP screen (duplicate or non-payer) — read it. iPhones beep
but don't buzz.

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
3. **PINs**: staff password 3636 (check-in, Help Table, moderator) — tell
   volunteers "3636" and that's the whole briefing. Admin Dashboard: 6363
   (keep that one to yourself).
4. Ballots are **blind** — numbering is permanently off (the app never shows a
   ballot number). "Ballots handed out" on the dashboard = the check-in count.
5. **Print**: the payroll reference (`/payroll-print.html`), the registration QR
   cards (`/qr-card.html`), the ONE event QR — a TinyURL pointing at the
   **`/meeting` hub page** on the queue server (login / register / question
   line / email help, all in one) — and both one-page guides. Print all QRs
   from the TinyURL, never the raw ts.net address (see FAILOVER.md).
6. **Check-in email**: already set up and working (sends from
   joseph.papariello@iaff36.org). In Admin → "Check-in confirmation email":
   confirm the title shows **· ON**, the meeting-page TinyURL is in "Meeting
   page link", and hit **Send test** once to prove it. Don't retype the
   settings — the app password is already stored.
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
2. Admin → **"Clear event data (keep roster + payroll)"** — type the code the
   popup asks for (`RESET`, or `RESET-<number>` when test check-ins exist) —
   to wipe rehearsal check-ins. Roster, payroll and blocks are kept. Verify
   counts: roster ~3,398, payroll 1,761, zero checked in.
3. Open the check-in URL on your phone: search a name → green member loads.
4. Scan one real license on one phone: match appears.
5. Search a known red case → confirm the red **DUES NOT VERIFIED** pill and
   the **"→ Send to Help Table"** button appear, and the person shows up on
   the Help Table (its page, or the Help Table tab in Admin). Resolve it,
   then void that test check-in from the admin dashboard.
6. Check-in email: check yourself in (then void it) — confirm the email lands
   and its link opens the meeting page. "Emails sent" counter ticks up.
7. Queue: print/post the QR, moderator opens `/mod`, taps **Clear entire
   line** and confirms the popup.
8. Confirm every check-in phone shows its volunteer's name (top right chip).
9. Backups run automatically every 10 min into `backups/` — nothing to do.
10. On the MacBook: start `bash ~/local36-backup/scripts/pull-backup.sh loop`
   and leave it running — off-machine copies + a warm spare server.
   Full switch procedure: **FAILOVER.md**.

## During the event

- **Camera**: tap "Scan ID", point at the barcode on the BACK of the license.
- **No scan?** Type 2+ letters of any name — last name, "john smith",
  first name only, "smith, j", or a member/dept ID number all work.
- The card shows two pills: **DUES VERIFIED ✓** (green — issue ballot; red
  says "send to Help Table") and **NEP DATABASE** (green = registered;
  yellow = not in NEP — enroll at the Help Table).
- **No info updates in the line** — members fix their own details through the
  meeting-page link they get by text/email. Keep the line moving.
- **Sounds**: one bright beep = checked in. Low double-beep = STOP screen.
- **Duplicate** = full red screen with original time/station. No ballot;
  disputes go to the Help Table.
- **Yellow portal banner** = they got their ballot AND were auto-added to the
  Help Table queue — just point them to that table on their way.
- **Not on roster** = log via the button, send to the Help Table. No ballot.
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

## After the event — download all ten exports

Admin → Exports (same order as the buttons):
1. **Check-in log** — every ballot: who, when, which volunteer, method, voids.
2. **Contact corrections** — the emails/phones captured at the Help Table;
   apply to ConnectPlus.
3. **Not-found list** — follow up.
4. **Access granted** — legacy; will be empty this year (that in-line flow was
   removed). Grab it anyway for completeness.
5. **Discrepancy log** — every Help Table case and its outcome (the challenge
   paper trail).
6. **Email log** — every confirmation email: sent, failed, or no address on
   file (the no-address rows are an email-collection follow-up list).
7. **Audit log** — every check-in, blocked attempt, duplicate attempt, void and
   override — the evidence trail if a ballot is contested.
8. **NEP dues-members** — every dues-payer in NEP-import format (Member Status
   = Active, Work Status = Active Member) to keep the database current after
   the vote. Includes the emails/phones collected from data records at the
   Help Table.
9. **Payroll not in NEP (+attendance)** — the enrollment sheet: import these
   people into NEP; `checked_in_at_vote` column prioritizes the no-shows for
   recruitment.
10. **Payroll list (clean)** — reference copy.

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
