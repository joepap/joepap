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

    async function tick() {
      if (!running) return;
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var results = await mod.readBarcodes(imageData, {
            formats: ['PDF417'],
            tryHarder: true,
            tryInvert: true,
            binarizer: BINARIZERS[frameNo % BINARIZERS.length],
            textMode: 'Plain',   // raw control chars for AAMVA parsing
            maxNumberOfSymbols: 1
          });
          frameNo++;
          if (opts.onFrame) opts.onFrame(frameNo);
          if (results.length && results[0].isValid && running) {
            opts.onDecoded(results[0].text);
            return; // caller decides whether to restart
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
