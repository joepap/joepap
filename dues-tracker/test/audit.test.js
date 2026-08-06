'use strict';
const assert = require('assert');
const { auditRoster } = require('../lib/audit');

const M = o => Object.assign({
  'Last Name': '', 'First Name': '', 'Member Status': '', 'Work Status': '',
  'IAFF Member Number': '', 'Email': '', 'Phone Number': '', 'DC Fire Rank': '',
  'Current Company': '', 'Platoon': '', 'Appointment Date': '', 'Paying Active Member': '', 'Notes': ''
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

console.log('audit tests passed');
