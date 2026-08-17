'use strict';
/*
 * People who work for the department but are NOT Local 36 members, and never
 * will be by any test this app can run.
 *
 * Why this file has to exist: rank does not decide membership. Single-role
 * EMS staff carry fire-sounding titles — Holly O'Byrne is a Lieutenant on
 * paper — so no pattern over telestaff's rank column can separate them. Only
 * somebody who knows the department can say, and once they have said it the
 * answer must survive every future report.
 *
 * The rule for adding: Joe (or a future officer) says so explicitly. Not a
 * guess from missing dues — plenty of real members are missing dues, which is
 * exactly what the chase list is for.
 *
 * A person here is dropped from every report the app produces: the chase
 * list, the new-member list, the treasurer's sheets. They keep no NEP record
 * and take no paying mark. If one of them ever appears on a dues register
 * with money deducted, that is a genuine surprise worth surfacing rather than
 * silently filtering — see `shouldHaveNoDues`.
 */

const NOT_MEMBERS = [
  { emplid: '00078079', name: "O'Byrne, Holly A.",
    rank: 'Lieutenant - Emergency Liaison Officer',
    why: 'single-role EMS — Joe, 17 Aug 2026. Not a member; keep her off every report.' },
];

const byEmplid = new Map(NOT_MEMBERS.map(p => [p.emplid, p]));

/** Is this employee number one of the known non-members? */
function isNotMember(emplid) {
  return byEmplid.has(String(emplid || '').trim());
}

/** The record behind the exclusion, for reporting why somebody was dropped. */
function whyNotMember(emplid) {
  return byEmplid.get(String(emplid || '').trim()) || null;
}

/** Drop every known non-member from a list. `get` reads the employee number. */
function withoutNonMembers(people, get = (p) => p.emplid) {
  return people.filter(p => !isNotMember(get(p)));
}

/**
 * A non-member appearing on a dues register is not something to filter away —
 * either the exclusion is wrong or the payroll is deducting from somebody who
 * should not be paying. Both need a human.
 */
function shouldHaveNoDues(registerRows, get = (r) => r.emplid) {
  return registerRows.filter(r => isNotMember(get(r)))
    .map(r => ({ row: r, ...whyNotMember(get(r)) }));
}

module.exports = { NOT_MEMBERS, isNotMember, whyNotMember, withoutNonMembers, shouldHaveNoDues };
