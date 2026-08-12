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

/*
 * The money columns. Each row prints three: the dues goal, what was actually
 * taken out of the check, and what is left. Almost every member reads
 * 49.19 / 49.09 / 0.10 — but a few read 0.00 / 0.00 / 0.00, and those people
 * are on the register with nothing coming out. They are NOT dues payers, and
 * reading the row without reading the money is what let 13 of them be counted
 * as paying in August 2026.
 *
 * The OCR mangles the digits badly ("439.09" for "49.09", "49,19", "c.10"),
 * so the exact amount cannot be trusted. The zero/non-zero distinction can:
 * a scanner turns 49.09 into 439.09, never into 0.00. So `taken` is reported
 * for information and `zero` is the value anything downstream should act on.
 */
const MONEY_RE = /^[^0-9]{0,2}(\d[\d,]*)[.,](\d\d)$/;

function asMoney(tok) {
  const m = MONEY_RE.exec(String(tok));
  if (!m) return null;
  return Number(m[1].replace(/,/g, '') + '.' + m[2]);
}

/**
 * Find the row's money columns. Only the first two — the goal and what was
 * taken — decide anything, so the third is read when legible and ignored
 * when not: the remainder column is where the OCR fails most often ("¢.10"
 * for "0.10"), and a lost third column must not cost us the whole row.
 *
 * Returns { goal, taken, left, zero } with left null when unreadable, or
 * null when the pair itself is not legible. Never guesses a number.
 */
function readMoney(toks) {
  for (let i = 0; i + 1 < toks.length; i++) {
    const goal = asMoney(toks[i]), taken = asMoney(toks[i + 1]);
    if (goal === null || taken === null) continue;
    const left = i + 2 < toks.length ? asMoney(toks[i + 2]) : null;
    if (goal === 0 && taken === 0) return { goal, taken, left, zero: true };
    // A real dues line: goal and taken are both tens of dollars. Anything
    // else is a stray run of numbers elsewhere on the line, so keep looking.
    if (goal >= 10 && goal < 1000 && taken >= 10 && taken < 1000) {
      return { goal, taken, left, zero: false };
    }
  }
  return null;
}

const HEADER_RE = /EMPL\s?ID|EMPLID|\bNAME\b|\bGRADE\b|\bSTEP\b|\bPAGE\b|REPORT|REGISTER|DEDUCT|DEPARTMENT|RUN\s?DATE|TOTAL|UNION\s?DUES|AGENCY|EMPLOYEE|ASSOC|\bBANK\b|VENDOR|FAIRFAX|ALEXANDRIA|RETIREMENT|COLUMBIA|PAY\s?(PERIOD|END|RUN)/i;
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

const SUFFIX_RE = /^(JR|SR|II|III|IV|V)\.?$/i;
// A middle initial: one letter, optionally with a period.
const INITIAL_RE = /^[A-Za-z]\.?$/;

