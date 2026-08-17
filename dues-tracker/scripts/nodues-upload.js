'use strict';
/*
 * Build the "working, no dues" upload: everyone employed by the department with
 * no dues line at all gets Member Status = Active and Paying Active Member = No.
 *
 * Joe's rule, 17 Aug 2026. It is a marker, not a correction — it makes the
 * collection gap visible inside NEP so it can be worked down, instead of living
 * only on a spreadsheet nobody opens.
 *
 * Two rules govern the file shape:
 *   - a blank cell WIPES the field, so each file carries only the key column
 *     plus the two we are setting, and no cell is left empty;
 *   - the key must be unique roster-wide, so each key type gets its own file.
 *     NEP takes one file per upload; never hand it a workbook of tabs.
 *
 *   node scripts/nodues-upload.js [roster-name] [output-dir]
 */
const path = require('path');
const DT = path.join(__dirname, '..');
const ROSTER = process.argv[2] || 'roster-59';
const S = process.argv[3] || process.cwd();
const fs = require('fs');
const D = require(DT + '/node_modules/better-sqlite3');
const db = new D(DT + '/data/dues.db', { readonly: true });
const t = require(DT + '/lib/tabular');
const tsl = require(DT + '/lib/telestaff');
const match = require(DT + '/lib/match');
const notmembers = require(DT + '/lib/notmembers');
const XLSX = require(DT + '/node_modules/xlsx');
const L = v => String(v == null ? '' : v).trim();

const N = t.parseUpload(fs.readFileSync(path.join(DT, 'data/uploads', ROSTER)), 'x.xlsx').records;
const ts = tsl.collapse(t.parseUpload(fs.readFileSync(DT + '/data/uploads/telestaff-2.csv'), 't.csv').records);
const july = db.prepare('SELECT * FROM rows WHERE import_id=8 AND excluded=0').all();
const regPS = new Map(july.map(r => [r.emplid, r]));
const psOf = r => { const p = L(r['PeopleSoft Number']); return /^0\d{7}$/.test(p) ? p : ''; };
const nepByPS = new Map(); for (const r of N) { const p = psOf(r); if (p && !nepByPS.has(p)) nepByPS.set(p, r); }
const nepByNameAll = (last, first) => N.filter(x => L(x['Last Name']) &&
  match.scoreCandidate({ lastName: last, firstName: first },
    { norm_last: match.normalizeName(L(x['Last Name'])), norm_first: match.normalizeName(L(x['First Name'])) }) >= 92);
const nepByName = (last, first) => { const h = nepByNameAll(last, first); return h.length === 1 ? h[0] : null; };

/* ---- rebuild the exact sheet list ---- */
const noLine = ts.filter(p => !regPS.has(p.emplid))
  .filter(p => !july.some(r => match.scoreCandidate({ lastName: p.last_name, firstName: p.first_name }, r) >= 95))
  .sort((a, b) => (a.last_name + a.first_name).localeCompare(b.last_name + b.first_name));
const isChief = p => /\bchief\b/i.test(p.rank);
const isOther = p => /^(PARAMEDIC|Emergency Medical Technician|EMS Advanced Practice Provider)$/i.test(p.rank.trim());
const isRecruit = p => /^RECRUIT$/i.test(p.rank.trim());
const chase = notmembers.withoutNonMembers(noLine.filter(p => !isChief(p) && !isOther(p) && !isRecruit(p)));
const withRec = [], without = [];
for (const p of chase) { const nep = nepByPS.get(p.emplid) || nepByName(p.last_name, p.first_name); (nep ? withRec : without).push({ p, nep }); }
console.log(`sheet: ${chase.length} people — ${withRec.length} with a record, ${without.length} without\n`);

