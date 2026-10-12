'use strict';
/*
 * Build the address file for MK Elections, and say exactly what is in it.
 *
 * The column set and order are copied from the file sent on 21 Aug 2026
 * (data/uploads/sent-to-mk.xlsx) and are not changed. Handing a vendor a new
 * schema in the middle of an election is its own risk, and MK's returns report
 * keys on the IAFF number under the name "MemberID" — that is what matched 167
 * of the 184 undeliverables.
 *
 * What gets corrected is only what the last mailing proved: of 15 malformed
 * zips sent, both six-digit ones bounced and one of three four-digit ones did,
 * while all seven ZIP+4s were delivered; and the single record whose second
 * address line repeated the first bounced. Everything else is reported and left
 * exactly as NEP holds it, because an address that USPS delivered is better
 * evidence than a rule.
 *
 *   node scripts/ballot-file-build.js [roster-name] [output-dir] [--no-blanks]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
// Joe, 12 Oct: "remove anyone from the spreadsheet that doesn't have anything
// in the street address section. does that make sense- they wouldnt get a
// mailer." It does, and the test is his: a street line, not all four fields.
// The two are not the same number — eleven records have a street, a city and a
// zip but no state, and USPS routes on the zip, so those DO get a mailer and
// belong in the file.
const NOBLANK = argv.includes('--no-blanks') || argv.includes('--mailable-only');
const rest = argv.filter(a => !a.startsWith('--'));
const ROSTER = rest[0] || 'roster-69';
const OUT = rest[1] || process.cwd();
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const { stateForZip } = require(path.join(DT, 'lib/zipstate'));
const excl = require(path.join(DT, 'lib/ballotexclusions'));
const L = v => String(v == null ? '' : v).trim();
const num = v => L(v).replace(/\D/g, '').replace(/^0+/, '');

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const COLS = ['First Name', 'Last Name', 'IAFF Member Number', 'City', 'Country',
              'Street Address 2', 'Zip', 'State', 'Street Address'];
const F = ['Street Address', 'City', 'State', 'Zip'];
const mail = r => F.every(f => L(r[f]));
const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);

/* ---- corrections, each one earned ---- */
// A four-digit zip can only be a five-digit zip that lost its leading zero, and
// 0xxxx is a real New England / New Jersey / Puerto Rico range. Pridham's 7932
// bounced from Florham Park NJ and was corrected to 07932 after the fact; this
// does it before. Applied only where the padded zip's state matches the record.
const ZIP0 = { '07735': 'New Jersey', '08223': 'New Jersey', '07932': 'New Jersey' };
const notes = { fixed: [], flagged: [] };
const mismatch = [];
const warn = [];
const rows = [];
let included = 0, skipped = 0;

