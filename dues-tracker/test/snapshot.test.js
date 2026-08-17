'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { membershipSnapshot, payrollNumber, paidRetireeDues } = require('../lib/snapshot');

const member = (over = {}) => ({
  'Member Status': 'Active', 'PeopleSoft Number': '', 'Paying Active Member': '', ...over,
});
const line = (emplid, taken, goal = taken) =>
  ({ emplid, amount_taken: taken, amount_goal: goal });

test('a payroll number keeps the leading zero a spreadsheet drops', () => {
  assert.equal(payrollNumber('35373'), '00035373');
  assert.equal(payrollNumber('00035373'), '00035373');
  assert.equal(payrollNumber(35373), '00035373');
  assert.equal(payrollNumber(' 00035373 '), '00035373');
});

test('a cell that does not hold a payroll number reads empty, never a guess', () => {
  assert.equal(payrollNumber(''), '');
  assert.equal(payrollNumber('n/a'), '');
  assert.equal(payrollNumber('0'), '');
  assert.equal(payrollNumber('000000000'), '');   // nine digits is not one of ours
});

test('retiree dues count as paid under either column spelling', () => {
  assert.equal(paidRetireeDues({ 'L36 2026 Retired Dues': 'Paid' }, 2026), true);
  assert.equal(paidRetireeDues({ '2026 Retired Dues': 'PAID' }, 2026), true);
  assert.equal(paidRetireeDues({ 'L36 2026 Retired Dues': '' }, 2026), false);
  assert.equal(paidRetireeDues({ 'L36 2026 Retired Dues': 'Unpaid' }, 2026), false);
  assert.equal(paidRetireeDues({ 'L36 2025 Retired Dues': 'Paid' }, 2026), false);
});

test('the roll splits by standing and everything else lands in one bucket', () => {
  const members = [
    member(), member(), member({ 'Member Status': 'Active Retired' }),
    member({ 'Member Status': 'Retired' }), member({ 'Member Status': 'Drop' }),
    member({ 'Member Status': 'Alumni' }), member({ 'Member Status': '' }),
  ];
  const s = membershipSnapshot(members, [], []);
  assert.equal(s.roll.total, 7);
  assert.equal(s.roll.active, 2);
  assert.equal(s.roll.activeRetired, 1);
  assert.equal(s.roll.other, 2);            // the Alumni and the unfiled record
  // the buckets have to add back up to the whole roll, or the wall lies
  const { active, activeRetired, retired, drop, other } = s.roll;
  assert.equal(active + activeRetired + retired + drop + other, s.roll.total);
});

test('the register reports what was TAKEN, and keeps the goal separate', () => {
  // the real July shape: the goal is a dime above the deduction on every line
  const rows = [line('00000001', 49.09, 49.19), line('00000002', 49.09, 49.19),
                line('00000003', 0, 0)];
  const s = membershipSnapshot([], rows, []);
  assert.equal(s.register.lines, 3);
  assert.equal(s.register.paying, 2);
  assert.equal(s.register.zero, 1);
  assert.equal(s.register.taken, 98.18);
  assert.equal(s.register.goal, 98.38);
  assert.equal(s.register.shortfall, 0.2);
  assert.equal(s.register.takenPerYear, Math.round(98.18 * 26));
});

test('a payer with no member record is counted, not quietly dropped', () => {
  const members = [member({ 'PeopleSoft Number': '00000001' })];
  const rows = [line('00000001', 49.09), line('00000002', 49.09)];
  const s = membershipSnapshot(members, rows, []);
  assert.equal(s.register.payersOnOurRoll, 1);
  assert.equal(s.register.payersWithNoRecord, 1);
});

test('a payer whose number misses but whose name hits is unsettled, not missing', () => {
  // one digit apart: either the scan was misread or our record is wrong, and
  // the count must not pretend to know which
  const members = [member({ 'PeopleSoft Number': '00099503', 'Last Name': 'Allen', 'First Name': 'Jordin A' })];
  const rows = [{ ...line('00039503', 49.09), last_name: 'Allen', first_name: 'Jordin' }];
  const s = membershipSnapshot(members, rows, []);
  assert.equal(s.register.payersOnOurRoll, 0);
  assert.equal(s.register.payersNumberUnsettled, 1);
  assert.equal(s.register.payersWithNoRecord, 0);
  // and the three buckets always account for every paying line
  const { payersOnOurRoll, payersNumberUnsettled, payersWithNoRecord } = s.register;
  assert.equal(payersOnOurRoll + payersNumberUnsettled + payersWithNoRecord, s.register.paying);
});

test('every retiree who paid counts, not only the ones filed Active Retired', () => {
  const members = [
    member({ 'Member Status': 'Active Retired', 'L36 2026 Retired Dues': 'Paid' }),
    member({ 'Member Status': 'Alumni', 'L36 2026 Retired Dues': 'Paid' }),
    member({ 'Member Status': 'Life', '2026 Retired Dues': 'Paid' }),
    member({ 'Member Status': 'Retired' }),
  ];
  const s = membershipSnapshot(members, [], []);
  assert.equal(s.roll.activeRetired, 1);
  assert.equal(s.dues.retireesPaying, 3);
});

test('per capita is figured on proven payers, at half rate for retirees', () => {
  const members = [member({ 'Member Status': 'Active Retired', 'L36 2026 Retired Dues': 'Paid' })];
  const rows = [line('00000001', 49.09), line('00000002', 49.09), line('00000003', 49.09)];
  const iaff = [{ 'Member Type': 'MEM' }, { 'Member Type': 'MRM' }, { 'Member Type': 'MRM' }];
  const s = membershipSnapshot(members, rows, iaff, { rate: 20, halfRate: 10 });
  assert.equal(s.international.active, 1);
  assert.equal(s.international.retired, 2);
  assert.equal(s.perCapita.activeGap, 2);              // 3 proven payers vs their 1
  assert.equal(s.perCapita.retiredGap, 1);             // their 2 retirees vs our 1 paid up
  assert.equal(s.perCapita.activeGapPerYear, 2 * 20 * 12);
  assert.equal(s.perCapita.retiredGapPerYear, 1 * 10 * 12);
  assert.equal(s.perCapita.billedOnTheirRoll, (1 * 20 + 2 * 10) * 12);
  assert.equal(s.perCapita.billedOnOurRecords, (3 * 20 + 1 * 10) * 12);
});

test('the International member types survive the HTML their export wraps them in', () => {
  const iaff = [{ 'Member Type': '<span>MEM</span>' }, { 'Member Type': ' MRM&nbsp;' }];
  const s = membershipSnapshot([], [], iaff);
  assert.equal(s.international.active, 1);
  assert.equal(s.international.retired, 1);
});

test('an empty roll does not divide by zero', () => {
  const s = membershipSnapshot([], [], []);
  assert.equal(s.payroll.activePct, 0);
  assert.equal(s.roll.total, 0);
});

test('an unreadable name never matches another unreadable name', () => {
  // both sides blank: the old bug filed every nameless line against every
  // nameless record and reported them as found
  const members = [member({ 'PeopleSoft Number': '00000001', 'Last Name': '', 'First Name': '' })];
  const rows = [{ ...line('00000002', 49.09), last_name: '', first_name: '' }];
  const s = membershipSnapshot(members, rows, []);
  assert.equal(s.register.payersNumberUnsettled, 0);
  assert.equal(s.register.payersWithNoRecord, 1);
});
