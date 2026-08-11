'use strict';
const assert = require('assert');
const { auditRoster } = require('../lib/audit');

const M = o => Object.assign({
  'Last Name': '', 'First Name': '', 'Member Status': '', 'Work Status': '',
  'IAFF Member Number': '', 'Email': '', 'Phone Number': '', 'DC Fire Rank': '',
  'Current Company': '', 'Platoon': '', 'Appointment Date': '', 'Paying Active Member': '', 'Notes': '',
  'Groups': ''
}, o);
const has = (r, check, who) => r.findings.some(f => f.check === check && (!who || f.who.includes(who)));

// A father and son must never be merged. This is the failure that costs a
// member, so it is the first thing the suite pins down.
{
  const r = auditRoster([
    M({ 'Last Name': 'Carter', 'First Name': 'James E', 'Member Status': 'Active Retired',
        'IAFF Member Number': '439013', 'Phone Number': '+13016031177' }),
    M({ 'Last Name': 'Carter Jr', 'First Name': 'James E', 'Member Status': 'Active',
        'Phone Number': '+13014670057' })
  ]);
  assert(has(r, 'possible-father-son', 'Carter'), 'suffix mismatch should be flagged, not merged');
  assert(!has(r, 'duplicate-profile', 'Carter'), 'father and son are not a duplicate');
}

// ...unless they share a mobile, which fathers and sons do not.
{
  const r = auditRoster([
    M({ 'Last Name': 'Wheeler', 'First Name': 'Berl D', 'Member Status': 'Active',
        'IAFF Member Number': '1115948', 'Phone Number': '+14433365575' }),
    M({ 'Last Name': 'Wheeler Sr.', 'First Name': 'Berl', 'Phone Number': '+14433365575' })
  ]);
  assert(has(r, 'duplicate-profile', 'Wheeler'), 'a shared phone outranks a differing suffix');
}

// Two real people who both have IAFF numbers are never a duplicate.
{
  const r = auditRoster([
    M({ 'Last Name': 'Walker', 'First Name': 'Michael E', 'IAFF Member Number': '1045695', 'Member Status': 'Active' }),
    M({ 'Last Name': 'Walker', 'First Name': 'Michael Q', 'IAFF Member Number': '402752', 'Member Status': 'Alumni' })
  ]);
  assert(!has(r, 'duplicate-profile', 'Walker'), 'different IAFF numbers means two members');
}

// The ghost's contact detail must be rescued before anyone deletes it.
{
  const r = auditRoster([
    M({ 'Last Name': 'Bobo', 'First Name': 'Ronald E', 'Member Status': 'Active', 'IAFF Member Number': '527824' }),
    M({ 'Last Name': 'BOBO', 'First Name': 'RONALD', 'Email': 'rescuebo3@comcast.net' })
  ]);
  const f = r.findings.find(x => x.check === 'duplicate-profile');
  assert(/^Copy email rescuebo3@comcast\.net/.test(f.fix), 'must say to save the email first, got: ' + f.fix);
}

// A dc.gov address is issued firstname.lastname, so it can be checked.
{
  const r = auditRoster([
    M({ 'Last Name': 'Flores', 'First Name': 'Ismael A', 'Email': 'steven.schlegel@dc.gov', 'Member Status': 'Active' }),
    M({ 'Last Name': 'Schlegel', 'First Name': 'Steven J', 'Member Status': 'Active' })
  ]);
  assert(has(r, 'email-belongs-to-another-member', 'Flores'));
  const f = r.findings.find(x => x.check === 'email-belongs-to-another-member');
  assert(/Schlegel/.test(f.detail), 'should name the likely owner');
}

// A personal address proves nothing — no false alarm on a nickname handle.
{
  const r = auditRoster([
    M({ 'Last Name': 'Sullivan', 'First Name': 'Christopher M', 'Email': 'green17monster@yahoo.com', 'Member Status': 'Active' }),
    M({ 'Last Name': 'Green', 'First Name': 'Tiffany', 'Member Status': 'Active' })
  ]);
  assert(!has(r, 'email-belongs-to-another-member'), 'personal addresses must not be second-guessed');
}

// One IAFF number on two members is a billing problem, not just a data one.
{
  const r = auditRoster([
    M({ 'Last Name': 'Warren', 'First Name': 'A', 'IAFF Member Number': '494309', 'Member Status': 'Active' }),
    M({ 'Last Name': 'Faunce', 'First Name': 'B', 'IAFF Member Number': '0494309', 'Member Status': 'Active' })
  ]);
  assert(has(r, 'iaff-number-on-more-than-one-member'), 'leading zeros must not hide a shared number');
}

// The junk-date import leftovers.
{
  const r = auditRoster([M({ 'Last Name': 'X', 'First Name': 'Y', 'IAFF Member Number': '08/08/2025' })]);
  assert(has(r, 'iaff-number-is-a-date'));
}

