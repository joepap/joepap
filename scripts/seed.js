'use strict';
/*
 * Rehearsal seed: ~300 SYNTHETIC members (no real people), sample AAMVA
 * strings, and printable PDF417 PNGs so volunteers can practice all three
 * input paths before the event.
 *
 * Usage: node scripts/seed.js [--count 300] [--wipe]
 * Outputs:
 *   data/checkin.db                    seeded roster
 *   seed-output/roster.csv             the same roster as a CSV (import practice)
 *   seed-output/paper-roll.csv         partial second list (merge practice)
 *   seed-output/aamva-samples.txt      raw synthetic AAMVA strings (wedge practice:
 *                                      most USB scanners can also read these from
 *                                      the printed barcodes)
 *   seed-output/barcodes/*.png         PDF417 barcodes for ~24 members (camera practice)
 */
const fs = require('fs');
const path = require('path');
const bwipjs = require('bwip-js');
const { open, setConfig } = require('../lib/db');
const match = require('../lib/match');
const csv = require('../lib/csv');

const args = process.argv.slice(2);
const COUNT = parseInt((args[args.indexOf('--count') + 1] || ''), 10) || 300;
const WIPE = args.includes('--wipe');

const FIRST = ['James', 'Michael', 'Robert', 'John', 'William', 'David', 'Joseph', 'Thomas', 'Christopher', 'Daniel',
  'Matthew', 'Anthony', 'Donald', 'Steven', 'Kenneth', 'Edward', 'Brian', 'Ronald', 'Timothy', 'Jason',
  'Ryan', 'Jacob', 'Nicholas', 'Eric', 'Kevin', 'Justin', 'Brandon', 'Samuel', 'Benjamin', 'Patrick',
  'Frank', 'Raymond', 'Gregory', 'Alexander', 'Dennis', 'Jerry', 'Tyler', 'Aaron', 'Jose', 'Adam',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
  'Carol', 'Amanda', 'Dorothy', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura', 'Cynthia',
  'Angela', 'Nicole', 'Katherine', 'Samantha', 'Christine', 'Catherine', 'Maria', 'Victoria', 'Danielle', 'Julia'];

const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen',
  'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson',
  'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans',
  "O'Brien", "O'Connor", 'McCarthy', 'Fitzgerald', 'Sullivan', 'Murphy', 'Kelly', 'Ryan', 'Callahan', 'Donnelly',
  'St. James', 'Van Dyke', 'De La Cruz'];

const HYPHEN_RATE = 0.06, SUFFIX_RATE = 0.08;
const SUFFIXES = ['JR', 'SR', 'II', 'III'];

