'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const ts = require('../lib/telestaff');

const row = o => Object.assign(
  { Name: '', Rank: '', 'Formula ID': '', 'First Contact': '', 'Employee ID': '' }, o);

test('the house assignment and qualifications are not part of the name', () => {
  assert.deepEqual(ts.splitName('Abell, Michael B. {E18}'), { last: 'Abell', first: 'Michael B.' });
  assert.deepEqual(ts.splitName('Albright, Julian (FTO/PM) {E03}'), { last: 'Albright', first: 'Julian' });
});

test('telestaff HTML-escapes apostrophes', () => {
  // O&#39;Neil scored 89 against O'Neil — close enough to look like a different
  // person, which is exactly the kind of false alarm that wastes an hour.
  assert.equal(ts.cleanName('O&#39;Neil, Michael J. {E22}'), "O'Neil, Michael J.");
  assert.equal(ts.cleanName('Keys, D&#39;Ante'), "Keys, D'Ante");
});

test('a shifted column must never become a fake employee ID', () => {
  // Twelve rows in the August export carry a qualification list in the
  // Employee ID column. "0000EMTB" stripped to digits is "0000", which pads
  // into 00000000 — a number that looks real and belongs to nobody.
  assert.equal(ts.padEmplid('EMTB,FF/TECH,FF/EMT'), '');
  assert.equal(ts.padEmplid('0000EMTB'), '');
  assert.equal(ts.padEmplid('35373'), '00035373');
  assert.equal(ts.padEmplid('00035373'), '00035373');
  assert.equal(ts.padEmplid(''), '');
  assert.equal(ts.padEmplid('123456789'), '', 'nine digits is not an employee ID');
});

test('one entry per person, not one per shift', () => {
  const people = ts.collapse([
    row({ Name: 'Abell, Michael B. {E18}', Rank: 'Sergeant', 'Formula ID': '1', 'Employee ID': '35373' }),
    row({ Name: 'Abell, Michael B. {E18}', Rank: 'Sergeant', 'Formula ID': '1', 'Employee ID': '35373' }),
    row({ Name: 'Name' }),                                   // the export repeats its header
    row({ Name: 'Adams, Joanna {E26}', Rank: 'FIREFIGHTER EMT', 'Formula ID': 'DW', 'Employee ID': '130150' })
  ]);
  assert.equal(people.length, 2);
  assert.equal(people[0].platoon, 'Platoon 1');
  assert.equal(people[1].platoon, 'Day Work');
});

test('telestaff wins on the employee ID when the scan misread a digit', () => {
  // The scanner reads 9 as 3, 8, 5 or 2 — 43 of 48 conflicts in the June
  // report were exactly that. Writing the scan's number into NEP as a
  // permanent key would point it at nobody.
  const people = ts.collapse([
    row({ Name: 'Kearney, Brandon L. {E11}', 'Employee ID': '107995' })
  ]);
  const dues = [{ emplid: '00107295', last_name: 'Kearney', first_name: 'Brandon L' }];
  const r = ts.crossCheck(dues, people);
  assert.equal(r.idFixes.length, 1);
  assert.equal(r.idFixes[0].now, '00107995');
  assert.equal(r.idFixes[0].digitsDiffer, 1);
  assert.equal(ts.peoplesoftNumber(dues[0], r), '00107995');
});

test('a weak name match must not move somebody\'s payroll number', () => {
  const people = ts.collapse([row({ Name: 'Smith, John {E01}', 'Employee ID': '111111' })]);
  const dues = [{ emplid: '00222222', last_name: 'Smythe', first_name: 'Jonathan' }];
  const r = ts.crossCheck(dues, people);
  assert.equal(r.idFixes.length, 0, 'not the same person');
  assert.equal(ts.peoplesoftNumber(dues[0], r), '00222222', 'keep what the scan read');
});

test('two equally good candidates is not a match', () => {
  const people = ts.collapse([
    row({ Name: 'Harris, Jason {E06}', 'Employee ID': '113839' }),
    row({ Name: 'Harris, Jason {E22}', 'Employee ID': '118028' })
  ]);
  const dues = [{ emplid: '00999999', last_name: 'Harris', first_name: 'Jason' }];
  const r = ts.crossCheck(dues, people);
  assert.equal(r.idFixes.length, 0, 'ambiguous — leave it for a human');
  assert.equal(r.unknown.length, 1);
});

test('an unreadable employee ID is recovered from the typed name', () => {
  const people = ts.collapse([row({ Name: 'Bartee, Mario {E15}', 'Employee ID': '89498' })]);
  const dues = [{ emplid: '', last_name: 'Bartee', first_name: 'Mario' }];
  const r = ts.crossCheck(dues, people);
  assert.equal(r.idFixes[0].now, '00089498');
  assert.equal(r.idFixes[0].digitsDiffer, null, 'nothing to compare against');
});