// Paying status judged against the payroll report.
{
  const roster = [
    M({ 'Last Name': 'Smith', 'First Name': 'John', 'Member Status': 'Active', 'Paying Active Member': '' }),
    M({ 'Last Name': 'Jones', 'First Name': 'Mary', 'Member Status': 'Active', 'Paying Active Member': 'Yes' })
  ];
  const r = auditRoster(roster, { payers: [{ lastName: 'Smith', firstName: 'John' }] });
  assert(has(r, 'paying-but-not-marked', 'Smith'), 'on the report but not marked');
  assert(has(r, 'marked-paying-but-not-on-the-report', 'Jones'), 'marked but not on the report');
}

// One-letter surnames are the migration damage worth chasing first.
{
  const r = auditRoster([M({ 'Last Name': 'M', 'First Name': 'Kurt', 'Member Status': 'Active' })]);
  const f = r.findings.find(x => x.check === 'damaged-name');
  assert(f && f.severity === 'high', 'a one-letter surname is a high finding');
}

// ---- the payroll number -------------------------------------------------
// One number, one employee. A retired member holding one means it was written
// to the wrong generation — 13 numbers landed on a father and his son this way.
{
  const r = auditRoster([
    M({ 'Last Name': 'Watson Jr.', 'First Name': 'Richard L', 'Member Status': 'Active',
        'PeopleSoft Number': '00003670' }),
    M({ 'Last Name': 'Watson', 'First Name': 'Richard', 'Member Status': 'Active Retired',
        'PeopleSoft Number': '00003670', 'IAFF Member Number': '237199' })
  ]);
  assert(has(r, 'peoplesoft-on-more-than-one-member'), 'a shared payroll number is always wrong');
  assert(has(r, 'peoplesoft-on-a-non-active-member', 'Watson, Richard'));
  const f = r.findings.find(x => x.check === 'peoplesoft-on-more-than-one-member');
  assert(/Watson Jr\., Richard L/.test(f.fix), 'the Active one keeps it, got: ' + f.fix);
}

// Where both are Active the suffix must NOT decide it — for Edwards and Harris
// the working man is the one WITHOUT the suffix.
{
  const r = auditRoster([
    M({ 'Last Name': 'Edwards', 'First Name': 'Raymond C', 'Member Status': 'Active', 'PeopleSoft Number': '00113842' }),
    M({ 'Last Name': 'Edwards', 'First Name': 'Raymond Allen', 'Member Status': 'Active', 'PeopleSoft Number': '00113842' })
  ]);
  const f = r.findings.find(x => x.check === 'peoplesoft-on-more-than-one-member');
  assert(/middle initial/.test(f.fix), 'must send them to telestaff, not to the suffix');
}

{
  const r = auditRoster([M({ 'Last Name': 'X', 'First Name': 'Y', 'PeopleSoft Number': '0000EMTB' })]);
  assert(has(r, 'peoplesoft-not-an-employee-number'));
}

// A hire date decades from its number's cohort is a merged record.
{
  const roster = [];
  for (let i = 0; i < 60; i++) {
    roster.push(M({ 'Last Name': 'Person' + i, 'First Name': 'A', 'Member Status': 'Active',
      'PeopleSoft Number': '001200' + String(10 + i), 'Appointment Date': '06/01/2021' }));
  }
  roster[30] = M({ 'Last Name': 'Klinger', 'First Name': 'Wayne D', 'Member Status': 'Active Retired',
    'PeopleSoft Number': '00120040', 'Appointment Date': '04/23/1982' });
  const r = auditRoster(roster);
  assert(has(r, 'hire-date-does-not-fit-the-employee-number', 'Klinger'),
    'a 1982 hire date among 2021 hires must be flagged');
}

// A shell with nothing but a mailing-list membership is not empty. Kevin
// Adams, 11 Aug 2026: two blank duplicates whose only content was the Retiree
// Insurance Group. Judged on phone and email alone they read as safe to delete
// outright, and he would have come off the insurance list with no trace of it.
{
  const r = auditRoster([
    M({ 'Last Name': 'Adams', 'First Name': 'Kevin A', 'IAFF Member Number': '401190',
        'Member Status': 'Active Retired', 'DC Fire Rank': 'Firefighter',
        Groups: 'All Members, Retired Members - NO Emails' }),
    M({ 'Last Name': 'Adams', 'First Name': 'KEVIN',
        Groups: 'All Members, Retired Members - NO Emails, Retiree Insurance Group' })
  ], {});
  const dup = r.findings.filter(f => f.check === 'duplicate-profile');
  assert.strictEqual(dup.length, 1);
  assert(/Retiree Insurance Group/.test(dup[0].fix),
    'must say to carry the group across first, got: ' + dup[0].fix);
}

// ...but a shell in no extra group is still a plain delete.
{
  const r = auditRoster([
    M({ 'Last Name': 'Baden', 'First Name': 'John M', 'IAFF Member Number': '214965',
        'Member Status': 'Active Retired', Groups: 'All Members' }),
    M({ 'Last Name': 'Baden', 'First Name': 'John', Groups: 'All Members' })
  ], {});
  const dup = r.findings.filter(f => f.check === 'duplicate-profile');
  assert.strictEqual(dup.length, 1);
  assert(/holds nothing worth saving/.test(dup[0].fix), dup[0].fix);
}

console.log('audit tests passed');
