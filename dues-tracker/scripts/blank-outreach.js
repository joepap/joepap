'use strict';
/*
 * Everybody on the roll with no mailable address, sorted by how Joe can
 * actually reach them.
 *
 * The returns batch cleared 177 addresses, but they joined 559 that were
 * already blank. Joe, 27 Sep: "i will attempt to reach out to all the blank
 * addressess." So the list is the whole 736, not the ones that bounced — and
 * the useful split is not who bounced, it is what handle we hold: an email, a
 * phone, a firehouse, or nothing at all.
 *
 * Also written: upload files for the handful who are only missing one field of
 * four. They are counted as blank and would get no ballot, but nothing about
 * them is lost — a city and a zip name their state.
 *
 *   node scripts/blank-outreach.js [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-68';
const OUT = process.argv[3] || process.cwd();
const fs = require('fs');
const XLSX = require(path.join(DT, 'node_modules/xlsx'));
const t = require(path.join(DT, 'lib/tabular'));
const L = v => String(v == null ? '' : v).trim();
const TODAY = '9/27/2026';

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const FIELDS = ['Street Address', 'City', 'State', 'Zip'];
const mailable = r => FIELDS.every(f => L(r[f]));
const email = r => /@/.test(L(r['Email'])) ? L(r['Email']) : '';
const phone = r => L(r['Phone Number']).replace(/\D/g, '').length >= 10 ? L(r['Phone Number']) : '';
const house = r => [L(r['Current Company']), L(r['Platoon'])].filter(Boolean).join(' · ');
const who = r => L(r['Last Name']) + ', ' + L(r['First Name']);
const held = r => FIELDS.map(f => L(r[f])).filter(Boolean).join(', ') || '(nothing)';
// A note we wrote when the address was cleared says the member bounced; anyone
// else has simply never had an address on file.
const bounced = r => /returned undeliverable from the nominations mailing/i.test(L(r['Notes']));
// The records we made ourselves off the payroll register carry an L36NEW tag.
// They were created from a name and a payroll number, so having no contact
// details is expected of them and is a different job from chasing a mover.
const ourOwn = r => /L36NEW/i.test(L(r['Notes']));

const blank = N.filter(r => !mailable(r)).sort((a, b) => who(a).localeCompare(who(b)));
const byEmail  = blank.filter(r => email(r));
const byPhone  = blank.filter(r => !email(r) && phone(r));
const byHouse  = blank.filter(r => !email(r) && !phone(r) && house(r));
const noRoute  = blank.filter(r => !email(r) && !phone(r) && !house(r));
const partial  = blank.filter(r => FIELDS.some(f => L(r[f])));

/* ---- the state a city and a zip name between them ---- */
// Only filled in where the city and the zip agree on one state. Nothing is
// inferred from the city alone: there is a Quantico in Maryland as well as the
// one in Virginia, and 21856 is the Maryland one.
const STATE_BY_ZIP = {
  '21225': ['Maryland', 'Brooklyn Park'], '20735': ['Maryland', 'Clinton'],
  '21856': ['Maryland', 'Quantico'],      '20646': ['Maryland', 'La Plata'],
};
const ZIP_BY_CITY = { 'murrells inlet|south carolina': '29576' };

const fixes = [];
for (const r of partial) {
  const miss = FIELDS.filter(f => !L(r[f]));
  if (miss.length !== 1) continue;
  if (miss[0] === 'State') {
    const s = STATE_BY_ZIP[L(r['Zip'])];
    if (s && s[1].toLowerCase() === L(r['City']).toLowerCase())
      fixes.push({ r, field: 'State', value: s[0], why: `zip ${L(r['Zip'])} is ${s[1]}, ${s[0]}` });
  } else if (miss[0] === 'Zip') {
    const z = ZIP_BY_CITY[(L(r['City']) + '|' + L(r['State'])).toLowerCase()];
    if (z) fixes.push({ r, field: 'Zip', value: z, why: `${L(r['City'])}, ${L(r['State'])} has the one zip, ${z}`, check: true });
  }
}
// The second address line repeating the first is the Bustillo defect again. It
// travels with these fixes because the same row has to be touched anyway.
for (const f of fixes)
  if (L(f.r['Street Address 2']) && L(f.r['Street Address 2']).toLowerCase() === L(f.r['Street Address']).toLowerCase())
    f.dropLine2 = true;