// An export is a snapshot, and a member corrected after it was pulled is still
// in it. Removing them here, from a list that records who decided and when,
// beats hand-editing the outgoing spreadsheet and leaving no trace.
const left = [];
for (const r of N) {
  const e = excl.excludedReason(r);
  if (e) { left.push([who(r), e]); continue; }
  if (NOBLANK && !L(r['Street Address'])) { skipped++; continue; }
  const out = {};
  for (const c of COLS) out[c] = L(r[c]);

  // The second line repeating the first prints the street twice. Bustillo
  // bounced on exactly this, and it has grown from 2 records to 21.
  if (out['Street Address 2'] && out['Street Address 2'].toLowerCase() === out['Street Address'].toLowerCase()) {
    out['Street Address 2'] = '';
    notes.fixed.push([who(r), 'second address line repeated the street, removed']);
  }
  // Two spaces inside a street line. No delivery risk either way; it is just
  // not how an address should go out on an official mailing.
  for (const c of ['Street Address', 'Street Address 2', 'City']) {
    if (/\s{2,}/.test(out[c])) {
      const was = out[c]; out[c] = out[c].replace(/\s+/g, ' ');
      notes.fixed.push([who(r), `"${was}" -> "${out[c]}"`]);
    }
  }
  const z = out['Zip'], d = z.replace(/\D/g, '');
  if (d.length === 4) {
    const pad = '0' + d;
    if (ZIP0[pad] && ZIP0[pad] === out['State']) {
      out['Zip'] = pad;
      notes.fixed.push([who(r), `zip ${z} -> ${pad} (${out['City']}, ${out['State']})`]);
    } else {
      notes.flagged.push([who(r), `zip "${z}" is four digits and padding it to 0${d} does not match ${out['City']}, ${out['State']} — left as NEP holds it`]);
    }
  } else if (d.length === 6) {
    notes.flagged.push([who(r), `zip "${z}" is six digits — left alone because it was DELIVERED last time and USPS NCOA did not flag it. Dropping a digit either way is a guess`]);
  } else if (d.length && d.length !== 5 && d.length !== 9) {
    notes.flagged.push([who(r), `zip "${z}" is ${d.length} digits — look at this one`]);
  }
  // A state that disagrees with its own zip. USPS routes on the zip and ignores
  // the state, which is why all eleven of these were delivered in September, so
  // the address goes out exactly as NEP holds it. Changing a delivered address
  // on the strength of a rule is the bigger risk. Reported because it is a real
  // error, and because NCOA matches on the whole address and can lose a
  // forwarding order over it.
  // A blank state next to a good zip is missing data, not a working address —
  // the self-service login does not insist on one. Filling it in is strictly
  // better for MK, whose NCOA pass matches on the whole address. Overwriting a
  // state that disagrees with its zip is a different thing and is NOT done
  // below, because those addresses were all delivered as they stand.
  if (!out['State'] && out['Zip'] && out['City']) {
    const s2 = stateForZip(out['Zip']);
    if (s2) { out['State'] = s2; notes.fixed.push([who(r), `state was blank, filled in as ${s2} from zip ${out['Zip']}`]); }
    else notes.flagged.push([who(r), `state is blank and zip "${out['Zip']}" is not a shape we can read it from`]);
  }
  if (!out['Country'] && out['State']) out['Country'] = 'USA';
  const zs = mail(r) && stateForZip(out['Zip']);
  if (zs && zs !== out['State'])
    mismatch.push([who(r), `${out['Street Address']}, ${out['City']} — record says ${out['State']}, ` +
      `zip ${out['Zip']} is ${zs}`]);
  rows.push(out); included++;
}

