# Open items

Things waiting on somebody, so they don't get lost between sessions.
Close an item by deleting it. Anything finished lives in git history, not here.

Roster state at last update: **NEP export of 14 Aug 2026, 16:55 — 3,430 members**
(`data/uploads/roster-44`, gitignored). Dues report: **13 June 2026**, 1,781
lines / 1,768 payers. IAFF export: **July 2026**, 2,514 members. Telestaff: **5-9 Aug 2026**,
1,684 people.

## The paying-member gap — 1,583 in NEP against 1,768 actually paying

Joe, 12 Aug: *"nep only has 1584 members marked as paying dues members. can we
get that closer"*. Worked out that evening against `roster-39`.

`Paying Active Member` had only ever held **Yes or nothing** — not one `No` in
the whole roster. So the gap was not 198 wrong answers, it was unanswered ones.
(The field *does* offer `No`; Joe used it on 13 Aug for the eight $0.00
members.) Measured on 12 Aug, of 2,117 Active members:

| | |
|---|---|
| Yes, and on the June payroll | 1,555 |
| Yes, and the payroll agrees once the scan damage is read through | 17 |
| **blank, and on the payroll — should be Yes** | **184** |
| blank, not on the payroll — should be `No` | 340 |
| held back, a relative shares the payroll line | 21 |

The 17 are why the raw match looked worse than it is. Every one of them *is* on
the payroll; the scanner mangled the name past the matcher — "SevendorE Brandon"
is Devendorf, "Qeschger,Sarah" is Oeschger, "aww tematH'" is unreadable. Nobody
marked them Yes in error.

**Done bar three.** Joe ran the sheets the same evening; NEP went **1,583 →
1,763**. Email matched 108 of 108, `PeopleSoft Number` 60 of 60, `Phone Number`
**0 of 10**, `Last Name` 2 of 2, `First Name` 8 of 11. Bartee was pulled off
the list — see the $0.00 section below. The field diff across all four exports
is clean: only `Paying Active Member` moved, plus a few members editing their
own addresses and Thornhill's duplicate payroll number being cleared by hand.

**Where it stands on the morning of 13 Aug:** of 2,117 Active members, 1,744 are
`Yes`, 8 are `No`, 341 are unanswered pending a current dues report, 21 are held
back as family collisions, and 3 are still to do by hand.

**3 left, by hand: Drake Roshawnda · Shaw Erica · Young Josiah.** They are the
only three the first-name key missed, and the reason looks structural — all
three are records *we* created from the payroll report (`All Members` group
only, an `L36NEW` note, no appointment date), while all 8 that matched were
pre-existing NEP records. Worth asking what NEP's step 5 showed for them.

That reaches **1,766** against **1,768** genuinely paying on the June report.
The remainder is the 21 contested father/son lines and four payroll lines too
damaged to read.

The 340 `No` is the other half of Joe's standard and has not been built yet.
**23 of them are still on telestaff** — working, but not on the June payroll.
That is the Botwin shape and needs a current dues report before anyone is marked
`No`.

## $0.00 on the payroll — Joe's rule

Joe, 12 Aug: *"I don't want to update the paying dues field if they are 0
dollars. If they are active in telestaff and our nep, they can be active, but
the 0$ and the not paying dues not saying yes, lets us know its something we
have to fix."*

Thirteen lines on the 13 June register print `0.00 0.00 0.00` where everyone
else prints `49.19 49.09 0.10`. Being on the register is not the same as
paying, and nothing in the app read the money column until now, so all 13 were
counted as payers. **The report has 1,781 lines but 1,768 payers.**

The app now reads the amount on every line, holds $0.00 rows out of the
"Mark Paid" sheet, lists them on their own `Zero Deduction — CHASE` sheet, and
treats a deduction falling to $0.00 as a stopped payer even when the member
stays on the report. `scripts/backfill-amounts.js` re-read the June report from
its stored OCR text — no re-scan needed.

