'use strict';
/*
 * One honest count of the local, taken from the three records that actually
 * know something: the membership export, the payroll checkoff register, and
 * the International's roll.
 *
 * This exists because the numbers on the office wall and the numbers in a
 * board presentation have to come from the same place. Every figure either
 * comes out of this file or it does not get shown. Nothing is typed by hand
 * into a template, so nothing can drift.
 *
 * Two counting rules worth stating, because they are judgement calls and the
 * answer changes the money:
 *
 *  - "Paying dues" means a line on the payroll register with money on it. Not
 *    a checkbox in our own records — the paycheck is the proof. The register
 *    also prints a Goal column and a Taken column; they are NOT the same
 *    number, and Taken is what the local actually collects.
 *  - "A retiree paying dues" means retiree dues marked Paid for the year,
 *    whatever status the record carries. Counting only Active Retired misses
 *    the members filed as Alumni, Life or Honorary who paid all the same, and
 *    understates us against the International's retired roll.
 */

const VALID_EMPLID = /^\d{8}$/;

const str = (v) => String(v == null ? '' : v).trim();

/** A payroll number in the one shape everything else compares against, or ''
 *  if the cell does not hold one. Sheets lose the leading zero, so pad. */
function payrollNumber(value) {
  const digits = str(value).replace(/\D/g, '');
  if (!digits || Number(digits) === 0) return '';
  const padded = digits.padStart(8, '0');
  return VALID_EMPLID.test(padded) ? padded : '';
}

/** Retiree dues for a year, under either of the two column spellings NEP has
 *  used. Any value containing "paid" counts; blanks and "Unpaid" do not. */
function paidRetireeDues(member, year) {
  const cells = [member[`L36 ${year} Retired Dues`], member[`${year} Retired Dues`]];
  return cells.some(c => /(^|[^n])paid/i.test(str(c)));
}

/**
 * @param members       rows of the NEP membership export
 * @param registerRows  rows of one dues checkoff register (amount_goal / amount_taken)
 * @param iaffRecords   rows of the International's export (Member Type)
 * @param opts.year     dues year for the retiree columns (default 2026)
 * @param opts.rate     per-capita rate per active member per month
 * @param opts.halfRate per-capita rate per retired member per month
 */