/* ---- the things no file can fix ---- */
const twoPeople = [], gains = [];
// Two records for one member is two ballots. Grouped the way
// scripts/roster-dupes.js groups them, and only where both would be mailed.
const SUF = /\b(jr|sr|ii|iii|iv|v)\b\.?/gi;
const bare = s => L(s).toLowerCase().replace(SUF, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const nkey = r => bare(r['Last Name']) + '|' + (bare(r['First Name']).split(' ')[0] || '');
const byName = new Map();
for (const r of N) byName.set(nkey(r), (byName.get(nkey(r)) || []).concat([r]));
const desc = r => `${who(r)} (IAFF ${L(r['IAFF Member Number']) || 'NONE'}, payroll ${L(r['PeopleSoft Number']) || 'none'}, ` +
  `${L(r['Current Company']) || 'no company'}, ${L(r['City'])} ${L(r['State'])})`;

// The Sellitto rule, 20 Aug: two IAFF member numbers means two people on the
// IAFF roll, and the automated pass that ignored it tried to delete a real
// member. So a pair is only a duplicate worth raising when nothing in the two
// records establishes a second man.
for (const g of [...byName.values()].filter(g => g.length > 1 && g.filter(mail).length > 1)) {
  const ids = new Set(g.map(x => num(x['IAFF Member Number'])).filter(Boolean));
  const addrs = new Set(g.map(x => L(x['Street Address']).toLowerCase()).filter(Boolean));
  // Different dues categories at once is the other independent proof: an active
  // member paying on the payroll and a retiree paying retiree dues are not one
  // person, however alike the names look.
  const kinds = new Set(g.map(x => L(x['Member Status'])));
  const pair = g.map(desc).join('  vs  ');
  if (ids.size >= g.length) { twoPeople.push([pair, `${ids.size} different IAFF member numbers`]); }
  else if (addrs.size >= g.length && kinds.size > 1) {
    twoPeople.push([pair, `different addresses and different member statuses — one working, one retired`]);
    for (const x of g) if (!num(x['IAFF Member Number']))
      gains.push([who(x), 'has no IAFF Member Number. Sellitto had the same gap and it is what made the pair look like one man — worth looking up on the IAFF roll']);
  } else warn.push(['CHECK THIS PAIR', pair + ' — nothing in either record establishes a second person']);
}
// A shared payroll number is not ambiguous. One person has one.
const samePS = new Map();
for (const r of N) if (num(r['PeopleSoft Number'])) samePS.set(num(r['PeopleSoft Number']), (samePS.get(num(r['PeopleSoft Number'])) || []).concat([r]));
for (const [ps, g] of samePS) if (g.length > 1)
  warn.push(['SAME PAYROLL NUMBER', `${ps} is on ${g.length} records — one person has one payroll number, so this is a duplicate: ` +
    g.map(x => `${who(x)} (${mail(x) ? 'mailable' : 'no address'})`).join(' / ')]);
// Work Status is not maintained (Joe, 20 Aug), so this is a prompt to check,
// never a reason to drop anybody from a ballot.
// Not for anyone already on the exclusion list — that question is settled and
// repeating it buries the warnings that are still live.
for (const r of N) if (/deceased/i.test(L(r['Work Status'])) && !excl.excludedReason(r) && (!NOBLANK || mail(r)))
  warn.push(['MARKED DECEASED', `${who(r)} — Work Status says Deceased and this record is ${mail(r) ? 'MAILABLE' : 'not mailable'}. ` +
    `That field is not maintained so it is a hint, not a fact. Verify before a ballot goes out`]);
// Without a MemberID, MK cannot report a return against a person. Only the
// mailable ones can bounce, so that is the number that matters.
const noId = rows.filter(r => !num(r['IAFF Member Number']));
const noIdMail = noId.filter(mail);
if (noId.length) warn.push(['NO MEMBER ID', `${noId.length} of ${rows.length} rows carry no IAFF Member Number, ${noIdMail.length} of them mailable. ` +
  `MK keys its returns report on it, so a bounce from one of those ${noIdMail.length} cannot be matched back to a member automatically`]);

/* ---- write ---- */
const aoa = [COLS, ...rows.map(r => COLS.map(c => r[c]))];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = COLS.map(c => ({ wch: /Street|City|Name/.test(c) ? 30 : 18 }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Addresses');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const name = `Local36-BALLOT-ADDRESS-FILE-${stamp}${NOBLANK ? '-mailable-only' : ''}.xlsx`;
XLSX.writeFile(wb, path.join(OUT, name));

const mailable = rows.filter(mail).length;
console.log(`${ROSTER}: ${N.length} records on the roll\n`);
console.log(`  rows in the file           ${String(included).padStart(5)}`);
if (skipped) console.log(`  left out, no street line   ${String(skipped).padStart(5)}   — they would get no mailer`);
if (left.length) {
  console.log(`  left out by name           ${String(left.length).padStart(5)}`);
  left.forEach(([w, e]) => console.log(`      ${w} — ${e.reason} (${e.who})`));
}
// A list entry that matches nothing has quietly stopped working.
for (const { entry, hits } of excl.isStale(N))
  warn.push(['EXCLUSION LIST', `the entry for ${entry.lastName}, ${entry.firstName} matches ${hits} records on ` +
    `${ROSTER} — it should match exactly one. If the record was deleted this is expected and the entry can go`]);
console.log(`  of those, a full address   ${String(mailable).padStart(5)}`);
if (included - mailable) console.log(`  still short a field        ${String(included - mailable).padStart(5)}`);
console.log(`\ncorrected (${notes.fixed.length}):`);
notes.fixed.forEach(([w, m]) => console.log(`  ${w.padEnd(26)} ${m}`));
console.log(`\nleft alone, worth an eye (${notes.flagged.length}):`);
notes.flagged.forEach(([w, m]) => console.log(`  ${w.padEnd(26)} ${m}`));
console.log(`\nstate does not match its own zip (${mismatch.length}) — ALL of these were delivered in September,`);
console.log('so they go out unchanged. Worth correcting in NEP afterwards, not in this file:');
mismatch.forEach(([w, m]) => console.log(`  ${w.padEnd(26)} ${m}`));
console.log(`\nNEEDS A DECISION BEFORE THIS GOES (${warn.length}):`);
warn.forEach(([tag, m]) => console.log(`  [${tag}] ${m}`));
console.log(`\nsame name, two ballots, and that is CORRECT (${twoPeople.length}) — do not merge these:`);
twoPeople.forEach(([p, why]) => console.log(`  ${p}\n      ${why}`));
if (gains.length) { console.log(`\nworth fixing while we are here (${gains.length}):`); gains.forEach(([w, m]) => console.log(`  ${w} — ${m}`)); }
console.log(`\nFILE  ${name}`);

/* ---- put the same corrections back into NEP ---- */
// The outgoing file is a copy. If the corrections only live in it, NEP stays
// wrong and the next export undoes the work — which is how the 21 duplicated
// address lines grew from 2 in the first place.
//
// One file per thing being fixed, split by key, because a blank cell CLEARS a
// field: a file that carries "Street Address 2" would wipe Quinn's legitimate
// "Apartment 243" on any row that was not meant to lose one.
const KEYNAME = { Email: 'Email', 'PeopleSoft Number': 'PeopleSoft-Number', 'IAFF Member Number': 'IAFF-Member-Number' };
const uniq = (f, v) => N.filter(x => (f === 'Email' ? L(x[f]).toLowerCase() : num(x[f]))
  === (f === 'Email' ? L(v).toLowerCase() : num(v))).length === 1;
const keyFor = r => ['Email', 'PeopleSoft Number', 'IAFF Member Number']
  .map(f => ({ f, v: L(r[f]) })).find(k => k.v && uniq(k.f, k.v));

const JOBS = [
  { tag: 'clear-duplicate-address-line-2', col: 'Street Address 2',
    pick: r => L(r['Street Address 2']) && L(r['Street Address 2']).toLowerCase() === L(r['Street Address']).toLowerCase(),
    value: () => '', note: r => `the second address line repeated the street "${L(r['Street Address'])}" and was removed` },
  { tag: 'fill-blank-state', col: 'State',
    pick: r => L(r['Street Address']) && L(r['Zip']) && L(r['City']) && !L(r['State']) && stateForZip(r['Zip']),
    value: r => stateForZip(r['Zip']), note: r => `state was blank, filled in as ${stateForZip(r['Zip'])} from zip ${L(r['Zip'])}` },
  { tag: 'pad-four-digit-zip', col: 'Zip',
    pick: r => { const d = L(r['Zip']).replace(/\D/g, ''); return d.length === 4 && ZIP0['0' + d] === L(r['State']); },
    value: r => '0' + L(r['Zip']).replace(/\D/g, ''), note: r => `zip ${L(r['Zip'])} was missing its leading zero` },
  { tag: 'collapse-double-spaces', col: 'Street Address',
    pick: r => /\s{2,}/.test(L(r['Street Address'])),
    value: r => L(r['Street Address']).replace(/\s+/g, ' '), note: r => `"${L(r['Street Address'])}" had a double space` },
];

const fixFiles = [], handwork = [];
let fn = 0;
for (const job of JOBS) {
  const hits = N.filter(job.pick);
  if (!hits.length) continue;
  const byKey = new Map(), byHand = [];
  for (const r of hits) {
    const k = keyFor(r);
    if (!k) { byHand.push(r); continue; }
    if (!byKey.has(k.f)) byKey.set(k.f, []);
    byKey.get(k.f).push({ r, k });
  }
  for (const [field, group] of byKey) {
    const hdr = [field, job.col, 'Notes'];
    const aoa2 = [hdr, ...group.map(({ r, k }) => [k.v, job.value(r),
      (L(r['Notes']) ? L(r['Notes']) + ' | ' : '') + `address tidied ${new Date().toISOString().slice(0, 10)} before the ballot file — ` + job.note(r)])];
    const w = XLSX.utils.book_new();
    const sh = XLSX.utils.aoa_to_sheet(aoa2);
    sh['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 120 }];
    XLSX.utils.book_append_sheet(w, sh, 'Upload');
    const nm = `Local36-ADDRFIX-${++fn}-${job.tag}-${group.length}-KEY-ON-${KEYNAME[field]}.xlsx`;
    XLSX.writeFile(w, path.join(OUT, nm));
    fixFiles.push([nm, group.length, field, job.col]);
  }
  for (const r of byHand) handwork.push([who(r), `${job.note(r)} — no unique key to upload on, so do this one in NEP by hand`]);
}
if (fixFiles.length) {
  console.log('\nNEP CORRECTION FILES — one at a time, Notes set to Trust File:');
  for (const [nm, n2, field, col] of fixFiles)
    console.log(`  ${nm}\n      ${n2} row${n2 === 1 ? '' : 's'} · sets ${col} · at step 3 choose primary key: ${field}`);
  console.log('      A blank cell clears the field. That is intended in the clear-duplicate-line-2 file');
  console.log('      and is why each file carries only the one column it changes.');
}
if (handwork.length) {
  console.log(`\nNO FILE — do these in NEP by hand (${handwork.length}):`);
  handwork.forEach(([w, m]) => console.log(`  ${w} — ${m}`));
}
