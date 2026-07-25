'use strict';
/*
 * The NEP repair workbook — everything needed to clean the NEP database,
 * built for review with the NEP folks BEFORE anything is uploaded.
 *
 * Hard-won rule baked in throughout: a past spreadsheet migration MERGED
 * same-name family members (father retired / son active) into one NEP
 * profile. So name matching here is deliberately paranoid: any member
 * whose name isn't unique on BOTH lists, or who matches more than one
 * IAFF person, or whose status class disagrees across systems, is
 * quarantined into the "CHECK BY HAND" sheet and excluded from the
 * upload-ready sheet entirely.
 */
const fs = require('fs');
const XLSX = require('xlsx');
const match = require('./match');
const tabular = require('./tabular');
const { latestRoster } = require('./reconcile');

const LINK = 88;      // same-person link threshold (event-proven)

function classifyForIaff(m) {
  const pick = (m.status || '').trim() || (m.work_status || '').trim();
  if (/\bMRM\b/i.test(pick) || /retire|\blife\b/i.test(pick)) return 'retired'; // Life sits at IAFF as MRM
  if (/\bMEM\b/i.test(pick) || /^active\b/i.test(pick)) return 'active';
  if (/\bHMM\b/i.test(pick) || /honor/i.test(pick)) return 'honorary';
  return 'other';
}

function normNo(v) {
  const s = String(v || '');
  if (s.includes('/')) return '';
  return s.replace(/\D/g, '').replace(/^0+/, '');
}

function keyExact(m) {
  return match.normalizeName(m.last_name) + '|' + (match.nameTokens(m.first_name)[0] || '');
}
function keyInitial(m) {
  return match.normalizeName(m.last_name) + '|' + (match.nameTokens(m.first_name)[0] || '')[0];
}

function buildBuckets(members) {
  const buckets = new Map();
  for (const m of members) {
    const seen = new Set();
    for (const tok of (m.norm_last || '').split(' ')) {
      const k = tok[0];
      if (k && !seen.has(k)) { seen.add(k); (buckets.get(k) || buckets.set(k, []).get(k)).push(m); }
    }
  }
  return buckets;
}

/** All IAFF candidates ≥ LINK for one NEP member, best first. */
function candidates(m, buckets) {
  const q = { lastName: m.last_name, firstName: m.first_name };
  const out = [], seen = new Set();
  for (const tok of (m.norm_last || '').split(' ')) {
    const k = tok[0]; if (!k) continue;
    for (const c of (buckets.get(k) || [])) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const s = match.scoreCandidate(q, c);
      if (s >= LINK) out.push({ c, s });
    }
  }
  return out.sort((a, b) => b.s - a.s);
}

