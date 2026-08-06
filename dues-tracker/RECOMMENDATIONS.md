# Getting the NEP roster right

Written after the night of 5–6 August 2026, against the NEP export of 04:44
(3,489 members), the 13 June DCHR dues report (1,781 payers), the 5–9 August
telestaff export (1,684 people) and the July IAFF export (2,514 members).

Every number here is measured, not estimated. `lib/audit.js` reproduces them.

---

## 1. Where the roster actually stands

**2,430 of 3,489 members can be vouched for by an outside source** — a
PeopleSoft number telestaff recognises, or an IAFF number the IAFF confirms.
**1,059 cannot.** Those 1,059 are the real size of the problem: nothing but a
name in a database says they exist.

Of the 2,041 Active members:

| field | filled | missing |
|---|---|---|
| DC Fire Rank | 97% | 63 |
| Phone | 93% | 134 |
| Current Company | 92% | 163 |
| Platoon | 90% | 199 |
| Paying Active Member | 78% | 457 |
| IAFF number | 75% | 513 |
| Appointment Date | 74% | 528 |
| PeopleSoft number | 69% | 625 |
| Email | 69% | 630 |

**117 Active members have no email and no phone** — no way to reach them at
all. **310 have neither an IAFF number nor a PeopleSoft number**, so nothing
external can confirm them and no upload can key on them.

The audit currently reports **1,291 findings, 162 of them high**.

---

## 2. The to-do list, in the order that matters

Ranked by what it costs to be wrong, not by how many rows it is.

### A. 88 members are caught up in a payroll-number problem — do this first

These overlap, so it is 88 people, not 97 separate jobs:

- **13 payroll numbers sit on two members each.** Every pair is a father and
  his son. One number, one employee — this is unambiguous.
- **19 non-Active members hold a payroll number.** Retired, deceased, alumni
  and dropped members do not have one; it was written to the wrong generation.
- **65 members have a hire date that does not fit their number's cohort.**
  Employee numbers are issued in hire order, so a 1982 appointment date on a
  number surrounded by 2021 hires means one record is holding two people's
  facts. 13 of these are the same people as the 19 above, and 8 are in the
  duplicate pairs — the tests agree with each other, which is what makes them
  believable.

**Two of the 13 must not be resolved by suffix.** For **Edwards** (Raymond
Allen vs Raymond C) and **Harris** (Jason A vs Jason M) the serving member is
the one *without* the Jr./Sr. Telestaff's middle initial is the only thing
that separates them.

**Do not apply "clear the number from non-Active members" as a blanket rule.**
94 members holding a number have a *blank* Member Status — not a non-active
one. They are on the payroll report, which is how they got a number; their
status was simply never set. Clearing those throws away good data. Only the 19
with a definite non-active status are wrong.

### B. 316 members have no Member Status at all

They are invisible to every report that filters on status, including the
paying-member counts we give the IAFF. This is a bigger number than any name
problem and nobody has looked at it.

### C. 104 duplicate profiles

27 of them have a contact detail that exists **only** on the record to be
deleted. Copy it across first. 22 more are Jr./Sr. pairs the audit reports as
*possible father and son* and refuses to merge — leave them.

### D. 411 IAFF numbers the IAFF has never heard of

Either the number is wrong or the member was dropped nationally. Since the
IAFF bills per member, both directions cost money.

### E. 137 damaged names, 81 records holding nothing but a name

The residue of the old spreadsheet migration. Low individual value, but they
generate false matches, which is how the Wheeler mistake happened.

### F. Smaller, already scoped

- 25 IAFF numbers that are a date, 1 reading `00L#326`
- 18 chiefs still Active who should be Drop (sheet built, not yet run)
- 85 members still unmarked as paying, 62 on phone key and 9 by hand
- 45 members with nothing unique to key on — no IAFF number, no email, no phone

---

## 3. Changes to NEP that would pay for themselves

**Add `Employment Status`, separate from `Member Status`.** Today one field
carries two ideas: whether someone is a *member* (Active, Honorary, Life) and
whether they are *employed* (working, retired, dropped). That conflation is
what let 19 retired members hold a serving employee's payroll number, and it is
why 316 blanks are ambiguous — we cannot tell "not a member" from "nobody ever
filled this in".

**Add `Appointment Date` to the required set for Active members.** 528 are
missing it. With a hire date and a payroll number, the cohort check catches a
merged father/son record automatically; without it, 991 Active members cannot
be checked at all.

**Make `PeopleSoft Number` unique in NEP, the way email and phone already are.**
NEP already refuses a duplicate email — it would have refused all 13 duplicate
payroll numbers on import, and we would never have written them.

**Add `Recruit` to the DC Fire Rank dropdown.** Telestaff has 2; NEP cannot
represent them.

**Consider a `Verified` date stamp.** Nothing in NEP records when a member's
details were last confirmed against an outside source, so a record corrected
tonight looks identical to one nobody has touched since 2019.

---

## 4. How the monthly process should run

The order matters, because each step makes the next one safer.

1. **Telestaff first, not the scan.** It is typed and it carries the employee
   number, the current rank and the platoon. Load it and it tells you who is
   working today.
2. **Then the dues report, matched on employee number.** The scan's only unique
   contribution is *who is paying*. Its employee numbers are unreliable — 48 of
   the June ones were out by a digit and 43 of those were a `9` misread — so use
   telestaff's number and use telestaff's typed name to repair the scanned one.
3. **Then the IAFF export**, for member numbers and as a third opinion on
   spelling.
4. **Then NEP**, and only then build upload sheets.
5. **Run `lib/audit.js` before and after every upload.** Before, so a bad value
   never reaches NEP. After, so we know exactly what changed. The field-by-field
   diff against the previous export caught a wrong key, a rejected row and two
   hand edits nobody mentioned.

For a **promotion list**, the same shape works: telestaff is the authority on
rank, every value must come from NEP's own 53-entry dropdown, and a rank that
encodes an assignment rather than a rank ("Captain - ROCC Manager") needs a
human before it is written.

**What should stay manual.** Anything that decides a person's identity —
merging two profiles, choosing between a father and a son, deciding a name is
wrong. The tools should find those and rank them; a human should settle them.
Everything else — building sheets, checking keys, verifying uploads landed —
can be automated safely, because it is checkable.

---

## 5. What broke tonight, and what stops it recurring

Worth keeping, because each was found the expensive way.

| what happened | now prevented by |
|---|---|
| Payroll number written from OCR alone; 42 wrong numbers reached a sheet | `lib/telestaff.js` — telestaff is the authority |
| An empty duplicate record won a matching tie and became false evidence | tie-break in `lib/reconcile.js`, with a regression test |
| A qualification list padded into the fake employee number `00000000` | `padEmplid` rejects anything that is not an employee number |
| `O&#39;Neil` scored 89 against himself | entity decoding in `cleanName` |
| Leading-zero IAFF number matched nobody on upload | key on NEP's own stored string |
| Six employee IDs collided; the importer had flagged them and I read past it | flags are a gate, not a suggestion |

The pattern in all six: **a plausible-looking wrong value is more dangerous
than a missing one.** Every check should prefer refusing to write over writing
something that looks right.
