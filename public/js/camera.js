/*
 * Live PDF417 camera scanning via zxing-wasm (vendored locally — no CDN,
 * works with zero internet at the venue).
 *
 * Requires a secure context (HTTPS or localhost) for getUserMedia — on
 * iPads this means the mkcert-trusted HTTPS URL. See RUNBOOK.md.
 *
 * PRIVACY: decoded barcode text goes straight to the onDecoded callback
 * (which parses AAMVA and discards); frames and text are never stored.
 */
(function (root) {
  'use strict';

  var zxingReady = null;
  var stream = null;
  var running = false;
  var video = null;
  var canvas = null;

  function loadZxing() {
    if (!zxingReady) {
      zxingReady = import('/vendor/zxing/reader.js').then(function (mod) {
        mod.prepareZXingModule({
          overrides: {
            locateFile: function (p, prefix) {
              return p.endsWith('.wasm') ? '/vendor/zxing/zxing_reader.wasm' : prefix + p;
            }
          }
        });
        return mod;
      });
    }
    return zxingReady;
  }

  function stop() {
    running = false;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (video) video.srcObject = null;
  }

  /**
   * Start scanning. opts: { video: <video el>, onDecoded(text), onError(msg) }
   * Resolves when the camera is live. Decoding loops ~5 fps until stop().
   */
  async function start(opts) {
    video = opts.video;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera unavailable. This page must be opened over HTTPS ' +
        '(or localhost) for camera access — see RUNBOOK.md.');
    }
    var mod = await loadZxing();
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },   // PDF417 is dense; ask for a high-res feed
        height: { ideal: 1080 }
      },
      audio: false
    });
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // iOS: stay inline, not fullscreen
    await video.play();

    canvas = canvas || document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    running = true;

    // Webcams (fixed focus, backlighting, glare) produce marginal frames;
    // rotate through binarization strategies — each handles a different
    // failure mode (uneven lighting vs. low contrast vs. washed-out).
    var BINARIZERS = ['LocalAverage', 'GlobalHistogram', 'FixedThreshold'];
    var frameNo = 0;

    // Licenses carry small 1D barcodes (MD prints an inventory number in
    // Code 128) NEXT TO the PDF417, and the 1D code often decodes first.
    // With preferPdf417, a non-PDF417 hit is held for a grace period —
    // if a PDF417 shows up it wins; if not (it's a real badge/dept ID),
    // the held result is emitted.
    var GRACE_MS = 3000;
    var held = null;

    async function tick() {
      if (!running) return;
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var results = await mod.readBarcodes(imageData, {
            // PDF417 = licenses; the rest cover department IDs and misc
            // badges (1D linear formats + QR/DataMatrix/Aztec).
            formats: opts.formats || ['PDF417', 'Code128', 'Code39', 'Code93',
              'Codabar', 'ITF', 'QRCode', 'DataMatrix', 'Aztec'],
            tryHarder: true,
            tryInvert: true,
            binarizer: BINARIZERS[frameNo % BINARIZERS.length],
            textMode: 'Plain',   // raw control chars for AAMVA parsing
            maxNumberOfSymbols: 4
          });
          frameNo++;
          if (opts.onFrame) opts.onFrame(frameNo);
          if (running) {
            var valid = results.filter(function (r) { return r.isValid; });
            var pdf = valid.filter(function (r) { return r.format === 'PDF417'; })[0];
            if (pdf) { opts.onDecoded(pdf.text, pdf.format); return; }
            if (valid.length) {
              if (!opts.preferPdf417) {
                opts.onDecoded(valid[0].text, valid[0].format);
                return;
              }
              if (!held) held = { text: valid[0].text, format: valid[0].format, t: Date.now() };
            }
            if (held && Date.now() - held.t > GRACE_MS) {
              opts.onDecoded(held.text, held.format);
              return;
            }
          }
        } catch (e) {
          if (opts.onError) opts.onError(String(e && e.message || e));
        }
      }
      setTimeout(tick, 120);
    }
    tick();
  }

  root.CameraScan = { start: start, stop: stop, isSecure: function () {
    return window.isSecureContext === true;
  } };
})(window);