// A comma between the house number and the street is a typing slip, not an
// address. Joe, 27 Sep: "if the typos are fixable, lets fix." Only this one
// shape is touched — anything else keeps whatever was typed.
for (const f of fixes) {
  const a = L(f.r['Street Address']);
  if (/^\d+,\s/.test(a)) f.street = a.replace(/^(\d+),\s/, '$1 ');
}

/* ---- the workbook ---- */
const wb = XLSX.utils.book_new();
const sheet = (title, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, title);
};
const WHY = r => bounced(r) ? 'mail came back' : ourOwn(r) ? 'we created the record from the payroll register'
  : 'never had an address on file';
const rowsFor = (list, extra) => list.map(r => [who(r), L(r['Member Status']), extra(r), house(r) || '—', WHY(r)]);
const HDR = c => ['Member', 'Status', c, 'Company · platoon', 'Why there is no address'];
const W = [30, 16, 34, 26, 44];

sheet('Start here', [
  ['Local 36 — every member with no mailable address', ''],
  ['', ''],
  [`Roster pulled ${ROSTER === 'roster-68' ? '27 Sep 2026, 23:42' : ROSTER}`, ''],
  ['', ''],
  ['On the roll (Active and Active Retired)', N.length],
  ['Mailable address on file', N.filter(mailable).length],
  ['NO mailable address — this workbook', blank.length],
  ['', ''],
  ['   of those, cleared by the returns batch on 27 Sep', blank.filter(bounced).length],
  ['   of those, blank before the mailing ever went out', blank.filter(r => !bounced(r)).length],
  ['', ''],
  ['How to reach them', ''],
  ['   Email these members', byEmail.length],
  ['   Call or text these members (no email, phone on file)', byPhone.length],
  ['   Reach at the firehouse (no email, no phone, but assigned)', byHouse.length],
  ['   No way to reach them at all', noRoute.length],
  ['', ''],
  ['Worth knowing', ''],
  [`   ${blank.filter(r => L(r['Member Status']) === 'Active').length} of the ${blank.length} are working members, not retirees.`, ''],
  ['   Working members have always been reachable at the firehouse, which is', ''],
  ['   why nobody ever collected their home address. That is the hole.', ''],
  [`   ${noRoute.filter(ourOwn).length} of the ${noRoute.length} unreachable are records we built ourselves off the`, ''],
  ['   payroll register — a name and a payroll number and nothing else. They', ''],
  ['   are not lost members; we simply never had anything on them. DC HR and', ''],
  ['   TeleStaff both hold their details.', ''],
  ['', ''],
  ['A blank address means no ballot. Anyone still blank when the file goes to', ''],
  ['MK Elections will not get one.', ''],
], [70, 10]);

sheet('Email these members', [HDR('Email'), ...rowsFor(byEmail, email)], W);
sheet('Call or text these', [HDR('Phone'), ...rowsFor(byPhone, phone)], W);
sheet('Reach at the firehouse', [HDR('Payroll number'), ...rowsFor(byHouse, r => L(r['PeopleSoft Number']) || '—')], W);
sheet('No way to reach them', [HDR('Payroll number'), ...rowsFor(noRoute, r => L(r['PeopleSoft Number']) || '—')], W);
sheet('Nearly there — one field short', [
  ['These count as blank and would get no ballot, but only one field of four is missing.', '', '', '', ''],
  ['Member', 'Status', 'What NEP holds', 'Missing', 'Filled in as'],
  ...partial.map(r => {
    const f = fixes.find(x => x.r === r);
    return [who(r), L(r['Member Status']), held(r) + (L(r['Street Address 2']) ? '  (line 2: ' + L(r['Street Address 2']) + ')' : ''),
      FIELDS.filter(x => !L(r[x])).join(', ') || '—',
      f ? `${f.value} — ${f.why}${f.street ? '; also "' + L(r['Street Address']) + '" -> "' + f.street + '"' : ''}` +
          `${f.check ? '  ** please confirm **' : ''}` : 'no safe answer — needs a look'];
  }),
], [30, 16, 56, 12, 56]);

const book = path.join(OUT, 'Local36-BLANK-ADDRESS-outreach.xlsx');
XLSX.writeFile(wb, book);

