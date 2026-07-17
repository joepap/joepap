# Question Line — Moderator Guide

*IAFF Local 36 · DC Fire Fighters Association*

The question line replaces raised hands and mic lines: members scan a printed QR
code, enter their name and what their question is about, and watch their place
in line on their own phone. You work the line from yours.

## The two pages

| Who | Where | What they see |
|---|---|---|
| Members | main link (from the printed QR) | Name + "What's your question about?" → "You're #7 — 6 people ahead of you", live. Big green **You're NEXT** when they're up. |
| **You (moderator)** | same link + `/mod` (PIN required) | The line in order, each person's topic under their name, UP NEXT in big type, controls below. |

*(A `/display` page also exists — open it once and print the QR it shows, or
print the QR image directly. Post copies at the mic and around the room.)*

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

### Grouping questions by topic

Each person's **topic** shows under their name. When someone raises a subject and
you want to take all the related questions before moving on:

- **Tap any person's topic.** Everyone else in line asking about the same thing
  lights up gold, and a bar shows "Grouping: … — N in line."
- Work through the gold rows (swipe/tap done) while the subject is live.
- Someone in the room who scans in mid-discussion on that topic **lights up
  automatically** — so you catch the follow-up before moving on.
- Tap **Clear** on the bar to drop the grouping and return to the normal order.

Matching understands the contract's vocabulary — it groups by shared word AND by
shared subject, so "money," "comp," "pay scale," and "acting pay" all group as
compensation even though they share no letters. It knows the FY25-27 CBA topics
(pay, overtime, staffing, healthcare, retirement, leave, promotions, safety, K9,
etc.). It's a highlight only — it never reorders the line or forces anything, and
you always have every topic in view as a backstop. (The word list lives in
`public-queue/topics.js` if you ever want to add a term.)

More than one person can be logged into /mod at the same time (e.g. a floor
volunteer adding no-phone members while you run the mic) — everything stays in
sync on both phones automatically.

## Good to know

- One phone = one spot in line. Nobody can enter themselves twice.
- The list is first-come, first-served by when they submitted. There's no
  reordering — only done / skip / undo, plus topic grouping to highlight related
  questions.
- Members who leave the line themselves just disappear from your list.
- If your phone dies or you close the tab, nothing is lost — open /mod on any
  phone, enter the PIN, and keep going.

## Event-day startup (the technical person does this)

1. The mini runs both servers automatically (they start at boot). The public
   link stays the same every time.
2. Before the event: open `<link>/display`, print the QR, post copies at the
   mic and around the room.
3. Moderator phone: open `<link>/mod`, enter the PIN, tap "Clear entire line".
