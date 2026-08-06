'use strict';
/*
 * Data-quality audit for the NEP roster.
 *
 * Every problem this file looks for is one we hit by accident first: a phone
 * number filed under the wrong man, a member sitting in NEP twice, an IAFF
 * number that was really a date. Finding them by accident meant finding them
 * one at a time, usually only when an upload bounced. These run over the whole
 * roster in one pass so the next one surfaces before it costs anybody an hour.
 *
 * Each check returns findings shaped { check, severity, who, detail, fix }.
 * Nothing here writes anything — it reports, and a human decides.
 */
const match = require('./match');

const L = s => String(s == null ? '' : s).trim();
const letters = s => L(s).toLowerCase().replace(/[^a-z]/g, '');
const digits = s => L(s).replace(/\D/g, '');
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b\.?/gi;
const bareName = s => L(s).toLowerCase().replace(SUFFIX, '').replace(/[^a-z]/g, '');
const suffixOf = s => { const m = L(s).toLowerCase().match(/\b(jr|sr|ii|iii|iv|v)\b/); return m ? m[1] : ''; };

function person(r) {
  return {
    rec: r,
    last: L(r['Last Name']), first: L(r['First Name']),
    name: L(r['Last Name']) + ', ' + L(r['First Name']),
    status: L(r['Member Status']), work: L(r['Work Status']),
    iaff: L(r['IAFF Member Number']), email: L(r['Email']).toLowerCase(),
    phone: digits(r['Phone Number']).slice(-10),
    rank: L(r['DC Fire Rank']), company: L(r['Current Company']),
    platoon: L(r['Platoon']), appt: L(r['Appointment Date']).slice(0, 10),
    paying: L(r['Paying Active Member']), notes: L(r['Notes'])
  };
}

/* ---------- 1. the same member filed twice ---------------------------- */
function duplicateProfiles(P) {
  const out = [];
  const bySur = new Map();
  for (const p of P) {
    const k = bareName(p.last);
    if (!k) continue;
    if (!bySur.has(k)) bySur.set(k, []);
    bySur.get(k).push(p);
  }
  for (const group of bySur.values()) {
    for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
      const x = group[a], y = group[b];
      const fx = bareName(x.first), fy = bareName(y.first);
      if (!fx || !fy) continue;
      if (!(fx === fy || fx.startsWith(fy) || fy.startsWith(fx))) continue;
      // two different IAFF numbers means the IAFF considers them two people
      if (x.iaff && y.iaff && x.iaff.replace(/^0+/, '') !== y.iaff.replace(/^0+/, '')) continue;

      const shared = [];
      if (x.phone && x.phone === y.phone) shared.push('the same phone');
      if (x.email && x.email === y.email) shared.push('the same email');

      // A suffix that differs is the father/son trap, and it is the one that
      // does real damage — merging a retired father into his working son loses
      // a member and corrupts the survivor. Shared contact details outrank it:
      // a father and son do not share a mobile number.
      const sx = suffixOf(x.last) || suffixOf(x.first);
      const sy = suffixOf(y.last) || suffixOf(y.first);
      if ((sx || sy) && sx !== sy && !shared.length) {
        out.push({ check: 'possible-father-son', severity: 'info', who: x.name + '  /  ' + y.name,
          detail: 'Names match but the suffix differs, and they share no contact details.',
          fix: 'Leave alone unless you know otherwise — merging these loses a member.' });
        continue;
      }
      const hollow = q => !q.iaff && !q.status && !q.appt && !q.rank;
      const ghost = hollow(x) ? x : (hollow(y) ? y : null);
      const keep = ghost ? (ghost === x ? y : x) : null;
      // A ghost record usually still carries the one thing the real record is
      // missing — a mobile number somebody typed in years ago. Delete it
      // blind and that is gone, which is how contact data quietly rots.
      const rescue = [];
      if (ghost) {
        if (ghost.phone && !keep.phone) rescue.push('phone ' + ghost.rec['Phone Number']);
        if (ghost.email && !keep.email) rescue.push('email ' + ghost.email);
      }
      out.push({
        check: 'duplicate-profile',
        severity: ghost ? 'high' : 'medium',
        who: x.name + '  /  ' + y.name,
        detail: shared.length ? 'They share ' + shared.join(' and ') + '.'
          : ghost ? 'One record is empty — no status, no IAFF number, no rank, no hire date.'
          : 'Same name, and nothing says they are two people.',
        fix: ghost
          ? (rescue.length
              ? 'Copy ' + rescue.join(' and ') + ' onto "' + keep.name + '" first, then delete "' + ghost.name + '".'
              : 'Keep "' + keep.name + '", delete "' + ghost.name + '" — it holds nothing worth saving.')
          : 'Check both, then merge into whichever has the IAFF number.'
      });
    }
  }
  return out;
}

