'use strict';
/*
 * The wall board for the union office: one page, readable across a room,
 * printable on a single landscape sheet.
 *
 * It is generated, never hand-typed. Every figure comes out of lib/snapshot
 * reading the real files, so the board cannot drift from the records the way
 * a slide pasted into a document does. When the next checkoff register is
 * read, run this again and put up the new sheet.
 *
 *   node tools/build-dashboard.js                     # newest of everything
 *   node tools/build-dashboard.js --out /tmp/wall.html
 *   node tools/build-dashboard.js --members data/uploads/roster-55 --import 8
 */

const fs = require('fs');
const path = require('path');
const tabular = require('../lib/tabular');
const { membershipSnapshot } = require('../lib/snapshot');

const ROOT = path.join(__dirname, '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** The highest-numbered roster export on disk — the most recent one Joe pulled. */
function newestRoster() {
  const files = fs.readdirSync(UPLOADS).filter(f => /^roster-\d+$/.test(f));
  if (!files.length) throw new Error('no roster export in ' + UPLOADS);
  files.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  return path.join(UPLOADS, files[files.length - 1]);
}

const records = (file, hint) => tabular.parseUpload(fs.readFileSync(file), hint).records;

const n = (v) => Number(v).toLocaleString('en-US');
const money = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (v) => '$' + Math.round(Number(v)).toLocaleString('en-US');
const pct = (part, whole) => whole ? (part / whole * 100) : 0;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** dd Month yyyy, from an ISO date, for people rather than machines. */
function niceDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

function build() {
  const membersFile = arg('members', newestRoster());
  const iaffFile = arg('iaff', path.join(UPLOADS, 'iaff-latest.csv'));
  const outFile = arg('out', path.join(ROOT, 'data', 'dashboard.html'));

  const { open } = require('../lib/db');
  const db = open();
  const imp = arg('import')
    ? db.prepare('SELECT * FROM imports WHERE id = ?').get(Number(arg('import')))
    : db.prepare(`SELECT * FROM imports WHERE status = 'ready'
                  ORDER BY COALESCE(NULLIF(report_date,''), substr(uploaded_at,1,10)) DESC, id DESC
                  LIMIT 1`).get();
  if (!imp) throw new Error('no finalized dues register to read');
  const rows = db.prepare(`SELECT emplid, last_name, first_name, amount_goal, amount_taken
                           FROM rows WHERE import_id = ? AND excluded = 0`).all(imp.id);

  const members = records(membersFile, 'roster.xlsx');
  const iaff = fs.existsSync(iaffFile) ? records(iaffFile, 'iaff.csv') : [];
  const s = membershipSnapshot(members, rows, iaff);

  // the small emblem: it renders about 100px wide, so the 768px master is
  // three hundred wasted kilobytes on a page that may live on an office TV
  const emblemFile = ['local36-emblem-384.png', 'local36-emblem.png']
    .map(f => path.join(ROOT, 'assets', f)).find(fs.existsSync);
  const emblem = fs.readFileSync(emblemFile).toString('base64');
  const rosterDate = niceDate(fs.statSync(membersFile).mtime.toISOString());
  const html = render(s, {
    emblem,
    registerDate: niceDate(imp.report_date),
    rosterDate,
    perCapitaRate: s.perCapita.rate,
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log('wrote', outFile, '(' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB)');
  console.log('  paying dues', s.register.paying, '| active', s.roll.active,
    '| active retired', s.roll.activeRetired, '| roll', s.roll.total);
  console.log('  deducted', money(s.register.taken), 'per period ·', money0(s.register.takenPerYear), 'a year');
  return outFile;
}

function render(s, o) {
  const bar = [
    ['Active', s.roll.active, 'var(--brand)'],
    ['Active Retired', s.roll.activeRetired, 'var(--green)'],
    ['Retired', s.roll.retired, 'var(--blue)'],
    ['Dropped', s.roll.drop, 'var(--gold)'],
    ['Alumni, Life, Honorary, deceased, unfiled', s.roll.other, 'var(--rule-firm)'],
  ];
  const seg = bar.map(([, count, colour]) =>
    `<span style="width:${pct(count, s.roll.total).toFixed(2)}%;background:${colour}"></span>`).join('');
  const legend = bar.map(([label, count, colour]) =>
    `<div class="leg"><i style="background:${colour}"></i><span>${esc(label)}</span><b class="mono">${n(count)}</b></div>`).join('\n        ');

  return `<title>Membership at a Glance</title>
<style>
  /* Wall board for the union office. Two jobs: legible from across the room
     on a screen, and one landscape page on paper. Same register-paper family
     as the board presentation so the two read as one body of work. */
  :root {
    --ground:#F1F1EE; --paper:#FBFBF9; --bar:#E6EBE4; --rule:#D3D5CE; --rule-firm:#B4B8AE;
    --ink:#16181A; --ink-soft:#5C625C; --ink-faint:#858A83;
    --brand:#C8102E; --green:#2C6141; --gold:#96681A; --gold-wash:#F6EBD6; --blue:#2A5570;
    --emblem: url("data:image/png;base64,${o.emblem}");
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#131513; --paper:#1B1E1B; --bar:#202420; --rule:#2E332E; --rule-firm:#434A43;
      --ink:#E9EBE6; --ink-soft:#A0A79F; --ink-faint:#7C837B;
      --brand:#FF6B6B; --green:#78BC91; --gold:#D8A648; --gold-wash:#2E2515; --blue:#8FBBD8;
    }
  }
  :root[data-theme="dark"] {
    --ground:#131513; --paper:#1B1E1B; --bar:#202420; --rule:#2E332E; --rule-firm:#434A43;
    --ink:#E9EBE6; --ink-soft:#A0A79F; --ink-faint:#7C837B;
    --brand:#FF6B6B; --green:#78BC91; --gold:#D8A648; --gold-wash:#2E2515; --blue:#8FBBD8;
  }

  * { box-sizing: border-box; }
  body { background: var(--ground); color: var(--ink); margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; }
  .board { max-width: 1600px; margin: 0 auto; padding: clamp(16px, 2vw, 34px) clamp(18px, 2.6vw, 44px); }
  .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums; }

  .top { display: flex; align-items: center; gap: clamp(14px, 1.6vw, 26px);
    border-bottom: 3px solid var(--brand); padding-bottom: clamp(12px, 1.6vh, 20px); }
  .emblem { width: clamp(62px, 6.5vw, 100px); aspect-ratio: 1; flex: none;
    background: var(--emblem) center / contain no-repeat; }
  .who { flex: 1 1 260px; }
  .who .name { font-size: clamp(14px, 1.4vw, 21px); line-height: 1.25; color: var(--ink-soft); }
  .who .name b { display: block; color: var(--brand); font-weight: 800;
    font-size: clamp(19px, 2vw, 30px); letter-spacing: .01em; }
  .who .title { font-family: ui-monospace, Menlo, monospace; text-transform: uppercase;
    letter-spacing: .18em; font-size: clamp(10px, .95vw, 13px); color: var(--ink-faint); margin-top: .5em; }
  .asof { text-align: right; font-family: ui-monospace, Menlo, monospace;
    font-size: clamp(10px, .95vw, 13px); letter-spacing: .08em; text-transform: uppercase;
    color: var(--ink-faint); line-height: 1.8; }
  .asof b { color: var(--ink); }

  .hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: clamp(16px, 2.2vw, 40px); align-items: center; background: var(--paper);
    border: 1px solid var(--rule); border-left: 8px solid var(--brand);
    padding: clamp(14px, 2vh, 26px) clamp(18px, 2vw, 38px); margin-top: clamp(12px, 1.6vh, 20px); }
  .hero .n { font-size: clamp(64px, 11vw, 156px); font-weight: 800; letter-spacing: -.045em;
    line-height: .88; color: var(--brand); }
  .hero .k { font-size: clamp(15px, 1.8vw, 28px); font-weight: 700; margin-top: .35em; color: var(--ink); }
  .hero p { font-size: clamp(13px, 1.2vw, 18px); color: var(--ink-soft); margin: .4em 0 0; max-width: 44ch; }

  .grid { display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule);
    margin-top: clamp(10px, 1.4vh, 18px);
    grid-template-columns: repeat(auto-fit, minmax(min(185px, 100%), 1fr)); }
  .cell { background: var(--paper); padding: clamp(12px, 1.7vh, 22px) clamp(13px, 1.3vw, 21px); }
  .cell .n { display: block; font-size: clamp(30px, 3.7vw, 54px); font-weight: 700;
    letter-spacing: -.035em; line-height: 1; }
  .cell .k { display: block; font-size: clamp(11px, 1vw, 14px); letter-spacing: .09em;
    text-transform: uppercase; color: var(--ink-faint); margin-top: .7em; line-height: 1.35; }
  .cell .sub { display: block; font-size: clamp(11px, 1vw, 14px); color: var(--ink-soft); margin-top: .4em; }
  .cell.b .n { color: var(--green); }
  .cell.c .n { color: var(--blue); }
  .cell.d .n { color: var(--gold); }

  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr));
    gap: clamp(12px, 1.5vw, 24px); margin-top: clamp(10px, 1.4vh, 18px); }
  .panel { background: var(--paper); border: 1px solid var(--rule);
    padding: clamp(14px, 1.9vh, 24px) clamp(15px, 1.5vw, 24px); }
  .panel h2 { font-size: clamp(11px, 1vw, 14px); letter-spacing: .14em; text-transform: uppercase;
    color: var(--ink-faint); margin: 0 0 .9em; font-weight: 700; }
  .money { font-size: clamp(26px, 3.4vw, 48px); font-weight: 750; letter-spacing: -.035em;
    color: var(--green); line-height: 1; }
  .money-k { font-size: clamp(12px, 1.1vw, 16px); color: var(--ink-soft); margin-top: .5em; }
  .money-2 { font-size: clamp(16px, 1.8vw, 25px); font-weight: 700; color: var(--ink);
    margin-top: .8em; letter-spacing: -.02em; }
  .money-2 em { font-style: normal; font-weight: 600; color: var(--ink-soft); font-size: .62em; }

  .stack { display: flex; height: clamp(24px, 3vh, 36px); border: 1px solid var(--rule-firm);
    overflow: hidden; margin-bottom: .9em; }
  .stack span { display: block; }
  .legend { display: grid; gap: .45em; }
  .leg { display: grid; grid-template-columns: 13px 1fr auto; gap: .7em; align-items: center;
    font-size: clamp(12px, 1.1vw, 16px); }
  .leg i { width: 13px; height: 13px; display: block; border: 1px solid var(--rule-firm); }
  .leg span { color: var(--ink-soft); }
  .leg b { font-weight: 700; }

  .work { margin-top: clamp(10px, 1.4vh, 18px); border: 1px solid var(--rule);
    border-left: 8px solid var(--gold); background: var(--gold-wash);
    padding: clamp(13px, 1.7vh, 22px) clamp(15px, 1.5vw, 24px); }
  .work h2 { font-size: clamp(11px, 1vw, 14px); letter-spacing: .14em; text-transform: uppercase;
    color: var(--ink); margin: 0 0 .8em; font-weight: 700; }
  .work ul { list-style: none; margin: 0; padding: 0; display: grid; gap: clamp(8px, 1vw, 16px);
    grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); }
  .work li { display: flex; align-items: baseline; gap: .5em; font-size: clamp(12px, 1.1vw, 16px); color: var(--ink); }
  .work li b { font-size: clamp(21px, 2.3vw, 34px); font-weight: 750; letter-spacing: -.03em;
    color: var(--gold); line-height: 1; }

  footer { margin-top: clamp(10px, 1.4vh, 16px); border-top: 1px solid var(--rule);
    padding-top: clamp(9px, 1.2vh, 16px); font-size: clamp(11px, .95vw, 13px); color: var(--ink-faint);
    display: flex; justify-content: space-between; gap: 1.5em; flex-wrap: wrap; }

  @media print {
    @page { size: landscape; margin: 9mm; }
    :root { --ground:#FFFFFF; --paper:#FFFFFF; }
    body { background: #fff; }
    .board { padding: 0; max-width: none; }
    .hero .n { font-size: 120px; }
    .cell .n { font-size: 40px; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>

<div class="board">

  <div class="top">
    <div class="emblem" role="img" aria-label="IAFF Local 36 emblem"></div>
    <div class="who">
      <div class="name">Fire Fighters Association, District of Columbia<b>IAFF LOCAL 36</b></div>
      <div class="title">Membership at a glance</div>
    </div>
    <div class="asof">
      Dues checkoff of <b>${esc(o.registerDate)}</b><br>
      Membership records as of <b>${esc(o.rosterDate)}</b>
    </div>
  </div>

  <div class="hero">
    <div>
      <div class="n mono">${n(s.register.paying)}</div>
      <div class="k">brothers and sisters paying dues</div>
    </div>
    <p>Every one of them verified line by line against the District's payroll
      checkoff register. Not estimated, not carried forward from last year.
      This is the number the local can prove.</p>
  </div>

  <div class="grid">
    <div class="cell"><span class="n mono">${n(s.roll.active)}</span><span class="k">Active members</span><span class="sub">on the job today</span></div>
    <div class="cell b"><span class="n mono">${n(s.roll.activeRetired)}</span><span class="k">Active Retired</span><span class="sub">retirees paid up for ${s.dues.year}</span></div>
    <div class="cell c"><span class="n mono">${n(s.roll.total)}</span><span class="k">Records on the roll</span><span class="sub">active, retired and separated</span></div>
    <div class="cell d"><span class="n mono">${s.payroll.activePct}%</span><span class="k">Active members tied to a paycheck</span><span class="sub">${n(s.payroll.active)} of ${n(s.roll.active)} carry their payroll number</span></div>
  </div>

  <div class="two">
    <div class="panel">
      <h2>Dues coming out of the checks</h2>
      <div class="money mono">${money(s.register.taken)}</div>
      <div class="money-k">deducted every pay period</div>
      <div class="money-2 mono">${money0(s.register.takenPerYear)} <em>a year, at 26 pay periods</em></div>
    </div>

    <div class="panel">
      <h2>The roll, by standing</h2>
      <div class="stack" aria-hidden="true">${seg}</div>
      <div class="legend">
        ${legend}
      </div>
    </div>
  </div>

  <div class="work">
    <h2>Open on the books — worked one member at a time</h2>
    <ul>
      <li><b class="mono">${n(s.perCapita.activeGap)}</b> paying members the International does not carry</li>
      <li><b class="mono">${n(s.register.payersWithNoRecord)}</b> paying dues with no record yet</li>
      <li><b class="mono">${n(s.register.payersNumberUnsettled)}</b> payroll numbers to confirm against the scan</li>
      <li><b class="mono">${n(s.roll.active - s.payroll.active)}</b> active members with no payroll number</li>
      <li><b class="mono">${n(s.register.zero)}</b> deducting $0.00</li>
    </ul>
  </div>

  <footer>
    <div>Built from the DCHR dues checkoff register, the local's membership records and the International's roll.</div>
    <div>Regenerated every time a new checkoff register is read.</div>
  </footer>

</div>
`;
}

if (require.main === module) {
  try { build(); } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { build, render };