/** Split "LAST,FIRST M" (or best effort without a comma) into parts. */
function splitName(nameRaw) {
  const reasons = [];
  let last = '', first = '', middle = '';
  const cleaned = nameRaw.replace(/\s*,\s*/g, ',').trim();
  if (cleaned.includes(',')) {
    // The report writes a suffix as its own comma field: "Robinson,Jr.,Karl H".
    // Fold it back onto the last name so the first name isn't read as "Jr.".
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3 && SUFFIX_RE.test(parts[1])) {
      last = parts[0] + ' ' + parts[1];
      parts.splice(1, 1);
    } else {
      last = parts[0];
    }
    const rest = parts.slice(1).join(' ').trim().split(/\s+/).filter(Boolean);
    // Some rows print the MIDDLE INITIAL FIRST: "Ordile,K. Gregory" is
    // Gregory K. Ordile, and "Mastri,G Nicholas" is Nicholas G. Mastri.
    // An initial followed by a real given name means that order.
    if (rest.length >= 2 && INITIAL_RE.test(rest[0]) && /^[A-Za-z]{2,}/.test(rest[1])) {
      first = rest[1];
      middle = [rest[0], ...rest.slice(2)].join(' ');
      reasons.push('name printed middle-initial-first on the report');
    } else {
      first = rest[0] || '';
      middle = rest.slice(1).join(' ');
    }
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
    // No usable emplid — but the row still has a readable NAME, and the name
    // is what links this person to the membership databases. Fall back to the
    // masked SSN column as the left anchor: the name always sits after it
    // (past the emplid and Emp Rec columns). Without this the whole line ends
    // up in the name field, and the person looks like a stranger.
    // Real emplids are 8 digits; the scan sometimes reads 9 ("00099503" as
    // "000939503"), which is exactly why the anchor failed here.
    const ssnIdx = toks.findIndex(t => /[xX*%¥]{2}/.test(t) && /\d{3,4}$/.test(t));
    if (ssnIdx !== -1 && ssnIdx + 1 < toks.length) {
      return buildRow(rowWords, toks, ssnIdx, '', 0,
        ['employee ID unreadable — name taken from the line instead']);
    }
    const nm = splitName(joined.replace(/[^A-Za-z ,.'-]/g, ' ').replace(/\s+/g, ' ').trim());
    return finish(rowWords, {
      emplid: '', name: joined, ...nm,
      grade: '', step: '',
      // The name may be lost but the money column often still reads, and a
      // $0.00 line matters however badly the rest of the row scanned.
      money: readMoney(toks),
      reasons: ['no emplid readable on this line', ...nm.reasons],
      forceReview: true
    });
  }
  return buildRow(rowWords, toks, anchorIdx, emplid, emplidFixes, []);
}

// Surname particles that legitimately stand alone before the comma token.
const PARTICLE_RE = /^(van|von|de|del|della|di|da|la|le|mc|mac|st|saint|der|ten|ter|bin|al|el|dos|das|du|des)\.?$/i;

/** Scanner debris sitting in the Emp Rec column ("Qa", "jo}", "[4]") —
 *  as opposed to a real part of the name. */
function isLeadingJunk(t) {
  if (/[^A-Za-z'\-.]/.test(t)) return true;               // braces, digits, symbols
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length <= 2 && !PARTICLE_RE.test(t);     // "Qa" yes, "De"/"Mc" no
}

/** Shared row builder: everything to the right of `anchorIdx` is name then
 *  trailing columns. Used for both the emplid anchor and the SSN fallback. */
function buildRow(rowWords, toks, anchorIdx, emplid, emplidFixes, extraReasons) {

  // Everything after the anchor: name, then trailing columns. Parsed from
  // the RIGHT — step is the last 1–2 digit number near the end, grade sits
  // just before it — so letter-bearing grades ("1C") never get swallowed
  // into the name, and extra columns don't shift anything.
  const after = toks.slice(anchorIdx + 1);
  let stepIdx = -1;
  for (let i = after.length - 1; i >= Math.max(0, after.length - 4); i--) {
    const d = digitize(after[i].replace(/[.,]/g, ''));
    if (d && d.value.length >= 1 && d.value.length <= 2) { stepIdx = i; break; }
  }
  let grade = '', step = '', nameEnd;
  let gradeBlankMarker = false;
  if (stepIdx > 0) {
    step = String(parseInt(digitize(after[stepIdx].replace(/[.,]/g, '')).value, 10));
    grade = after[stepIdx - 1];
    nameEnd = stepIdx - 1;
    // The real report prints "**" in the grade column for a few rows —
    // that's a legitimate blank, not a misread.
    if (/^\*+$/.test(grade)) { gradeBlankMarker = true; grade = ''; }
    // A grade should be short and not name-shaped; if it looks like part of
    // the name (e.g. step read but grade column empty), give it back.
    else if (grade.length > 8 || grade.includes(',')) { nameEnd = stepIdx; grade = ''; }
  } else {
    nameEnd = after.length;
  }
  let nameToks = after.slice(0, nameEnd);
  // The DC report has an "Emp Rec" column (a lone 0/1) between emplid and
  // name. On a grainy scan it reads as anything — "0", "Q", "[¢}", "8}" —
  // so strip leading tokens until one shaped like a name: starts with a
  // letter and has at least two letters ("O'Brien,Sean" and "Ng,Amy" pass).
  while (nameToks.length && !/^[A-Za-z](?=(?:[^A-Za-z]*[A-Za-z]))/.test(nameToks[0])) nameToks.shift();
  // Stronger anchor when it exists: the report prints "LAST,FIRST" with no
  // space, so the token carrying the comma starts the name. Only slice when
  // everything before it is junk — a real surname can precede the comma
  // token ("Adkins Jr.,Donald L", "Van Hagen,John"), and those must survive.
  const commaAt = nameToks.findIndex(t => t.includes(','));
  if (commaAt > 0 && nameToks.slice(0, commaAt).every(isLeadingJunk)) {
    nameToks = nameToks.slice(commaAt);
  }
  // The name column ends where the code/money columns begin: deduction
  // codes ("DU0405" — also misread as "DU040S"/"Duo40s"), dollar amounts,
  // masked SSNs. Truncate at the first such token — otherwise codes to the
  // right ("LAA", "D13") would read as part of the name. The ≥2-real-digits
  // guard keeps genuine surnames ("Bliss") out of the code pattern.
  const STOP_TOK = /^(?:(?=(?:[^0-9]*[0-9]){2})[A-Za-z]{2,3}[0-9OoIlSsBZz]{3,5}|\d+[.,]\d{2}|x{2,}.*|\*+)$/;
  const stopAt = nameToks.findIndex(t => STOP_TOK.test(t));
  if (stopAt !== -1) nameToks = nameToks.slice(0, stopAt);
  // Strip digit-heavy tokens (ssn4, dept numbers) off the end of the name.
  while (nameToks.length && digitCount(nameToks[nameToks.length - 1]) > letterCount(nameToks[nameToks.length - 1])) {
    nameToks.pop();
  }
  // Scan specks read as stray punctuation; the report prints "LAST,FIRST"
  // with no space — canonicalize so OCR tokenization noise isn't a "diff".
  // Grades print in CAPS: case-fold and drop non-ASCII junk so "CpT-01" /
  // "FF¥F-02" style misreads can't masquerade as grade changes.
  grade = grade.replace(/[^\x20-\x7E]/g, '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toUpperCase();
  // Real DC grades are two chars, digit-first ("04", "1C", "7B" — suffix
  // letters only A-D). Tesseract systematically confuses 1/I, 0/O, 5/S,
  // 1/L there ("IC" for "1C", "OL" for "01", "0S" for "05") — consistent
  // enough that the rare-grade check can't catch it. Normalize.
  if (grade.length === 2) {
    grade = grade.replace(/^I/, '1').replace(/^O/, '0')
      .replace(/^(\d)O$/, '$10').replace(/^(\d)L$/, '$11').replace(/^(\d)S$/, '$15');
  }
  const nameRaw = nameToks.join(' ').replace(/\s*,\s*/g, ',').trim();
  const nm = splitName(nameRaw);
  const reasons = [...(extraReasons || []), ...nm.reasons];
  if (emplidFixes > 0) reasons.push(`emplid needed ${emplidFixes} character fix${emplidFixes > 1 ? 'es' : ''}`);
  if (!nameRaw) reasons.push('no name read');
  if (!grade && !gradeBlankMarker) reasons.push('no grade read');
  if (!step) reasons.push('no step read');

  const money = readMoney(toks);
  if (money && money.zero) reasons.push('deduction is $0.00 — on the register but not paying');
  return finish(rowWords, { emplid, name: nameRaw, ...nm, grade, step, reasons, emplidFixes,
    money, forceReview: !emplid });
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
    // -1 means the column was not legible, which is not the same as zero.
    amount_goal: p.money ? p.money.goal : -1,
    amount_taken: p.money ? p.money.taken : -1,
    zero_deduction: p.money && p.money.zero ? 1 : 0,
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

module.exports = { parseWords, parseTextLines, parseRow, clusterRows, asEmplid, splitName,
  readMoney, EMPLID_RE };