/* ---------- 2. contact details filed under the wrong member ----------- */
function contactBelongsToSomeoneElse(P) {
  const out = [];
  // A @dc.gov address is issued firstname.lastname, so it is the one address
  // we can check against the record holding it. Personal addresses are
  // nicknames and handles and prove nothing.
  for (const p of P) {
    if (!p.email.endsWith('@dc.gov')) continue;
    const local = letters(p.email.split('@')[0]);
    if (letters(p.last) && local.includes(letters(p.last))) continue;
    if (letters(p.first).length >= 4 && local.includes(letters(p.first))) continue;
    const owner = P.find(q => q !== p && letters(q.last).length >= 4
      && local.includes(letters(q.last)) && letters(q.first).length >= 3
      && local.includes(letters(q.first).slice(0, 4)));
    out.push({
      check: 'email-belongs-to-another-member', severity: 'high', who: p.name,
      detail: 'Official address ' + p.email + ' does not contain this member\'s name'
        + (owner ? ' — it looks like ' + owner.name + '.' : '.'),
      fix: 'Clear it by hand — safer than trying to blank a field through an upload.'
    });
  }
  return out;
}

/* ---------- 3. IAFF member numbers ------------------------------------ */
function iaffNumbers(P, iaffRoster) {
  const out = [];
  const known = iaffRoster ? new Set(iaffRoster.map(r => L(r['Id']).replace(/^0+/, ''))) : null;
  const seen = new Map();
  for (const p of P) {
    if (!p.iaff) continue;
    const v = p.iaff.replace(/^0+/, '');
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(p.iaff) || /^\d{5}$/.test(p.iaff) && Number(p.iaff) > 40000) {
      out.push({ check: 'iaff-number-is-a-date', severity: 'high', who: p.name,
        detail: 'IAFF Member Number reads "' + p.iaff + '".',
        fix: 'Replace with the real number, or clear it by hand.' });
      continue;
    }
    if (!/^\d+$/.test(v)) {
      out.push({ check: 'iaff-number-not-a-number', severity: 'high', who: p.name,
        detail: 'IAFF Member Number reads "' + p.iaff + '".', fix: 'Correct it by hand.' });
      continue;
    }
    if (known && !known.has(v)) {
      out.push({ check: 'iaff-number-unknown-to-the-iaff', severity: 'medium', who: p.name,
        detail: '#' + v + ' is not in the IAFF export.',
        fix: 'Either the number is wrong or the member was dropped at the IAFF.' });
    }
    if (!seen.has(v)) seen.set(v, []);
    seen.get(v).push(p);
  }
  for (const [v, list] of seen) {
    if (list.length > 1) out.push({
      check: 'iaff-number-on-more-than-one-member', severity: 'high',
      who: list.map(p => p.name).join('  /  '),
      detail: 'All carry #' + v + '. The IAFF bills per member, so this is a billing problem too.',
      fix: 'Find out whose number it is; the others need their own or none.'
    });
  }
  return out;
}

