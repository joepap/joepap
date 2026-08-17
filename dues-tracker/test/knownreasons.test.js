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

test('flags that the status is waiting on a NEP dropdown, not on us', () => {
  const waiting = kr.awaitingStatus();
  assert.ok(waiting.length >= 1);
  assert.match(waiting[0].pendingStatus, /Military/);
  // The record must NOT be described as already changed.
  assert.match(kr.explain(waiting[0].emplid), /status to become/);
});
