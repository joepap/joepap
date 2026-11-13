'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compare, compact } = require('../lib/addresskey');
const A = (street, zip) => ({ street, zip });

test('the same address written two ways is the same address', () => {
  assert.equal(compare(A('2910 Stanton Rd SE', '20020'), A('2910 Stanton Road S.E.', '20020')), 'same');
  assert.equal(compare(A('1445 southview dr, 203', '20745'), A('1445 Southview Dr Apt 203', '20745')), 'same');
});

test('a compass word that may be part of the name is near, not same and not different', () => {
  // "West Wood Court" bounced. "Westwood Ct" may be why — or may be W Wood Ct.
  assert.equal(compare(A('7908 West Wood Court', '20735'), A('7908 Westwood Ct', '20735-1234')), 'near');
});

test('a slip in the house number or the street name is near, not different', () => {
  assert.equal(compare(A('1031 Kearney Street NE', '20017'), A('1031 Kearny St NE', '20017')), 'near');
  assert.equal(compare(A('1674 Hammond Drive', '17201'), A('1647 Hammond Dr', '17201')), 'near');
  assert.equal(compare(A('11432 Rawhide Road', '20657'), A('11431 Rawhide Rd', '20657')), 'near');
  assert.equal(compare(A('4524 Livingston Rd SE #A', '20032'), A('4528 Livingston Rd SE Apt A', '20032')), 'near');
});

test('the same line with a different zip is near — the zip may be the slip', () => {
  assert.equal(compare(A('2910 Stanton Rd SE', '20002'), A('2910 Stanton Rd SE', '20020')), 'near');
});

test('a slip in the DC quadrant is near', () => {
  assert.equal(compare(A('842 48th Street NW', '20019'), A('842 48th St NE', '20019')), 'near');
  assert.equal(compare(A('28 N St. Ne', '20001'), A('28 N St NW', '20001')), 'near');
});

test('two small differences at once are a different address', () => {
  // two characters apart, and two different streets
  assert.equal(compare(A('1447 U Street NW #103', '20009'), A('1440 V St NW Apt 412', '20009')), 'different');
});

test('another street is a different address', () => {
  assert.equal(compare(A('501 Robinson Ct', '22302'), A('615 Oakley Pl', '22302')), 'different');
  assert.equal(compare(A('6764 Charlene Ct', '20616'), A('1913 Colette Ter', '20747')), 'different');
});

test('one post office box is not another', () => {
  assert.equal(compare(A('Box 8', '20732'), A('PO Box 57', '20732')), 'different');
  assert.equal(compare(A('P.O. Box 303', '20778'), A('PO Box 303', '20778')), 'same');
});

test('nothing is the same as nothing', () => {
  assert.equal(compare(A('', '20020'), A('2334 Park Pl SE', '20020')), 'different');
  assert.equal(compact(''), '');
});

test('an apartment marker run into its number is still an apartment marker', () => {
  assert.equal(compare(A('410 12Th Street SE Apt305', '20003'), A('410 12th St SE Apt 305', '20003-1234')), 'same');
});

test('a DC street missing its quadrant is near, not the same and not different', () => {
  assert.equal(compare(A('900 Example Ave #12', '20032'), A('900 Example Ave SE Apt 12', '20032')), 'near');
});
