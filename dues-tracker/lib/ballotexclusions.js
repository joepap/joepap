'use strict';
/*
 * Members to leave out of the ballot address file for a reason the roster
 * export cannot know.
 *
 * An export is a snapshot. A member who dies, or is corrected, after it is
 * pulled still appears in it — Ken Cox left roster-68 that way, and Charles
 * Fowler was marked deceased on 12 Oct minutes after roster-70 came down. The
 * alternative to this list is hand-editing the outgoing spreadsheet, which
 * leaves no record of who was removed or why.
 *
 * Each entry says who decided and when, so the file can be defended if a
 * member asks why he got no ballot. Nothing is excluded on an inference.
 */
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');

const EXCLUDED = [
  {
    // No IAFF number and no payroll number on this record, so the name is the
    // only handle. "Fowler, Charles L" is one record on roster-70 and the birth
    // date is carried as a second check: a name alone must never drop somebody.
    lastName: 'Fowler', firstName: 'Charles L', dob: '07/14/1944',
    reason: 'deceased',
    who: 'Joe, 12 Oct 2026',
    detail: 'Marked deceased in NEP after roster-70 was exported, so the export still carries him. ' +
            'His Work Status already read Deceased, which the 20 Aug rule treats as a hint rather than a fact — ' +
            'this time the hint was right.',
  },
];

// Matched on every field an entry names, never on fewer. An entry that does not
// match exactly one record is a fault, not a near miss: isStale() reports it so
// a list entry cannot silently stop working after a record is renamed.
function matches(entry, r) {
  if (entry.iaff && num(entry.iaff) !== num(r['IAFF Member Number'])) return false;
  if (entry.peoplesoft && num(entry.peoplesoft) !== num(r['PeopleSoft Number'])) return false;
  if (entry.lastName && L(entry.lastName).toLowerCase() !== L(r['Last Name']).toLowerCase()) return false;
  if (entry.firstName && L(entry.firstName).toLowerCase() !== L(r['First Name']).toLowerCase()) return false;
  if (entry.dob && L(entry.dob) !== L(r['Date of Birth'])) return false;
  return !!(entry.iaff || entry.peoplesoft || entry.lastName);
}

function excludedReason(r) {
  const e = EXCLUDED.find(x => matches(x, r));
  return e ? e : null;
}

// Which entries no longer pick out exactly one record on a given roster. An
// entry matching none has gone stale — usually because the record was deleted,
// which is fine, but it must be seen rather than assumed.
function isStale(records) {
  return EXCLUDED.map(e => ({ entry: e, hits: records.filter(r => matches(e, r)).length }))
    .filter(x => x.hits !== 1);
}

module.exports = { EXCLUDED, excludedReason, isStale };
