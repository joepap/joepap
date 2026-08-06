# Open items

Things waiting on somebody, so they don't get lost between sessions.
Close an item by deleting it. Anything finished lives in git history, not here.

Roster state at last update: **NEP export of 6 Aug 2026, 3,491 members**
(`data/uploads/roster-17`, gitignored). Dues report: **13 June 2026**, 1,781
payers. IAFF export: **July 2026**, 2,514 members.

## Do this next

- **Paying Active Member.** 1,277 rows keyed on IAFF number are with Joe. Then
  three more sheets: 311 on email, 111 on phone, 52 with nothing unique to key
  on. Only the **Yes** values are being written — Joe's call to hold the No's,
  and a good one: of the 391 rows that would have gone to No, 388 are blank
  today, not Yes. Marking those No asserts something new rather than correcting
  anything, and the report is eight weeks old.
- **Platoon**, last batch: 42 people with no IAFF number, no email and no
  phone. Needs a different approach — same 42 block the last phone sheet.
- **Mobile numbers**, remaining: 1 keyed on email, 42 with nothing to key on.

## Waiting on a member to reply

- **Jeffery / Jeffrey Agnew** (#1456943). Payroll *and* telestaff both print
  "Jeffery"; NEP and his own Gmail say Jeffrey. Joe is emailing him. NEP keeps
  **Jeffrey** until he answers.
- **Warren** (#494309) and **Faunce** (#1049247) — two members sharing one IAFF
  number each. Joe emailed both.

## Needs doing by hand in NEP

- **Ismael Flores** — his record carries Steven Schlegel's email
  (`steven.schlegel@dc.gov`) *and* Schlegel's mobile. Set his phone to
  **+1 202 316-9803** (his own, from telestaff, and free) and clear the email.
  Until this is done, Schlegel cannot take his own number back and Bekure
  cannot take Schlegel's.
- **Thompson, William L** holds `wct6280@gmail.com`, which reads as William
  **C** Thompson. Same contamination, not yet confirmed.
- **Gary Bellegarde** lost `Paying Active Member = Yes` and
  `Work Status = Active Member` when his duplicate was merged.
- **Key'shaun Samuel** — NEP has only "Key'". No IAFF number, email or phone.
- **Alexander Henry** — payroll says Alexander; NEP holds two profiles, "Alex"
  and "Alex D". Sort out which is real before renaming either.

## Damaged records that keep surfacing

Each of these lands on three different problem lists at once, so fixing them
clears more than it looks like.

- `iaz, Davi` — a damaged duplicate of **Diaz, David** (#1674118), also in NEP.
- `M, Kurt` — same shape; **Long, Kurt M** (#1107560) is also in NEP.
- `Ne, Dennis`, `S, Ebony`, `Lo, Nicholas C` — one and two-letter surnames.
- `Lea, D'Andfe L` and `Lea, D'Andre` — one is a typo of the other.

All carry an `L36NEW` note, so they were created from the payroll report and
are genuinely dues payers. They only look unmatched because the names are
mangled beyond matching.

## Settled — do not reopen

- **Berl Wheeler.** Leave alone. The audit reported `Wheeler Sr., Berl` and
  `Wheeler, Berl D` as one person on the strength of a shared phone. That was
  wrong — the empty record has no phone at all. The matcher had put the
  payroll line on the hollow record, and the false evidence came from that bug
  (now fixed, with a regression test in `test/reconcile.test.js`).
- **Douglas Wheeler.** Two men, correctly kept apart by different IAFF numbers:
  Douglas A (#153483, Deceased, appointed 1967) and Douglas W (#1113004,
  Active, appointed 2004). The father/son rule held.
- **The 69 suffix differences.** NEP stores Jr./II/III inside the Last Name
  field. Cosmetic; the matcher already ignores it.
- **Rank.** NEP wins over telestaff, per Joe.

## Bigger jobs not started

- **Run `lib/audit.js` and work the list.** 2,631 findings against roster-17,
  114 of them high. Biggest groups after the paying job: 411 IAFF numbers
  absent from the IAFF's own export, 316 members with no Member Status, 139
  damaged names, 104 duplicate profiles, 81 records holding nothing but a name.
- **Duplicate profiles**: 104 pairs. 27 have a contact detail that exists only
  on the ghost — copy it across before deleting. 22 more are Jr./Sr. pairs
  reported as *possible father and son* and deliberately not merged.
- **Junk IAFF numbers**: 25 members whose number is a date, 1 that reads
  `00L#326`.
- **PeopleSoft Number backfill.** Field not yet added to NEP. 1,753 members
  ready; all six duplicate-emplid flags cleared. Telestaff also carries the
  same number, which is a second source for it.
- **209 people work in telestaff but are not on the dues report** — active
  employees not paying Local 36 dues. Some are chiefs who may sit outside the
  unit; plenty are firefighters.
- **13 zero-deduction rows** on the June report: on the payroll deduction list
  but $0.00 taken. Treated separately from paying status throughout.
- **A current dues report.** Everything above rests on 13 June.
- **Drive-folder automation** for the monthly scan — needs the public link
  confirmed and the folder name.
