/*
 * USB keyboard-wedge scanner capture.
 *
 * 2D scanners "type" the whole barcode payload as fast keystrokes ending
 * with Enter. We watch keydown globally (capture phase) and detect bursts:
 * inter-key gap under BURST_GAP_MS and total length over MIN_LENGTH. While
 * a burst is live we suppress the keystrokes so they don't spray into
 * whatever input happens to be focused.
 *
 * A human typing in the search box never trips this (humans are slower and
 * scans start with '@' for AAMVA), and scanners configured slow still work:
 * anything landing in a focused text input that parses as AAMVA is caught
 * by app.js as a fallback.
 *
 * PRIVACY: the captured buffer goes straight to AAMVA.parse() and is then
 * discarded. It is never stored or transmitted.
 */
(function (root) {
  'use strict';

  var BURST_GAP_MS = 45;   // max ms between keys to count as scanner speed
  var MIN_LENGTH = 20;     // AAMVA payloads are 200+ chars; 20 is generous
  var buffer = '';
  var lastKeyTs = 0;
  var burstActive = false;
  var onScan = null;

  function keyToChar(e) {
    if (e.key === 'Enter') return '\n';
    // Some wedges send control chars as Ctrl+letter (RS = Ctrl+^, LF = Ctrl+J)
    if (e.ctrlKey && e.key.length === 1) {
      var code = e.key.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 32) return String.fromCharCode(code);
      return '';
    }
    if (e.key.length === 1) return e.key;
    return '';
  }

  function reset() { buffer = ''; burstActive = false; }

  function handler(e) {
    var now = Date.now();
    var ch = keyToChar(e);
    var gap = now - lastKeyTs;
    lastKeyTs = now;

    if (gap > BURST_GAP_MS) {
      // Too slow to be (mid-)scan. If we had a big fast buffer ending now,
      // it may have finished without Enter — try it.
      maybeFinish();
      buffer = ch;
      // A scan starts with '@' typed at machine speed; tentatively begin.
      burstActive = (ch === '@');
      return;
    }

    buffer += ch;
    if (buffer.length >= 3 && buffer[0] === '@') burstActive = true;

    if (burstActive) {
      // Suppress scanner keystrokes from reaching inputs/shortcuts.
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === 'Enter' && buffer.length >= MIN_LENGTH) maybeFinish();
  }

  function maybeFinish() {
    if (buffer.length >= MIN_LENGTH && buffer.indexOf('@') !== -1 &&
        (buffer.indexOf('ANSI ') !== -1 || buffer.indexOf('AAMVA') !== -1)) {
      var payload = buffer;
      reset();
      if (onScan) onScan(payload); // parse-and-discard happens in the callback
    } else if (buffer.length > 400) {
      reset(); // runaway buffer, not AAMVA
    }
  }

  root.WedgeCapture = {
    start: function (cb) {
      onScan = cb;
      document.addEventListener('keydown', handler, true);
    },
    stop: function () {
      document.removeEventListener('keydown', handler, true);
      reset();
    }
  };
})(window);
