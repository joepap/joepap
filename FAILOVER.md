# Failover — running the event from the MacBook if the mini dies

The MacBook is on the same Tailscale network, so it can serve the internet the
same way the mini does — it just gets **its own public URL**. Because stations
and printed QRs use the **TinyURL short links** (which we control), the switch
is: start the laptop, repoint the short links, everyone re-opens. ~5 minutes.

**Prerequisites for this to work — verify BEFORE the event:**
- All printed materials and volunteer instructions use the SHORT links, never
  the raw `ts.net` addresses (question-line QR poster especially).
- You can actually EDIT the TinyURL destinations from your phone — log in and
  test-edit one now. (Free-tier TinyURLs are often not editable; if yours
  aren't, make editable ones or the whole plan falls back to announcing the
  raw laptop URL.)

## Prep on the MacBook (do this BEFORE the event — 10 minutes, needs internet)

```
git clone -b claude/local-36-checkin-app-m8sypg https://github.com/joepap/joepap.git ~/local36-backup
cd ~/local36-backup && npm install
```

Then, after the final roster + payroll import on the mini, copy the data over
(from the MacBook):

```
scp josephpapariello@dcjoe-claude-macmini.tail5dba36.ts.net:"Desktop/claude/local36/data/*" ~/local36-backup/data/
```

Dry-run once: `npm start` in `~/local36-backup`, open http://localhost:8080,
confirm the roster and payroll counts look right, Ctrl-C. The laptop is now a
warm spare.

## During the event: keep the data safe off the mini

On the MacBook, in a terminal, run and leave running:

```
bash ~/local36-backup/scripts/pull-backup.sh loop
```

It copies the mini's databases + snapshots to the laptop every 10 minutes.
Worst case after a total mini loss: the last ~10 minutes of check-ins, which
the paper flow at the tables can reconstruct.

## If the mini actually dies

1. On the MacBook, restore the freshest data (pick the newest file in
   `~/local36-backup/backups-from-mini/`):
   ```
   cp ~/local36-backup/backups-from-mini/checkin-live-*.db ~/local36-backup/data/checkin.db   # newest one
   cp ~/local36-backup/backups-from-mini/queue-*.db ~/local36-backup/data/queue.db            # newest one
   ```
2. Start both servers:
   ```
   cd ~/local36-backup && npm start        # terminal 1 (check-in)
   npm run queue                            # terminal 2 (question line)
   ```
3. Expose them (first time asks you to enable Funnel for this device — follow
   the printed link):
   ```
   /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg 8090
   /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg --https=8443 8080
   ```
   It prints the laptop's public URL — something like
   `https://gustave-eiffel-the-2nd.tail5dba36.ts.net`.
4. **Update the TinyURL redirects** to point at the laptop's URL (check-in
   short link → `<new-url>:8443`, question-line short link → `<new-url>`).
   Then tell stations: "close the tab and re-open the short link" — a stale
   open tab still points at the dead mini, so re-opening matters. They
   re-enter their name + station password once (the new address is a new site to the
   browser). Duplicate protection still holds — the restored database knows
   everyone already checked in.
5. Question line: printed QR posters keep working IF they encode the TinyURL
   (make sure of this when printing!). Members re-scan or reload; the
   moderator re-opens `/mod` via the short link.

## Reality check

- Anyone checked in during the gap minutes may not be in the restored copy —
  if a "already checked in?" dispute comes up, the Discrepancy Table decides.
- The laptop must stay on power + internet (hotspot is fine) for the rest of
  the meeting, lid open.
- After the event, exports come from the laptop (it now holds the truth).
