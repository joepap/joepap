'use strict';
// Fuzzy name matching for roster lookup. Handles hyphenated last names,
// suffixes, apostrophes/diacritics, and common nicknames (Joe/Joseph).

const SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V', 'JUNIOR', 'SENIOR']);

// Nickname groups — every name in a group matches every other.
const NICKNAME_GROUPS = [
  ['JOSEPH', 'JOE', 'JOEY', 'JOS'],
  ['MICHAEL', 'MIKE', 'MIKEY', 'MICK'],
  ['WILLIAM', 'BILL', 'BILLY', 'WILL', 'WILLIE', 'LIAM'],
  ['ROBERT', 'BOB', 'BOBBY', 'ROB', 'ROBBIE', 'BERT'],
  ['JAMES', 'JIM', 'JIMMY', 'JAMIE'],
  ['JOHN', 'JACK', 'JOHNNY', 'JON', 'JONATHAN'],
  ['RICHARD', 'RICK', 'RICKY', 'RICH', 'DICK'],
  ['THOMAS', 'TOM', 'TOMMY'],
  ['CHRISTOPHER', 'CHRIS', 'TOPHER', 'KIT'],
  ['DANIEL', 'DAN', 'DANNY'],
  ['MATTHEW', 'MATT', 'MATTY'],
  ['ANTHONY', 'TONY', 'ANT'],
  ['DONALD', 'DON', 'DONNIE'],
  ['KENNETH', 'KEN', 'KENNY'],
  ['STEVEN', 'STEPHEN', 'STEVE', 'STEVIE'],
  ['EDWARD', 'ED', 'EDDIE', 'TED', 'TEDDY', 'NED'],
  ['RONALD', 'RON', 'RONNIE'],
  ['TIMOTHY', 'TIM', 'TIMMY'],
  ['GERALD', 'GERRY', 'JERRY'],
  ['LAWRENCE', 'LARRY', 'LAURENCE'],
  ['GREGORY', 'GREG'],
  ['SAMUEL', 'SAM', 'SAMMY'],
  ['BENJAMIN', 'BEN', 'BENNY', 'BENJI'],
  ['ALEXANDER', 'ALEX', 'AL', 'XANDER'],
  ['NICHOLAS', 'NICK', 'NICKY'],
  ['ZACHARY', 'ZACH', 'ZACK'],
  ['PATRICK', 'PAT', 'PADDY', 'PATTY'],
  ['CHARLES', 'CHUCK', 'CHARLIE', 'CHAS'],
  ['FRANCIS', 'FRANK', 'FRANKIE', 'FRAN'],
  ['RAYMOND', 'RAY'],
  ['DAVID', 'DAVE', 'DAVEY'],
  ['JOSHUA', 'JOSH'],
  ['ANDREW', 'ANDY', 'DREW'],
  ['PETER', 'PETE'],
  ['PHILIP', 'PHILLIP', 'PHIL'],
  ['VINCENT', 'VINCE', 'VINNY'],
  ['DOUGLAS', 'DOUG'],
  ['FREDERICK', 'FRED', 'FREDDY'],
  ['HENRY', 'HANK', 'HARRY'],
  ['WALTER', 'WALT', 'WALLY'],
  ['EUGENE', 'GENE'],
  ['LEONARD', 'LEN', 'LENNY', 'LEO'],
  ['ALBERT', 'AL', 'BERT'],
  ['ARTHUR', 'ART', 'ARTIE'],
  ['ELIZABETH', 'LIZ', 'BETH', 'BETTY', 'LIZZIE', 'ELIZA'],
  ['MARGARET', 'MAGGIE', 'MEG', 'PEG', 'PEGGY', 'MARGE'],
  ['KATHERINE', 'CATHERINE', 'KATE', 'KATIE', 'KATHY', 'CATHY', 'KAT'],
  ['JENNIFER', 'JEN', 'JENNY'],
  ['JESSICA', 'JESS', 'JESSIE'],
  ['STEPHANIE', 'STEPH'],
  ['KIMBERLY', 'KIM'],
  ['PATRICIA', 'PAT', 'PATTY', 'TRICIA', 'TRISH'],
  ['DEBORAH', 'DEBRA', 'DEB', 'DEBBIE'],
  ['SUSAN', 'SUE', 'SUSIE', 'SUZY'],
  ['BARBARA', 'BARB', 'BARBIE'],
  ['CHRISTINA', 'CHRISTINE', 'CHRIS', 'TINA', 'CHRISSY'],
  ['AMANDA', 'MANDY'],
  ['SAMANTHA', 'SAM'],
  ['VICTORIA', 'VICKY', 'VICKI', 'TORI'],
  ['REBECCA', 'BECKY', 'BECCA'],
  ['MICHELLE', 'SHELLY'],
  ['MELISSA', 'MEL', 'MISSY'],
  ['DANIELLE', 'DANI'],
  ['NICOLE', 'NIKKI'],
  ['ALEXANDRA', 'ALEX', 'LEXI', 'SANDRA'],
  ['SANDRA', 'SANDY'],
  ['CYNTHIA', 'CINDY'],
  ['PAMELA', 'PAM'],
  ['TERESA', 'THERESA', 'TERRY', 'TESS'],
  ['ANGELA', 'ANGIE'],
  ['JACQUELINE', 'JACKIE'],
  ['DOROTHY', 'DOT', 'DOTTIE'],
  ['FLORENCE', 'FLO'],
  ['JOSEPHINE', 'JO', 'JOSIE'],
  ['GABRIEL', 'GABE'],
  ['GABRIELLA', 'GABRIELLE', 'GABBY'],
  ['ISABELLA', 'ISABEL', 'BELLA', 'IZZY'],
  ['ABIGAIL', 'ABBY'],
  ['NATHANIEL', 'NATHAN', 'NATE', 'NAT'],
  ['JEFFREY', 'JEFF'],
  ['BRADLEY', 'BRAD'],
  ['BRANDON', 'BRAND'],
  ['JACOB', 'JAKE'],
  ['MAXWELL', 'MAX'],
  ['THEODORE', 'THEO', 'TED', 'TEDDY'],
  ['RODERICK', 'ROD', 'RICK'],
  ['SALVATORE', 'SAL'],
  ['DOMINIC', 'DOM', 'NICK'],
  ['LOUIS', 'LOU', 'LOUIE'],
  ['MARTIN', 'MARTY'],
  ['BERNARD', 'BERNIE'],
  ['NORMAN', 'NORM'],
  ['STANLEY', 'STAN'],
  ['HAROLD', 'HAL', 'HARRY'],
  ['IRVING', 'IRV'],
  ['SIDNEY', 'SID'],
  ['MITCHELL', 'MITCH'],
  ['GORDON', 'GORDY'],
  ['RUSSELL', 'RUSS', 'RUSTY'],
  ['WESLEY', 'WES'],
  ['CURTIS', 'CURT'],
  ['MARCUS', 'MARC', 'MARK'],
  ['TREVOR', 'TREV'],
  ['CAMERON', 'CAM'],
  ['XAVIER', 'X']
];