/* ---------- 4. names that are damaged --------------------------------- */
function damagedNames(P) {
  const out = [];
  for (const p of P) {
    const bad = [];
    if (!p.last) bad.push('no surname at all');
    else if (letters(p.last).length <= 2) bad.push('surname is only "' + p.last + '"');
    if (/[`~^*_|\\/\[\]{}<>]/.test(p.last + p.first)) bad.push('stray punctuation');
    if (p.last && p.last === p.last.toUpperCase() && /[A-Z]{2}/.test(p.last)) bad.push('ALL CAPS');
    else if (p.last && p.last === p.last.toLowerCase() && /[a-z]{2}/.test(p.last)) bad.push('all lowercase');
    if (bad.length) out.push({
      check: 'damaged-name', severity: letters(p.last).length <= 2 ? 'high' : 'low',
      who: p.name, detail: bad.join(', ') + '.',
      fix: 'Check it against the payroll report and correct the spelling.'
    });
  }
  return out;
}

/* ---------- 5. status that contradicts itself ------------------------- */
function statusCoherence(P, payingIdx) {
  const out = [];
  for (const p of P) {
    if (p.paying === 'Yes' && p.status && p.status !== 'Active') out.push({
      check: 'paying-but-not-active', severity: 'medium', who: p.name,
      detail: 'Paying Active Member is Yes but Member Status is "' + p.status + '".',
      fix: 'One of the two is wrong.'
    });
    if (!p.status) out.push({
      check: 'no-member-status', severity: 'low', who: p.name,
      detail: 'Member Status is empty, so this member is invisible to every report that filters on it.',
      fix: 'Set a status.'
    });
  }
  if (payingIdx) {
    for (const p of P) {
      if (p.status !== 'Active') continue;
      const onReport = payingIdx.has(p);
      if (onReport && p.paying !== 'Yes') out.push({
        check: 'paying-but-not-marked', severity: 'medium', who: p.name,
        detail: 'On the payroll dues report but Paying Active Member reads "' + (p.paying || 'blank') + '".',
        fix: 'Set it to Yes.'
      });
      if (!onReport && p.paying === 'Yes') out.push({
        check: 'marked-paying-but-not-on-the-report', severity: 'medium', who: p.name,
        detail: 'Marked as paying but no dues line on the report.',
        fix: 'Check whether they stopped paying.'
      });
    }
  }
  return out;
}

/* ---------- 6. records with nothing in them --------------------------- */
function hollowRecords(P) {
  return P.filter(p => !p.iaff && !p.status && !p.appt && !p.rank && !p.email && !p.phone)
    .map(p => ({ check: 'empty-record', severity: 'medium', who: p.name,
      detail: 'Nothing on this record but a name — no status, number, rank, hire date or contact.',
      fix: 'Almost certainly a leftover from the old spreadsheet. Check for a real record under the same name.' }));
}

/**
 * Run every check. `payers` is an optional list of {lastName, firstName} from
 * the payroll dues report; `iaffRoster` the raw IAFF export rows.
 */
function auditRoster(records, { payers, iaffRoster } = {}) {
  const P = records.map(person);

  // Link the dues report to NEP one-to-one, so "is this member paying" means
  // the same thing here as everywhere else in the app.
  let payingIdx = null;
  if (payers && payers.length) {
    const pairs = [];
    for (const d of payers) {
      if (!d.lastName) continue;
      for (const m of P) {
        const s = match.scoreCandidate(d, {
          last_name: m.last, first_name: m.first,
          norm_last: match.normalizeName(m.last), norm_first: match.normalizeName(m.first)
        });
        if (s >= 88) pairs.push({ d, m, s });
      }
    }
    pairs.sort((a, b) => b.s - a.s);
    const usedD = new Set(), usedM = new Set();
    payingIdx = new Set();
    for (const p of pairs) {
      if (usedD.has(p.d) || usedM.has(p.m)) continue;
      usedD.add(p.d); usedM.add(p.m); payingIdx.add(p.m);
    }
  }

  const findings = [].concat(
    duplicateProfiles(P),
    contactBelongsToSomeoneElse(P),
    iaffNumbers(P, iaffRoster),
    damagedNames(P),
    statusCoherence(P, payingIdx),
    hollowRecords(P)
  );
  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.check.localeCompare(b.check)
    || a.who.localeCompare(b.who));

  const byCheck = {};
  for (const f of findings) byCheck[f.check] = (byCheck[f.check] || 0) + 1;
  return { total: findings.length, byCheck, findings, members: P.length };
}

module.exports = { auditRoster };
