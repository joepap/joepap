# Joe's list

Short, and only things that need Joe. Everything else lives in `OPEN-ITEMS.md`.

---

## Tomorrow — set up the union drive folder

Why: `data/` cannot be committed to GitHub (member PII), so it only ever exists
on a throwaway cloud machine. It has been wiped twice. **Right now your own
downloads are the only copy of the union's membership data, and there is no
second one.**

### 1. Make the folder

On the union drive, somewhere only officers can reach:

```
Local 36 Membership Data/
    NEP exports/            members_export_....xlsx, straight from NEP
    DCHR dues registers/    the payroll deduction registers
    TeleStaff/              staffing exports
    IAFF/                   the member roll export
    MK Elections/           anything the ballot company sends back
    Personnel actions/      the Special Order PDFs
```

**Keep the filenames exactly as they download.** The date and time in a NEP
export filename is the only thing that tells two of them apart, and renaming
them to "roster latest" is how a set becomes unusable.

### 2. Put in what you already have

- [ ] every NEP member export you still have in Downloads
- [ ] **DCHR payroll dues registers — June, July, August 2026** (September too,
      if it has come through). These are the ones I most need back: without them
      `ballot-check.js`, `ballot-dupes.js` and the paying-member checks cannot run.
- [ ] **a TeleStaff export.** Remember it only shows who is *on duty*, so it
      takes four consecutive days to cover all four platoons.
- [ ] **the IAFF member roll export** — this is what settles father-and-son
      pairs, and it is the only thing that proved Sellitto was two men.
- [ ] the MK Elections files: `2532611_movers.xls`, the undeliverables report,
      and the address book we sent them
- [ ] `SO2026198_Personnel_Actions.pdf`, and any other Special Orders

### 3. From then on

Every file you download and send me goes in that folder first. One drag.

### 4. Send me back what the project is missing

`docs/data-manifest.md` lists it by name. The registers, TeleStaff and the IAFF
roll are the three that unblock real work.

---

## Before the ballot file goes to MK

- [ ] **Run the six `Local36-ADDRFIX-*` files**, one at a time, Notes set to
      Trust File. They put the same corrections into NEP that the outgoing file
      already carries, so the next export does not undo them.
- [ ] **HENDERSON, EMMETT** by hand: "5705  1ST STREET N.W." has a double space.
- [ ] **Pull a fresh roster right before sending** and tell me — the builder
      re-runs in one command and the audit comes with it.

## Still open — not for tomorrow

- [ ] **Look up Johnson, Joseph B in NEP with the status filter off.** He and
      Johnson, Joseph W had different payroll numbers, different IAFF numbers
      and houses five years apart — two men by the Sellitto rule. He is gone
      from the roster and it has the shape of a bad merge. If the record was
      deleted, a member with nine years in has lost his ballot.
- [ ] **Pull one export that includes Deceased.** Every roster is filtered to
      Active and Active Retired, so a death reaches me as a vanished row. The
      LODD and LODD Spouse Insurance fields read as empty on all 2,390 records
      and have never been verifiable — including Keith Long's.
- [ ] **Run `Local36-MERGE-Cole-carry-across-KEY-ON-Email.xlsx`, then delete
      "Cole, Leonard W".** In that order — an upload cannot delete, and the
      payroll number, appointment date and address are only on the old record.
- [ ] **McCoy, James** — two records on payroll 00132282, open since August.
      One is mailable. Two ballots.
- [x] **The 14 same-name pairs** — settled 12 Oct. All fourteen are two real
      men: thirteen carry two distinct IAFF numbers, and Abell is settled by
      both records paying different dues at addresses 40 miles apart. Do not
      merge any of them.
- [ ] **Look up Michael Abell's IAFF member number.** His record has none,
      which is the same gap that made Sellitto look like one man.
- [ ] **Fowler, Charles L** — Work Status reads Deceased and the record is
      mailable. The field is not maintained, so verify before a ballot goes.
- [ ] **Quarry, Lawrence J** by hand in NEP: 4931 Milligans Cove Rd,
      Manns Choice PA 15550.
- [ ] **Call the 150.** Of the 180 whose address we cleared on 27 Sep, 150 are
      still blank. They could not be mailed and most have no email, so the
      phone is the only route left.
- [ ] **Ask Kenny to re-run NCOA before the ballot file goes over.** 29 movers
      have expired forwarding — they did not bounce the notice but the ballot
      will.
