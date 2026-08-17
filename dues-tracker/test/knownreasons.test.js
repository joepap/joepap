'use strict';
const test = require('node:test');
const assert = require('node:assert');
const kr = require('../lib/knownreasons');

test('finds a known reason however the number is written', () => {
  for (const form of ['00093437', '93437', ' 00093437 ']) {
    const k = kr.reasonFor(form);
    assert.ok(k, `should match ${JSON.stringify(form)}`);
    assert.match(k.reason, /military/i);
  }
});

test('says nothing about a member we have no answer for', () => {
  assert.equal(kr.reasonFor('00000001'), null);
  assert.equal(kr.explain('00000001'), '');
  assert.equal(kr.explain(''), '');
  assert.equal(kr.explain(null), '');
});

test('the explanation names the reason and who settled it', () => {
  const line = kr.explain('00093437');
  assert.match(line, /KNOWN/);
  assert.match(line, /military leave/i);
  assert.match(line, /Joe/);
});

test('the ones Joe settled on 17 Aug all have an answer', () => {
  // The eleven members sitting at $0.00 on the June register. Ten now have a
  // written answer; DiPietro is the one still open, and must NOT get invented one.
  const settled = ['00078082', '00103926', '00118038', '00007060',
                   '00106864', '00033810', '00130126', '00133058', '00130127'];
  for (const ps of settled) assert.ok(kr.reasonFor(ps), `no answer recorded for ${ps}`);
  assert.equal(kr.reasonFor('00108259'), null, 'DiPietro has no ruling yet');
});

test('tells a drop apart from a member we are carrying active', () => {
  // Carried active — the sheet must not read these as people who left.
  for (const ps of ['00078082', '00103926', '00118038', '00007060', '00093437']) {
    assert.doesNotMatch(kr.explain(ps), /no further dues lines/,
      `${ps} is still one of ours`);
  }
  // Off the roll — no further dues expected.
  for (const ps of ['00106864', '00033810', '00130126', '00133058']) {
    assert.match(kr.explain(ps), /no further dues lines/);
  }
});

test('flags that the status is waiting on a NEP dropdown, not on us', () => {
  const waiting = kr.awaitingStatus();
  assert.ok(waiting.length >= 1);
  assert.match(waiting[0].pendingStatus, /Military/);
  // The record must NOT be described as already changed.
  assert.match(kr.explain(waiting[0].emplid), /status to become/);
});