function membershipSnapshot(members, registerRows, iaffRecords, opts = {}) {
  const year = opts.year || 2026;
  const rate = opts.rate == null ? 19.05 : opts.rate;
  const halfRate = opts.halfRate == null ? +(rate / 2).toFixed(2) : opts.halfRate;

  /* ---- the roll, by standing ---- */
  const statusOf = (m) => str(m['Member Status']);
  const status = {};
  for (const m of members) {
    const s = statusOf(m) || 'unfiled';
    status[s] = (status[s] || 0) + 1;
  }
  const active = members.filter(m => statusOf(m) === 'Active');
  const named = ['Active', 'Active Retired', 'Retired', 'Drop'];
  const roll = {
    total: members.length,
    active: active.length,
    activeRetired: status['Active Retired'] || 0,
    retired: status.Retired || 0,
    drop: status.Drop || 0,
    // everything else in one bucket: alumni, life, honorary, deceased, unfiled
    other: members.length - named.reduce((sum, s) => sum + (status[s] || 0), 0),
    status,
  };

  /* ---- how much of the roll is tied to a paycheck ---- */
  const withNumber = members.filter(m => payrollNumber(m['PeopleSoft Number']));
  const activeWithNumber = active.filter(m => payrollNumber(m['PeopleSoft Number']));
  const seen = new Map();
  for (const m of members) {
    const n = payrollNumber(m['PeopleSoft Number']);
    if (n) seen.set(n, (seen.get(n) || 0) + 1);
  }
  const payroll = {
    onRoll: withNumber.length,
    active: activeWithNumber.length,
    activePct: active.length ? +(activeWithNumber.length / active.length * 100).toFixed(1) : 0,
    duplicates: [...seen.values()].filter(c => c > 1).length,
  };

  /* ---- the checkoff register ---- */
  const paying = registerRows.filter(r => Number(r.amount_taken) > 0);
  const goal = paying.reduce((sum, r) => sum + Number(r.amount_goal || 0), 0);
  const taken = paying.reduce((sum, r) => sum + Number(r.amount_taken || 0), 0);
  const register = {
    lines: registerRows.length,
    paying: paying.length,
    zero: registerRows.filter(r => Number(r.amount_taken) === 0).length,
    goal: +goal.toFixed(2),
    taken: +taken.toFixed(2),
    shortfall: +(goal - taken).toFixed(2),
    takenPerYear: Math.round(taken * 26),
  };

  /* ---- who the register matches on our own roll ----
   * Three outcomes, and the middle one is the reason this is not a one-liner.
   * A payer whose NUMBER is on a record is settled. A payer whose number is
   * not, but whose NAME is, is NOT settled: either the register's number was
   * misread off the scan or the number on our record is wrong, and one digit
   * decides which. Those get counted separately so nobody reports them as
   * either verified or missing. Only a payer we cannot find by number or by
   * name has genuinely no record with the local. */
  const byNumber = new Set(members.map(m => payrollNumber(m['PeopleSoft Number'])).filter(Boolean));
  // an unreadable name is '' on both sides, and '' must never match '' — that
  // would file every nameless line against every nameless record
  const nameKey = (last, first) => {
    const l = str(last).toLowerCase();
    if (!l) return '';
    return `${l}|${str(first).toLowerCase().split(/[\s,]+/)[0] || ''}`;
  };
  const byName = new Set(members.map(m => nameKey(m['Last Name'], m['First Name'])).filter(Boolean));
  let onRoll = 0, nameOnly = 0, missing = 0;
  for (const r of paying) {
    const key = nameKey(r.last_name, r.first_name);
    if (byNumber.has(payrollNumber(r.emplid))) onRoll++;
    else if (key && byName.has(key)) nameOnly++;
    else missing++;
  }
  register.payersOnOurRoll = onRoll;
  register.payersNumberUnsettled = nameOnly;
  register.payersWithNoRecord = missing;

  /* ---- retirees paying retiree dues ---- */
  const retireesPaying = members.filter(m => paidRetireeDues(m, year));
  const dues = {
    year,
    markedPayingInOurRecords: members.filter(m => str(m['Paying Active Member']) === 'Yes').length,
    unansweredActive: active.filter(m => !str(m['Paying Active Member'])).length,
    retireesPaying: retireesPaying.length,
  };

  /* ---- the International's roll ---- */
  const cleanType = (v) => str(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const byType = {};
  for (const r of iaffRecords) {
    const t = cleanType(r['Member Type']) || 'unfiled';
    byType[t] = (byType[t] || 0) + 1;
  }
  const international = {
    total: iaffRecords.length,
    active: byType.MEM || 0,        // MEM — active member on their roll
    retired: byType.MRM || 0,       // MRM — retired member
    honorary: byType.HMM || 0,
    byType,
  };

  /* ---- per capita, both ways ---- */
  const ourActive = register.paying;               // proven by the paycheck
  const ourRetired = dues.retireesPaying;
  const perMonth = (a, r) => a * rate + r * halfRate;
  const perCapita = {
    rate, halfRate,
    activeGap: ourActive - international.active,
    retiredGap: international.retired - ourRetired,
    billedOnTheirRoll: Math.round(perMonth(international.active, international.retired) * 12),
    billedOnOurRecords: Math.round(perMonth(ourActive, ourRetired) * 12),
  };
  perCapita.activeGapPerYear = Math.round(perCapita.activeGap * rate * 12);
  perCapita.retiredGapPerYear = Math.round(perCapita.retiredGap * halfRate * 12);
  perCapita.difference = perCapita.billedOnTheirRoll - perCapita.billedOnOurRecords;

  return { roll, payroll, register, dues, international, perCapita };
}

module.exports = { membershipSnapshot, payrollNumber, paidRetireeDues };