**The eight wrong `Yes` marks are done** — Joe set all eight to **`No`** on
13 Aug, which also settles a standing unknown: the field *does* offer `No`, not
just `Yes` and blank. Barrow · Chen · Devendorf · Dufresne · Elliott · Irving ·
Long · Tyler. Bartee Mario stays blank and `Active` — he is on telestaff as a
Firefighter EMT, Platoon 2, which is exactly the signal Joe wants surfaced
rather than tidied away.

Still unanswered: **what a $0.00 line means** — leave, workers' comp, a stopped
deduction or a payroll error. That decides whether these members get chased or
left alone.

## The Watson father and son — SETTLED 14 Aug

Telestaff decided it. Employee **3670** is *Richard Watson, Engine 17,
FIREFIGHTER TECH, Platoon 2, (301) 399-6174* — and 00003670 is the **son's**
payroll number in NEP. So the payroll line reading `Watson,Richard 00003670`
belongs to Watson Jr., Richard L, not his father. One of the 21 contested
father/son lines closed.

The son now carries payroll 00003670, IAFF **#1080006** (MEM on their roll),
Firefighter Technician, Platoon 2 and the (301) 399-6174 phone. The empty third
Watson record is deleted.

**Still open on the father** (`Watson, Richard`, Active Retired, IAFF #237199,
Brandywine): his phone reads **+1 301-494-0561** with a note "wrong phone
number" — the son's old number was +1 301-494-05**66**, one digit off. And his
record still shows Engine 17 / Platoon 2, which only Joe can say is his own
last posting or the son's details carried over.

## Merges cost data twice — the rule that follows

Gooding and Reed were merged the wrong way round on 14 Aug: the record holding
the service history was deleted and the near-empty self-registration survived.
Gooding lost his Battalion Fire Chief rank, Safety Office, Platoon 2,
appointment date, IAFF #479616 and his 2025/2026 retired-dues **Paid** marks.
Nothing was unrecoverable — every value was read back out of `roster-42`.

**Before any future merge, send Joe one sheet showing every field of both
records side by side with the keeper marked.** Naming the keeper in prose is
not enough when both records look plausible on screen.

## Duplicate profiles — 12 same-name groups, measured 13 Aug

**Six have an empty side and want deleting**: Long Brian, Taylor Charles, Taylor
Herbert, Neal Jimmy and Farrow Shirley are each *two* completely empty records;
Watson Richard is one good record plus a shell.

**Six are split profiles to merge**: Noznesky Alan, Schiafone Christopher M,
Smith Michael, Clark Timothy J, Reed Trevor, Gooding Wallace. In each case the
two records hold different halves of the same person — one carries the phone,
IAFF number, rank and appointment date, the other the email and date of birth.
No Jr or Sr on any of them, so these read as split profiles rather than fathers
and sons. Copy the missing fields onto the keeper, then delete the other.

## 10 non-Active members still hold a payroll number — parked

Retired, dropped, alumni and life members do not have a payroll number, so
each of these came from the wrong generation. Every one was independently
flagged by the cohort test: hire dates 20 to 39 years away from the neighbours
of the number they hold.

Kline, Kevin P · Evans, Marc A · Roop, Michael A · Lacore, Michael D ·
Schaefer, Paul M · Sullivan, Jason · Klinger, Wayne D **[Active Retired]** ·
Walker, Michael Q · Tyner, Sr., Reginald H **[Alumni]** · Moore, Kenneth R ·
Mitchell, Kenneth **[Life]**

**Thornhill is done** — his was the father/son pair Joe warned about, and it
turned out to be exactly that: payroll 00130157 belongs to Thomas E, the son,
who is working and paying. Thomas B is the father, appointed 1990, Drop.
Settled 12 Aug. **Moore, Kenneth R is done too**, same shape — 00138941 belongs
to Kenneth R. Moore III.

Joe parked the rest on 11 Aug. Ten left, and nobody is waiting on them.

## Duplicate numbers — the standing rule

Joe, 12 Aug: *"i'm not worried if we have an iaff number of someone who is
deceased or dropped and the iaff doesn't. we need to be notified if they are
ever duplicates and then we will address individually."*

