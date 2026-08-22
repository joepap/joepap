'use strict';
const test = require('node:test');
const assert = require('node:assert');
const tsl = require('../lib/telestaff');

test('the shift a member stood beats the rota engine\'s stale home platoon', () => {
  // Ryan Brault after SO-2026-198 moved him to Engine 18 Platoon 2: the order
  // and the shift agree, and only Formula ID still says 4.
  assert.equal(tsl.platoonOf({ Shift: '*_2 PLT', 'Formula ID': '4' }), 'Platoon 2');
  // Two probationers posted to companies still carried DW from the academy.
  assert.equal(tsl.platoonOf({ Shift: '*_4 PLT', 'Formula ID': 'DW' }), 'Platoon 4');
  assert.equal(tsl.platoonOf({ Shift: '*_3 PLT', 'Formula ID': 'DW' }), 'Platoon 3');
});

test('reads the other shift spellings the export uses', () => {
  assert.equal(tsl.platoonOf({ Shift: '*_1 PLT,0500-0500 PLT 1' }), 'Platoon 1');
  assert.equal(tsl.platoonOf({ Shift: '0500-0500 PLT 2' }), 'Platoon 2');
  assert.equal(tsl.platoonOf({ Shift: 'ROCC PLT#3' }), 'Platoon 3');
  assert.equal(tsl.platoonOf({ Shift: '0700-1500 (DAYWORK M-F)' }), 'Day Work');
});

test('falls back to Formula ID only when there is no shift to read', () => {
  assert.equal(tsl.platoonOf({ Shift: '', 'Formula ID': '3' }), 'Platoon 3');
  assert.equal(tsl.platoonOf({ Shift: '', 'Formula ID': 'DW' }), 'Day Work');
  assert.equal(tsl.platoonOf({ Shift: '', 'Formula ID': '' }), '');
});
