# Open items

Things waiting on somebody, so they don't get lost between sessions.
Close an item by deleting it. Anything finished lives in git history, not here.

Roster state at last update: **NEP export of 17 Aug 2026, 6:41pm — 3,436
members** (`data/uploads/roster-60`, gitignored). Taken after the board meeting,
which went well.

**Active 1,840 · Active Retired 454 · Retired 504 · Drop 324 · Alumni 99 ·
Deceased 85 · Honorary 27 · Life 15 · no status 88.** Paying Yes 1,770 ·
**No 42** · blank 1,624. 2026 retiree dues Paid **366**.

### The eleven $0.00 members — ten answered, one open

Joe settled these on 17 Aug and they are written into `lib/knownreasons.js`, so
the treasurer's dues-stopped sheet prints the answer instead of asking again.

*Off the roll, no further dues expected:* Devendorf, Dufresne, Newton, Tyler,
Chen. The last three moved to Drop in the 6:15pm export.

*Carried active on purpose — do not drop:* Long (in jail, suspended without
pay), Rembert (on suspension), Price Jr. (in a program, deduction resumes on
his return), Glover (payroll glitch — a missed week then a double), Barrow
(military leave, waiting on the NEP dropdown).

**Still open: DiPietro, Andrew D (00108259).** Active, marked paying, $0.00
since June, no explanation recorded. The last of the eleven.

Devendorf (00106864) and Newton (00130126) have **no PeopleSoft number in NEP**
and never have — the register knows them, NEP does not. That is why the known
reasons are keyed on the register number, not NEP's.

### Working, no dues — the Active/paying=No batch (Joe, 17 Aug)

Joe's rule for the "working, no dues" sheet: **Member Status Active, Paying
Active Member No.** Not a correction — a marker, so the collection gap is
visible in NEP and can be worked down over time rather than living on a
spreadsheet nobody opens.

Built from roster-59 by `scripts/nodues-upload.js`, verified by
`scripts/nodues-verify.js`. **Checked against roster-60 — 32 of 38 rows landed:**

| file | rows | key | state |
|---|---|---|---|
| `Local36-NODUES-1-active-payingno-on-email` | 20 | Email | **landed** |
| `Local36-NODUES-2-…-on-peoplesoftnumber` | 1 | PeopleSoft Number | **landed** |
| `Local36-NODUES-3-…-on-iaffmembernumber` | 2 | IAFF Member Number | **landed** |
| `Local36-NODUES-4-…-on-lastname` | 2 | Last Name | **NOT RUN** |
| `Local36-NODUES-5-…-on-firstname` | 3 | First Name | **NOT RUN** |
| `Local36-NODUES-6-YOUR-CALL-Barbour-was-Life` | 1 | Email | half — see below |
| `Local36-NODUES-7-CREATE-9-new-members` | 9 | PeopleSoft Number | **landed** |

**Still to run: files 4 and 5** — Hines Jr Ronald E, Rowel Danard T, Hayes
Bernie, Kinney Rico C, Smith Dominique N. All five are untouched, still no
status and no paying value. Both files re-verify clean against roster-60, so
they can go as they are.

**Barbour was done by hand, not by file 6.** Her status moved Life → Active and
a payroll number 00132174 appeared — file 6 has only three columns and cannot
set a payroll number, so that was typed in NEP. **Paying Active Member is still
blank on her record.** Re-running file 6 finishes it: Member Status Active is
then a no-op and the No lands.

Do **not** re-run file 7 — the nine now exist, and `nodues-verify.js` refuses
it against roster-60 for exactly that reason.

Hayes, Kinney and Smith Dominique have no email, no payroll number and no IAFF
number and share a surname — first name is the only unique handle they have.
Worth filling their payroll numbers in afterwards.

**Barbour, Erianna is held out in her own file.** She is carried as Life — one
of only 16 — while working as a Platoon 4 firefighter EMT on a 2025-era payroll
number. Almost certainly a keying error, but Life is an honour and not ours to
overwrite in a batch, so Joe runs that file or skips it.

**Nine of the 38 had no NEP record at all — created 17 Aug, confirmed in
roster-60.** All nine came back with the right rank, platoon, phone, Member
Status Active, Work Status Active Member, Paying Active Member No and their
L36NEW tag, and NEP assigned Role Member / Status nonactive / Groups "All
Members, Active, Platoon - n" exactly as the earlier batch did.
`Local36-NODUES-7-CREATE-9-new-members.xlsx` built them: Boyd Keelin, Celestine
Collin, Dillon Jamar J, Goldberg Joseph, Johnson Jeffrey A, Lee Jahred, Moore
Justyn, Tapia Lima Jesus, Toure Alassane. Tags **L36NEW059-067**, continuing the
002-058 batch already in NEP.

Built by `scripts/nodues-create.js`, which **refuses to write** if any of them
turns out to be on the roster by payroll number or by name — a name matching two
records means "cannot tell apart", not "absent", and creating on top of that is
how a duplicate profile gets made. All nine were checked: no payroll match, no
surname-and-first-name match, no fuzzy match at 80 or above. There is no Tapia
or Lima on the roster at all; the 43 Johnsons include no Jeffrey.

Shape copied from the L36NEW 002-058 batch, which is the proven way to add:
keyed on PeopleSoft Number, no email, **Role / Status / Groups deliberately
left out** because NEP assigns them (all 47 of that batch came out Member /
nonactive / "All Members, Active"). Member Status Active, Work Status Active
Member, **Paying Active Member No** — the one deviation from that batch, and
the point of the exercise. `Paramedic` was left out on purpose: 20 of the 190
Firefighter Paramedics on the roster are marked No, so it cannot be derived
from rank.

### The 50-year upload landed — 9 files of 11

Verified row by row against roster-58: **1-FIFTY (all four files, 133 rows) and
2-FIFTY (all three, 25 rows) landed complete**, and of the deceased set
`3-DECEASED-note-on-email` (5) and `-on-lastname` (11) landed. **NOT applied:
`3-DECEASED-note-on-iaff` (37 rows) and `3-DECEASED-note-on-firstname` (3)** —
0 of 40 rows present, so those two were never run. 174 records now carry the
`50 year member` note, which is exactly the 9 files that landed.

**CONSEQUENCE TO SETTLE — the honour is now a billable status.** 158 fifty-year
members carry Active Retired, but only 28 pay 2026 retiree dues. That flows
straight into the International's lists:

| list | was | now | of which 50-year |
|---|---|---|---|
| not on their roll | 215 | **228** | **14** |
| numbers dropped | 67 | **87** | **20** |
| type corrections | 13 | **8** | 0 |
| billed as active | 9 | 9 | 0 |

So **34 entries would go to the International asking them to carry members who
pay no current dues.** Both sheets now have a **"50-year member?"** column
marking every one, and the workbook's front page says so. **Joe decides whether
they belong in that ask before it is sent.** This is the definitional blur
flagged when the files were built: `Active Retired` now means both "retiree who
pays retiree dues" and "50-year honoree", and the per-capita denominator can
only mean one of them.

Per capita at roster-58: 180 undercounted (unchanged) · **506 overcounted**
(872 MRM - 366) = $4,822/mo, **$57,866/yr**; bills $473,483 vs $456,765,
**apart by $16,718**.

**Six changes were Joe's own, not the 50-year files:** Hurda Gregory (no status
-> Active Retired), Henry Joseph L, Lane Joseph W and Sandy Stephen R (Retired
-> Active Retired), each with 2026 dues Paid; **Farrow Shirley** (no status ->
Active Retired, and an address moved from Menifee CA to Washington DC); and
**Smith Edward C** (Active Retired -> Life).

### THE FIVE UNEXPLAINED DEPARTURES ARE SETTLED### THE FIVE UNEXPLAINED DEPARTURES ARE SETTLED (Joe, 17 Aug afternoon)

Rule 10 worked exactly as designed: a drop-off with no personnel action behind
it went to Joe rather than getting a status by guess, and he settled all five.

| | now reads |
|---|---|
| Mullins, Anthony L | Active Retired · 2026 retiree dues Paid · paying No |
| Washington, Sr., David V | Active Retired · 2026 Paid · paying No |
| Latimer Jr., John E | Active Retired · 2026 Paid · **still paying = Yes** |
| Covey, Jonathan B | Active Retired · **no 2026 dues marked** · **still paying = Yes** |
| Mangiameli, Nicholas | Drop · paying No |

**Two loose ends flagged to Joe, both real:**
1. **Covey is the only one of the 317 Active Retired without 2026 retiree dues
   marked Paid.** Joe's own sweep rule is "2026 Paid = Active Retired", so
   either the tick is missing or he belongs in another status.
2. **Covey and Latimer Jr. still read `Paying Active Member = Yes`** although
   they are off the register; the other three were set to No.
   **NOT an error for Streat Sr., Turner and Williams**, who also read Yes —
   they work until 22 Aug, and PA rule 3 says the next register self-corrects.

roster-56 -> roster-57: six records touched, nothing else moved.
roster-55 -> roster-56 was the rank fill: exactly 80 rows, `DC Fire Rank` the
only field that changed anywhere, all 80 verified on the right people.

**Also confirmed landed:** the SO-2026-198 retirements (Turner, Williams,
Streat Sr. — all Active Retired + 2026 Paid) and **Washabaugh John A = 00083207**.

**Still open, verified still open in roster-57** (do not assume these ran):
- Status moves: **Thomas Anthony L** (-> Retired + IAFF 1273776), **Potts
  Christopher S** (-> Drop), **Clark Lawrence** (-> Retired) — all still Active.
- **The 25-member Mark-No files have NOT run** — only 10 members read No.
- The rest of SO-2026-198: 21 reassignments and the rank changes.
- By hand: **Robinson Karl H** (plain record, no status) -> 00026734 + Active +
  Yes · **DeSilva Sydney D** -> 00115723 · **Gibson Demarius** -> Firefighter /
  Truck 08 / Platoon 4 + a status.
- Merges: **Barbosa** pair · **McCoy** pair (both approved — confirm two men) ·
  **Butler Arthenious** (Active, paying, no payroll number).
- **26 active members with no rank** — the staffing roster cannot supply them.

