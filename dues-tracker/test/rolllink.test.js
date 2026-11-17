'use strict';
const test = require('node:test');
const assert = require('node:assert');
const rl = require('../lib/rolllink');

// Every name, number and address here is made up.
const nep = (o = {}) => ({ 'Last Name': 'Ames', 'First Name': 'Al', 'IAFF Member Number': '', Email: '', 'Phone Number': '', 'Street Address': '', Zip: '', Notes: '', ...o });
const roll = (o = {}) => ({ Id: '0123456', 'Last Name': 'Ames', 'First Name': 'Al', 'Middle Name': '', Suffix: '', Email: '', 'Mobile Phone': '', 'Home Address 1': '', 'Zip/Postal Code': '', ...o });

test('the number links a record to the roll whatever the name', () => {
  const r = nep({ 'Last Name': 'Amis', 'IAFF Member Number': '123456' }), x = roll();
  const L = rl.link([r], [x]);
  assert.equal(L.nepToRoll.get(r), x);
  assert.equal(L.how.get(r), 'number');
});

test('a record with no number is linked by name only to one unclaimed roll entry', () => {
  const r = nep(), x = roll();
  assert.equal(rl.link([r], [x]).fill.length, 1);
  assert.equal(rl.link([r], [x, roll({ Id: '0999999' })]).fill.length, 0);
});

test('backing counts an email, a phone and a house — each the same on both sides', () => {
  const r = nep({ Email: 'Al@Example.org', 'Phone Number': '(202) 555-0100', 'Street Address': '10 Example St NE', Zip: '20002' });
  const x = roll({ Email: 'al@example.org', 'Mobile Phone': '+1 202-555-0100', 'Home Address 1': '10 Example Street NE', 'Zip/Postal Code': '20002-1234' });
  assert.deepEqual(rl.backing(r, x), ['email', 'phone', 'address']);
  assert.deepEqual(rl.backing(nep(), x), []);
});

test('an address NEP took from the roll is not evidence that NEP and the roll agree', () => {
  const r = nep({ 'Street Address': '10 Example St NE', Zip: '20002', Notes: 'address added 11/10/2026 from the IAFF International roll — NEP had none on file' });
  const x = roll({ 'Home Address 1': '10 Example St NE', 'Zip/Postal Code': '20002' });
  assert.deepEqual(rl.backing(r, x), []);
});
