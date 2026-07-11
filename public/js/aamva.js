/*
 * AAMVA DL/ID PDF417 payload parser.
 *
 * PRIVACY CONSTRAINT (hard requirement — do not change):
 *   This parser is the ONLY place raw barcode data is handled. It extracts
 *   name fields + DOB for roster matching, and DELIBERATELY DISCARDS
 *   everything else. The license/ID number (DAQ), address, physical
 *   descriptors, and the raw payload itself must NEVER be returned from
 *   this function, stored, logged, or sent over the network. Callers
 *   receive only: { lastName, firstName, middleName, suffix, dob, state }.
 *   DOB is used only for on-screen disambiguation (age display) and is
 *   never persisted.
 *
 * Format reference: AAMVA DL/ID Card Design Standard, Annex D.
 * Payload structure:
 *   "@" LF RS CR "ANSI " IIN(6) AAMVAVersion(2) JurisdictionVersion(2)
 *   NumEntries(2) [SubfileType(2) Offset(4) Length(4)]... then subfiles.
 *   Subfile: type prefix ("DL"/"ID"), elements = 3-char ID + value,
 *   separated by LF, subfile terminated by CR.
 *   Old (v01, pre-2000) headers use "AAMVA" instead of "ANSI " and a
 *   combined name field (DAA).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AAMVA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LF = '\n', CR = '\r';

  // Element IDs we extract. Everything else is intentionally ignored.
  var WANTED = {
    DCS: 'lastName',    // Customer Family Name
    DAB: 'lastName',    // Family Name (older versions)
    DAC: 'firstName',   // Customer First Name (v04+)
    DCT: 'firstName',   // Customer Given Names (v01–v03; may include middle)
    DAD: 'middleName',  // Middle Name(s)
    DCU: 'suffix',      // Name Suffix (JR, SR, II, ...)
    DBB: 'dob',         // Date of Birth
    DAJ: 'state',       // Address Jurisdiction Code (helps sanity-check)
    DCG: 'country',     // USA / CAN — needed to interpret date format
    DAA: 'fullName'     // v01 combined name: LAST,FIRST,MIDDLE
  };

  function parseDate(raw, country) {
    if (!raw) return null;
    var digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    var a = parseInt(digits.slice(0, 2), 10);
    var iso;
    if (country === 'CAN' || a > 12 || digits.slice(0, 2) === '19' || digits.slice(0, 2) === '20') {
      // CCYYMMDD (Canada, and AAMVA v01)
      iso = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8);
    } else {
      // MMDDCCYY (US, v02+)
      iso = digits.slice(4, 8) + '-' + digits.slice(0, 2) + '-' + digits.slice(2, 4);
    }
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }

  function cleanName(s) {
    if (!s) return '';
    // Jurisdictions pad with commas/spaces or use "NONE"/"UNAVL" placeholders.
    s = s.trim().replace(/,+$/, '').trim();
    if (/^(NONE|UNAVL|UNAVAILABLE|N\/A)$/i.test(s)) return '';
    return s;
  }

  /**
   * Parse a raw AAMVA PDF417 payload string.
   * Returns { lastName, firstName, middleName, suffix, dob, state } or null
   * if the payload is not recognizable AAMVA data.
   */
  function parse(raw) {
    if (!raw || typeof raw !== 'string') return null;
    // Keyboard-wedge scanners sometimes swallow/translate control chars;
    // normalize CRLF and locate the header loosely.
    var idx = raw.indexOf('ANSI ');
    if (idx === -1) idx = raw.indexOf('AAMVA');
    if (idx === -1 || raw.indexOf('@') === -1) return null;

    var fields = {};
    // Walk every element in every subfile. Elements are LF- (or CR-)
    // separated; the first element of a subfile is prefixed by the subfile
    // type ("DL"/"ID"), e.g. "DLDCSPUBLIC".
    var body = raw.slice(idx);
    // Drop the fixed header: "ANSI " + IIN(6) + versions(4) + entries(2) = 17
    // chars, then 10 chars per subfile designator. Rather than trust offsets
    // (real-world cards get them wrong), split on control chars and pattern-
    // match 3-letter element IDs.
    var chunks = body.split(/[\n\r]+/);
    for (var i = 0; i < chunks.length; i++) {
      var el = chunks[i];
      // Strip a leading subfile-type prefix if present (DL/ID + element id).
      var m = /^(?:DL|ID)?(D[A-Z][A-Z0-9])(.*)$/.exec(el);
      if (!m && /ANSI |AAMVA/.test(el)) {
        // The first element is often glued to the header/designator block
        // with no separator (e.g. "...0278DLDCSSAMPLE"). Find the subfile
        // start: "DL"/"ID" immediately followed by an element ID.
        m = /(?:DL|ID)(D[A-Z][A-Z0-9])(.*)$/.exec(el);
      }
      if (!m) continue;
      var id = m[1], val = m[2];
      if (WANTED[id] && !(WANTED[id] in fields && fields[WANTED[id]])) {
        fields[WANTED[id]] = val.trim();
      }
      // NOTE: DAQ (license number) and all other elements fall through
      // here and are discarded. Do not add them to WANTED.
    }

    var out = {
      lastName: cleanName(fields.lastName),
      firstName: cleanName(fields.firstName),
      middleName: cleanName(fields.middleName),
      suffix: cleanName(fields.suffix),
      dob: parseDate(fields.dob, (fields.country || '').toUpperCase()),
      state: (fields.state || '').trim().toUpperCase() || null
    };

    // v01 fallback: DAA = "LAST,FIRST,MIDDLE" (or space separated)
    if (!out.lastName && fields.fullName) {
      var parts = fields.fullName.split(',');
      if (parts.length === 1) parts = fields.fullName.trim().split(/\s+/);
      out.lastName = cleanName(parts[0]);
      out.firstName = cleanName(parts[1]);
      out.middleName = cleanName(parts.slice(2).join(' '));
    }

    // v01–v03: DCT "given names" may pack first + middle together.
    if (out.firstName && !out.middleName && /\s|,/.test(out.firstName)) {
      var given = out.firstName.split(/[,\s]+/).filter(Boolean);
      out.firstName = given[0] || '';
      out.middleName = given.slice(1).join(' ');
    }

    if (!out.lastName && !out.firstName) return null;
    return out;
  }

  /** Age in whole years from an ISO date, for disambiguation display only. */
  function ageFromDob(iso, now) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var n = now ? new Date(now) : new Date();
    var age = n.getFullYear() - d.getFullYear();
    var beforeBirthday = (n.getMonth() < d.getMonth()) ||
      (n.getMonth() === d.getMonth() && n.getDate() < d.getDate());
    if (beforeBirthday) age--;
    return age;
  }

  return { parse: parse, ageFromDob: ageFromDob };
});
