'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { stateForZip } = require('../lib/zipstate');

test('reads the state off a five-digit zip', () => {
  assert.equal(stateForZip('20032'), 'District of Columbia');
  assert.equal(stateForZip('20715'), 'Maryland');
  assert.equal(stateForZip('22309'), 'Virginia');
  assert.equal(stateForZip('28226'), 'North Carolina');
  assert.equal(stateForZip('29576'), 'South Carolina');
  assert.equal(stateForZip('07932'), 'New Jersey');
});

test('201 is Virginia but 200 is the District — the prefixes interleave', () => {
  assert.equal(stateForZip('20169'), 'Virginia');       // Haymarket VA
  assert.equal(stateForZip('20019'), 'District of Columbia');
  assert.equal(stateForZip('20662'), 'Maryland');       // Nanjemoy MD
});

test('takes a ZIP+4 and ignores the suffix', () => {
  assert.equal(stateForZip('21770-9503'), 'Maryland');
});

test('refuses to answer for a zip it cannot read, rather than padding a guess', () => {
  // "2015" padded to 02015 would read Massachusetts. The record says Bowie MD.
  assert.equal(stateForZip('2015'), null);
  assert.equal(stateForZip('200032'), null);
  assert.equal(stateForZip(''), null);
  assert.equal(stateForZip(null), null);
});