test('a confirmed number still reports a scanned name that disagrees', () => {
  const people = ts.collapse([row({ Name: 'Crump, Taniya A {E30}', 'Employee ID': '99407' })]);
  const dues = [{ emplid: '00099407', last_name: 'Grump', first_name: 'Taniya A' }];
  const r = ts.crossCheck(dues, people);
  assert.equal(r.confirmed.length, 1);
  assert.equal(r.nameFixes.length, 1);
  assert.equal(r.nameFixes[0].now, 'Crump, Taniya A');
});

// ---- who may hold a payroll number --------------------------------------
const N = o => Object.assign({ 'Last Name': '', 'First Name': '', 'Member Status': '' }, o);

test('a retired member is never given a payroll number', () => {
  // This is the whole bug: the matcher put a payroll row on the retired
  // father, nothing refused the write, and 13 numbers ended up on two
  // members each. Clearing them without this guard just resets the clock.
  const { write, refused } = ts.planPeoplesoftWrites([
    { member: N({ 'Last Name': 'Watson', 'First Name': 'Richard', 'Member Status': 'Active Retired' }), number: '00003670' }
  ]);
  assert.equal(write.length, 0);
  assert.equal(refused.length, 1);
  assert(/serving employee/.test(refused[0].reason));
});

test('deceased, dropped, alumni and life are all refused', () => {
  for (const status of ['Deceased', 'Drop', 'Alumni', 'Life', 'Retired']) {
    const { write } = ts.planPeoplesoftWrites([
      { member: N({ 'Last Name': 'X', 'First Name': 'Y', 'Member Status': status }), number: '00012345' }
    ]);
    assert.equal(write.length, 0, status + ' should be refused');
  }
});

test('a blank status is NOT treated as non-serving', () => {
  // 94 members hold a number with no status set. They are on the payroll
  // report, which is how they got one — refusing them would throw away
  // good data to satisfy a rule about retirees.
  const { write } = ts.planPeoplesoftWrites([
    { member: N({ 'Last Name': 'Johnson', 'First Name': 'Joseph', 'Member Status': '' }), number: '00004546' }
  ]);
  assert.equal(write.length, 1);
});

test('two members wanting one number: neither gets it', () => {
  const { write, refused } = ts.planPeoplesoftWrites([
    { member: N({ 'Last Name': 'Harris', 'First Name': 'Jason A', 'Member Status': 'Active' }), number: '00113839' },
    { member: N({ 'Last Name': 'Harris', 'First Name': 'Jason M', 'Member Status': 'Active' }), number: '00113839' }
  ]);
  assert.equal(write.length, 0, 'silently picking one is how the father ends up wearing it');
  assert.equal(refused.length, 2);
  assert(/One number, one member/.test(refused[0].reason));
});

test('the ordinary case still goes through', () => {
  const { write, refused } = ts.planPeoplesoftWrites([
    { member: N({ 'Last Name': 'Abell', 'First Name': 'Michael B', 'Member Status': 'Active' }), number: '00035373' },
    { member: N({ 'Last Name': 'Adams', 'First Name': 'Joanna', 'Member Status': 'Active' }), number: '00130150' }
  ]);
  assert.equal(write.length, 2);
  assert.equal(refused.length, 0);
});

// ---- ranks outside the local ----------------------------------------------

test('chief officers are outside Local 36', () => {
  ['Battalion Fire Chief', 'Battalion Fire Chief - Homeland Security',
   'Battalion Chief - EMS', 'Deputy Fire Chief', 'Assistant Fire Chief',
   'Assistant Chief of Operations', 'Fire Chief']
    .forEach(r => assert(ts.isOutsideLocal(r), r + ' should be outside'));
});

test('titles that merely sound like chiefs are ours', () => {
  // Every one of these is a real rank in NEP or telestaff, and every one is a
  // dues-paying member. Matching loosely on "battalion" or "assistant" would
  // drop them.
  ['Battalion EMS Supervisor', 'Assistant Lieutenant', 'Assistant Marine Pilot',
   'Assistant Fleet Management Officer', 'Sergeant - DFC Aide',
   'Captain - ROCC Manager', 'Firefighter', 'Lieutenant', 'Captain']
    .forEach(r => assert(!ts.isOutsideLocal(r), r + ' should be inside'));
});

test('a chief’s aide is one of ours, not a chief', () => {
  assert.equal(ts.isOutsideLocal('Deputy Fire Chief Aide'), false);
});

// ---- why a payer stopped ---------------------------------------------------

test('promoted into a chief rank: drop them', () => {
  const r = ts.explainStopped({ rank: 'Battalion Fire Chief', platoon: '' });
  assert.equal(r.code, 'promoted-out');
  assert(/Drop/.test(r.action));
});

test('gone from telestaff: left the department', () => {
  assert.equal(ts.explainStopped(null).code, 'left-department');
});

test('still on telestaff in the unit: somebody has to ask', () => {
  const r = ts.explainStopped({ rank: 'Firefighter', platoon: 'Platoon 2' });
  assert.equal(r.code, 'still-working');
  assert(/Platoon 2/.test(r.detail));
});

test('no telestaff file at all says nothing rather than guessing', () => {
  // undefined means "we did not look", null means "we looked and they are
  // not there". Collapsing the two would tell Joe a working member had left.
  assert.equal(ts.explainStopped(undefined), null);
});
