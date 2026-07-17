const test = require('node:test');
const assert = require('node:assert');
const Topics = require('../public-queue/topics.js');

// Are two topic strings grouped together?
function grouped(a, b) {
  return Topics.related(Topics.analyze(a), Topics.analyze(b));
}

test('groups compensation synonyms that share no letters', () => {
  // Joe's exact case: "money" and "comp" both mean compensation.
  assert.ok(grouped('money for new hires', 'comp and longevity'));
  assert.ok(grouped('pay scale steps', 'wage increase'));
  assert.ok(grouped('acting pay', 'when does the raise hit'));
  assert.ok(grouped('backpay', 'retro check'));
});

test('groups within a concept across different wording', () => {
  assert.ok(grouped('dental coverage', 'health insurance'));   // healthcare
  assert.ok(grouped('minimum staffing', 'brownouts'));         // staffing (NEW article)
  assert.ok(grouped('OT rules', 'callback pay'));              // overtime (callback also pay, still groups)
  assert.ok(grouped('K9 handlers', 'canine assignments'));     // canine (NEW article)
  assert.ok(grouped('pension', 'DROP program'));               // retirement
  assert.ok(grouped('paramedic cert', 'medic training'));      // education
});

test('does NOT group unrelated topics', () => {
  assert.ok(!grouped('dental coverage', 'minimum staffing'));
  assert.ok(!grouped('K9 handlers', 'pay raise'));
  assert.ok(!grouped('parking', 'pension'));
  assert.ok(!grouped('how long is the contract', 'sick leave'));
});

test('literal shared keyword still groups even outside the concept map', () => {
  // "aerial" isn't in any concept, but two people typing it should group.
  assert.ok(grouped('aerial ladder staffing', 'aerial training'));
});

test('short synonyms like OT and K9 are recognized', () => {
  const ot = Topics.analyze('OT');
  assert.ok(ot.concepts.overtime, 'OT should map to overtime');
  const k9 = Topics.analyze('K9');
  assert.ok(k9.concepts.canine, 'K9 should map to canine');
});

test('stopwords and punctuation do not create false matches', () => {
  // Both contain "the"/"is"/"a" but nothing substantive in common.
  assert.ok(!grouped('what is the parking situation', 'is there a canine unit'));
});