/* ---- upload files for the one-field-short fixes ---- */
const KEYNAME = { Email: 'Email', 'PeopleSoft Number': 'PeopleSoft-Number', 'IAFF Member Number': 'IAFF-Member-Number' };
const uniq = (field, v) => N.filter(x => (field === 'Email' ? L(x[field]).toLowerCase() : L(x[field]).replace(/\D/g, '').replace(/^0+/, ''))
  === (field === 'Email' ? L(v).toLowerCase() : L(v).replace(/\D/g, '').replace(/^0+/, ''))).length === 1;
const keyFor = r => ['Email', 'PeopleSoft Number', 'IAFF Member Number']
  .map(f => ({ f, v: L(r[f]) })).find(k => k.v && uniq(k.f, k.v));

const out = [];
const byKey = new Map();
for (const f of fixes) {
  const k = keyFor(f.r);
  if (!k) { out.push(`  ${who(f.r)} — no unique key, do this one by hand`); continue; }
  if (!byKey.has(k.f)) byKey.set(k.f, []);
  byKey.get(k.f).push({ ...f, key: k });
}
const files = [];
let n = 0;
for (const [field, group] of byKey) {
  // Street Address 2 only travels when it must be emptied, because an empty
  // cell clears the field and Quinn's "Apartment 243" is real.
  const wantsLine2 = group.some(x => x.dropLine2);
  const hdr = [field, ...FIELDS, ...(wantsLine2 ? ['Street Address 2'] : []), 'Notes'];
  const rows = group.map(x => {
    const r = x.r;
    const val = f => f === x.field ? x.value : (f === 'Street Address' && x.street) ? x.street : L(r[f]);
    const note = (L(r['Notes']) ? L(r['Notes']) + ' | ' : '') +
      `address completed ${TODAY} — ${x.field.toLowerCase()} filled in, ${x.why}` +
      (x.street ? '; the comma after the house number was dropped' : '') +
      (x.dropLine2 ? '; the second address line repeated the first and was removed' : '') +
      `; as held it was: ${held(r)}`;
    return [x.key.v, ...FIELDS.map(val), ...(wantsLine2 ? [x.dropLine2 ? '' : L(r['Street Address 2'])] : []), note];
  });
  const name = `Local36-BLANKFIX-${++n}-${group.length}-one-field-short-KEY-ON-${KEYNAME[field]}.xlsx`;
  const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
  ws['!cols'] = [28, 34, 20, 20, 10, ...(wantsLine2 ? [24] : []), 120].slice(0, hdr.length).map(w => ({ wch: w }));
  const w2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w2, ws, 'Upload');
  XLSX.writeFile(w2, path.join(OUT, name));
  files.push([name, group.length, field, group]);
}

/* ---- what happened ---- */
console.log(`${ROSTER}: ${N.length} on the roll, ${N.filter(mailable).length} mailable, ${blank.length} with no address\n`);
console.log(`  email them            ${String(byEmail.length).padStart(4)}`);
console.log(`  call or text them     ${String(byPhone.length).padStart(4)}`);
console.log(`  catch at the firehouse${String(byHouse.length).padStart(4)}`);
console.log(`  no route at all       ${String(noRoute.length).padStart(4)}   (${noRoute.filter(ourOwn).length} are our own payroll-register creates)`);
console.log(`\n  ${blank.filter(r => L(r['Member Status']) === 'Active').length} working members · ${blank.filter(r => L(r['Member Status']) === 'Active Retired').length} retired`);
console.log(`  ${blank.filter(bounced).length} were cleared by the returns batch · ${blank.filter(r => !bounced(r)).length} were already blank\n`);
console.log('WORKBOOK  ' + path.basename(book));
if (files.length) {
  console.log('\nUPLOAD FILES — one at a time, in this order:');
  for (const [name, rows, field, group] of files) {
    console.log(`  ${name}\n      ${rows} row${rows === 1 ? '' : 's'} · at step 3 choose primary key: ${field}`);
    group.forEach(x => console.log(`      ${who(x.r)} — ${x.field} = ${x.value}` +
      (x.street ? `, street "${L(x.r['Street Address'])}" -> "${x.street}"` : '') +
      (x.dropLine2 ? ', second address line removed' : '') + (x.check ? '  ** confirm this one **' : '')));
  }
}
out.forEach(o => console.log(o));