`lib/audit.js` reports both kinds at high severity —
`peoplesoft-on-more-than-one-member` and `iaff-number-on-more-than-one-member`,
the latter matching on bare digits so `0555555` and `555555` cannot hide one.
An IAFF number the IAFF no longer recognises is reported only when the member
is **Active**, since the IAFF drops a number when somebody leaves.

Clean as of the 12 Aug 20:47 export: 2,731 IAFF numbers, 2,731 distinct. The
one payroll duplicate (Thornhill 00130157, on both father and son) was fixed
by hand the same evening.

## Waiting on Joe

- **Dave Brown — SETTLED 12 Aug.** `brown, David` (lowercase in NEP; Active
  Retired, Captain, Engine 20) is **David R. Brown**, IAFF **#0469335**, and is
  not a Jr. `Brown, David A` (Firefighter Paramedic, Fireboat, payroll 00030709)
  is the Jr., IAFF **#0441560**. Neither carries an IAFF number in NEP yet; both
  are free to write. His phone in NEP reads 301-34**2**-2526 and Joe says
  301-34**3**-2526 — a change to an existing number, so left alone pending Joe.
- **Taylor, James P** — the IAFF has a James A. and a James M. Taylor, no P. He may
  simply not be on their roll.
- **Robinson, Wayne** — Wayne L. (Mount Rainier, matches his city) vs Wayne P.
  (Waldorf). NEP holds no middle initial, so the city is the only evidence.
- **Elliott, Jazmin / Harris, Jazmin Ks** — the IAFF gives both #1339641 and the
  Elliott record's email is `harrisjazmin32@gmail.com`. Reads as one woman who
  changed her name; a name change is Joe's call, not a merge to assume.
- **Coates, Q'Juan** — marked `Drop`, but payroll line 00092196 has dues coming
  out of his check. Either the status is wrong or the deduction never stopped.
- **Thomas, Corta M** — Active, blank. The payroll prints `Thomas,Cortni`
  (00093402). Same person or not is a judgement call; scored 88, under the bar.
- **Wimbish, Levitus O** — one of the 13 with no Member Status in an Active
  Members group, and he is on the payroll (00006363). Should be Active + Yes.

## The Jeffery swap — do this before any IAFF-number sheet

The IAFF has **#1215027 = Alfred B. Jeffery IV** (MEM) and **#0341279 = Alfred B.
Jeffery III** (MRM). NEP has #1215027 on the **father**, and little Al has none.
Joe confirmed: Al retired as an Assistant Chief, little Al is a working Lieutenant.

1. `Jeffery III, Alfred` — IAFF number `1215027` -> `0341279`
2. `Jeffery, Iv, Alfred B` — IAFF number -> `1215027`

Order matters; the number cannot sit on two members at once.

## Still to upload

- **PeopleSoft Number**: 45 members with no IAFF number, no email and no
  phone — nothing unique to key on. By hand, or after they get contact info.
- **Paying Active Member**: 62 keyed on phone, 9 with nothing to key on.
- **Platoon**: 42 with nothing to key on.
- **Thomas L Williams** → Drop, by hand (no IAFF number to key on).

## What is the difference between "Retired" and "Active Retired"?

Joe cannot recall, and the data does not settle it either — but it points at
`Retired` being a stray value rather than a real category.

**798 members are `Active Retired`**: 492 have a retired-dues year filled in,
219 are marked "Not Required", 227 are in the Retiree Insurance Group.

**4 members are `Retired`**, and they look nothing like a category:

| | |
|---|---|
| Mcconnell, Kevin P | Lieutenant, appointed 2001, in **Officers** and **Active Members** groups |
| Bourassa, Ryan | Lieutenant, appointed 2000, in **Officers** and **Active Members** groups |
| Gilson, Michael J | Firefighter, retired-dues "Not Required", Retired Members group |
| Embrey, Willian | Battalion Fire Chief — and the name is a typo for **William** |

Two of the four sit in *Active Members* and *Officers*. None is in the Retiree
Insurance Group. None has a retired-dues year filled in.

