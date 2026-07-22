'use strict';
/*
 * Turn OCR output (words with boxes + confidence) into parsed report rows.
 *
 * The payroll dues report is a fixed-ish table: emplid, name (LAST,FIRST M),
 * then trailing columns (grade, step, sometimes more). Row detection anchors
 * on the emplid pattern 0\d{7}. IMPORTANT: department numbers on the same
 * report start with 1 — anchoring on "any 8-digit number" grabs those and
 * shifts every column (a real bug from the first prototype). Emplids start
 * with 0, dept numbers never do.
 */
const match = require('./match');

const EMPLID_RE = /^0\d{7}$/;

// Common OCR digit confusions, applied only when testing whether a token
// could be an emplid. Conservative on purpose — D/G/T are left alone.
const DIGIT_FIX = { O: '0', o: '0', Q: '0', I: '1', l: '1', '|': '1', '!': '1', i: '1', S: '5', s: '5', B: '8', Z: '2', z: '2' };

function digitize(tok) {
  let out = '', fixes = 0;
  for (const ch of tok) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (DIGIT_FIX[ch]) { out += DIGIT_FIX[ch]; fixes++; }
    else return null;                       // a char no digit could look like
  }
  return { value: out, fixes };
}

/** If tok plausibly reads as an emplid (0 + 7 digits), return the cleaned
 *  value and how many characters needed fixing; else null. */
function asEmplid(tok) {
  const t = String(tok).replace(/[.,]/g, '');   // stray scan specks
  const d = digitize(t);
  if (!d || d.value.length !== 8 || d.fixes > 3) return null;
  if (d.value[0] !== '0') return null;          // dept numbers start with 1
  return d;
}

function letterCount(t) { return (t.match(/[A-Za-z]/g) || []).length; }
function digitCount(t) { return (t.match(/\d/g) || []).length; }

const HEADER_RE = /EMPL\s?ID|EMPLID|\bNAME\b|\bGRADE\b|\bSTEP\b|\bPAGE\b|REPORT|REGISTER|DEDUCT|DEPARTMENT|RUN\s?DATE|TOTAL|UNION\s?DUES|AGENCY|EMPLOYEE/i;
// A "LAST,FIRST"-shaped fragment — the signature of a member row even when
// the emplid was mangled beyond recognition.
const NAMEISH_RE = /[A-Za-z]{2,}\s?[.,]\s?[A-Za-z]{2,}/;

/**
 * Group a page's OCR words into visual rows by vertical position.
 * words: [{ text, conf, x0, y0, x1, y1 }] — pixel coords.
 * Returns rows sorted top-to-bottom, words within a row left-to-right.
 */
function clusterRows(words) {
  const ws = words.filter(w => w.text && w.text.trim());
  if (!ws.length) return [];
  const heights = ws.map(w => w.y1 - w.y0).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 12;
  ws.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  let cur = null, curMid = 0;
  for (const w of ws) {
    const mid = (w.y0 + w.y1) / 2;
    if (cur && Math.abs(mid - curMid) <= medH * 0.6) {
      cur.push(w);
      curMid = cur.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / cur.length;
    } else {
      cur = [w]; curMid = mid; rows.push(cur);
    }
  }
  for (const r of rows) r.sort((a, b) => a.x0 - b.x0);
  return rows;
}

/** Split "LAST,FIRST M" (or best effort without a comma) into parts. */
function splitName(nameRaw) {
  const reasons = [];
  let last = '', first = '', middle = '';
  const cleaned = nameRaw.replace(/\s*,\s*/g, ',').trim();
  if (cleaned.includes(',')) {
    const i = cleaned.indexOf(',');
    last = cleaned.slice(0, i).trim();
    const rest = cleaned.slice(i + 1).trim().split(/\s+/).filter(Boolean);
    first = rest[0] || '';
    middle = rest.slice(1).join(' ');
  } else {
    const toks = cleaned.split(/\s+/).filter(Boolean);
    if (toks.length >= 2) { last = toks[0]; first = toks[1]; middle = toks.slice(2).join(' '); }
    else last = cleaned;
    reasons.push('name missing comma');
  }
  if (!first) reasons.push('no first name read');
  return { last, first, middle, reasons };
}

/**
 * Parse one visual row (array of word objects) into a report row, or null
 * if it's a header/footer/junk line. Never silently drops anything that
 * looks like it could be a member — those come back flagged for review.
 */
