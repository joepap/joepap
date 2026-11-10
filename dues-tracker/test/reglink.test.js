'use strict';
const test = require('node:test');
const assert = require('node:assert');
const reglink = require('../lib/reglink');

// Every name and number here is made up.
const line = (emplid, last, first, amount = '49.19', mid = '') =>
  ({ page: 1, line: 1, emplid, last_name: last, first_name: first, middle_name: mid, amount, dept: 'FB' });
const nep = (last, first, ps, status = 'Active', paying = 'Yes', extra = {}) =>
  ({ 'Last Name': last, 'First Name': first, 'PeopleSoft Number': ps, 'Member Status': status, 'Paying Active Member': paying, ...extra });
const person = (RG, emplid) => RG.P.find(p => p.emplid === emplid);

test('the payroll number decides, whatever the spelling of the name', () => {
  const N = [nep('Rooke', 'George', '00004582')];
  const RG = reglink.link([line('00004582', 'Brooke III', 'George')], N);
  assert.equal(RG.link.get(person(RG, '00004582')), N[0]);
  assert.equal(RG.nepStatusOf(person(RG, '00004582')), 'Active');
});

test('several lines for one payroll number are one person, netted', () => {
  const RG = reglink.link([line('00000111', 'Able', 'Ann'), line('00000111', 'Able', 'Ann', '-49.19'), line('00000111', 'Able', 'Ann')], []);
  assert.equal(RG.P.length, 1);
  assert.equal(RG.P[0].net, 49.19);
  assert.equal(RG.payers.length, 1);
});

test('a line at zero is on the register and not a payer', () => {
  const RG = reglink.link([line('00000222', 'Baker', 'Bo', '0.00')], [nep('Baker', 'Bo', '00000222')]);
  assert.equal(RG.payers.length, 0);
  assert.equal(RG.zeros.length, 1);
  assert.equal(RG.A.zeroButPaying.length, 1);
});

test('a NEP number one digit off, same name, is NEP\'s typo — and is linked', () => {
  const N = [nep('Carter', 'Cy', '00138347')];
  const RG = reglink.link([line('00138947', 'Carter', 'Cy')], N);
  assert.equal(RG.link.get(person(RG, '00138947')), N[0]);
  assert.equal(RG.A.typo.length, 1);
});

test('one digit off is not a typo when that other number is on the register too', () => {
  const N = [nep('Carter', 'Cy', '00138347')];
  const RG = reglink.link([line('00138947', 'Carter', 'Cy'), line('00138347', 'Carter', 'Cy')], N);
  assert.equal(RG.link.get(person(RG, '00138347')), N[0]);
  assert.equal(RG.nepStatusOf(person(RG, '00138947')), 'no NEP record');
});

test('a same-name record with no payroll number is linked, and listed for its number to be added', () => {
  const N = [nep('Dunn', 'Dee', '')];
  const RG = reglink.link([line('00000444', 'Dunn', 'Dee')], N);
  assert.equal(RG.link.get(person(RG, '00000444')), N[0]);
  assert.equal(RG.A.addNumber.length, 1);
});

test('a retired namesake is not the new hire: a member who has left does not come back onto the payroll', () => {
  const RG = reglink.link([line('00143802', 'Ellis', 'Dan')], [nep('Ellis', 'Dan', '', 'Retired', '')]);
  assert.equal(RG.link.has(person(RG, '00143802')), false);
  assert.equal(RG.nepStatusOf(person(RG, '00143802')), 'no NEP record');
});

test('two same-name records with no payroll number are not guessed between', () => {
  const N = [nep('Ford', 'Karl', ''), nep('Ford', 'Karl', '')];
  const RG = reglink.link([line('00000666', 'Ford', 'Karl')], N);
  assert.equal(RG.link.has(person(RG, '00000666')), false);
  assert.equal(RG.nepStatusOf(person(RG, '00000666')), 'two NEP records could be theirs');
});

test('paying with a NEP status other than Active is reported, and so is a paying flag that is not Yes', () => {
  const N = [nep('Gray', 'Gil', '00000777', 'Drop', 'Yes'), nep('Hale', 'Hal', '00000888', 'Active', '')];
  const RG = reglink.link([line('00000777', 'Gray', 'Gil'), line('00000888', 'Hale', 'Hal')], N);
  assert.deepEqual(RG.A.statusWrong.map(([p]) => p.emplid), ['00000777']);
  assert.deepEqual(RG.A.flagWrong.map(([p]) => p.emplid), ['00000888']);
});