If `Retired` has no meaning of its own, these four should become `Active
Retired` — or whatever each actually is. Waiting on Joe.

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
- **William Embrey** — `Embrey, Willian` is a typo (his own email is
  `william.embrey1@verizon.net`), and `Embrey, William` is an empty shell
  duplicate of him. **Delete the empty one, then correct the spelling** — that
  order, or NEP briefly holds two records with the same name. Caught by Joe
  while working the name-only list, which is why that record was left out of
  the 31.

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
- **Chiefs.** Done, 11 Aug. All 201 chief records reviewed; the last four
  Active ones — Botwin, Robinson, Spielman, Polish — went to Drop and the
  export confirms exactly four changed fields and nothing else. Botwin was
  still on the June report because he had only just been promoted, which is
  what the new stopped-payer explanation exists to catch.
- **Anthony ("Tony") Prince.** Not a dues payer. Retired 08/2019, not on
  payroll, not on telestaff, every retired-dues checkbox blank, and his IAFF
  number 469346 is unknown to the IAFF. Not to be confused with **Johnathan B
  Prince** (#1485614, PeopleSoft 00098456), who is a paying Active member.

## Duplicate profiles — 18 deleted, 85 pairs left

Done 11 Aug: 18 empty duplicate records deleted by hand, verified against the
export — exactly the 18 asked for, nothing else removed, and the three group
memberships they carried were moved to the surviving record first.

What remains, and why each is held back:

| pairs | why it is not a delete |
|---|---|
| 24 | the empty record holds a **different** phone or email — deleting loses it |
| 23 | no outside source has anyone by that name, so one person cannot be proved |
| 21 | neither record is empty — both hold real data, a human must choose |
| 7 | telestaff, the IAFF or payroll knows **two** people by that name |
| 7 | both records are empty — nothing worth keeping either way |
| 3 | the empty record holds the **only** phone or email — copy it across first |

The 3 copy-first are the obvious next slice. The 24 conflicts need a person to
decide which contact is current — Kristina A Harris is the shape of it: two
records, two different phone numbers, one email that exists on only one.

**Never judge a record empty on phone and email alone.** The Kevin Adams shells
held nothing but membership of the Retiree Insurance Group; deleting them blind
would have dropped him off that list with no trace. `lib/audit.js` now counts
group membership as content, which is why the "holds nothing" pile fell from 56
to 15.

## Ready and waiting to be forwarded

- **`Local36-remove-from-IAFF-roster.xlsx`** — 47 members the IAFF bills us for
  whom our own records say are not billable: 21 deceased, 20 dropped, 4 alumni,
  2 retired. Finished; goes to whoever maintains the IAFF roll.
- **`Local36-add-to-IAFF-roster.xlsx`** — 184 members the IAFF has never heard of,
  147 of them paying dues every payroll. Parked on Joe's word until the rest is
  squared away.
- **`Local36-IAFF-status-corrections.xlsx`** — 81 members the IAFF has under the
  wrong `Member Type`. 70 we call Active whom they carry as MRM (retired), 6 the
  other way round, 5 honorary mismatches. 15 are backed by the payroll report or
  the staffing roster and are shaded green; the other 66 rest on our record alone
  and are shaded yellow, so the recipient can tell the two apart.

  **The two David Browns are the shape of it.** The IAFF has #0469335 David R.
  Brown as MEM when he is the retired captain from Engine 20, and #0441560 David
  A. Brown Jr. as MRM when he is Active and paying on payroll 00030709. Their
  statuses are swapped. Joe identified them by hand on 12 Aug — David R. is the
  retired captain and is **not** a Jr.

## Settled today — single-role EMS

No single-role member is on the roll, checked department-wide. Telestaff has 19
people with an EMS title carrying no fire rank:

- **9 `PARAMEDIC` and 1 `EMS Advanced Practice Provider`** — genuinely single-role,
  the other union's members. **None is in NEP and none is paying.** Correct.
- **9 `Battalion EMS Supervisor`** — all in NEP, all Active, all paying, and all
  holding dual-role ranks (Sergeant/Lieutenant/Firefighter Paramedic). The title
  is an assignment, not a job. They are ours.

So the `PARAMEDIC` rank mapping Joe wanted to look at is moot — those nine should
not be in NEP at all. And `Battalion EMS Supervisor` must stay unmapped, because
the nine hold three different real ranks.

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
