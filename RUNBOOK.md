# Local 36 Check-In — Event Runbook

One page. Print this.

## Before the event (do at home, days ahead)

1. **Install** on the server laptop/Mac mini: [Node.js 18+](https://nodejs.org), then in this folder: `npm install`
2. **Travel router**: plug it in, connect the server machine (Ethernet if possible).
   In the router admin, give the server a **static/reserved IP** (e.g. `192.168.8.10`) —
   the HTTPS cert is bound to this IP, so it must not change on event day.
   Write the Wi-Fi name/password on tape on the router.
3. **Certs** (needed for iPad cameras): install [mkcert](https://github.com/FiloSottile/mkcert)
   (`brew install mkcert`), then:
   ```
   npm run certs 192.168.8.10        # your server's static IP
   ```
4. **Trust the cert on each iPad** (one time, ~1 min each):
   - AirDrop or email the root CA file the script printed (`.../rootCA.pem`) to the iPad
   - Tap it → "Profile Downloaded" → Settings → Profile Downloaded → **Install**
   - Then Settings → General → About → **Certificate Trust Settings** → toggle ON for the Local36/mkcert CA
5. **Import the roster**: start the server (`npm start`), open `http://localhost:8080/admin.html`
   on the server machine (PIN default **3636** — change it in Settings), upload the ConnectPlus
   CSV, map the columns, import. Optionally import the paper dues roll.
6. **Rehearse**: `npm run seed` loads 300 fake members and writes `seed-output/`
   (practice CSV, printable PDF417 barcodes, raw AAMVA strings). On each iPad open
   `https://<server-ip>:8443/barcode-test.html` and confirm camera decoding works.
   **Re-import the real roster (with "Replace existing") after rehearsal.**

## Event day — start the system

1. Power the travel router. Wait for Wi-Fi to appear.
2. On the server machine: `npm start` in this folder.
   It prints the URLs, e.g.:
   ```
   HTTP  : http://192.168.8.10:8080
   HTTPS : https://192.168.8.10:8443
   ```
3. On every station (laptop or iPad): join the router's Wi-Fi, open
   **`https://192.168.8.10:8443`** (iPads MUST use https for camera).
   Laptops with USB scanners can use either URL.
4. First load asks for a **station name** and **default verification method**:
   - Green lane stations → default `Portal + ID`
   - Standard lane stations → default `License scan`
5. Admin dashboard: `https://192.168.8.10:8443/admin.html` (watch counts live).

## During the event

- **USB scanner**: just scan — from anywhere on the check-in page. Match appears, tap, confirm.
- **Camera**: tap "Scan ID", point at the barcode on the BACK of the license.
- **No scan?** Type 2+ letters of the last name. `smith, j` narrows by first name.
- **Green ACTIVE pill** = eligible, issue ballot. **Red NOT ELIGIBLE** = no ballot without
  a conversation. **Gray NO STATUS** = blank in NEP; send to the resolution table.
- **Duplicate** = full red screen with original time/station. Do NOT issue a ballot;
  send disputes to the resolution table.
- **Verify member info** (open on every card): read it back to the member, fix anything
  wrong (name, email, phone, address, rank/assignment/platoon, appointment date,
  paramedic), ask "are you getting our emails?", tap Save. Never blocks check-in;
  a green "corrections already captured" note means another station already did it.
- **Yellow portal banner** = hand them a portal card / help lane after check-in.
- **Not on roster** = log the name via the button, send to resolution table. No ballot from the app.
- **Help lane**: after getting the member portal access, tick "Portal access granted today"
  on their card, then check them in normally.

## Question line (floor debate)

A separate mini-site lets members scan a QR code and line up to speak; the moderator
works the line from their phone. It runs on members' **cellular data**, so the mini
needs internet at the venue (a phone hotspot works) — the check-in LAN stays offline
and is never exposed.

1. On the mini: `npm run queue`   (separate process, port 8090, own database)
2. Expose it publicly (one time, needs Tailscale on the mini — already set up):
   ```
   tailscale funnel --bg 8090
   ```
   It prints the public URL, e.g. `https://claudemini.tailXXXX.ts.net`. HTTPS is automatic.
3. **Projector**: open `<public-url>/display` on the projection laptop, paste the same
   public URL when asked → big QR + live "N people in line" for the room.
4. **Moderator's phone**: open `<public-url>/mod`, PIN `3636` (change with
   `MOD_PIN=xxxx npm run queue`). Swipe right = done, left = skip, buttons work too,
   undo available. "Clear entire line" resets before the meeting.
5. **Members**: scan → enter full name → live "#7 — 6 people ahead of you" that
   updates by itself; big green "You're NEXT" when they're up.

If the funnel command errors: `tailscale funnel status`, or check Funnel is enabled for
your tailnet at https://login.tailscale.com (Settings → Funnel). Without venue internet
the queue can run on any internet-connected laptop instead — clone the repo there and
repeat steps 1–2 on that machine.

## If things break

| Problem | Fix |
|---|---|
| Station browser crashed/refreshed | Just reopen the URL — all state is on the server. Station name is remembered per device. |
| A station (iPad/laptop) dies | Nothing is lost. Grab any spare device, join Wi-Fi, open the URL, set the station name, keep going. |
| Camera won't start on iPad | You're on `http://` — switch to `https://…:8443`. Still failing → cert not trusted (redo step 4) or use USB scanner / type-ahead. |
| Wrong person checked in | Admin dashboard → Recent check-ins → **Void** (logged). Then check in the right person. |
| Server laptop dies mid-event | The database is `data/checkin.db` (plus `-wal`/`-shm` files). Copy the whole `data/` folder to a backup machine with this repo, `npm start` there, repoint stations at the new IP. Consider copying `data/` to a USB stick every ~30 min as cheap insurance. |
| Router dies | Any phone hotspot or spare router works — but the server IP will change, so cameras lose HTTPS trust. USB scanners and type-ahead still work over `http://<new-ip>:8080`. |
| Forgot admin PIN | Stop the server, run `node -e "const db=require('./lib/db'); db.setConfig(db.open(),'admin_pin','NEWPIN')"`, start it again. |

## After the event

Admin dashboard → Exports:
- **Check-in log** (includes verification method + access-granted flags)
- **Contact corrections** (batch-update ConnectPlus)
- **Not-found list** (follow up)
- **Access granted** (who the help lane set up)

Then archive the `data/` folder somewhere safe and delete it from the laptop.
No license data is in it — but it is the membership roster.
