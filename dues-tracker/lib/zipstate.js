'use strict';
/*
 * Which state a five-digit zip belongs to, by its first three digits.
 *
 * Used to catch a record whose state does not match its zip. USPS routes on the
 * zip and ignores the state, so a mismatch is not a delivery problem — all
 * eleven on roster-69 were delivered by the September mailing. It matters
 * because NCOA matches on the whole address, so a wrong state can quietly cost
 * a forwarding order, and because it is a real error in the database.
 */
const RANGES = {
  'Massachusetts': [[10, 27], [55, 55]], 'Rhode Island': [[28, 29]], 'New Hampshire': [[30, 38]],
  'Maine': [[39, 49]], 'Vermont': [[50, 54], [56, 59]], 'Connecticut': [[60, 69]],
  'New Jersey': [[70, 89]], 'New York': [[5, 5], [90, 149]], 'Pennsylvania': [[150, 196]],
  'Delaware': [[197, 199]], 'District of Columbia': [[200, 200], [202, 205], [569, 569]],
  'Virginia': [[201, 201], [220, 246]], 'Maryland': [[206, 219]], 'West Virginia': [[247, 268]],
  'North Carolina': [[270, 289]], 'South Carolina': [[290, 299]], 'Georgia': [[300, 319], [398, 399]],
  'Florida': [[320, 349]], 'Alabama': [[350, 369]], 'Tennessee': [[370, 385]], 'Mississippi': [[386, 397]],
  'Kentucky': [[400, 427]], 'Ohio': [[430, 459]], 'Indiana': [[460, 479]], 'Michigan': [[480, 499]],
  'Iowa': [[500, 528]], 'Wisconsin': [[530, 549]], 'Minnesota': [[550, 567]], 'South Dakota': [[570, 577]],
  'North Dakota': [[580, 588]], 'Montana': [[590, 599]], 'Illinois': [[600, 629]], 'Missouri': [[630, 658]],
  'Kansas': [[660, 679]], 'Nebraska': [[680, 693]], 'Louisiana': [[700, 714]], 'Arkansas': [[716, 729]],
  'Oklahoma': [[730, 749]], 'Texas': [[750, 799], [885, 885]], 'Colorado': [[800, 816]],
  'Wyoming': [[820, 831]], 'Idaho': [[832, 838]], 'Utah': [[840, 847]], 'Arizona': [[850, 865]],
  'New Mexico': [[870, 884]], 'Nevada': [[889, 898]], 'California': [[900, 961]],
  'Hawaii': [[967, 968]], 'Oregon': [[970, 979]], 'Washington': [[980, 994]], 'Alaska': [[995, 999]],
};

// Only answers for a zip of a shape it can read. A four- or six-digit zip is a
// different problem and must not be padded into a confident wrong answer.
function stateForZip(zip) {
  const d = String(zip == null ? '' : zip).replace(/\D/g, '');
  if (d.length !== 5 && d.length !== 9) return null;
  const p = Number(d.slice(0, 3));
  for (const [state, ranges] of Object.entries(RANGES))
    for (const [a, b] of ranges) if (p >= a && p <= b) return state;
  return null;
}

module.exports = { stateForZip, RANGES };
