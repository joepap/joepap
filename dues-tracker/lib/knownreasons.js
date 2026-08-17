'use strict';
// Why a member's dues stopped, when we already know the answer.
//
// A $0.00 line on the checkoff register means the paperwork is in place and
// there is no paycheck to deduct from — suspension without pay, leave, comp,
// or military service. The register cannot tell those apart, so every review
// cycle the same names come back up as "why did the money stop?".
//
// This is where an answer gets written down once. It changes nothing in NEP;
// it only stops a settled question being asked again.
//
// Keyed by the PAYROLL number as it appears on the DCHR register, which is not
// always the number NEP holds — Devendorf and Newton, for instance, have no
// PeopleSoft number in NEP at all.

const KNOWN = [
  {
    emplid: '00093437',
    name: 'Barrow, Joshua M',
    reason: 'long-term military leave',
    detail: 'On military leave, so there is no DC paycheck to deduct from — ' +
            'the checkoff is still in place, which is why the line reads $0.00 ' +
            'rather than disappearing. He has not left and is not lapsed.',
    // Joe, 18 Aug: "no change at the moment till we get that category" — the
    // record stays Active until NEP adds a Military value to Member Status.
    pendingStatus: 'Military (waiting on the NEP dropdown)',
    expect: 'stays $0.00 until he returns to a DC paycheck',
    who: 'Joe, 18 Aug 2026',
  },
  {
    emplid: '00078082',
    name: 'Long, Kenneth W',
    reason: 'in jail, suspended without pay',
    detail: 'Suspended and not being paid, so there is nothing to deduct. ' +
            'Carried as an active member until he is either terminated or ' +
            'comes back — the union has not let him go.',
    expect: 'stays $0.00 while suspended; do not drop him',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00103926',
    name: 'Rembert, Tondelaya L',
    reason: 'on suspension',
    detail: 'A member on suspension. Keep the record Active.',
    expect: 'may read $0.00 while suspended; do not drop',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00118038',
    name: 'Price Jr., Woodrow B',
    reason: 'in a program',
    detail: 'In a program and still an active member. He may not have dues ' +
            'deducted while he is in it, but the deduction comes back when ' +
            'he does.',
    expect: 'gap in deductions is expected; resumes on his return',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00007060',
    name: 'Glover, Tye M',
    reason: 'payroll glitch — comes off and back onto the register',
    detail: 'A known oddity in the dues deduction: he drops off the payroll ' +
            'sheet and reappears, and will probably show a double deduction ' +
            'the following week. He is an active member throughout.',
    expect: 'a missed week followed by a double — not a lapse',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00106864',
    name: 'Devendorf, Brandon M',
    reason: 'dropped — no longer on the dues roll',
    detail: 'A drop, and correctly off the dues-paying list. Settled; nothing ' +
            'outstanding. NEP already carries him as Drop.',
    expect: 'no further dues lines',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00033810',
    name: 'Dufresne, Christopher M',
    reason: 'quit — moved to Drop',
    detail: 'Left the department. Changed to Drop in NEP on the 17 Aug ' +
            '6:15pm export.',
    expect: 'no further dues lines',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00130126',
    name: 'Newton, Kenneth',
    reason: 'quit — moved to Drop',
    detail: 'Left the department, and the NEP record was changed to Drop ' +
            'correctly.',
    expect: 'no further dues lines',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00133058',
    name: 'Tyler, Shawn',
    reason: 'terminated — moved to Drop',
    detail: 'Terminated by the department and changed to Drop in NEP on the ' +
            '17 Aug 6:15pm export.',
    expect: 'no further dues lines',
    who: 'Joe, 17 Aug 2026',
  },
  {
    emplid: '00130127',
    name: 'Chen, Ben',
    reason: 'dropped',
    detail: 'Moved from Active to Drop in NEP on the 17 Aug 6:15pm export. ' +
            'The reason was not recorded with the change.',
    expect: 'no further dues lines',
    who: 'NEP record, 17 Aug 2026',
  },
];

const byEmplid = new Map(KNOWN.map(k => [String(k.emplid).padStart(8, '0'), k]));

/** The known explanation for a payroll number, or null. */
function reasonFor(emplid) {
  return byEmplid.get(String(emplid == null ? '' : emplid).trim().padStart(8, '0')) || null;
}

/** One line fit for a spreadsheet cell, or '' when we genuinely do not know. */
function explain(emplid) {
  const k = reasonFor(emplid);
  if (!k) return '';
  return `KNOWN — ${k.reason} (${k.who})` +
         (k.pendingStatus ? ` · status to become ${k.pendingStatus}` : '') +
         (k.expect ? ` · ${k.expect}` : '');
}

/** Everyone waiting on a NEP dropdown value before their status can be set. */
function awaitingStatus() {
  return KNOWN.filter(k => k.pendingStatus);
}

module.exports = { KNOWN, reasonFor, explain, awaitingStatus };