// Deterministic PRNG so reruns produce the same roster.
let seedVal = 3636;
function rnd() { seedVal = (seedVal * 1103515245 + 12345) & 0x7fffffff; return seedVal / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

function makeMember(i) {
  const first = pick(FIRST);
  let last = pick(LAST);
  if (rnd() < HYPHEN_RATE) last = last + '-' + pick(LAST).replace(/[^A-Za-z]/g, '');
  const suffix = rnd() < SUFFIX_RATE ? pick(SUFFIXES) : '';
  const middle = rnd() < 0.5 ? pick(FIRST) : '';
  const memberNo = 'L36-' + String(1000 + i);
  const duesBad = rnd() < 0.07;
  const dues = duesBad ? pick(['Suspended', 'Delinquent - 2 mo', 'Arrears']) : 'Good Standing';
  const staleKind = rnd();
  const email = staleKind < 0.12 ? '' : first.toLowerCase() + '.' + last.toLowerCase().replace(/[^a-z]/g, '') + '@example.com';
  const phone = staleKind < 0.08 ? '' : '202-555-' + String(1000 + Math.floor(rnd() * 9000));
  const yearsAgo = rnd() < 0.2 ? 3 + rnd() * 4 : rnd() * 0.9;
  const lastUpdated = new Date(Date.now() - yearsAgo * 365 * 86400000).toISOString().slice(0, 10);
  const dobYear = 1958 + Math.floor(rnd() * 45);
  const dobMonth = 1 + Math.floor(rnd() * 12);
  const dobDay = 1 + Math.floor(rnd() * 28);
  return { first, middle, last, suffix, memberNo, dues, email, phone, lastUpdated,
    dob: { y: dobYear, m: dobMonth, d: dobDay } };
}

function aamvaString(m) {
  // Synthetic AAMVA v08-style payload. The DAQ value is fake.
  const pad2 = n => String(n).padStart(2, '0');
  const dbb = pad2(m.dob.m) + pad2(m.dob.d) + m.dob.y; // MMDDCCYY (US)
  const elements = [
    'DAQTEST' + m.memberNo.replace(/\D/g, ''),
    'DCS' + m.last.toUpperCase(),
    'DDEN',
    'DAC' + m.first.toUpperCase(),
    'DDFN',
    'DAD' + (m.middle || 'NONE').toUpperCase(),
    'DDGN',
    'DCU' + (m.suffix || ''),
    'DBB' + dbb,
    'DBC1',
    'DAJDC',
    'DCGUSA'
  ].join('\n');
  const subfile = 'DL' + elements + '\r';
  return '@\n\x1e\rANSI 636000080002DL0041' + String(subfile.length).padStart(4, '0') + subfile;
}

async function main() {
  const db = open(process.env.DB_FILE);
  if (WIPE) {
    db.exec('DELETE FROM checkins; DELETE FROM contact_corrections; DELETE FROM not_found; DELETE FROM audit_log; DELETE FROM members;');
    setConfig(db, 'next_ballot_no', '1');
  }
  const existing = db.prepare('SELECT COUNT(*) c FROM members').get().c;
  if (existing > 0 && !WIPE) {
    console.error(`DB already has ${existing} members. Re-run with --wipe to replace.`);
    process.exit(1);
  }

  const members = [];
  for (let i = 0; i < COUNT; i++) members.push(makeMember(i));

  const ins = db.prepare(`INSERT INTO members
    (member_no, last_name, first_name, middle_name, suffix, full_name, dues_status, dues_ok,
     email, phone, last_updated, info_stale, portal_status, dob, norm_last, norm_first)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const staleDays = 365;
  const pad2 = n => String(n).padStart(2, '0');
  db.transaction(() => {
    for (const m of members) {
      const stale = (!m.email && !m.phone) ||
        (Date.now() - new Date(m.lastUpdated).getTime()) / 86400000 > staleDays ? 1 : 0;
      // Mimic ConnectPlus portal-account states so the check-in banners
      // and green-lane flow can be rehearsed.
      const portal = rnd() < 0.55 ? 'approved' : pick(['nonactive', 'invited', 'pending']);
      const dobIso = m.dob.y + '-' + pad2(m.dob.m) + '-' + pad2(m.dob.d);
      ins.run(m.memberNo, m.last, m.first, m.middle, m.suffix,
        [m.first, m.middle, m.last].filter(Boolean).join(' ') + (m.suffix ? ' ' + m.suffix : ''),
        m.dues, /suspend|delinq|arrear/i.test(m.dues) ? 0 : 1,
        m.email, m.phone, m.lastUpdated, stale, portal, rnd() < 0.5 ? dobIso : null,
        match.normalizeName(m.last), match.normalizeName(m.first));
    }
  })();
  console.log(`Seeded ${members.length} synthetic members into the database.`);

  const outDir = path.join(__dirname, '..', 'seed-output');
  const bcDir = path.join(outDir, 'barcodes');
  fs.mkdirSync(bcDir, { recursive: true });

  // Roster CSV — for practicing the import + column-mapping flow.
  fs.writeFileSync(path.join(outDir, 'roster.csv'), csv.serialize(
    ['Member Name', 'Member Number', 'Dues Status', 'Email Address', 'Cell Phone', 'Last Updated'],
    members.map(m => ({
      'Member Name': m.last + (m.suffix ? ' ' + m.suffix : '') + ', ' + m.first + (m.middle ? ' ' + m.middle : ''),
      'Member Number': m.memberNo,
      'Dues Status': m.dues,
      'Email Address': m.email,
      'Cell Phone': m.phone,
      'Last Updated': m.lastUpdated
    }))));

  // Partial paper roll — every 3rd member, plus two names that won't match.
  const paper = members.filter((_, i) => i % 3 === 0).map(m => ({
    'Name': m.first + ' ' + m.last, 'Member #': m.memberNo
  }));
  paper.push({ 'Name': 'Zebulon Notonroster', 'Member #': '' });
  paper.push({ 'Name': 'Test Unmatched', 'Member #': 'X-9999' });
  fs.writeFileSync(path.join(outDir, 'paper-roll.csv'), csv.serialize(['Name', 'Member #'], paper));

  // AAMVA strings + printable barcodes for the first 24 members.
  const sample = members.slice(0, 24);
  const lines = [];
  for (const m of sample) {
    const s = aamvaString(m);
    lines.push('--- ' + m.memberNo + ' ' + m.last + ', ' + m.first + ' ---');
    lines.push(JSON.stringify(s)); // JSON-escaped so control chars are visible
    const png = await bwipjs.toBuffer({
      bcid: 'pdf417', text: s, scale: 4, padding: 20,
      backgroundcolor: 'FFFFFF' // required: transparent bg breaks decoders
    });
    fs.writeFileSync(path.join(bcDir, m.memberNo + '-' + m.last.replace(/[^A-Za-z]/g, '') + '.png'), png);
  }
  fs.writeFileSync(path.join(outDir, 'aamva-samples.txt'), lines.join('\n') + '\n');

  console.log(`Wrote seed-output/roster.csv, paper-roll.csv, aamva-samples.txt and ${sample.length} barcode PNGs.`);
  console.log('Print the PNGs (or open on a phone) to rehearse camera + USB scanning.');
}

main().catch(e => { console.error(e); process.exit(1); });
