'use strict';
/*
 * Build realistic fake "scanned" dues reports for rehearsal and testing:
 *
 *   node scripts/make-test-scan.js [rows]     (default 170; use 1700 for a
 *                                              full-size 52-page stress run)
 *
 * Writes to seed-output/ (gitignored):
 *   dues-scan-A.pdf   first biweekly report  (image-only PDF — forces OCR)
 *   dues-scan-B.pdf   next report: ~7% stopped, ~6% new, ~5% grade/step
 *                     changes, 2 name changes
 *   truth.json        exactly what's in each + the expected comparison
 *
 * The pages are laid out like the real payroll register (emplid first, a
 * department number starting with 1 mid-row — the classic parser trap),
 * rendered to pixels, roughed up with scanner noise, and wrapped back into
 * a PDF as plain page images: no text layer, the OCR path has to work.
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', '..', 'seed-output');
const TOTAL = parseInt(process.argv[2] || '170', 10);
const ROWS_PER_PAGE = 33;
const ZOOM = 2.78;             // ~200 dpi — a typical office-scanner setting

// Deterministic PRNG so every run builds the same fixture.
let seed = 361936;
function rnd() {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const pick = a => a[Math.floor(rnd() * a.length)];

const LASTS = ['SMITH', 'JOHNSON', 'WILLIAMS', 'BROWN', 'JONES', 'GARCIA', 'MILLER', 'DAVIS',
  'RODRIGUEZ', 'MARTINEZ', 'WILSON', 'ANDERSON', 'TAYLOR', 'THOMAS', 'MOORE', 'JACKSON',
  'WHITE', 'HARRIS', 'MARTIN', 'THOMPSON', 'ROBINSON', 'CLARK', 'LEWIS', 'WALKER', 'HALL',
  'YOUNG', 'KING', 'WRIGHT', 'SCOTT', 'GREEN', 'BAKER', 'ADAMS', 'NELSON', 'CARTER',
  'MITCHELL', 'TURNER', 'PHILLIPS', 'CAMPBELL', 'PARKER', 'EVANS', 'EDWARDS', 'COLLINS',
  'STEWART', 'MORRIS', 'MURPHY', 'COOK', 'ROGERS', 'BELL', 'BAILEY', 'COOPER', 'RICHARDSON',
  'HOWARD', 'WARD', 'PETERSON', 'GRAY', 'JAMES', 'BROOKS', 'SANDERS', 'BENNETT', 'BARNES',
  'OBRIEN', 'PAPARIELLO', 'DIAZ', 'WASHINGTON', 'BUTLER', 'SIMMONS', 'FOSTER', 'GONZALES',
  'BRYANT', 'ALEXANDER', 'RUSSELL', 'GRIFFIN', 'HAYES', 'MYERS', 'FORD', 'HAMILTON',
  'GRAHAM', 'SULLIVAN', 'WALLACE', 'WOODS', 'COLE', 'WEST', 'JORDAN', 'OWENS', 'REYES',
  'FISHER', 'ELLIS', 'HARRISON', 'GIBSON', 'MCDONALD', 'CRUZ', 'MARSHALL', 'ORTIZ',
  'GOMEZ', 'MURRAY', 'FREEMAN', 'WELLS', 'WEBB', 'SIMPSON', 'STEVENS', 'TUCKER', 'PORTER'];
const FIRSTS = ['JAMES', 'JOHN', 'ROBERT', 'MICHAEL', 'WILLIAM', 'DAVID', 'RICHARD', 'JOSEPH',
  'THOMAS', 'CHARLES', 'CHRISTOPHER', 'DANIEL', 'MATTHEW', 'ANTHONY', 'DONALD', 'MARK',
  'PAUL', 'STEVEN', 'ANDREW', 'KENNETH', 'GEORGE', 'KEVIN', 'BRIAN', 'EDWARD', 'RONALD',
  'TIMOTHY', 'JASON', 'JEFFREY', 'RYAN', 'JACOB', 'MARY', 'PATRICIA', 'JENNIFER', 'LINDA',
  'ELIZABETH', 'BARBARA', 'SUSAN', 'JESSICA', 'SARAH', 'KAREN', 'NANCY', 'LISA', 'BETTY',
  'MARGARET', 'SANDRA', 'ASHLEY', 'KIMBERLY', 'EMILY', 'DONNA', 'MICHELLE', 'TYRONE',
  'DARNELL', 'ANDRE', 'MARCUS', 'TERRELL', 'JUAN', 'CARLOS', 'LUIS', 'JOSE', 'MIGUEL'];
const GRADES = ['FF-01', 'FF-02', 'FF-03', 'TEC-01', 'SGT-01', 'LT-01', 'CPT-01', 'PM-02'];

function makeRoster(n) {
  const used = new Set();
  const roster = [];
  while (roster.length < n) {
    const emplid = '0' + String(Math.floor(rnd() * 1e7)).padStart(7, '0');
    if (used.has(emplid)) continue;
    used.add(emplid);
    roster.push({
      emplid,
      last: pick(LASTS), first: pick(FIRSTS),
      middle: rnd() < 0.6 ? String.fromCharCode(65 + Math.floor(rnd() * 26)) : '',
      dept: '1' + String(Math.floor(rnd() * 9000) + 1000),   // starts with 1 — the trap
      grade: pick(GRADES), step: String(1 + Math.floor(rnd() * 10))
    });
  }
  roster.sort((a, b) => (a.last + a.first).localeCompare(b.last + b.first));
  return roster;
}

// ---------- text-PDF builder (Courier, fixed columns, base-14 font) ----------
function pdfEscape(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

function reportPages(rows, dateLabel) {
  const pages = [];
  const nPages = Math.ceil(rows.length / ROWS_PER_PAGE);
  for (let p = 0; p < nPages; p++) {
    const lines = [
      'DISTRICT OF COLUMBIA - FIRE AND EMS DEPARTMENT',
      'UNION DUES DEDUCTION REGISTER          PAY PERIOD ENDING ' + dateLabel,
      '',
      'EMPLID    NAME                            DEPT   GRADE   STEP'
    ];
    for (const r of rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)) {
      const name = (r.last + ',' + r.first + (r.middle ? ' ' + r.middle : '')).padEnd(32);
      lines.push(r.emplid + '  ' + name + r.dept.padEnd(7) + r.grade.padEnd(8) + r.step);
    }
    lines.push('', 'PAGE ' + (p + 1) + ' OF ' + nPages + '          RUN DATE ' + dateLabel);
    pages.push(lines);
  }
  return pages;
}

function buildTextPdf(pages) {
  const objs = [];   // 1-indexed
  const add = body => { objs.push(body); return objs.length; };
  const fontRef = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pageRefs = [];
  const contentRefs = [];
  for (const lines of pages) {
    let s = 'BT /F1 9 Tf 36 756 Td 13 TL\n';
    for (const ln of lines) s += '(' + pdfEscape(ln) + ') Tj T*\n';
    s += 'ET';
    contentRefs.push(add('<< /Length ' + s.length + ' >>\nstream\n' + s + '\nendstream'));
  }
  for (const cr of contentRefs) {
    pageRefs.push(add('<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 ' + fontRef + ' 0 R >> >> /Contents ' + cr + ' 0 R >>'));
  }
  const realPagesRef = add('<< /Type /Pages /Kids [' +
    pageRefs.map(r => r + ' 0 R').join(' ') + '] /Count ' + pageRefs.length + ' >>');
  const catRef = add('<< /Type /Catalog /Pages ' + realPagesRef + ' 0 R >>');
  for (let i = 0; i < objs.length; i++) objs[i] = objs[i].replace(/PAGES 0 R/g, realPagesRef + ' 0 R');
  return assemblePdf(objs, catRef);
}

function assemblePdf(objs, catRef) {
  let out = '%PDF-1.4\n';
  const offsets = [0];
  const chunks = [Buffer.from(out, 'latin1')];
  let pos = chunks[0].length;
  objs.forEach((body, i) => {
    offsets.push(pos);
    const b = Buffer.from((i + 1) + ' 0 obj\n' + body + '\nendobj\n', 'latin1');
    chunks.push(b); pos += b.length;
  });
  const xrefPos = pos;
  let xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catRef + ' 0 R >>\n' +
    'startxref\n' + xrefPos + '\n%%EOF\n';
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

// ---------- rasterize + noise + rebuild as image-only PDF ----------
function addNoise(gray, w, h, uglyBands) {
  // Global scanner grain.
  for (let i = 0; i < gray.length; i++) {
    const n = (rnd() + rnd() - 1) * 20;
    let v = gray[i] + n;
    gray[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  // Dust specks.
  const specks = Math.floor(w * h / 220000);
  for (let sp = 0; sp < specks * 6; sp++) {
    const x = Math.floor(rnd() * (w - 3)), y = Math.floor(rnd() * (h - 3));
    const dark = rnd() < 0.6 ? 30 : 235;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) gray[(y + dy) * w + x + dx] = dark;
  }
  // "Toner fade" bands over chosen rows — guarantees review-queue content.
  for (const band of uglyBands) {
    for (let y = band.y0; y < band.y1 && y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (gray[i] < 128 && rnd() < 0.42) gray[i] = 128 + rnd() * 100;  // eat the ink
      }
    }
  }
}

function buildImagePdf(images) {
  const objs = [];
  const add = body => { objs.push(body); return objs.length; };
  const pageRefs = [], parts = [];
  for (const img of images) {
    const data = zlib.deflateSync(Buffer.from(img.gray));
    parts.push({ data,
      dict: '<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h +
        ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ' + data.length + ' >>' });
  }
  const imgRefs = parts.map(p2 => add(p2)); // placeholder objects — handled in assemble
  for (let i = 0; i < images.length; i++) {
    const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
    const cRef = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    pageRefs.push(add('<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /XObject << /Im0 ' + imgRefs[i] + ' 0 R >> >> /Contents ' + cRef + ' 0 R >>'));
  }
  const pagesRef = add('<< /Type /Pages /Kids [' + pageRefs.map(r => r + ' 0 R').join(' ') +
    '] /Count ' + pageRefs.length + ' >>');
  const catRef = add('<< /Type /Catalog /Pages ' + pagesRef + ' 0 R >>');
  for (let i = 0; i < objs.length; i++) {
    if (typeof objs[i] === 'string') objs[i] = objs[i].replace(/PAGES 0 R/g, pagesRef + ' 0 R');
  }
  // Assemble with binary streams.
  const chunks = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let pos = chunks[0].length;
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(pos);
    let b;
    if (typeof body === 'string') {
      b = Buffer.from((i + 1) + ' 0 obj\n' + body + '\nendobj\n', 'latin1');
    } else {
      b = Buffer.concat([
        Buffer.from((i + 1) + ' 0 obj\n' + body.dict + '\nstream\n', 'latin1'),
        body.data,
        Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    }
    chunks.push(b); pos += b.length;
  });
  let xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catRef + ' 0 R >>\n' +
    'startxref\n' + pos + '\n%%EOF\n';
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

async function scanify(textPdf, uglyRowsPerPage) {
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(new Uint8Array(textPdf), 'application/pdf');
  const n = doc.countPages();
  const images = [];
  for (let p = 0; p < n; p++) {
    const page = doc.loadPage(p);
    const pix = page.toPixmap(mupdf.Matrix.scale(ZOOM, ZOOM), mupdf.ColorSpace.DeviceGray, false, false);
    const w = pix.getWidth(), h = pix.getHeight(), stride = pix.getStride();
    const px = pix.getPixels();
    const gray = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) gray.set(px.subarray(y * stride, y * stride + w), y * w);
    pix.destroy(); page.destroy();

    // Rows sit after 4 header lines: baseline of visual line i is at
    // 756 - 13*i pt; convert the chosen data rows to pixel bands.
    const bands = (uglyRowsPerPage[p] || []).map(rowIdx => {
      const baselinePt = 756 - 13 * (4 + rowIdx);
      return { y0: Math.round((792 - baselinePt - 8) * ZOOM), y1: Math.round((792 - baselinePt + 3) * ZOOM) };
    });
    addNoise(gray, w, h, bands);
    images.push({ gray, w, h });
  }
  doc.destroy();
  return buildImagePdf(images);
}

// ---------- main ----------
(async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rosterA = makeRoster(TOTAL);

  // Report B: some stop, some join, some change grade/step, two change names.
  const nStop = Math.max(3, Math.round(TOTAL * 0.07));
  const nNew = Math.max(2, Math.round(TOTAL * 0.06));
  const nGrade = Math.max(2, Math.round(TOTAL * 0.05));
  const stopped = [];
  const rosterB = rosterA.slice();
  for (let i = 0; i < nStop; i++) {
    const idx = Math.floor(rnd() * rosterB.length);
    stopped.push(rosterB.splice(idx, 1)[0]);
  }
  const added = makeRoster(nNew * 3).filter(r => !rosterA.some(a => a.emplid === r.emplid)).slice(0, nNew);
  rosterB.push(...added);
  const changed = [];
  const shuffled = rosterB.filter(r => !added.includes(r)).slice();
  for (let i = 0; i < nGrade; i++) {
    const r = shuffled[Math.floor(rnd() * shuffled.length)];
    if (changed.some(c => c.emplid === r.emplid)) { i--; continue; }
    const before = { grade: r.grade, step: r.step };
    const j = rosterB.findIndex(x => x.emplid === r.emplid);
    rosterB[j] = { ...r, step: String(Math.min(10, parseInt(r.step, 10) + 1)),
      grade: rnd() < 0.3 ? pick(GRADES) : r.grade };
    changed.push({ emplid: r.emplid, name: r.last + ',' + r.first, before,
      after: { grade: rosterB[j].grade, step: rosterB[j].step } });
  }
  // Two name changes (e.g. marriage) — emplid stays, last name changes.
  const nameChanged = [];
  for (let i = 0; i < 2 && i < rosterB.length; i++) {
    const j = rosterB.findIndex((x, k) => k > i * 7 && !added.includes(x) &&
      !changed.some(c => c.emplid === x.emplid) && !nameChanged.some(c => c.emplid === x.emplid));
    if (j < 0) break;
    const oldLast = rosterB[j].last;
    rosterB[j] = { ...rosterB[j], last: pick(LASTS.filter(l => l !== oldLast)) };
    nameChanged.push({ emplid: rosterB[j].emplid, from: oldLast, to: rosterB[j].last });
  }
  rosterB.sort((a, b) => (a.last + a.first).localeCompare(b.last + b.first));

  // Ugly (toner-fade) rows: ~4% of data rows on each report.
  const uglyFor = roster => {
    const nPages = Math.ceil(roster.length / ROWS_PER_PAGE);
    const map = {};
    for (let p = 0; p < nPages; p++) {
      const rowsOnPage = Math.min(ROWS_PER_PAGE, roster.length - p * ROWS_PER_PAGE);
      map[p] = [];
      for (let i = 0; i < rowsOnPage; i++) if (rnd() < 0.04) map[p].push(i);
    }
    return map;
  };

  console.log(`Report A: ${rosterA.length} rows · Report B: ${rosterB.length} rows`);
  console.log('rendering + noising A…');
  const pdfA = await scanify(buildTextPdf(reportPages(rosterA, '07/04/2026')), uglyFor(rosterA));
  fs.writeFileSync(path.join(OUT_DIR, 'dues-scan-A.pdf'), pdfA);
  console.log('rendering + noising B…');
  const pdfB = await scanify(buildTextPdf(reportPages(rosterB, '07/18/2026')), uglyFor(rosterB));
  fs.writeFileSync(path.join(OUT_DIR, 'dues-scan-B.pdf'), pdfB);

  fs.writeFileSync(path.join(OUT_DIR, 'truth.json'), JSON.stringify({
    totalA: rosterA.length, totalB: rosterB.length,
    rosterA, rosterB,
    expected: {
      stopped: stopped.map(r => ({ emplid: r.emplid, name: r.last + ',' + r.first })),
      new: added.map(r => ({ emplid: r.emplid, name: r.last + ',' + r.first })),
      gradeStepChanged: changed,
      nameChanged
    }
  }, null, 2));
  console.log(`wrote ${OUT_DIR}/dues-scan-A.pdf, dues-scan-B.pdf, truth.json`);
  console.log(`expected: ${stopped.length} stopped, ${added.length} new, ` +
    `${changed.length} grade/step changes, ${nameChanged.length} name changes`);
})().catch(e => { console.error(e); process.exit(1); });