const NICK_INDEX = new Map(); // NAME -> Set of group ids
NICKNAME_GROUPS.forEach((group, gi) => {
  for (const n of group) {
    if (!NICK_INDEX.has(n)) NICK_INDEX.set(n, new Set());
    NICK_INDEX.get(n).add(gi);
  }
});

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normalize a name for comparison: uppercase, no punctuation, no suffix. */
function normalizeName(s) {
  if (!s) return '';
  let n = stripDiacritics(String(s)).toUpperCase()
    .replace(/['’.`]/g, '')       // O'Brien -> OBRIEN, St. John -> ST JOHN
    .replace(/[-,\/]+/g, ' ')     // hyphens/commas become token breaks
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n;
}

/** Tokenize a normalized name, dropping suffixes. */
function nameTokens(s) {
  return normalizeName(s).split(' ').filter(t => t && !SUFFIXES.has(t));
}

function sameNicknameGroup(a, b) {
  const ga = NICK_INDEX.get(a), gb = NICK_INDEX.get(b);
  if (!ga || !gb) return false;
  for (const g of ga) if (gb.has(g)) return true;
  return false;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 0–100 similarity between two first names. */
function firstNameScore(a, b) {
  if (!a || !b) return 50;             // missing data — neutral
  if (a === b) return 100;
  if (sameNicknameGroup(a, b)) return 95;
  if (a[0] === b[0] && (a.length === 1 || b.length === 1)) return 85; // initial
  if (a.startsWith(b) || b.startsWith(a)) return 88;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (d <= 2 && maxLen >= 4) return 90 - d * 10;   // typo tolerance
  return Math.max(0, Math.round((1 - d / maxLen) * 60));
}

/** 0–100 similarity between last names (token-aware for hyphenated names). */
function lastNameScore(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const ja = ta.join(' '), jb = tb.join(' ');
  if (ja === jb) return 100;
  // Any shared token (GARCIA-LOPEZ vs GARCIA) is a strong signal.
  for (const t of ta) if (tb.includes(t)) return 92;
  const d = levenshtein(ja, jb);
  const maxLen = Math.max(ja.length, jb.length);
  if (d <= 2 && maxLen >= 5) return 90 - d * 8;
  return Math.max(0, Math.round((1 - d / maxLen) * 70));
}

/**
 * Score a parsed {lastName, firstName} query against a roster member with
 * precomputed norm_last / norm_first. Returns 0–100.
 */
function scoreCandidate(query, member) {
  const ls = lastNameScore(query.lastName || '', member.norm_last || member.last_name || '');
  if (ls < 45) return 0;
  const qf = nameTokens(query.firstName || '')[0] || '';
  const mf = nameTokens(member.norm_first || member.first_name || '')[0] || '';
  const fs = firstNameScore(qf, mf);
  // Last name dominates; first name disambiguates.
  return Math.round(ls * 0.6 + fs * 0.4);
}

module.exports = {
  normalizeName, nameTokens, levenshtein,
  firstNameScore, lastNameScore, scoreCandidate,
  MATCH_THRESHOLD: 62
};
