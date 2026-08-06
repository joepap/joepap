# Open items

Things waiting on somebody, so they don't get lost between sessions.
Close an item by deleting it. Anything finished lives in git history, not here.

Roster state at last update: **NEP export of 6 Aug 2026, 04:44 — 3,489 members**
(`data/uploads/roster-21`, gitignored). Dues report: **13 June 2026**, 1,781
payers. IAFF export: **July 2026**, 2,514 members. Telestaff: **5-9 Aug 2026**,
1,684 people.

## Fix first — 13 PeopleSoft numbers are on two members each

Every one is a father and his son, and the son is the one working. The
one-to-one assignment was rebuilt from a fresh roster for each batch and is
not stable across runs, so the same payroll number went to the father in one
batch and the son in another. Both writes stuck.

The number belongs to whoever telestaff has working today:

| number | keeps it | must be cleared |
|---|---|---|
| 00003670 | Watson Jr., Richard L | Watson, Richard [Active Retired] |
| 00037151 | Thompson, Jr., Gregory F | Thompson, Gregory F [Active Retired] |
| 00006773 | Rainwater, Jr, Joseph H | Rainwater, Joseph H [Active Retired] |
| 00004546 | Johnson, Joseph W | Johnson, Joseph [no status] |
| 00111758 | Humphries Jr, Clifton D | Humphries, Clifton D [Active Retired] |
| 00107998 | Carter Jr, James E | Carter, James E [Active Retired] |
| 00107993 | Baltimore Iii, William J | Baltimore, William J [Active Retired] |
| 00035200 | Curry, Jr., John W | Curry, John W [Deceased] |
| 00035267 | Denmark, Jr., Alan L | Denmark, Alan [Active] |
| 00101069 | Faulkner Jr, John M | Faulkner, John [Active] |
| 00113842 | Edwards, **Raymond Allen** | Edwards, Raymond C [Active] |
| 00113839 | Harris, **Jason A** | Harris, Jason M [Active] |
| 00096802 | Thompson, William L | Thompson, William C. — **and William C should get 00036560** |

Edwards and Harris are the two where the *son* is not the suffixed record —
telestaff's middle initial is the only thing that separates them, so do not
resolve these by suffix alone.

The code fix belongs in the assignment: a payroll number must never be
written to two members, and the tie-break needs the middle initial.

## Still to upload

- **PeopleSoft Number**: 45 members with no IAFF number, no email and no
  phone — nothing unique to key on. By hand, or after they get contact info.
- **Chiefs to Drop**: the 18-row sheet does not appear to have been applied —
  NEP still shows 4 chiefs Active. Thomas L Williams also needs doing by hand
  (no IAFF number).
- **Paying Active Member**: 62 keyed on phone, 9 with nothing to key on.
- **Platoon**: 42 with nothing to key on.

## Needs adding to NEP itself

- **Add `Recruit` to the DC Fire Rank dropdown.** Telestaff has 2 recruits;
  NEP has no such value, so they are excluded from the rank upload for now.
  Joe's call that recruits should not be on our sheet at all — revisit once
  the option exists.

## Ranks still needing a decision

Telestaff rank on the left, no safe equivalent in NEP's 53-value dropdown.
Their rank is left untouched until Joe says; they still get a PeopleSoft
number.

| telestaff rank | people |
|---|---|
| Captain - EMS Supervisor | 14 |
| Battalion EMS Supervisor | 9 |
| PARAMEDIC | 9 — Joe is looking at these |
| Lieutenant / Captain - Fire Operations Center | 8 |
| Battalion Chief - EMS | 4 |
| Battalion Chief - Special Operations | 4 |
| Fire Liaison Officer | 4 |
| Lieutenant - Emergency Liaison Officer | 2 |
| seven one-person ranks | 7 |

Settled already: `Captain - EMS Liaison Officer` → **EMS Captain**;
`SERGEANT DFC AIDE` → **Sergeant**; `Lieutenant - Staffing Officer` →
**Lieutenant**; `RECRUIT` → excluded.

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
- **Rank.** Telestaff wins, reversing the earlier call — NEP's ranks were
  years out of date and 22 of 37 working chiefs were still filed as Captains
  and Lieutenants. Every value written must come from NEP's own 53-entry
  dropdown.

## Bigger jobs not started

- **Run `lib/audit.js` and work the list.** 1,194 findings against roster-21,
  113 of them high — down from 2,631 at the start of the evening. Biggest
  groups now: 411 IAFF numbers absent from the IAFF's own export, 316 members
  with no Member Status, 137 damaged names, 104 duplicate profiles, 85 still
  unmarked as paying, 81 records holding nothing but a name.
- **Duplicate profiles**: 104 pairs. 27 have a contact detail that exists only
  on the ghost — copy it across before deleting. 22 more are Jr./Sr. pairs
  reported as *possible father and son* and deliberately not merged.
- **Junk IAFF numbers**: 25 members whose number is a date, 1 that reads
  `00L#326`.
- **PeopleSoft Number** is live and filled on 1,529 members. Telestaff is the
  authority for it; see `lib/telestaff.js`.
- **209 people work in telestaff but are not on the dues report** — active
  employees not paying Local 36 dues. Some are chiefs who may sit outside the
  unit; plenty are firefighters.
- **13 zero-deduction rows** on the June report: on the payroll deduction list
  but $0.00 taken. Treated separately from paying status throughout.
- **A current dues report.** Everything above rests on 13 June.
- **Drive-folder automation** for the monthly scan — needs the public link
  confirmed and the folder name.