### Per capita at roster-57

180 undercounted (unchanged) · **511 overcounted** (872 MRM - 361 paying
retirees) = $4,870/mo, **$58,438/yr**. Bill on their roll $473,483; on ours
$456,193; **apart by $17,290**. At the October rate (~$19.86): $42,898 and
$60,891, apart by $17,993.

## Personnel Actions — the standing procedure (first run: SO-2026-198, 15 Aug)

Joe's rulings, now permanent:

1. **The printed rank on a PA is the member's NEW rank.**
2. **A member retiring after March gets that year's retired dues marked `Paid`**
   (both L36 and plain columns) alongside `Active Retired` and the retirement
   date. Pre-March retirees: rule to be discussed when one appears.
3. **Write the changes when the order is signed** — no waiting for the
   effective date. The next dues register self-corrects the paying field.
4. **A chief retiring goes to `Drop`** unless their retired dues are marked
   Paid, then `Active Retired`. (None on this order.)
5. **Trust the PA over NEP** — a transfer or promotion that exposes a stale
   NEP rank or assignment gets fixed to what the order says.
6. **Exception learned on the first run:** the PA prints bare "Firefighter"
   for members NEP carries as "Firefighter EMT" — including two retirees, so
   it is the order's house shorthand, NOT a demotion. Never strip an EMT
   designation off a PA line. Paramedic/Technician designators ARE printed.
7. **Probationary appointments (recruit/cadet classes) are skipped** until Joe
   says otherwise. SO-2026-198 carried ~49 across Cadet 28 and Recruit 414.
8. EMS supervisor assignments map to companies `EMS 1`..`EMS 7`. Stored
   values are grandfathered relics — the dropdown lacks the whole series.
   `Local36-NEP-companies-to-add.xlsx` was superseded the same day by the
   combined `Local36-NEP-fields-to-add.xlsx` (see the Promotional Information
   tab section). Graham's EMS 3 and Raymer's EMS 1 rows wait on it.
9. **Code glossary, Joe's definitions**: TA training academy · H&S/HS homeland
   security · SAFO safety officer (chief or aide) · PSO professional standards
   office · FMD fleet maintenance division · FPD fire prevention division ·
   OFC office of the fire chief · XO executive officer (high-chief aide) ·
   ELO emergency liaison officer · HMU hazmat unit · FOC fire operations
   center · OMD office of medical director · FB fireboat. **SWD and TD are
   context-dependent (Joe, 15 Aug): in telestaff's unit braces they are
   ASSIGNMENTS — SWD = Safety Division, TD = Training Division — but in a
   certifications column the same letters are driver quals (squad wagon
   driver / truck driver). Read the column, not the code. NQTD = not qualified
   to drive; TDFD = taken down from driving (Joe, 15 Aug).**
9b. **Recruit vs probationer** (Joe, 16 Aug): a RECRUIT is in the Training
   Division, not yet assigned to a company (telestaff's shift rosters don't
   carry them). A PROBATIONER is a rookie ON THE STREET at a company —
   telestaff tags them "(PROBATION) {E21}". Probationers paying dues is
   normal. Whether/how RECRUITS pay is **Joe's open question for the
   treasurer** — the July register shows the 00143-block recruit class
   deducting 49.19 like everyone else, so the answer shapes what records
   the 45 get. Joseph T. Johnson and Eli Washabaugh are probationers
   (paying, at companies).
10. **Separations reconcile against personnel actions** (Joe, 16 Aug). The
   DCHR register counts separations and shows who dropped off; the PAs say
   WHY. A drop-off covered by a PA follows the PA rules (retirement ->
   Active Retired or Drop per rule 2/4). **A drop-off with NO personnel
   action behind it gets brought to Joe explicitly** — never given a status
   by guess — so the member can be separated properly in the records.
   First live case, settled to five: **Covey, Latimer Jr., Mangiameli,
   Mullins, Washington Sr. David V** — unexplained departures with Joe
   (none covered by SO-2026-198; its retirements date 22 Aug). Removed on
   Joe's word: Botwin (promoted) and Sanders (already Retired). The
   Washabaugh scare RESOLVED 16 Aug by re-reading the June scan: June
   misread Eli's 00139643 as 00135643 — he never left, June row fixed,
   compare re-run (9 stopped / 56 new). Bonus from the same scan band:
   **Washabaugh, John A = 00083207** (Active, Yes, pays both months) —
   his NEP record lacks the number; type it in by hand.

SO-2026-198 itself: 2 promotions (Graham -> Lieutenant Paramedic, Pinckney ->
Sergeant Paramedic — the order misspells her "Pickney"), 2 technician
appointments, 21 reassignments, 3 retirements (Streat Sr. — also rank-fixed to
EMS Captain — Turner Andre R, Williams Alfred C, all 22 Aug, all -> Active
Retired + 2026 Paid). Seminerio is "Nicolas" in NEP, not Nicholas.

## The Promotional Information tab — waiting on the NEP help desk (15 Aug)

Joe created a "Promotional Information" tab in NEP and wants it to mirror the
food chain for every member. The request workbook
**`Local36-NEP-fields-to-add.xlsx`** went to the help desk 15 Aug — format
approved by Joe ("That works!"). It supersedes the earlier companies-only
sheet. Two sheets:

- **Promotion fields** — 12 rows, 24 fields, in Joe's order: Field Training
  Officer (start date | end date), Vice Technician 1 / 2 / 3 (start | end
  each — a member can hold it multiple times), Technician (start | end, no
  test), then Sergeant through Fire Chief (promotion date | exam next to it).
- **Company assignments** — 13 dropdown values: EMS 1–7, Homeland Security,
  Fire Operations Center, Emergency Liaison Officer, Fleet Maintenance
  Division, Recruitment, Information Technology.

**When the help desk confirms:** if they renamed anything, regenerate the data
file headers to match BEFORE uploading. Then run **PROMO data files 1–5** —
494 food-chain officers (keys: 417 email / 53 PeopleSoft / 20 IAFF / 1 last
name / 3 first name), each officer's exam placed in the field for their
current rank (147 Sgt / 190 Lt / 76 Capt / 36 BFC / 12 DFC / 3 Asst / 1 Fire
Chief) — and the two held PA198 rows (Graham -> EMS 3, Raymer -> EMS 1).
Known future entries to add once the fields exist: Deems Technician start
07/26/2026 · McKee Vice Technician start 08/23/2026.

## Upload batches built 15 Aug, delivered, not yet confirmed run

Verify each against Joe's next export:

- **PA198 files 1–7** — everything from SO-2026-198 that keys cleanly:
  3 retirements (Active Retired + 2026 Paid), the rank changes, 21
  assignments. Two EMS-company rows held for the dropdown (above).
- **PSFILL files 1–4 — LANDED, 61 of 61**, verified against roster-50
  (15 Aug 12:55). One deliberate consequence to keep in view: three
  known same-man split pairs each got the SAME number on both halves, so
  the duplicate-number audit will flag them until each pair is merged —
  **barbosa, becaye / Barbosa, Becaye O** (00115712) · **Streat, Jonathan /
  Streat, Sr., Jonathan E** (00126621 — note Sr. also retires 22 Aug on
  SO-2026-198) · **McCoy, James / Mccoy, Jr., James M** (00132282, two
  different gmails — confirm one man before merging).
