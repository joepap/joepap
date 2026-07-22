/* The OCR-fix screen: a zoomed crop of the real scanned line next to
 * editable fields. The treasurer corrects by eye; Enter = save & next. */
(function () {
  'use strict';
  var api = Dues.api, esc = Dues.esc;
  var $ = function (id) { return document.getElementById(id); };
  var impId = parseInt(Dues.qs('id'), 10);
  var onlyRow = parseInt(Dues.qs('row'), 10) || 0;   // deep link to one row
  var pagesById = {};
  var total = 0, doneCount = 0;

  Dues.gate(function () {
    if (!impId) { location.href = '/'; return; }
    $('backLink').href = '/import.html?id=' + impId;
    $('doneLink').href = '/import.html?id=' + impId;
    load();
  });

  function load() {
    var filter = onlyRow ? 'all' : 'flagged';
    api('/api/imports/' + impId + '/rows?filter=' + filter).then(function (r) {
      if (r.status !== 200) return;
      (r.body.pages || []).forEach(function (p) { pagesById[p.page] = p; });
      var rows = r.body.rows;
      if (onlyRow) {
        rows = rows.filter(function (x) { return x.id === onlyRow; });
        $('revTitle').textContent = 'One row (from the full list)';
      }
      total = rows.length; doneCount = 0;
      $('reviewList').innerHTML = '';
      rows.forEach(function (row, i) { $('reviewList').appendChild(item(row, i)); });
      progress();
      if (!rows.length && !onlyRow) { $('allDone').classList.remove('hidden'); }
      var first = document.querySelector('.review-item input');
      if (first) first.focus();
    });
  }

  function progress() {
    var left = total - doneCount;
    $('revProgress').innerHTML = total
      ? '<div class="banner ' + (left ? 'yellow' : 'green') + '">' +
        (left ? left + ' of ' + total + ' left to check' : 'All ' + total + ' checked ✓') + '</div>'
      : (onlyRow ? '' : '<div class="banner green">Nothing needs review 🎉</div>');
    if (total && !left && !onlyRow) $('allDone').classList.remove('hidden');
  }

  /* Crop the page scan around the row's bounding box using CSS background
   * math — the browser does the cropping, no server image processing. */
  function setCrop(el, row) {
    var pg = pagesById[row.page];
    if (!pg || !pg.width || !row.bx1) { el.style.display = 'none'; return; }
    var padX = 14, padY = 10;
    var x0 = Math.max(0, row.bx0 - padX), y0 = Math.max(0, row.by0 - padY);
    var x1 = Math.min(pg.width, row.bx1 + padX), y1 = Math.min(pg.height, row.by1 + padY);
    var w = el.clientWidth || el.parentElement.clientWidth || 600;
    // Fit the crop to the container width; if that would make it taller
    // than 170px, shrink to fit height instead. Aspect always preserved.
    var s = w / (x1 - x0);
    if ((y1 - y0) * s > 170) s = 170 / (y1 - y0);
    el.style.height = Math.max(46, Math.round((y1 - y0) * s)) + 'px';
    el.style.backgroundImage = 'url("/api/imports/' + impId + '/page/' + row.page +
      '.png?pin=' + encodeURIComponent(Dues.pin()) + '")';
    el.style.backgroundSize = (pg.width * s) + 'px ' + (pg.height * s) + 'px';
    el.style.backgroundPosition = (-x0 * s) + 'px ' + (-y0 * s) + 'px';
  }

  function item(row, idx) {
    var div = document.createElement('div');
    div.className = 'review-item';
    div.innerHTML =
      '<div class="muted small">Page ' + row.page + ', line ' + row.line_no +
      ' · computer read: <span class="mono">' + esc(row.ocr_text) + '</span></div>' +
      '<div class="crop mt" title="the actual scanned line"></div>' +
      (row.review_reason ? '<div class="why">⚠ ' + esc(row.review_reason) + '</div>' : '') +
      '<div class="review-fields">' +
      '<div><label>Emplid (0 + 7 digits)</label><input type="text" class="f-emplid mono" inputmode="numeric" value="' + esc(row.emplid) + '"></div>' +
      '<div><label>Name — LAST,FIRST M</label><input type="text" class="f-name" value="' + esc(row.name) + '"></div>' +
      '<div><label>Grade</label><input type="text" class="f-grade" value="' + esc(row.grade) + '"></div>' +
      '<div><label>Step</label><input type="text" class="f-step" inputmode="numeric" value="' + esc(row.step) + '"></div>' +
      '</div>' +
      '<div class="review-actions">' +
      '<button class="primary a-save">✓ Save (Enter)</button>' +
      '<button class="a-ok">Looks right as-is</button>' +
      '<button class="ghost a-junk">Not a member line ✗</button>' +
      '</div>' +
      '<div class="err a-err" style="color:#b91c1c;font-weight:600;min-height:1.1em"></div>';

    var crop = div.querySelector('.crop');
    requestAnimationFrame(function () { setCrop(crop, row); });

    function done(label) {
      div.classList.add('done');
      div.querySelector('.review-actions').innerHTML =
        '<span class="flag green">' + label + '</span>';
      doneCount++; progress();
      var next = div.nextElementSibling;
      while (next && next.classList.contains('done')) next = next.nextElementSibling;
      var inp = next && next.querySelector('input');
      if (inp) { inp.focus(); next.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }

    function send(body, label) {
      api('/api/rows/' + row.id, { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
        if (r.status !== 200) {
          div.querySelector('.a-err').textContent = r.body.error || 'failed — try again';
          return;
        }
        div.querySelector('.a-err').textContent = '';
        done(label);
      });
    }

    div.querySelector('.a-save').onclick = function () {
      send({ action: 'save',
        emplid: div.querySelector('.f-emplid').value,
        name: div.querySelector('.f-name').value,
        grade: div.querySelector('.f-grade').value,
        step: div.querySelector('.f-step').value }, 'saved ✓');
    };
    div.querySelector('.a-ok').onclick = function () { send({ action: 'confirm' }, 'confirmed ✓'); };
    div.querySelector('.a-junk').onclick = function () { send({ action: 'exclude' }, 'excluded ✗'); };
    div.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        div.querySelector('.a-save').click();
      }
    });
    return div;
  }
})();
