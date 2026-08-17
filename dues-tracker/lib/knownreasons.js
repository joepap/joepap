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
    who: 'Joe, 18 Aug 2026',
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
         (k.pendingStatus ? ` · status to become ${k.pendingStatus}` : '');
}

/** Everyone waiting on a NEP dropdown value before their status can be set. */
function awaitingStatus() {
  return KNOWN.filter(k => k.pendingStatus);
}

module.exports = { KNOWN, reasonFor, explain, awaitingStatus };
