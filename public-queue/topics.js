/*
 * Question-topic matching for the moderator's "group same-subject questions"
 * feature. Two topics are considered related if they share a literal keyword
 * OR a CONCEPT — a synonym map tuned to the FY2025-2027 DCFEMS / Local 36 CBA,
 * so "money", "comp" and "pay scale" all group together even though they share
 * no letters.
 *
 * Used by public-queue/mod.html in the browser and by test/topics.test.js in
 * Node (UMD wrapper below). To extend: add a word to a concept's list, or add
 * a new concept line — the words members are likely to type, one word each.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Topics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONCEPTS = {
    // Wages, Acting Pay, Technician/Paramedic Pay, Pay Corrections, Backpay, Longevity
    pay:        ['pay','money','comp','compensation','wage','wages','salary','salaries','raise',
                 'raises','cola','increase','increases','scale','step','steps','income','earnings',
                 'paycheck','differential','stipend','bonus','ratification','lump','retro','retroactive',
                 'backpay','correction','corrections','acting','longevity','hazard','hazardous'],
    // Article 18
    overtime:   ['overtime','ot','callback','callbacks','holdover','holdovers','recall'],
    // Hours of Work / Schedule (Art 44)
    schedule:   ['schedule','scheduling','shift','shifts','platoon','platoons','kelly','hours',
                 'rotation','tour','tours','workweek','daywork'],
    // Leave (Art 14,16,33,44,45): annual, sick, funeral, restored, buyback, COVID
    leave:      ['leave','vacation','vacations','annual','pto','sick','fmla','bereavement','funeral',
                 'holiday','holidays','personal','buyback','restored','covid','convention','conventions',
                 'picks','pick'],
    // Minimum Staffing (Art 53 — NEW)
    staffing:   ['staffing','staff','manning','minimum','minimums','understaffed','vacancy','vacancies',
                 'roster','riding','shorthanded','browns','brownouts'],
    // Promotions, Selection of Technicians / Special Ops (Art 20,21,22)
    promotion:  ['promotion','promotions','promote','promotional','rank','ranks','exam','exams',
                 'testing','list','lieutenant','captain','sergeant','technician','technicians',
                 'selection','eligibility'],
    // Transfers, Reassignments, Details, Watch Detail, Special Ops (Art 19,22,26,38)
    assignment: ['transfer','transfers','reassignment','reassignments','detail','details','assignment',
                 'assignments','watch','ops','operations','rescue','aides','prevention','deputy'],
    // Safety, Health, Gear Lockers, Hostile Situations (Art 25,30,31,40)
    safety:     ['safety','health','ppe','gear','equipment','apparatus','exposure','cancer','presumption',
                 'wellness','lockers','locker','hostile','turnout','cleaning','decon'],
    // Optical/Dental, Legal Plan, Health benefits (Art 40,47,48)
    healthcare: ['healthcare','medical','insurance','dental','optical','vision','benefit','benefits',
                 'coverage','premium','premiums','copay','copays','deductible','legal','rx'],
    // Pension, Retirement Assistance, DROP, 125 Plan (Art 49,50,51)
    retirement: ['retirement','pension','pensions','retire','retired','retiree','retirees','drop',
                 'deferred','annuity','pickup'],
    // Education and Training, Training New Employees, Paramedic/Medic (Art 34,35,43)
    education:  ['education','training','tuition','certification','cert','certs','paramedic','medic',
                 'medics','emt','als','incentive','incentives','school','academy','recruit','recruits'],
    // Disciplinary, Grievance, Investigations, Supervisory Questioning (Art 8,9,32)
    discipline: ['discipline','disciplinary','grievance','grievances','arbitration','investigation',
                 'investigations','termination','suspension','discharge','questioning','complaint'],
    // Union Rights, Dues Checkoff, Official Time, Labor-Management (Art 2,3,13,15)
    union:      ['union','dues','checkoff','representation','steward','stewards','rights','local',
                 'conferences','activities'],
    // Uniforms, Identification Devices (Art 28,29)
    uniform:    ['uniform','uniforms','allowance','allowances','boots','clothing','quartermaster',
                 'identification','badge','badges'],
    // Canine Handlers (Art 54 — NEW)
    canine:     ['canine','k9','dog','dogs','handler','handlers'],
    // Duration / Term of the agreement (Art 57)
    term:       ['duration','term','length','expiration','expire','renewal','mou','memoranda',
                 'contract','agreement','cba','years']
  };

  var SYN = {}; // word -> array of concept names
  Object.keys(CONCEPTS).forEach(function (c) {
    CONCEPTS[c].forEach(function (w) {
      (SYN[w] = SYN[w] || []).push(c);
    });
  });

  var STOP = {a:1,an:1,the:1,to:1,of:1,on:1,in:1,for:1,and:1,or:1,my:1,our:1,we:1,us:1,
    is:1,are:1,be:1,about:1,question:1,questions:1,comment:1,will:1,with:1,how:1,what:1,
    when:1,why:1,who:1,do:1,does:1,can:1,it:1,that:1,this:1,new:1,old:1};

  function tokens(topic, minLen) {
    return String(topic || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length >= minLen && !STOP[w]; });
  }

  // Literal keywords (3+ letters) plus the concepts any 2+ letter token maps to.
  function analyze(topic) {
    var words = {}, concepts = {};
    tokens(topic, 3).forEach(function (w) { words[w] = 1; });
    tokens(topic, 2).forEach(function (w) {
      (SYN[w] || []).forEach(function (c) { concepts[c] = 1; });
    });
    return { words: words, concepts: concepts };
  }

  // Do two analyzed topics share a keyword or a concept?
  function related(a, b) {
    for (var w in a.words) if (b.words[w]) return true;
    for (var c in a.concepts) if (b.concepts[c]) return true;
    return false;
  }

  return { CONCEPTS: CONCEPTS, analyze: analyze, related: related, tokens: tokens };
});