/* ---- uniqueness counters, roster-wide ---- */
const mail = v => L(v).toLowerCase();
const num  = v => L(v).replace(/[^0-9]/g, '');
const tally = (fn, field) => { const m = new Map(); for (const r of N) { const k = fn(r[field]); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
const emailN = tally(mail, 'Email');
const psN    = tally(num, 'PeopleSoft Number');
const iaffN  = tally(num, 'IAFF Member Number');
const plain = (() => { const m = f => { const x = new Map(); for (const r of N) { const k = L(r[f]).toLowerCase(); if (k) x.set(k, (x.get(k) || 0) + 1); } return x; };
  return { last: m('Last Name'), first: m('First Name') }; })();

// Email > PeopleSoft Number > IAFF Member Number > Last Name > First Name. The
// value has to be unique across the whole roster or NEP cannot tell which record
// we mean. Three of these people have no email, no payroll number and no IAFF
// number on file, and share a surname — their first name is the only handle left.
const keyFor = (nep) => {
  const e = mail(nep['Email']);        if (e && emailN.get(e) === 1) return { field: 'Email', value: L(nep['Email']) };
  const p = num(nep['PeopleSoft Number']); if (p && psN.get(p) === 1) return { field: 'PeopleSoft Number', value: L(nep['PeopleSoft Number']) };
  const i = num(nep['IAFF Member Number']); if (i && iaffN.get(i) === 1) return { field: 'IAFF Member Number', value: L(nep['IAFF Member Number']) };
  const l = L(nep['Last Name']).toLowerCase(); if (l && plain.last.get(l) === 1) return { field: 'Last Name', value: L(nep['Last Name']) };
  const f = L(nep['First Name']).toLowerCase(); if (f && plain.first.get(f) === 1) return { field: 'First Name', value: L(nep['First Name']) };
  return null;
};

// Barbour is carried as Life — one of only 16 on the whole roster — while working
// as a Platoon 4 firefighter EMT on a 2025-era payroll number. Almost certainly a
// keying error, but Life is an honour and not ours to overwrite in a batch, so she
// goes in a file of her own for Joe to run or skip.
const isJudgement = (nep) => L(nep['Member Status']) === 'Life';

const buckets = new Map();   // key field -> rows
const judgement = [];
const byHand = [];
const report = [];
for (const { p, nep } of withRec) {
  const k = keyFor(nep);
  const was = `${L(nep['Member Status']) || 'no status'} / paying=${L(nep['Paying Active Member']) || 'blank'}`;
  if (!k) { byHand.push({ p, nep, was, why: 'no field on the record is unique roster-wide' }); continue; }
  const row = { key: k.value, field: k.field, nep, p, was };
  if (isJudgement(nep)) { judgement.push(row); continue; }
  if (!buckets.has(k.field)) buckets.set(k.field, []);
  buckets.get(k.field).push(row);
  report.push([p.last_name + ', ' + p.first_name, p.emplid, was, k.field, k.value]);
}

/* ---- write one file per key type ---- */
const write = (name, field, rows) => {
  const aoa = [[field, 'Member Status', 'Paying Active Member']];
  for (const r of rows) aoa.push([r.key, 'Active', 'No']);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Upload');
  XLSX.writeFile(wb, S + '/' + name);
  console.log(`  ${name}  —  ${rows.length} rows, keyed on ${field}`);
};

console.log('FILES TO UPLOAD (one at a time — never as a workbook):');
let n = 0;
const order = ['Email', 'PeopleSoft Number', 'IAFF Member Number', 'Last Name', 'First Name'];
for (const field of order) {
  const rows = buckets.get(field);
  if (!rows || !rows.length) continue;
  n++;
  const slug = field.toLowerCase().replace(/\s+/g, '');
  write(`Local36-NODUES-${n}-active-payingno-on-${slug}.xlsx`, field, rows);
}
for (const r of judgement) {
  n++;
  write(`Local36-NODUES-${n}-YOUR-CALL-${L(r.nep['Last Name'])}-was-${L(r.nep['Member Status'])}.xlsx`, r.field, [r]);
  console.log(`      ^ ${L(r.nep['Last Name'])}, ${L(r.nep['First Name'])} is carried as ${L(r.nep['Member Status'])} — run this one only if you agree it is a keying error`);
}

/* ---- the by-hand and no-record leftovers ---- */
console.log('\nBY HAND (' + byHand.length + '):');
for (const b of byHand) console.log('  ' + b.p.last_name + ', ' + b.p.first_name + ' (' + b.p.emplid + ') — ' + b.why + ' — now ' + b.was);

console.log('\nNOT IN NEP AT ALL (' + without.length + ') — cannot be marked until a record exists:');
for (const { p } of without) console.log('  ' + p.last_name + ', ' + p.first_name + '  ' + p.emplid + '  ' + p.rank);

/* ---- what actually changes ---- */
const all = [...buckets.values()].flat();
const statusChange = all.filter(r => L(r.nep['Member Status']) !== 'Active');
console.log('\n--- what this upload changes ---');
console.log('rows in the upload: ' + all.length);
console.log('Member Status already Active (no change): ' + all.filter(r => L(r.nep['Member Status']) === 'Active').length);
console.log('Member Status changing: ' + statusChange.length);
for (const r of statusChange) console.log('   ' + L(r.nep['Last Name']) + ', ' + L(r.nep['First Name']) + ': "' + (L(r.nep['Member Status']) || '(blank)') + '" -> Active');
console.log('Paying Active Member was blank: ' + all.filter(r => !L(r.nep['Paying Active Member'])).length +
            ', was Yes: ' + all.filter(r => L(r.nep['Paying Active Member']) === 'Yes').length +
            ', was No: ' + all.filter(r => L(r.nep['Paying Active Member']) === 'No').length);

fs.writeFileSync(S + '/nodues-upload.json', JSON.stringify({ report, byHand: byHand.map(b => b.p), without: without.map(x => x.p) }, null, 1));
