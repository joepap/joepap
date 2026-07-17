# Question Line — Moderator Guide

*IAFF Local 36 · DC Fire Fighters Association*

The question line replaces raised hands and mic lines: members scan a QR code on
the screen, put in their name, and watch their place in line on their own phone.
You work the line from yours.

## The three pages

| Who | Where | What they see |
|---|---|---|
| Members | main link (from the QR) | Name box → "You're #7 — 6 people ahead of you", live. Big green **You're NEXT** when they're up. |
| **You (moderator)** | same link + `/mod` (PIN required) | The line in order, UP NEXT in big type, controls below. |
| Projector | same link + `/display` | Big QR + "QUESTIONS OR COMMENTS?" + live count. |

## Working the line (on /mod)

- **UP NEXT** (green box at top) — the person to call to the microphone.
- After they speak: **swipe their row to the RIGHT** (or tap **✓**) — done.
- Not there / passes / out of order: **swipe LEFT** (or tap **✗**) — skipped.
- Fat-fingered someone? **undo** next to their name under "Recently handled" —
  they go back to their original spot in line, not the back.
- **Someone without a phone**: type their name in the **"Add someone without a
  phone…"** box and hit **+**. They join the end of the line like everyone else —
  tell them their number, since they can't see the screen ("you're #6, listen
  for your name").
- **Before the meeting starts**: tap **"Clear entire line"** once to wipe any
  test entries.

More than one person can be logged into /mod at the same time (e.g. a floor
volunteer adding no-phone members while you run the mic) — everything stays in
sync on both phones automatically.

## Good to know

- One phone = one spot in line. Nobody can enter themselves twice.
- The list is first-come, first-served by when they submitted. There's no
  reordering — only done / skip / undo.
- Members who leave the line themselves just disappear from your list.
- If your phone dies or you close the tab, nothing is lost — open /mod on any
  phone, enter the PIN, and keep going.

## Event-day startup (the technical person does this)

1. On the server: `npm run queue`, then `tailscale funnel --bg 8090`
   (prints the public link — it stays the same every time)
2. Projector: open `<link>/display`, paste the same link when asked
3. Moderator phone: open `<link>/mod`, enter the PIN
4. Tap "Clear entire line", and you're live
