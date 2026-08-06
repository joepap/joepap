# Open items

Things waiting on somebody, so they don't get lost between sessions.
Close an item by deleting it. Anything finished lives in git history, not here.

## Waiting on a member to reply

- **Jeffery / Jeffrey Agnew** (#1456943). The payroll report prints
  "Agnew,Jeffery M", but NEP, the IAFF and his own email address
  (`jeffreyagnew1@gmail.com`) all say Jeffrey. There is print noise sitting
  on that exact letter in the scan, so the paper is not conclusive. Joe is
  emailing him. Until he answers, NEP keeps **Jeffrey**.
- **Warren** (#494309) and **Faunce** (#1049247) — two members sharing one
  IAFF number each. Joe emailed both to confirm which number is whose.

## Waiting on a decision

- **Davis, Don / Tony** (#1378287) — wrong IAFF number, Joe investigating.
- **The 69 suffix differences.** NEP stores Jr./II/III inside the Last Name
  field ("Bozarth, Jr.", "Kiser, Iii", "Washington, Sr.") while the payroll
  and the IAFF leave it off. Deferred deliberately — it is cosmetic and the
  matcher already ignores it.

## Needs doing by hand in NEP

- **Gary Bellegarde** lost `Paying Active Member = Yes` and
  `Work Status = Active Member` when his duplicate was merged. The surviving
  profile was his own self-registration, which was the right one to keep
  (it has his email, rank and company) — those two fields just need typing
  back in.
- **Key'shaun Samuel** — NEP has only "Key'". No IAFF number, no email, no
  phone, so there is nothing to key an upload on.
- **Alexander Henry** — the payroll says Alexander; NEP holds *two* profiles,
  "Alex" and "Alex D", both Active, neither with an IAFF number. Work out
  which is real before renaming either.

## Broken NEP records with no payroll match

These are leftovers from the old spreadsheet migration. Each needs a look:

- `iaz, Davi` — almost certainly a damaged duplicate of **Diaz, David**
  (#1674118), who is also in NEP.
- `M, Kurt` — same shape; **Long, Kurt M** (#1107560) is also in NEP.
- `Lea, D'Andfe L` and `Lea, D'Andre` — one of these is a typo of the other.
- `Ne, Dennis`, `S, Ebony` — one-letter surnames, no payroll line.

## Bigger jobs not started

- **Junk IAFF numbers**: 66 members carry a date (mostly `08/08/2025`) where
  their IAFF number should be. 15 can be replaced with a real number, 49 need
  clearing, 2 by hand. The clearing pass needs a 2-row test first — NEP may
  read a blank cell as "leave alone" rather than "make it blank".
- **Paying Active Member** across the whole active roster (~1,514 rows).
- **A current dues report.** The one driving all of this is 13 June 2026.
- **Drive-folder automation** for the monthly scan — needs the public link
  confirmed and the folder name.
- **Telestaff roster** — Joe has one that is a few years old. It carries DC
  Fire's own spelling of every name, which would settle name questions
  without anyone having to remember. Not yet sent.