function parseRow(rowWords) {
  const toks = rowWords.map(w => w.text.trim()).filter(Boolean);
  if (toks.length < 2) return null;
  const joined = toks.join(' ');

  // Find the emplid anchor.
  let anchorIdx = -1, emplid = '', emplidFixes = 0;
  for (let i = 0; i < toks.length; i++) {
    const e = asEmplid(toks[i]);
    if (e) { anchorIdx = i; emplid = e.value; emplidFixes = e.fixes; break; }
  }

  if (anchorIdx === -1) {
    if (HEADER_RE.test(joined) || !NAMEISH_RE.test(joined)) return null; // header / junk
    // Looks like a person but no readable emplid — surface it, don't drop it.
    const nm = splitName(joined.replace(/[^A-Za-z ,.'-]/g, ' ').replace(/\s+/g, ' ').trim());
    return finish(rowWords, {
      emplid: '', name: joined, ...nm,
      grade: '', step: '',
      reasons: ['no emplid readable on this line', ...nm.reasons],
      forceReview: true
    });
  }

  // Everything after the anchor: name, then trailing columns. Parsed from
  // the RIGHT — step is the last 1–2 digit number near the end, grade sits
  // just before it — so letter-bearing grades ("FF-1") never get swallowed
  // into the name, and extra columns (amounts, ssn4) don't shift anything.
  const after = toks.slice(anchorIdx + 1);
  let stepIdx = -1;
  for (let i = after.length - 1; i >= Math.max(0, after.length - 4); i--) {
    const d = digitize(after[i].replace(/[.,]/g, ''));
    if (d && d.value.length >= 1 && d.value.length <= 2) { stepIdx = i; break; }
  }
  let grade = '', step = '', nameEnd;
  if (stepIdx > 0) {
    step = String(parseInt(digitize(after[stepIdx].replace(/[.,]/g, '')).value, 10));
    grade = after[stepIdx - 1];
    nameEnd = stepIdx - 1;
    // A grade should be short and not name-shaped; if it looks like part of
    // the name (e.g. step read but grade column empty), give it back.
    if (grade.length > 8 || grade.includes(',')) { nameEnd = stepIdx; grade = ''; }
  } else {
    nameEnd = after.length;
  }
  const nameToks = after.slice(0, nameEnd);
  // Strip digit-heavy tokens (ssn4, amounts) off the end of the name.
  while (nameToks.length && digitCount(nameToks[nameToks.length - 1]) > letterCount(nameToks[nameToks.length - 1])) {
    nameToks.pop();
  }
  // Scan specks read as stray punctuation; the report prints "LAST,FIRST"
  // with no space — canonicalize so OCR tokenization noise isn't a "diff".
  // Grades print in CAPS: case-fold and drop non-ASCII junk so "CpT-01" /
  // "FF¥F-02" style misreads can't masquerade as grade changes.
  grade = grade.replace(/[^\x20-\x7E]/g, '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toUpperCase();
  const nameRaw = nameToks.join(' ').replace(/\s*,\s*/g, ',').trim();
  const nm = splitName(nameRaw);
  const reasons = [...nm.reasons];
  if (emplidFixes > 0) reasons.push(`emplid needed ${emplidFixes} character fix${emplidFixes > 1 ? 'es' : ''}`);
  if (!nameRaw) reasons.push('no name read');
  if (!grade) reasons.push('no grade read');
  if (!step) reasons.push('no step read');

  return finish(rowWords, { emplid, name: nameRaw, ...nm, grade, step, reasons, emplidFixes });
}

function finish(rowWords, p) {
  const confs = rowWords.map(w => (typeof w.conf === 'number' ? w.conf : 100));
  const avg = confs.reduce((s, c) => s + c, 0) / (confs.length || 1);
  let conf = avg - (p.emplidFixes || 0) * 6;
  if (p.forceReview) conf = Math.min(conf, 40);
  if (!p.grade || !p.step) conf = Math.min(conf, 70);
  if (p.reasons.some(r => r.includes('comma'))) conf = Math.min(conf, 75);
  // Structural cross-check: a clean-pattern emplid, a comma name, and
  // grade/step in their expected shapes are evidence independent of the
  // raw pixel confidence — a row that passes all four is a good read even
  // on a grainy scan. (Raw tesseract confidence runs pessimistic there.)
  if (EMPLID_RE.test(p.emplid) && !(p.emplidFixes > 0) && p.name.includes(',') &&
      /^[A-Za-z]{1,4}-?\d{1,2}$/.test(p.grade) && /^\d{1,2}$/.test(p.step)) {
    conf = Math.min(97, conf + 10);
  }
  conf = Math.max(0, Math.min(100, Math.round(conf * 10) / 10));

  const bx0 = Math.min(...rowWords.map(w => w.x0));
  const by0 = Math.min(...rowWords.map(w => w.y0));
  const bx1 = Math.max(...rowWords.map(w => w.x1));
  const by1 = Math.max(...rowWords.map(w => w.y1));

  return {
    emplid: p.emplid, name: p.name,
    last_name: p.last, first_name: p.first, middle_name: p.middle,
    grade: p.grade, step: p.step,
    confidence: conf,
    review_reasons: p.reasons,
    ocr_text: rowWords.map(w => w.text).join(' '),
    bx0, by0, bx1, by1,
    norm_last: match.normalizeName(p.last),
    norm_first: match.normalizeName(p.first)
  };
}

/** Parse a whole OCR'd page: words -> clustered rows -> parsed rows. */
function parseWords(words) {
  const out = [];
  for (const rw of clusterRows(words)) {
    const r = parseRow(rw);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Parse a page that has a real text layer (digital PDF or scanner-side OCR).
 * lines: [{ text, x0, y0, x1, y1 }] in image-pixel coords. Confidence 100.
 */
function parseTextLines(lines) {
  const out = [];
  for (const ln of lines) {
    const toks = String(ln.text).split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    // Fake per-word boxes by slicing the line box horizontally — close
    // enough for review-crop purposes (the whole line is what gets shown).
    const w = (ln.x1 - ln.x0) / Math.max(1, toks.length);
    const words = toks.map((t, i) => ({
      text: t, conf: 100,
      x0: ln.x0 + i * w, y0: ln.y0, x1: ln.x0 + (i + 1) * w, y1: ln.y1
    }));
    const r = parseRow(words);
    if (r) out.push(r);
  }
  return out;
}

module.exports = { parseWords, parseTextLines, parseRow, clusterRows, asEmplid, splitName, EMPLID_RE };