- **Bad-address contact to-do** — 11 Active Retired members in the
  known-wrong-address group: 5 reachable by email, 6 phone-only. Corrected
  copy sent (first copy's note miscounted 4/7).

## The 21 payroll-number leftovers — worked out 15 Aug, with Joe

`Local36-payroll-number-cleanup.xlsx` settles everything PSFILL couldn't
upload (14 collisions + 6 no-key + 1 double-match). Verify in the next
export. Four sheets:

- **Type in (9) — DONE 15 Aug, all 9 verified in roster-50**, phones pasted
  too. Along the way: NEP's empty "Johnson, Joseph" record turned out to be
  **Joseph T., the probationer at Engine 22** (his telestaff phone is on it,
  emplid 00139634) — left alone per the probationer rule, but he is already
  paying on the register; build the record out when he comes off probation.
- **Move (7) — DONE 16 Aug, all verified in roster-51.** Joe walked all
  seven: numbers moved, working members marked Yes, and along the way he
  renamed Lacore jr/Robinson Wayne L, set Tyner Jr's rank to **Sergeant**
  (took the telestaff evidence), put Michael Q Walker's real phone
  (240) 421-5412 on his record, and moved **Smith Christopher S and
  Robinson Wayne P to Retired**. The one loose thread — Wayne P's stray
  Paying=Yes — **Joe cleared 16 Aug** (his word; verify in next export,
  which should then read Paying Yes = 1,757). The whole 21-leftover
  cleanup is CLOSED.
- **Merge (2) — DONE 16 Aug**, both keepers were the APPROVED accounts (the
  rule this pair minted): "Denmark JR, Alan L" and "Washington Jr, Wayne D"
  each carry everything. One small loss: the deleted Washington shell's
  **VA6 and "2024 returned mail" groups did not carry over** — rejoin the
  keeper to them if that history matters, and his Stephenson VA address
  should be verified before the election mailer either way.
- **Closed (4)** — number already right: Taylor James M · Hughes James P ·
  Faulkner Jr · Williams Shawn D. Surfaced along the way: **Taylor James P**
  is Active but in the South Carolina group with 2022 retiree dues — reads
  Retired; **Hughes, James T** is a thin possible-duplicate of James P (both
  Lt, both Engine 15, different appt dates) — conflict box, don't delete
  blind; **the Faulkner father** (retired 2011, retiree dues 22–25) is
  Active+Yes on the son's paycheck while the 35-year-old working SON carries
  "2026 Retired Dues Paid" — reads as the father's 2026 payment recorded on
  the son's record; if Joe agrees, move it, father → Active Retired.

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

**And the keeper is always the APPROVED account** (Joe, 15 Aug — the export's
`Status` column: approved / nonactive). The approved profile is the member's
own login. Copy fields onto it and delete the nonactive one, even when the
nonactive record looks richer — it flipped the Denmark merge direction. Both
records approved (the McCoy 00132282 pair) = probably two real people; stop.

## Duplicate profiles — 12 same-name groups, measured 13 Aug

**Six have an empty side and want deleting**: Long Brian, Taylor Charles, Taylor
Herbert, Neal Jimmy and Farrow Shirley are each *two* completely empty records;
Watson Richard is one good record plus a shell.

**Split profiles to merge** (Clark Timothy J CLOSED 15 Aug — unpaid duplicate
deleted, paid 378798 record survives): Noznesky Alan, Schiafone Christopher M,
Smith Michael, Reed Trevor, Gooding Wallace. In each case the
two records hold different halves of the same person — one carries the phone,
IAFF number, rank and appointment date, the other the email and date of birth.
No Jr or Sr on any of them, so these read as split profiles rather than fathers
and sons. Copy the missing fields onto the keeper, then delete the other.

## Non-Active members still holding a payroll number — 4 left parked

Retired, dropped, alumni and life members do not have a payroll number, so
each of these came from the wrong generation. Every one was independently
flagged by the cohort test: hire dates 20 to 39 years away from the neighbours
of the number they hold.

**Five moved to the payroll-number cleanup workbook 15 Aug** (Kline Kevin P,
Evans Marc A, Lacore Michael D, Walker Michael Q, Tyner Sr.) — each number
belongs to a working member and the workbook says whom. Sullivan Jason was
settled earlier (scanner misread; NEP was right). Still parked, nobody
waiting: Roop, Michael A · Schaefer, Paul M · Klinger, Wayne D **[Active
Retired]** · Mitchell, Kenneth **[Life]**

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

## The 295 no-sign-of-life members — Joe's rule, 14 Aug

Active in NEP but absent from the June register (any match strength), absent
from telestaff, not marked paying. Joe: 25+ years since appointment -> Retired;
younger, after a collision screen -> Drop; the 38 with no date at all -> Drop
(they are not new hires — Joe confirmed).

Disposition: **80 Retired · 192 Drop · 21 held** (the IAFF still carries their
numbers as MEM-working — 20 of them — plus Akers Dahave, a two-letter
misspelling of the working "Akers, Dahvae" on telestaff) · Ridgway parked in
the conflict box · Harris Jazmin Ks parked with the Elliott question · Mason
Roshawnda K pulled out entirely — she IS Drake (same appointment date
09/29/2004 on the food chain; register line "Drake,Roshawnda K"; the created
Drake shell is her duplicate; merge pending the side-by-side).

**Landed 14 Aug across two runs.** The first run proved a hard rule: every
email/PS/IAFF-keyed row hit (206 of 206), every name-keyed row missed (75 of
75) — a name-keyed sheet must carry the key name column ONLY, and the
two-column retries then landed 61 of 61. Active 2,102 -> 1,844; Drop 311;
Retired 90. The final 14 went by hand;
three remain open: Clark Lawrence -> Retired, Potts Christopher -> Drop, and
Thomas Anthony L -> **Retired** (revised: the IAFF carries him MRM-retired in
Harrisburg, #1273776 free to write). Sullivan Charles D likewise revised to
Retired on IAFF MRM evidence — Joe ran it 14 Aug. The register's odd number
for Sullivan Jason (00127380) was the scanner's misread of his real 00127980;
telestaff confirms NEP was right all along.

## The Ridgeway question — parked in the conflict box, 14 Aug

NEP holds ONE Michael: `Ridgway, Michael S` [Active, Lieutenant, E-4, appointed
10/10/2000, IAFF #1045730, email shaneridgeway@gmail.com, Retiree Insurance
Group]. The IAFF says #1045730 = Michael Ridgeway, **MRM (retired)**, Owings MD.
Joe believes Michael has a son named **Shane** on the job.

If the son is real, the one record may be a father/son blend: the father's
number and service, the son's email. But NO Shane Ridgeway (any spelling)
exists in NEP, on telestaff, on the June register, or on the IAFF roll — the
only working Shanes are Melton, Javid and Walker. So either the son goes by
another name in the records, or "Michael S" IS the son (Michael Shane?) and
the retired father has no record at all.

Held out of every list until Joe settles who is who. Do not set his status,
do not fix the Ridgway/Ridgeway spelling, do not touch the email.

## Joe's questions for the treasurer

- **Do recruits pay dues, and under what arrangement?** (16 Aug.) The July
  register shows the whole 00143-block recruit class deducting the full
  49.19 while still in the Training Division. The answer decides how their
  45 NEP records get set up (and what the "Recruit" rank request to the
  help desk should say).

## Waiting on Joe

- **Dave Brown — SETTLED 12 Aug.** `brown, David` (lowercase in NEP; Active
  Retired, Captain, Engine 20) is **David R. Brown**, IAFF **#0469335**, and is
  not a Jr. `Brown, David A` (Firefighter Paramedic, Fireboat, payroll 00030709)
  is the Jr., IAFF **#0441560**. Neither carries an IAFF number in NEP yet; both
  are free to write. His phone in NEP reads 301-34**2**-2526 and Joe says
  301-34**3**-2526 — a change to an existing number, so left alone pending Joe.
- **Taylor, James P** — the IAFF has a James A. and a James M. Taylor, no P. He may
  simply not be on their roll. New evidence 15 Aug: he is in NEP's South
  Carolina group with 2022 retiree dues while marked Active — reads Retired.
- **Robinson, Wayne** — settled 15 Aug: the plain "Robinson, Wayne" IS Wayne
  Leon (register "Robinson,Wayne Leon", telestaff phone on his record, email
  wlrobinson4419). The open question is now Wayne **P** — appointed 1982, not
  working, holds Leon's payroll number (move on the cleanup sheet).
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

## Retired chiefs — the full rule (Joe, 14 Aug)

Serving chiefs: **Drop** (pay nothing) or **Honorary** (pay a small GAP-insurance
amount, set by hand when they pay — never touch those fields). Once a chief
retires: **Active Retired if they pay retiree dues; Retired, or simply left as
Drop, if they never do.** Applied to Alston, Poust, Knaggs, Truesdel and Dean —
all paying, all to Active Retired. Schneider (Deceased, 2026 Paid) is a true
record: he paid, then died. Leave him.

**Sellitto settled the same day**: Michael J [Active, payroll 00033832, on
telestaff, Yes] is the working son; the no-status Michael with three years of
retired dues is the father, now Active Retired. Another contested family line
closed — with Watson and the three payroll-number moves (Walker, Tyner,
Lacore), that is five of the original 21 settled.

## "Retired" vs "Active Retired" — SETTLED 14 Aug

Joe's rule, verbatim: *"unless we already have them paying '2026 dues', lets
just put them as 'retired'. if they are paying, then active retired."*

So: **Retired = retired, not paying retired dues. Active Retired = retired and
paying.** Applied first to the ten food-chain retirees still marked Active
(7 -> Retired, 3 -> Active Retired: Lord, Simba and Mcdonough had already paid
2026). The four members who were already plain `Retired` now look intentional
rather than stray; leave them.

A consequence worth a later pass: some of the 845 `Active Retired` members
carry no retired-dues year at all, and under this rule those belong in
`Retired`. Not urgent, and not before the election-mailer pull is settled.

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

## The PeopleSoft gap — second pass, files sent 17 Aug

242 Active members had no payroll number. The July register closes **191** of
them (`1-4 PSFILL2-*.xlsx`, 189 by upload + 2 by hand: Richards Christopher J
00099359, Turner Michaela 00116848). **Fill Blanks Only** on PeopleSoft
Number. That takes Active coverage from 1,587 to ~1,778 of 1,829.

Why the register and not telestaff: only 3 of the 242 appear on telestaff at
all — the earlier round already harvested everyone it could name — and the
register IS the payroll, so it is the strongest possible source for a payroll
number. 176 of the 191 are confirmed on BOTH June and July; 15 are new payers
who first appear in July.

Every row was checked four ways before it went in the file: the July line
still scores >=95 against the member, no number goes to two members, the
register never prints the number twice, and no June line points the number at
somebody else. Three rows tripped that last check and were cleared by eye —
DiPietro, Walker Tarrick and Rembert, whose June names scanned as garbage
("Pe a", "bl", "Ry A A A") because those were the damaged $0.00 rows.

**Held back deliberately — 6 that need Joe:**

- **Butler, Arthenious = Butler, Arenthious D — ONE man, two records.** The
  register prints "Butler,Arthenious D" at 00014199; NEP holds both spellings,
  both Active, both Yes, and only Arenthious D carries the number and IAFF
  1104687. A merge (both nonactive accounts, so keep the one with data).
- **DeSilva — the mystery solved: two men.** `DeSilva, Sydney D` (Active,
  appointed 2021, desilva.sydney@yahoo) is the working one paying at
  **00115723**; `Desilva, Sydney S` (Retired, appointed 1990, IAFF 1001861)
  is the elder. Give the number to Sydney D only.
- **Taylor James P / Hughes James T / Faulkner John** — the number is already
  on the other family member's record; all three are existing open questions.
- **Robinson Jr, Karl H** — two numbers on the register (00086148 and
  00026734), father and son both paying; needs the split first.

45 Active members remain with no number and no evidence anywhere — nothing to
key on until they turn up on a register.

## For the treasurer — sent 17 Aug

`Local36-TREASURER-July-register-questions.xlsx`, three sheets off the
verified 25 July register:

1. **The 11 zero-dollar members.** Only **Glover Tye M and Price Jr Woodrow**
   are newly stopped (paying 49.19 in June); the other nine were already
   $0.00 in June. Joe's call, 17 Aug: leave them on the sheet for the
   treasurer rather than flipping their NEP paying field.
2. **48 new payers with no NEP record** (not 45 — the wider name check found
   three more), $2,361.12 a pay period. Mostly the 00143xxx class block,
   none on telestaff = still in the Training Division. Waiting on the
   recruit-dues answer before records get created.
3. **39 working with no dues line** — the honest chase list. The raw count
   is 113, but **46 chiefs** (outside the unit) and **27 single-role EMS**
   (the other union — Paramedic / EMT / Advanced Practice Provider) and
   1 recruit are correctly absent and excluded, with the sheet saying so.
   Of the 39: 28 already have NEP records (points at lost paperwork),
   11 have none — **10 after Joe fixed the Akers spelling 17 Aug**
   (Dahave -> Dahvae, so the working man at Platoon 3 now has his own
   record). Akers keeps a blank paying field, correctly: he is on no
   register at either date, so he belongs on the chase list, not the
   marked-member list. That also closes him out of the held-21 cohort
   from the no-sign-of-life sweep — he was never missing, just misspelt.

## Ready and waiting to be forwarded

- **`Local36-FORWARD-9-working-no-dues.xlsx`** — nine members working on the
  Aug telestaff roster with NO dues deduction on the 13 June register (not even
  a $0.00 line) and no retiree dues on file: Hayes Bernie (EMS Captain) ·
  Sellers Paul B (Lieutenant) · Hines Jr. Ronald E · Rowel Danard T · Smith
  Dominique N · Mendes Demarco J · Kinney Rico C · Wilkins Devin · Bianco
  Vincenzo. Verified by employee number against every register line. Goes to
  whoever can start/verify deductions with DCHR. Built 14 Aug on Joe's ask.
  In NEP the nine stay Active with paying blank — that combination IS the flag.

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
- **The 25 July register — IMPORTED AND FULLY VERIFIED 16 Aug (import #8).**
  1,826 lines · 1,815 paying · 11 at $0.00 — reconciles EXACTLY with DCHR's
  own printed totals page ($89,475.80 gross / $89,294.30 net / $181.50
  agency fee, to the penny). Every flagged line eye-checked against the
  scan; four catch-up amounts are real (Barry 96.76 · Elliott Jazmin 97.57 ·
  George Sr 99.19 · Walker Tarrick 99.19). The scan was duplex with every
  back page upside down and tilted ~1° — the pipeline now rights and
  deskews automatically (committed with tests). One line the OCR skipped
  (Middleton Jr., Raymond 00101396) was caught BY the totals cross-check and
  restored by hand. **Results workbook `Local36-JULY-register-results.xlsx`
  sent to Joe 16 Aug**: 11 Mark-Yes (incl. Bartee/Irving/Elliott recovered,
  Drake, Shaw, Young, Wimbish) · 8 status questions (Retired/Drop/Life
  members paying active dues: Chapman, Coates, Klinger, Mitchell, Roop,
  Schaefer, Sullivan Jason — the parked-list mystery SOLVED: they pay) ·
  the $0.00 eleven (5 newly stopped-but-working: DiPietro, Glover, Newton,
  Price Jr., Rembert) · 7 who left the payroll (+ the Washabaugh
  135643/139643 digit question) · **45 new-member recruits to create** ·
  register-solved puzzles (**Streat = TWO men**, 00126621 + 00022464 — the
  PSFILL same-number assumption was wrong there; Robinson Karl H father+son
  both pay; Thomas Cortni confirmed again; DeSilva 00115723 unknown) ·
  35 Mark-No candidates + 19 working-no-dues for the forward sheet.
  Waiting on Joe to work the sheets; verify in his next export.
- **Drive-folder automation** for the monthly scan — needs the public link
  confirmed and the folder name.

## Board meeting, 18 Aug 2026 — what was presented

Presentation: `claude.ai/code/artifact/c7a1773a-a50c-4430-9e54-91d7c3480bb1`
(projected, scroll-snapped sections; same register-paper look as the punch
list). Workbooks: `Local36-ALL-outstanding-work.xlsx` plus split copies
`Local36-FOR-THE-IAFF.xlsx` and `Local36-FOR-THE-TREASURER.xlsx`.

**The "where we were" baseline is roster-4 (25 July 2026)** — the last export
before any of this work. Two findings anchor it: the `Paying Active Member`
and `PeopleSoft Number` fields **did not exist in that export**, and the
status vocabulary was unused (802 Active Retired against 3 Retired).

Measured 25 July -> 17 Aug, all from `scratchpad/journey.js` (roster-4 vs
roster-55, matched on email > IAFF number > name, then a fuzzy pass):
1,639 payroll numbers added · 1,630 paying answers · 995 statuses corrected
(813 changed + 182 set) · 1,043 IAFF numbers added/fixed · 512 ranks ·
303 birthdates · 136 records created (**every one a paying member**) ·
107 duplicates removed (same-name pairs 23 -> 6) · 55 names respelled.

**The per-capita headline: we verified 1,815 paying members; the IAFF roll
carries 1,635 MEM. A 180-member undercount**, plus 10 they bill as active
whom we do not. **Joe still owes the per-capita rate** — the money slide has
a marked slot for it and turns the 180 into dollars once he supplies it.
Dues proven: $89,475.80 a pay period, $2,326,370 a year at 26 periods.

IAFF lists recomputed against roster-55 (they shrank as the data got clean):
215 not on their roll (180 of them paying) · 67 dropped numbers · 10 billed
as active · 13 type corrections. Treasurer: 11 zero-dollar · 48 paying with
no record · 38 to chase · 5 unexplained departures.

**Per-capita figures (Joe, 17 Aug): $19.05 per active member per month;
active retired pay half ($9.53).** Rate was raised at last week's convention —
Joe does not have the new number yet, so every figure below uses the current
rate and will need re-running.

- **Active side, solid**: 1,815 verified payers vs their 1,635 MEM = **180
  undercounted** = $3,429/month, **$41,148/year**. Plus 180 firefighters who
  may not be on the international's rolls for benefits at all.
- **Retired side — SETTLED as fact (Joe, 17 Aug): "this is not a question, it
  is a fact."** Per capita IS charged at half rate on every retiree on their
  roll. Their roll has 872 MRM; only 313 of our retirees pay retiree dues, so
  the local pays on 559 it cannot match to a dues payment: $5,324/month,
  **$63,894/year**. The deck states it plainly; the old "confirm with the
  international" hedge is removed.
- **Net**: a bill computed on their roll is $473,431/yr; on our verified
  records $450,685/yr — **$22,746 apart**, the two gaps pulling opposite ways.

## The 42 payroll numbers that disagreed — SETTLED by reading the scan (17 Aug)

Found while building the office wall board: of the 1,815 paying lines on the
25 July register, 1,719 matched a member by payroll number and 54 matched
nobody at all — but **42 matched a member by NAME while the number disagreed**.
Thirty-eight of those had been auto-verified by name only, so nobody had ever
confirmed the digits. One of the two numbers was wrong in every case.

Settled the way Joe's rule says — go back to the paper. Each line's number
column was cut out of a fresh render of the page at the importer's own zoom
and read by eye at 2x with the neighbouring lines visible for column
alignment. `scratchpad/settled.json` holds every reading;
**`Local36-42-payroll-numbers-settled.xlsx`** has it in three sheets.

The answer is a good one for the local:

- **36 — our record was RIGHT and the scan reading was wrong.** 35 of the 36
  differ by exactly one digit (3/9, 5/9, 2/9, 8/9 confusions). Nothing to
  change in NEP. What it does mean: the dues database is holding 36 wrong
  employee numbers on the July import, which will invent false "stopped" and
  "new" payers on the next comparison. **A correction script is ready but has
  NOT been run** — it edits Joe's register data, so it waits on his word.
- **4 — the paper gives a number our record does not have.** Type these in:
  Coates Q'Juan P `00092196` · DeSilva Sydney David `00115723` · Robinson
  Karl H `00026734` · White Daniel `00143802`. (DeSilva and Robinson were
  already on the by-hand list; the scan confirms both.)
- **2 — a different man with the same name.** Burton, Sean `00143796` (ours
  carries 00027472; the paper's number is in the 00143xxx recruit block) and
  Johnson, Joseph `00139634` (ours carries 00055446 and 00004546 — this is a
  third Joseph Johnson). Both need Joe to say who they are.

**Schema gap found doing this:** `pages` records mode but NOT whether the page
was rendered rotated. This scan is duplex — even pages are 180 degrees — and
because the importer chose per page and never wrote it down, anything that
re-crops a stored row box has to guess. Parity happens to hold for import 8.
Add a `rotated` column when the pages table is next touched.

## The register prints TWO totals and they are not the same number (17 Aug)

Also found building the wall board, and it changes a figure that was on the
board deck. The 25 July register's columns are **Goal $89,475.80** and
**Taken $89,294.30**. What the local actually collects is the Taken figure —
$2,321,652 a year at 26 periods, not the $2,326,371 the goal implies.

The $181.50 difference is not noise: **every one of the 1,815 paying lines
reads a goal of 49.19 and a deduction of 49.09.** A dime a member a pay
period, 1,815 x $0.10 = $181.50 exactly, **$4,719 a year**. The fact is
solid; the reason is not known and is a question for DCHR and the treasurer.
(June's scan is too dirty to compare — its goal column has OCR noise.)

`lib/snapshot.js` now keeps goal and taken apart so this cannot be blurred
again, and `test/snapshot.test.js` pins it.

## THE NUMBERS ARE SETTLED — full audit of the board deck, 17 Aug

Joe asked for a whole-presentation pass ("this should look so professional and
legit... not duplicative... clear messages for people that don't have time to
waste"). A five-lens review raised 110 findings; 45 survived adversarial
verification. Everything below was then re-derived from the real files by
`scratchpad/facts.js` + `scratchpad/verify.js`. **`scratchpad/FACTS-BRIEF.md`
is the ground truth; if a number is not in it, it does not go on a screen.**

### Four real errors that were on the deck and are now fixed

1. ~~"$89,475.80 is the goal, not what was collected"~~ — **SUPERSEDED by
   Joe's 17 Aug ruling above.** The dues the local collects ARE $89,475.80 a
   pay period / $2,326,371 a year. What the audit did settle and keep: our
   read of the register matches BOTH figures DCHR prints on its own last page,
   which is the check that proves the read is right.
2. **The dime is NOT a shortfall — RULED CLOSED by Joe, 17 Aug: "we are
   getting the 49.19, the dime off is part of processing, do not discuss the
   dime difference."** The register's two money columns differ by $0.10 a line
   (goal `49.19`, taken `49.09`, $181.50 a period), but that gap is DCHR's own
   processing artifact and never costs the local anything. **The local
   collects $49.19 per member per pay period — $89,475.80 on 25 July,
   $2,326,371 a year at 26 periods.** Use the goal column as the money.
   The screen built around this was deleted; do not raise it again, and do not
   put $89,294.30, $49.09, $181.50 or $4,719 on any deliverable.
3. **The retiree denominator was wrong.** 313 is the Active Retired *status*
   count. The number of records that PAID 2026 retiree dues is **358** (313
   Active Retired + 14 Retired + 13 Alumni + 10 Life + 4 Honorary + 3 Active
   + 1 Deceased). **This breakdown is now printed on the deck itself** (Joe,
   17 Aug: "clarify the 358 — what those other statuses are"), with the reason
   they count: the International bills for a retiree whatever word we filed him
   under. The 3 Active are the known oddballs — Faulkner Jr John M, Jackson
   Michael, Waby William D — still awaiting Joe, and the deck says so rather
   than hiding them. So the retired gap is **872 − 358 = 514**, not 559 —
   **$4,898/month, $58,781/year**, and the two-sided difference is
   **$17,633** ($473,483 on their roll vs $455,850 on ours), not $22,746.
   The old figures also silently used a $9.525 half-rate, so 559 × $9.53 did
   not even compute to the printed total. Anyone with a phone would have
   caught it.
4. **151 records were created, not 136** — and **150 of the 151 are Active
   members marked as paying dues.** Better and true.

### The register against our own roll — the settled split

Of the **1,815** paying members on 25 July:
- **1,719** tie to a member record **by payroll number** (exact, unambiguous)
- **47** match a member by NAME but the register's number is not the one we
  hold — usually one digit. **UNSETTLED.** These are now a workbook sheet
  and a line on the deck owned by the EVP; each gets read back against the
  scanned page, never guessed. (5 of the 47 are names shared by two or more
  members — ambiguous, so a person identifies the right one first.)
- **49** have no record with the local at all. **46** carry payroll numbers in
  the 00143xxx block — the recruit class.

A name that matches two members is NOT "no record". Calling it that was what
produced the earlier 54/42 split; the honest split is 49/47.

### Counts that changed, and why

| | was | now | why |
|---|---|---|---|
| Billed as active, not ours | 10 | **9** | the list has nine names |
| Paying, no record | 48 / 54 | **49** | ambiguous names are not "no record" |
| Register number differs | — | **47** | new list, new owner (EVP) |
| Dues stopped | 11 | **13** | 11 at $0.00 **plus** Glover and Price, still working with the dues line gone. Joe: "keep them on the same sheet — it's the same overall problem" |
| Left the payroll | 7 | **5** | Glover/Price moved to dues-stopped; Botwin (promoted) and Sanders (already Retired) cleared by Joe |
| Staffing roster | 1,684 | **1,684** | confirmed: 2,469 is shift ROWS, 1,684 is people. Do not print 2,469 |

**Every sheet's row count now equals the number printed on the deck.** The
workbooks are rebuilt from `scratchpad/board-workbooks.js` — now **nine**
lists across three files (combined / IAFF / treasurer).

### Structure: 13 screens to 10, and each one fits a projector exactly

Cut the "What we built" screen entirely — it duplicated "How this was done"
(same 3,607 lines, same 223 log entries, same premise). Cut the generic
father-and-son paragraph that pre-told the Watson story two screens early.
Cut the "to the penny" claim in all three places it appeared — it was the one
line the rest of the deck disproved. Headlines now carry the message rather
than label the topic ("What was blank in July is filled in today", "The
register is a dime short on every member", "Undercounted by 180. Overcounted
by 514."). **Added a closing screen with the actual ask** — approve the four
IAFF lists, treasurer takes four lists, get the new per-capita rate — because
twelve screens previously ended without telling the board what to decide.

**The member-stories screen is CUT** (Joe, 17 Aug: "we can get rid of this
slide") — the Watsons, the Streats, Klinger & Schaefer and Eli Washabaugh no
longer have their own screen. The human point survives in one sentence at the
end of "Where we were": fathers and sons sharing a name and a payroll number,
"a retired father looking like the dues payer while his working son looked
like a stranger to his own local." The two passing mentions on "How this was
done" stay — they read fine without the setup and they are the point of that
screen. Do not re-add the stories screen.

Verified in Chromium at 1440×900: all 10 sections are exactly one screen tall,
no horizontal overflow, light and dark.

**Offline copies for the meeting** (Joe asked to "pop it out of this window"):
a print stylesheet gives one screen per page at 16:9, exported by
`scratchpad/deckpdf.js` to **`Local36-Who-Pays-Dues.pdf`** (11 pages), plus
**`Who-Pays-Dues-Local36.html`**, the self-contained page. Both were sent to
Joe — present from the PDF, keep the artifact link as the backup, because the
room's wifi is not worth trusting.

## Missing ranks on active members (Joe spotted it on the IAFF sheet, 17 Aug)

**106 of our 1,834 active members carry no `DC Fire Rank`** — and every one of
them pays dues, so they are unquestionably members. 92 of the 106 are on the
"not on their roll" list going to the International, which is why Joe saw so
many blanks there. (Whole roll: 280 of 3,427 records have no rank.)

`scratchpad/rankfill.js` builds **`Local36-RANKS-missing.xlsx`**:

- **80 are fillable from the department's own staffing roster**, matched on
  PAYROLL NUMBER — never on name; 0 of the 106 matched by name alone.
  63 Firefighter EMT · 14 Firefighter Paramedic · 2 Firefighter Technician ·
  1 Sergeant Aide. Two upload tabs, keyed per Joe's hierarchy:
  **38 on Email, 42 on PeopleSoft Number** (email preferred; those 42 have no
  unique email). Each tab is key column + `DC Fire Rank` only.
- **Telestaff wording is translated to NEP's dropdown**, not copied:
  `FIREFIGHTER EMT` -> `Firefighter EMT`, `FIREFIGHTER TECH` ->
  `Firefighter Technician`, and so on. Anything not in the map is NOT uploaded.
- **26 need a person.** Two because the roster prints rank AND assignment
  together — **Bell Sr. Renaldo "Captain - EMS Supervisor"** and **Faunce
  Henry "Lieutenant - Staffing Officer"** — where the rank is Joe's call, so
  the sheet offers the NEP values that could fit and stops. **Drake Roshawnda**
  comes off the food chain: Lieutenant, promoted 11/24/2019 (confirm any
  Paramedic/EMS variant). The other 23 are simply not on the staffing roster;
  21 of them ARE on the July dues register, so they work somewhere the shift
  rosters do not cover.

**Pay grade is a HINT and must never be uploaded.** The June register prints a
grade, and it correlates: grade `01` is 93% Firefighter EMT, `1C` 91%
Firefighter Paramedic, `1B` 87% Firefighter Technician. But `01` also covers
Firefighter and EMT, and `2D` is only 33% anything — so the sheet shows the
grade and the most common rank at it, labelled as a hint to confirm. Nothing
on the upload tabs comes from a grade.

## Military leave — a Member Status value NEP does not have (Joe, 18 Aug)

Members on long-term military leave have nowhere honest to sit. The dropdown
holds only: Active · Active Retired · Alumni · Deceased · Drop · Honorary ·
Life · Retired. They are not retired, not dropped and have not left — so today
they read **Active**, which is wrong in the way that costs us time: no DC
paycheck means no dues deducted, so they look like members who stopped paying.

**`Local36-NEP-add-military-status.xlsx`** asks the help desk for one value,
**`Military`**, in the same shape as the 15 Aug request, and restates what is
still outstanding from it (Recruit rank · 13 company values · the Promotional
Information tab).

**First case: Barrow, Joshua M — 00093437.** Active, Firefighter, Engine 1,
paying=No, not on the staffing roster, and **a $0.00 line on BOTH the June and
July registers**. That is the signature: the checkoff is still in place, there
is simply no paycheck to deduct from — the same shape as a suspension without
pay. **Joe, 18 Aug: "no change at the moment till we get that category."** His
record stays Active until NEP adds the value.

He is also **first on the treasurer's dues-stopped sheet**, so a settled
question was about to be asked again. `lib/knownreasons.js` (new, 4 tests) is
where an answer gets written down once: the sheet now prints
*"KNOWN — long-term military leave (Joe, 18 Aug 2026) · status to become
Military (waiting on the NEP dropdown)"* in the Question column instead of
"has this been chased?". It changes nothing in NEP.

**When the value lands:** set Barrow to Military, then look again at the other
$0.00 lines — Chen, Dufresne, Long, Tyler and Devendorf have all been $0.00
since June with no explanation recorded, and at least some may be the same
story. Suite now 101 tests.

## The 50-year members — the grouping that was lost (Joe, 17 Aug)

The 50-year-plus members used to be held as a "company" in NEP; that went away
and took the grouping with it. Joe supplied the list (218 names, first + last
only, no numbers). `scratchpad/fifty.js` rebuilds it into
****eleven individual upload files** — status `Active Retired` plus a `Notes`
value of **`50 year member`** plus the 2026 dues. **NEP takes one file per
upload, never a workbook of tabs** (Joe's standing rule, restated 17 Aug), so
they ship numbered: `1-FIFTY-status-note-on-{iaff,email,lastname,firstname}`,
`2-FIFTY-note-on-{iaff,email,firstname}`,
`3-DECEASED-note-on-{iaff,email,lastname,firstname}`, with
`0-FIFTY-READ-THIS-FIRST.xlsx` as the review sheet (not an upload).

**All 218 matched a member record, each to exactly one person.** 216 matched
letter-for-letter; two did not and are NOT guesses — each resolved to a single
member and the reason is printed on the review tab:
- **"Bruke, Paul T" -> Burke, Paul T** (one letter transposed; the roll holds
  exactly one Paul T Burke, already Active Retired)
- **"Delgrosso, Robert A" -> Del Grosso, Robert** (the list runs the name
  together and adds a middle initial; one Del Grosso on the roll)

**HELD BACK ON PURPOSE: 60 of the 218 are marked Deceased.** Setting them
Active Retired would put dead members back on the billable roll and count them
for per capita, so **the status change is not in their files** — tab 3 carries
the note only and is Joe's to run or skip. This was flagged, not decided.

The rest: **133 get status + note** (127 Retired, 5 Life, 1 Alumni) and
**25 already read Active Retired** so they get the note alone.

**2026 retiree dues (Joe, 17 Aug): "mark these life members as not required.
I will fill blanks only if they happened to pay dues."** Both 2026 columns are
now on every tab — `L36 2026 Retired Dues` and `2026 Retired Dues` — set to
**`Not Required`**, which is a value NEP already uses in these columns (1,106
of them in the 2022 column alone). **28 of the 218 already read `Paid` and are
left exactly as they are**; the review tab lists every one so Joe can see what
was kept. Every cell on every row is filled with its current-or-new value,
because a blank cell in an upload wipes the field.

**Three traps this file avoids, all worth remembering:**
1. **A Notes upload OVERWRITES the field.** Six of the 218 already had
   something written there — "LIFE MEMBER 50+", "Paid $200 in 2024 / He is a
   Legacy member" — so the file writes `50 year member — <what was there>`
   rather than wiping it. Always check `Notes` before uploading `Notes`.
2. **`fold()` strips digits.** The first build of this script reused the NAME
   normaliser on the IAFF number, so every number collapsed to the empty string
   and no number ever looked unique — which pushed 43 people onto a by-hand
   list for no reason. Identifiers get their own normaliser (`num`). With it
   fixed, 102 key on the IAFF number and only **4 need doing by hand** — all
   four Deceased, sharing a last name, so they only matter if Joe runs tab 3.

Every one of the 214 upload rows was re-checked against roster-57: each key
resolves to exactly one member, no Deceased record appears in a file that sets
a status, **no cell anywhere is empty**, and **not one row turns an existing
`Paid` into `Not Required`**.

**If Joe runs the status files, the roll shifts:** Active Retired 317 -> 450,
Retired 634 -> 507, Life 20 -> 15, Alumni 100 -> 99. That changes the
per-capita retiree denominator, so re-run `facts.js` and the deck afterwards —
though note these are 50-year members who mostly do NOT pay current retiree
dues, so "Active Retired" here means long-service standing rather than the
dues-paying test the sweep rule used. **Worth confirming with Joe that the two
meanings can share one status.**

## Per capita — the October rate (Joe, 17 Aug)

**$19.05 is the CURRENT rate**, confirmed by Joe, and every figure in the deck
and on the wall board uses it. The convention raised it by **about 81 cents,
to roughly $19.86, effective 1 October 2026** — Joe's word, approximate, so it
is labelled "about" everywhere it appears and the closing ask now says
**confirm the exact figure in writing with the International**.

At $19.86 (retirees at half, $9.93), computed the same way:

| | at $19.05 | from 1 Oct (~$19.86) |
|---|---|---|
| the 180 they do not have | $41,148/yr | **$42,898/yr** |
| the 514 retirees we cannot match | $58,781/yr | **$61,248/yr** |
| bill on their roll | $473,483/yr | **$493,561/yr** |
| bill on our verified records | $455,850/yr | **$475,210/yr** |
| the two-sided difference | $17,633 | **$18,351** |

**The rise alone costs the local about $20,078 a year** on the International's
current roll ($19,360 on our verified records). That is the line on the deck:
getting the count right is worth MORE after October, not less. When the exact
rate lands, change `RATE`/`HALF` in `scratchpad/facts.js` and re-run.

## The nine the International bills as active (Joe asked, 17 Aug)

"Are these retired guys not paying anymore, or what?" — checked all nine
against roster-55. **None of them pays the local anything.** Four we carry as
**Retired** (Preslipsky, Eller — retired 09/22/2020 — Pennington, Robinson
Wayne P, who is explicitly marked Paying = No) and five as **Drop** (Schott,
Weinroth, Hutchins, Thornhill, White II). Not one appears on the July dues
register. Only Pennington has ever paid retiree dues, and only for 2025 —
nobody paid 2026.

So they are not lapsed Active Retired members; they are people who left the
active roll and the International was never told. **Their roll still types all
nine MEM, so we are billed the FULL active rate for them — 9 × $19.05 × 12 =
$2,057 a year, rising to $2,145 in October.** The deck row now says this
plainly instead of "the overcount side of the gap".

## The office wall board (new, 17 Aug)

`claude.ai/code/artifact/f81c07e6-6086-4f2c-990b-6368c38a7cd2` — Joe wants it
"displayed somewhere prominent in the office". One screen, no scrolling:
1,815 paying · 1,834 Active · 313 Active Retired in huge type, then the whole
roll by status, what the records can prove, the money per pay period, and the
per-capita standing. Everything is sized off one unit
(`--u: min(0.615vw, 1.094vh)`) so it fits any display; verified at 1440×900,
1920×1080 and 3840×2160, light and dark. Prints to one landscape page —
`Local36-membership-board.pdf` was sent to Joe.

**When the numbers change, edit `dashboard-src.html` and run `build-dash.js`**
(it inlines the emblem), then republish to the same artifact URL.

**Sizing, after Joe said the figures were hard to read (17 Aug):** the headline
numbers are **156px** on a 1080p screen and the secondary rows **58px** — up
from 101 and 37. The space came from tighter padding, gaps and sub-lines, plus
scaling `--u` (now `min(0.655vw, 1.165vh)`) into the slack at the bottom.
**If you add a row, shrink something else rather than the digits** — the whole
point of this board is being legible from the door. Re-check with
`measure.js` (must stay under 1080) and `shotdash.js` (all four sizes).

## Waiting on NEP — now its own section of the board deck (17 Aug)

Joe: "add info on things we are waiting on for nep — promotional history and
some of the other fields." Placed immediately after "What is left · and who
owns it" so NEP reads as the third owner of outstanding work, alongside the
International and the treasurer. What the section says, all of it checked
against the built files (`scratchpad/promo2.json`, 494 rows):

- **The Promotional Information tab** — 12 rows / 24 fields, requested of the
  help desk 15 Aug as `Local36-NEP-fields-to-add.xlsx`: FTO (start | end),
  Vice Technician 1/2/3 (start | end each), Technician (start | end, no exam),
  Sergeant through Fire Chief (promotion date with the exam date beside it).
- **Current Company** is missing 13 real assignments: EMS 1–7, Homeland
  Security, Fire Operations Center, Emergency Liaison Officer, Fleet
  Maintenance Division, Recruitment, Information Technology.
- **DC Fire Rank has no "Recruit"** — the rank of the class on the treasurer's
  list, so those members cannot be entered correctly until it is added.
- **494 officers built and waiting**: 1,018 promotion dates and 465 exam dates
  (147 Sgt / 190 Lt / 76 Capt / 36 BFC / 12 DFC / 3 Asst / 1 Fire Chief), each
  exam placed against the rank the officer holds today. Held behind the
  dropdown: Graham -> EMS 3, Raymer -> EMS 1. Known future dates: Deems
  Technician 07/26/2026, McKee Vice Technician 08/23/2026.

The counts above come from the data file, not from memory: 494 officers carry
1,018 promotion dates, and 465 of them have an exam date — 29 officers have a
promotion on record with no exam, which is why 465 and 494 differ.

## The program we are building next (Joe, 17 Aug — on the board deck)

Kept general in the presentation on purpose; this is the shape:

1. **Everything lands in one Google Drive folder, automatically** — the food
   chain list when published, Personnel Actions as signed, and the scanned
   DCHR dues checkoff report.
2. **The program watches that folder**, picks up each document as it appears,
   and runs the checks we did by hand this month — including reconciling the
   checkoff report to the totals DCHR prints on it.
3. **It hands back finished work**: NEP upload sheets, the changes the
   International's database needs, anything doubtful flagged for human eyes
   (never guessed), and a plain synopsis of what was done and what waits.

Two parallel tracks: keep working with **NEP** to streamline and automate what
we send them, and check with **the International** on API progress so the two
databases can eventually sync directly.

**Branding**: the deck now carries the local's legal name — *Fire Fighters
Association, District of Columbia, IAFF Local 36* — with the emblem's red
(#C8102E) as the accent and a red banner on every section. Union vocabulary
throughout: "in good standing", "dues checkoff", "the International", "the
local", "brothers and sisters", "per capita", "separation".

**The emblem — FOUND AND EMBEDDED, 17 Aug.** Inline chat images never land on
disk, so two attempts failed; the Drive connector got it instead.

**Wrong file first — the folder named "Local 36 Logo" holds the OLD emblem.**
`My Drive › Local 36 Logo › L36_430 (1).png` (430×463, dated 2017) is the
plain red maltese cross with "District of Columbia" curved underneath. Joe
caught it: "that's the wrong logo." **The CURRENT emblem is
`l36.jpg`** — file id `1jznhdBFPd8qqch1CHswPCZunyO_pdfUl`, 4096×4096, last
modified 1 June 2026, and it is NOT in the logo folder (parent
`1yXPAkZe3aWqqJLoxKvyxiPRC9WNFCRFz`). It is the round seal: red outer ring,
black ring reading WASHINGTON DC · FIRE FIGHTERS, maltese cross with the DC
flag and the Capitol dome, LOCAL 36 beneath. **Use `l36.jpg`. Ignore the logo
folder.** (`logoIAff36.png` in the same Drive is the International's gold
badge, not ours.)

The source JPEG is a circle on a black square, so it was cut out on the outer
edge of the red ring — measured, not eyeballed: red spans x 117–3963,
y 77–3924, centre (2040, 2000), radius 1923 — and masked with a 4×
supersampled circle so the edge stays clean. The result carries its own red
ring and needs no plate behind it. Stored three ways so it cannot go missing:

- `dues-tracker/assets/local36-emblem.png` — 768px transparent cutout,
  **committed to the repo** (the `.gitignore` excludes `public/logo.png` at
  both levels, so that copy alone was not durable)
- `dues-tracker/assets/local36-emblem-source-4096.jpg` — the untouched 4096px
  original from Drive, so the cutout can be redone at any size
- `dues-tracker/public/logo.png` — what the app serves; `server.js` now falls
  back to `assets/` so a fresh checkout still shows it on every page header
- the board deck — inlined as a base64 data URI in one CSS variable, drawn at
  two sizes (cover and footer). The whole page is 0.25 MB, well inside the
  16 MB artifact limit.

Verified in Chromium at 1440×900 in both light and dark, no horizontal
overflow. Also on Joe's word (17 Aug): the deck says **"this morning"**, not
"tonight" — he presents Tuesday 18 Aug in the morning.

**The three text plates on the roadmap section are GONE** (Joe, 17 Aug: "you
can delete this") — the IAFF/NEP/Local 36 placeholders and their CSS were
removed rather than left waiting for marks we do not have. Do not re-add them.

## Paying but not in NEP — 49 sent by Joe, 17 Aug

Joe's list from the "Treasurer - paying no record" sheet: 49 payroll numbers
deducting on the 25 July register with no NEP record. Built by
`scripts/paying-create.js`, checked by `scripts/paying-verify.js`.

### THE RULE THIS TAUGHT US — the wizard asks for the key, it does not work it out

Step 3 of the NEP import wizard is **Primary key**, and whoever is running the
upload chooses it. Choose a column whose value is not yet on any record and NEP
**creates a record** rather than updating one — a stub carrying only the columns
in that file.

That is exactly what happened on 17 Aug. Two stubs were made:

- a **nameless record on payroll 00143865** (Griffin, Ethan) — from the
  platoon-and-phone file being run before the file that creates him;
- **", Corta M"** — first name only, payroll 00093402 — from the Thomas link
  file being keyed on the payroll number, which no record held.

**So every filename now names its key**: `...-KEY-ON-PeopleSoft-Number.xlsx`.
That is the convention the earlier PSFILL batches used (`3-PSFILL2-key-on-
lastname`), and it is why those landed and these did not. A file whose key
cannot pick out exactly one record is **not built at all** — the script prints
what to do by hand instead.

### Where it stands after roster-61

| file | rows | key to choose at step 3 |
|---|---|---|
| `Local36-PAYING-1-REPAIR-1-nameless-record` | 1 | PeopleSoft Number |
| `Local36-PAYING-2-CREATE-46-new-members` | 46 | PeopleSoft Number |
| `Local36-PAYING-3-LINK-Bell-payroll-number` | 1 | IAFF Member Number |

File 1 repairs the Griffin stub in place — it already holds his payroll number,
platoon and phone, and only needs a name and status. It is keyed on a number
that **does** exist, so it can only update. Run it before file 2, which is why
Griffin is no longer among the creates (46, not 47).

**Thomas has to be done by hand.** There are two "Corta M" records now, so no
key can pick one. Delete the stub — first name only, no company, payroll
00093402 — then type 00093402 onto **Thomas, Corta M** (Class 377, appointed
09/18/2016), which is the record holding the history. Her platoon, phone and
Paying Yes are on the stub and will go with it; the real record keeps her
appointment date, class and date of birth.

**47 were genuinely new, tags L36NEW068-114.** 44 are one block, payroll
00143793-00143865 — a class on the payroll and paying before NEP heard of them.
Three are older numbers that never got a record: Walker Infiniti 00103756, plus
the two below.

**Two of the 49 were already on the roster under a different spelling**, and get
their payroll number added rather than a second profile:

- **Belle, TySean D 00079233** is NEP's **Bell, Tysean D** — NEP and the IAFF
  roll both spell him Bell and agree on IAFF 1318785; only the DC payroll writes
  Belle. *Which spelling is legally right is still open — payroll usually wins,
  but that is Joe's call.*
- **Thomas, Cortni 00093402** is NEP's **Thomas, Corta M** — Class 377,
  appointed 09/18/2016, and her classmates hold 00093410, 00093445 and 00093454,
  so 00093402 sits inside that block. The IAFF roll also has her as Corta M.
  (1359071), which NEP does not hold.

**Andrew Boyd Jr. (00143848) and Andrew Boyle Jr. (00120022) are two people** —
confirmed by Joe, and by the register carrying both as separate paying lines.

Rank is set for nobody: the one createe on the staffing roster is **Griffin,
Ethan — a recruit**, and NEP still has no Recruit value on the DC Fire Rank
dropdown. His rank waits on the same request as the 13 company values.

Only 1 of the 47 is on the IAFF roll, so the per-capita undercount grows by 46
once these land.

## Ballot file check — roster-62, 20 Aug 2026

Joe is sending the roll to the election ballot vendor. `scripts/ballot-check.js`
builds `Local36-BALLOT-file-check.xlsx` — six tabs of everything needing a
decision first. Counting Active / Active Retired / Retired / Life / Honorary as
eligible, **2,887 of 3,484 would be sent a ballot**.

**Eligibility is our assumption, not a rule anyone has agreed.** Confirm it
before the file is used — it decides 597 people either way.

1. **545 of the 2,887 (19%) have no address to post to.** 467 Active, 39 Active
   Retired, 32 Retired, 3 Honorary, 2 Life. **429 of them are confirmed dues
   payers on the 25 July register.** 275 have no email either. 102 are the
   records we created this month — we never had addresses for those.
2. **Duplicates that would send two envelopes.** Two payroll numbers on two
   records each: Barbosa Becaye 00115712, McCoy James 00132282. A brand-new
   duplicate **Akers, Dahvae** (second record, Status pending, no Member Status)
   appeared since 17 Aug. Same date of birth: Henyon Michael, Bobo Ronald. Same
   address: Frazier/Shumate Lashon, Matthews Norita, Gilbert Stephen. Four
   blank-status pairs: Long Brian, Taylor Charles, Taylor Herbert, Neal Jimmy.
3. **Three records that are not people would be posted a ballot**: "Sepeartation
   Status, Dennis D" (status Retired, has an address), "Admin, Local 36", and
   "Firefighters Local 36, DC". Plus **two deceased members with Work Status
   Deceased still carrying a voting Member Status** — Fowler Charles L and
   Zollars David E — both with good addresses.
4. **89 records have no Member Status**, so no rule reaches them; 43 have
   addresses. Includes the five from the NODUES 4 and 5 files, still not run.
5. **Five dues payers whose payroll number is on no eligible record**: Belle
   TySean D, Griffin Ethan, DeSilva Sydney David, Johnson Brianna M, Johnson
   Joseph. The last three match two records each and cannot be told apart.

**The nameless stub on payroll 00143865 is still there** — Griffin, Ethan. The
REPAIR file was never run, so he pays dues and would get no ballot.

### The duplicate-ballot fix — `Local36-BALLOT-duplicate-fix.xlsx`

`scripts/ballot-dupes.js`, built to the rule the Gooding/Reed merge left behind:
one sheet, every field of every record side by side, keeper marked. **12 groups
have a keeper decided; 18 are marked STOP; 29 values must be copied across
before anything is deleted; 3 pairs disagree about where the member lives.**

An upload cannot delete a record, so this is hand work in NEP, in this order:
read the side-by-side sheet, copy the values across, then delete.

**Nine send two ballots today**: Barbosa Becaye, Glaze Charles, Frazier Lashon,
Henyon Michael, Sellitto Michael, Matthews Norita, Bobo Ronald, Gilbert Stephen,
Dean Thomas. Three more are one person twice but only one ballot today — Akers
Dahvae (the record that appeared on 17 Aug), Washington Joseph L, Farrow Shirley.

**18 marked STOP.** Two approved logins means two real people (Smith Christopher,
McCoy James — the pair already named in the merge rule — Johnson Joseph, Abell
Michael), or the identity fields disagree outright.

Two traps this run walked into and now guards against:

- **Name grouping alone missed McCoy.** "McCoy, James" and "Mccoy, Jr., James M"
  share payroll 00132282 but not a surname string. Records are now joined by
  payroll number, IAFF number, name, and surname-plus-birth-date, followed
  transitively.
- **A shared birth date must not outrank a first name.** Long **Keith T** and
  Long **Kenneth W** share 12/24/1967 and hold different IAFF numbers — two
  different men, and the first draft had one of them deleted. A birth date or an
  address now only counts as evidence when the first names agree.

The keeper is usually the record holding the service history, and the record
being deleted usually holds the **only email address** — which is exactly what
the copy-across sheet is for.

### Long, Keith T — line-of-duty death recorded as a Drop (Joe, 20 Aug)

Battalion Fire Chief, Battalion Fire Chief 2, Platoon 1, Class 329, appointed
03/26/2001, IAFF 1055217. NEP carried him as **Member Status = Drop**.
`Local36-LODD-Keith-Long-KEY-ON-Email.xlsx` sets Member Status **Deceased** and
LODD **Yes**, keyed on his email, which is unique roster-wide.

**The LODD column has never been used — it is blank on all 3,484 records**, as is
LODD Spouse Insurance Participant. Keith would be the first. If the local wants
its line-of-duty deaths marked — for the memorial, or for spouse insurance —
none of them currently are, and nothing in NEP can tell them from any other
deceased member. Worth a proper pass.

Work Status is deliberately left alone: 67 of the 85 Deceased records carry no
Work Status at all, and the two that read "Deceased" there are the pair still
holding a **voting** Member Status (Fowler, Zollars) — the wrong way round.
Groups are left alone too; NEP writes "Member Status - Deceased" itself.

He is not a ballot problem — Drop was already ineligible — but he shares the
birth date 12/24/1967 with **Long, Kenneth W**, which is what nearly got one of
them deleted as a duplicate. They are plainly two different men. One of those
two birth dates is probably wrong.

## RULE — Work Status is not ours to change (Joe, 20 Aug)

Joe, verbatim: *"every member here's work status is active member. that's an NEP
field that we don't change to anything but active. our member status is the one
that changes right now."*

**Work Status = Active Member for everybody, always.** Never copy a different
value across in a merge, never propose changing it, never read meaning into it.
1,204 records disagree with it today (1,077 blank, 115 "Retired Member", and a
scatter of Deceased / Quit / Employee / Resigned). Joe: *"we'll handle that field
later."*

Consequence: the ballot check's "two deceased would get a ballot" finding
(Fowler Charles L, Zollars David E) rested only on Work Status = Deceased. That
field is not maintained, so treat it as a hint to verify, not a fact.

## The twelve duplicates, worked through one at a time — 20 Aug

Full record in `docs/duplicate-decisions-20aug.md`: every pair, the keeper, what
must be copied across first, and what is still open. **Nine to merge** (Barbosa,
Glaze, Frazier, Henyon, Matthews, Bobo, Gilbert, Dean, Washington), **two
cleanup** (Akers, Farrow), **one to leave alone**.

**Sellitto is two men, not a duplicate.** Michael (Active Retired, paying retiree
dues) and Michael J (Active, Engine 27, payroll 00033832, paying on the register)
at one address. The IAFF roll settles it — **two member numbers, 0321288 and
1161880**. Father and son. Two ballots is correct, and the automated rule wanted
to delete the retiree. **Check the IAFF roll for two people of a name before any
merge**; NEP alone could not tell, because the retiree's record holds no IAFF
number at all.

**In six of the nine merges, the record being deleted is the only one carrying
the Retiree Insurance Group** — Frazier, Henyon, Bobo, Gilbert, Dean, Washington.
That is the Kevin Adams trap at six times the rate anyone assumed. **85 duplicate
pairs are still untouched from the 11 Aug pass, and merges done before that rule
existed may already have dropped people off the insurance roll with no trace.**
Worth a dedicated pass once the ballot is away.

**Three merges decide where a ballot lands**: Bobo (Myrtle Beach SC vs Mineral
VA), Farrow (Menifee CA vs Washington DC), Henyon (same house, spelling only).

Picked up along the way, each needing a fix: Glaze's keeper has Date of Birth
11/20/2022 against a 1986 appointment; Henyon's two records disagree on rank
(Marine Engineer vs Firefighter); Washington Joseph is filed Alumni but is a
retired Lieutenant on the insurance group; Sellitto's retiree record should carry
IAFF 0321288; Akers has no payroll number though the staffing roster says
00072958; and Frazier, Henyon and Matthews each have two emails with nothing to
say which is current.

## The container was wiped — 22 Aug 2026

Everything under `data/` is gitignored, correctly, because it holds member PII.
When the container was rebuilt on 22 Aug that took **all of it**: 62 NEP roster
exports, `dues.db` with the June and July registers parsed and eye-verified,
the IAFF roll, and `telestaff-2.csv`. The upload folder was cleared at the same
time, so there was nothing to rebuild from. No off-box backup exists.

Everything committed survived — scripts, `lib/knownreasons.js`, the duplicate
decisions in `docs/`, this file.

**Joe holds the only durable copies of the source files.** Worth building the
encrypted per-import backup the check-in app already has the shape for, once
the election is past.

## The August staffing roster — merged from four platoon exports, 22 Aug

TeleStaff shows who is **on duty**, not who is employed, so one export is one
platoon on one day. Joe worked this out himself and pulled four consecutive
days: 28 Aug Platoon 4 · 29 Aug Platoon 1 · 30–31 Aug Platoon 2 · 31 Aug
Platoon 3. `scripts/telestaff-merge.js` merges them.

**1,745 unique employees.** Only 72 appear in more than one file — day-work and
specialists (hazmat, ROCC, battalion aides) who are not on a platoon rotation.
So the four files are complementary, not copies.

Against `roster-63` (22 Aug 3:50pm, 3,475 records):

| | |
|---|---|
| in NEP by payroll number | 1,592 |
| in NEP but the record carries no payroll number | 60 |
| **not in NEP at all, bargaining unit** | **55** |
| set aside — chiefs 4, single-role EMS 25, recruits 5, ambiguous 3 | 37 |

**51 of the 55 are tagged PROBATION by TeleStaff** and sit in one payroll block,
**00142066–00142684** — an academy class now out on the street with company
assignments. Under standing rule 7 probationary appointments were skipped on
SO-2026-198; these people are now *at companies*, which is the point at which
they stop being recruits (rule 9b) and start being members who pay.

Four are not from that class and are a different problem: **Belle TySean D
00079233** (still the missing payroll number on NEP's "Bell, Tysean D"),
**Kennedy David A 00103335**, **Guzeh Nueta Z 00128212**, **Gilligan Brendan
00136079**.

**Still needed before records can be created:** the training academy personnel
action assigning this class to companies — Joe asked for it and we do not have
it; the SO-2026-198 scan is gone with everything else, and its Cadet 28 /
Recruit 414 appointments were skipped anyway. And the August dues register, to
say which of the 55 are already paying.

## SO-2026-198 against the staffing roster — 22 Aug

Joe sent the signed order. `scripts/pa-parse.js` reads it out of the PDF and
matches it to the four merged TeleStaff exports. **79 actions**: 2 promotions,
1 technician, 1 vice-technician, 17 reassignments, 3 retirements, and **55
probationary appointments — Cadet Class 28 (18) and Recruit Class 414 (37)**,
all effective 0700 Sunday 23 August.

**All 55 are on the street and none of them is in NEP.** That is the whole of
the gap: the 55 bargaining-unit members missing from `roster-63` are this
order's class, less two, plus two others.

The order's code carries the company **and** the platoon — `E-14-2` is Engine
14 Platoon 2, `TL-3-3` is Tower 3 — so both were checked. **52 of 55 stand
exactly where the order sent them.** Three do not:

| | order says | on duty |
|---|---|---|
| Brault, Ryan P. 00142663 | Engine 18, Platoon 2 | **Platoon 4** |
| Jensen, Douglas K. 00142652 | Engine 10, Platoon 3 | **Day Work** |
| Sanford, Alexander B. 00142666 | Engine 9, Platoon 4 | **Day Work** |

Under rule 5 the order wins, so those three go in as the order reads unless
Joe knows of a later change. Day Work on a brand-new probationer usually means
light duty or an injury.

**Two are on the street, absent from NEP, and not on this order** — each needs
its own explanation: **Belle, TySean D 00079233** (Engine 33P — still the
missing payroll number on NEP's "Bell, Tysean D", outstanding since 17 Aug) and
**Gilligan, Brendan 00136079** (Ambulance 13; not the same man as Reilly
Gilligan, who *is* on the order).

Rank on the order: 8 Firefighter Paramedic, 47 plain Firefighter. Under rule 6
the bare "Firefighter" is the order's house shorthand — TeleStaff carries most
of them as FIREFIGHTER EMT, and **that EMT designation must not be stripped**.

**Still needed before records are created:** the August dues register, to say
which of the 55 already have a deduction running. At $49.19 a fortnight the
class is roughly $2,700 a pay period.

Two matching traps this run hit and now guards against: a two-word surname
("Brayan A. Flores Guevara" is TeleStaff's "Flores, Brayan") needs every split
point tried, not just the last word; and "on duty but not in NEP" has to
exclude chiefs, single-role EMS, recruits and anyone matched by name, or it
returns a hundred people who are not missing at all.

## Appointment Date for a class — Joe's rule, 22 Aug

**Cadets and recruits are dated differently, and it matters when records are
created from a personnel action.**

- **Cadet class** — kids who came up through a DC programme. Their official
  appointment date is **the date printed on the action**. For Cadet Class 28
  that is **08/23/2026**.
- **Recruit training class** — the appointment date is **when they started the
  fire academy**, not the date on the order. *We do not hold that date.* Leave
  Appointment Date empty rather than stamping the order's date on them. This
  holds even for a recruit who worked for DC before: an earlier payroll number
  means prior service somewhere in the District, but that date does not come
  over to our records — ours starts at the fire academy.

So a create built from an order splits into two files by class, because the two
differ on Class Number, the Cadet flag **and** whether Appointment Date can be
filled at all.

**Prior DC service does not come over to our records** (Joe, 22 Aug). Two of
Recruit Class 414 carry payroll numbers years older than the rest — **Kennedy,
David A — 00103335** and **Guzeh, Nueta Z — 00128212**, against the 001426xx
block the other 35 sit in. They worked for DC before this academy, and not
necessarily for EMS; it could be any DC agency. **It makes no difference to the
appointment date either way** — for Local 36 that date is when they started the
fire academy, so they are treated exactly like the other 35 and their
Appointment Date is left empty too. There is no special case.

Cadet Class 28 sits at 00142066-00142233, **below** the recruit block, which
fits: cadets are on payroll before the class that graduated with them.

No NEP record between 00138000 and 00143000 carries an appointment date, so
there is no neighbouring number to date the block from. If the academy start is
wanted later, the earliest dues register showing the 001426xx block deducting
would date it approximately — recruits are paid from their first academy day.

## Both classes landed — roster-64, 22 Aug

`roster-64` (3,529 records, 54 columns). **All 55 records from
SO-2026-198 imported with every field exact** — checked column by column
against both upload files, nothing wrong on a single row. Active rose
1,884 → 1,939.

NEP assigned what it always assigns: Role Member, Status nonactive, Groups
"All Members, Active, Platoon - n". Class Number reads 414 on 37 and CC28 on
18, Cadet No/Yes to match, and **Paying Active Member is blank on all 55** —
the honest position until a register speaks.

### Griffin, Ethan 00143865 — now has no record at all

The nameless stub was deleted rather than repaired, so there are **zero
nameless records left** (good) but Griffin is gone with it. **L36NEW092 is the
one missing tag in the whole sequence** — his.

He is a **RECRUIT at the Training Division** on the current staffing files
(`{TD}`, NQTD), which is why the class import did not cover him: he is not on
SO-2026-198, and rule 9b says a recruit is not yet a probationer at a company.
But he **was deducting $49.19 on the 25 July register**, so he is paying with
no record. Needs creating on his own, and his rank waits on NEP adding
"Recruit" to the DC Fire Rank dropdown.

### The help desk delivered part of the Promotional Information request

Nine new columns arrived: **Company Assignments 1**, **Vice Technician 1/2/3
Start and End**, **Technician Start and End**. All empty so far.

Still missing from the 15 August request: **Field Training Officer** start/end,
and the promotion-date-plus-exam pairs for **Sergeant, Lieutenant, Captain,
Battalion Fire Chief, Deputy, Assistant and Fire Chief** — the bulk of the 24
fields. So the PROMO data files for 494 officers still cannot run; only the
technician and vice-technician dates could go now.

Worth chasing the help desk with what arrived and what did not, since they are
clearly working the ticket.