function buildNepRepairWorkbook(db) {
  const nepRoster = latestRoster(db, 'nep');
  const iaffRoster = latestRoster(db, 'iaff');
  if (!nepRoster || !iaffRoster) throw new Error('Upload both the NEP and IAFF files first.');
  const nep = db.prepare('SELECT * FROM roster_members WHERE roster_id = ?').all(nepRoster.id);
  const iaff = db.prepare('SELECT * FROM roster_members WHERE roster_id = ?').all(iaffRoster.id);

  // Name-ambiguity maps per side (the father/son trap).
  const dupCount = list => {
    const exact = new Map(), initial = new Map();
    for (const m of list) {
      exact.set(keyExact(m), (exact.get(keyExact(m)) || 0) + 1);
      initial.set(keyInitial(m), (initial.get(keyInitial(m)) || 0) + 1);
    }
    return { exact, initial };
  };
  const nepDup = dupCount(nep), iaffDup = dupCount(iaff);
  const ambiguous = m =>
    nepDup.exact.get(keyExact(m)) > 1 || nepDup.initial.get(keyInitial(m)) > 1 ||
    iaffDup.exact.get(keyExact(m)) > 1 || iaffDup.initial.get(keyInitial(m)) > 1;

  const buckets = buildBuckets(iaff);
  const claimedIaff = new Map();   // iaff id -> nep id (one-to-one guard)

  const fill = [], review = [], placeholders = [], already = { count: 0 };
  const idOf = m => m.member_no || '';

  const nepPerson = m => ({
    'NEP First Name': m.first_name, 'NEP Last Name': m.last_name,
    'NEP Member Status': m.status, 'NEP Work Status': m.work_status,
    'NEP Email': m.email, 'NEP Phone': m.phone
  });
  const iaffPerson = (c) => ({
    'IAFF Number': idOf(c), 'IAFF Name': c.last_name + ', ' + c.first_name + (c.middle_name ? ' ' + c.middle_name : ''),
    'IAFF Type': c.status
  });

  for (const m of nep) {
    const cls = classifyForIaff(m);
    const rawNo = String(m.member_no || '');
    if (rawNo.includes('/')) {
      placeholders.push({ ...nepPerson(m), 'Bad IAFF Number value': rawNo,
        note: 'date-shaped placeholder from an old bulk import — clear or replace' });
    }
    if (cls === 'other') continue;   // Drop/Deceased/Alumni/blank — not IAFF-relevant

    const cands = candidates(m, buckets);
    const top = cands[0];
    const second = cands[1];
    const curNo = normNo(m.member_no);

    if (!top) {
      // No IAFF match at all — that's the reconcile screen's "missing at
      // IAFF" list, not a repair item. Skip here.
      continue;
    }

    // Merged-profile signature: one NEP profile, two strong IAFF matches —
    // especially one MEM + one MRM (father/son split into two at IAFF).
    if (second && second.s >= LINK) {
      review.push({ Issue: 'MATCHES TWO IAFF PEOPLE — possible merged NEP profile',
        ...nepPerson(m),
        ...iaffPerson(top.c), 'Match Score': top.s,
        'IAFF Number (2nd match)': idOf(second.c),
        'IAFF Name (2nd)': second.c.last_name + ', ' + second.c.first_name,
        'IAFF Type (2nd)': second.c.status,
        note: top.c.status !== second.c.status
          ? 'one active + one retired at IAFF — classic father/son merge, split the NEP profile'
          : 'two same-name people at IAFF — verify which one this profile is' });
      continue;
    }

    if (ambiguous(m)) {
      review.push({ Issue: 'SAME-NAME FAMILY — verify by hand',
        ...nepPerson(m), ...iaffPerson(top.c), 'Match Score': top.s,
        note: 'this name is not unique on one of the lists — confirm identity before touching the profile' });
      continue;
    }

    const iaffClass = classifyForIaff(top.c);
    if (iaffClass !== cls) {
      review.push({ Issue: 'STATUS CLASS DISAGREES (NEP vs IAFF)',
        ...nepPerson(m), ...iaffPerson(top.c), 'Match Score': top.s,
        note: `NEP says ${cls}, IAFF says ${iaffClass} — one of the two is stale (or it's a merged profile)` });
      continue;
    }

    if (curNo && curNo === normNo(idOf(top.c))) { already.count++; continue; }
    if (curNo && curNo !== normNo(idOf(top.c))) {
      review.push({ Issue: 'IAFF NUMBER CONFLICT',
        ...nepPerson(m), 'NEP has IAFF Number': m.member_no,
        ...iaffPerson(top.c), 'Match Score': top.s,
        note: 'the number in NEP differs from the matched IAFF record — verify which is right' });
      continue;
    }

    // Unambiguous, class-consistent, single-match, currently blank/placeholder.
    if (claimedIaff.has(top.c.id)) {
      review.push({ Issue: 'TWO NEP PROFILES CLAIM ONE IAFF RECORD',
        ...nepPerson(m), ...iaffPerson(top.c), 'Match Score': top.s,
        note: 'possible duplicate NEP profiles for the same person' });
      continue;
    }
    claimedIaff.set(top.c.id, m.id);
    fill.push({ ...nepPerson(m), ...iaffPerson(top.c), 'Match Score': top.s });
  }

  // NEP internal exact-name duplicates (possible duplicate/merged profiles).
  const seenKey = new Map();
  const nepDupRows = [];
  for (const m of nep) {
    const k = keyExact(m);
    if (seenKey.has(k)) {
      const first = seenKey.get(k);
      nepDupRows.push({ Issue: 'DUPLICATE NEP PROFILES (same name twice)',
        ...nepPerson(m),
        'Other profile status': first.status + ' / ' + first.work_status,
        'Other profile email': first.email,
        note: /retire/i.test(first.status + m.status) && /active/i.test(first.status + m.status)
          ? 'one active + one retired — likely father/son, make sure each has their own clean profile'
          : 'same name twice in NEP — verify these are two real people, not a duplicate' });
    } else seenKey.set(k, m);
  }

  // Member Status vs Work Status contradictions inside NEP.
  const contradictions = [];
  for (const m of nep) {
    const s = (m.status || '').trim(), w = (m.work_status || '').trim();
    if (!s || !w) continue;
    const sc = classifyForIaff({ status: s, work_status: '' });
    const wc = classifyForIaff({ status: w, work_status: '' });
    if ((sc === 'other' && wc === 'active') || (sc === 'active' && wc === 'other') ||
        (sc === 'retired' && wc === 'active' && !/active retired/i.test(s))) {
      contradictions.push({ ...nepPerson(m),
        note: `Member Status "${s}" vs Work Status "${w}" — cannot both be true` });
    }
  }

  // Upload-ready sheet with NEP's EXACT export headers, only for the safe
  // list — built from the original uploaded file so every column rides
  // along unchanged except the IAFF number.
  let uploadRows = null, uploadHeaders = null;
  const rosterFile = require('path').join(require('./db').DATA_DIR, 'uploads', `roster-${nepRoster.id}`);
  if (fs.existsSync(rosterFile)) {
    const parsed = tabular.parseUpload(fs.readFileSync(rosterFile), nepRoster.filename);
    if (parsed.records.length === nep.length) {
      const fillByNepId = new Map();
      for (const [iaffId, nepId] of claimedIaff) fillByNepId.set(nepId, iaff.find(x => x.id === iaffId));
      uploadHeaders = parsed.headers;
      uploadRows = [];
      nep.forEach((m, i) => {
        const hit = fillByNepId.get(m.id);
        if (!hit) return;
        const rec = { ...parsed.records[i] };
        rec['IAFF Member Number'] = idOf(hit);
        uploadRows.push(rec);
      });
    }
  }

  // ---------- assemble ----------
  const wb = XLSX.utils.book_new();
  const add = (name, rows, note) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: note || 'nothing found' }]);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  };
  add('READ ME FIRST', [
    { ' ': 'NEP REPAIR WORKBOOK — review everything with NEP support before uploading anything.' },
    { ' ': '' },
    { ' ': `Built from: NEP export of ${nepRoster.uploaded_at.slice(0, 10)} (${nep.length} rows) + IAFF export (${iaff.length} rows).` },
    { ' ': `${fill.length} members get an IAFF number filled in — SAFE list: name unique on both lists, exactly one` },
    { ' ': '   IAFF match, active/retired class agrees, no existing conflicting number.' },
    { ' ': `${already.count} members already have the correct IAFF number — nothing to do.` },
    { ' ': `${review.length + nepDupRows.length} members are QUARANTINED on the CHECK BY HAND sheet — same-name families,` },
    { ' ': '   possible merged profiles, status conflicts. A previous migration merged father/son records:' },
    { ' ': '   these are exactly the rows where that happens. NEVER bulk-upload these.' },
    { ' ': `${placeholders.length} placeholder IAFF numbers (date-shaped) to clear.` },
    { ' ': `${contradictions.length} internal status contradictions to fix.` },
    { ' ': '' },
    { ' ': 'The UPLOAD sheet mirrors the NEP export headers exactly (safe list only). Confirm with NEP support' },
    { ' ': 'that bulk import matches on their internal record — NOT on names — before uploading.' }
  ]);
  add('IAFF numbers to fill (SAFE)', fill);
  add('CHECK BY HAND', [...review, ...nepDupRows], 'no conflicts found');
  add('Placeholder IAFF numbers', placeholders);
  add('Status contradictions', contradictions);
  if (uploadRows) {
    const sheet = XLSX.utils.json_to_sheet(uploadRows, { header: uploadHeaders });
    XLSX.utils.book_append_sheet(wb, sheet, 'UPLOAD (safe list, exact hdrs)');
  } else {
    add('UPLOAD (unavailable)', [], 'original NEP file not stored on the server — re-upload the NEP export and regenerate');
  }

  return { wb, counts: { safe: fill.length, already: already.count, review: review.length + nepDupRows.length,
    placeholders: placeholders.length, contradictions: contradictions.length,
    upload: uploadRows ? uploadRows.length : 0 } };
}

module.exports = { buildNepRepairWorkbook };
