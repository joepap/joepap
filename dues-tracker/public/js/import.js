/* Import detail: OCR progress → review link → finalize/compare → changes + exports. */
(function () {
  'use strict';
  var api = Dues.api, esc = Dues.esc;
  var $ = function (id) { return document.getElementById(id); };
  var impId = parseInt(Dues.qs('id'), 10);
  var curKind = 'stopped';
  var pollTimer = null;
  var lastStatus = '';

  Dues.gate(function () {
    if (!impId) { location.href = '/'; return; }
    refresh();
    wireRows();
    $('reviewLink').href = '/review.html?id=' + impId;
    $('nepLink').href = '/api/imports/' + impId + '/nep.xlsx?pin=' + encodeURIComponent(Dues.pin());
  });

  function refresh() {
    api('/api/imports/' + impId).then(function (r) {
      if (r.status === 404) { location.href = '/'; return; }
      if (r.status !== 200) return;
      render(r.body);
      var st = r.body.import.status;
      clearTimeout(pollTimer);
      // Poll fast while OCR runs, slowly otherwise (another device may edit).
      pollTimer = setTimeout(refresh, st === 'processing' ? 1500 : 8000);
      if (lastStatus === 'processing' && st === 'review') loadRows();  // OCR just finished
      lastStatus = st;
    });
  }

  function render(d) {
    var imp = d.import, c = d.counts;
    var label = imp.report_date || (imp.uploaded_at || '').slice(0, 10);
    $('impTitle').textContent = 'Report — ' + label;
    document.title = 'Report ' + label + ' — Local 36 Dues Tracker';

    // ------- status header -------
    var h = '<div class="muted small">' + esc(imp.filename) + ' · uploaded ' + esc(imp.uploaded_at) + '</div>';
    if (imp.status === 'processing') {
      var pct = imp.pages ? Math.round(imp.pages_done / imp.pages * 100) : 0;
      h += '<div class="banner blue mt">Reading the scan — page ' + imp.pages_done + ' of ' +
        (imp.pages || '…') + '</div>' +
        '<div class="progress"><div style="width:' + pct + '%">' + pct + '%</div></div>' +
        '<p class="muted small">You can close this page — reading continues on the server. ' +
        (imp.error ? esc(imp.error) : '') + '</p>';
    } else if (imp.status === 'failed') {
      h += '<div class="banner red mt">Import failed: ' + esc(imp.error || 'unknown error') + '</div>';
    } else {
      h += '<div class="stat-grid mt">' +
        stat(c.total, 'Rows (dues payers)') +
        stat(c.flagged, 'Still to review', c.flagged ? 'red' : 'green') +
        stat(c.fixed + c.edited, 'Fixed by hand') +
        stat(c.avg_conf == null ? '—' : c.avg_conf + '%', 'Avg. OCR confidence') +
        stat(c.excluded, 'Excluded lines') + '</div>';
    }
    $('impStatusArea').innerHTML = h;

    var done = imp.status === 'review' || imp.status === 'ready';
    $('reviewCard').classList.toggle('hidden', !done);
    $('finalizeCard').classList.toggle('hidden', !done);
    $('rowsCard').classList.toggle('hidden', !done);
    $('exportCard').classList.toggle('hidden', imp.status !== 'ready');
    $('changesCard').classList.toggle('hidden', imp.status !== 'ready');
    $('dangerCard').classList.toggle('hidden', imp.status === 'processing');

    if (done) {
      $('reviewSummary').innerHTML = c.flagged
        ? '<div class="banner yellow">' + c.flagged + ' row' + (c.flagged === 1 ? '' : 's') +
          ' need' + (c.flagged === 1 ? 's' : '') + ' your eyes — the scan wasn\'t clear enough to trust.</div>'
        : '<div class="banner green">Nothing left to review' +
          (c.fixed + c.edited ? ' — ' + (c.fixed + c.edited) + ' fixed by hand.' : ' — every row read cleanly.') + '</div>';

      if (imp.status === 'ready') {
        $('finalizeTitle').textContent = 'Re-run the comparison';
        $('finalizeInfo').textContent = 'Already compared' +
          (d.prev ? ' against ' + (d.prev.report_date || d.prev.uploaded_at.slice(0, 10)) : ' (first import)') +
          '. Re-run after fixing more rows (edits already re-compare automatically).';
        $('doFinalize').textContent = 'Re-run comparison';
        $('doFinalize').className = 'ghost big mt';
      } else {
        $('finalizeInfo').textContent = d.would_compare_to
          ? 'Will compare against the ' + d.would_compare_to.label + ' report.'
          : 'This is the first report — it becomes the baseline.';
      }
    }

    if (imp.status === 'ready') renderChanges(d.changes, d.prev);
  }

  function stat(num, label, cls) {
    return '<div class="stat"><div class="num ' + (cls || '') + '">' + num +
      '</div><div class="lbl">' + esc(label) + '</div></div>';
  }

  // ------- finalize -------
  $('doFinalize').onclick = function () {
    $('doFinalize').disabled = true;
    $('finalizeStatus').textContent = 'comparing…';
    api('/api/imports/' + impId + '/finalize', { method: 'POST' }).then(function (r) {
      $('doFinalize').disabled = false;
      if (r.status !== 200) { $('finalizeStatus').textContent = '✗ ' + (r.body.error || 'failed'); return; }
      var s = r.body.summary;
      $('finalizeStatus').textContent = s.comparedTo
        ? '✓ compared against ' + s.comparedTo.label + ': ' + s.stopped + ' stopped, ' +
          s.new + ' new, ' + s.changed + ' changed'
        : '✓ saved as the baseline (first report)';
      refresh();
    });
  };

  // ------- changes -------
  Array.prototype.forEach.call(document.querySelectorAll('#chTabs button'), function (b) {
    b.onclick = function () {
      curKind = b.getAttribute('data-kind');
      Array.prototype.forEach.call(document.querySelectorAll('#chTabs button'), function (x) {
        x.classList.toggle('active', x === b);
      });
      refresh();
    };
  });

  function renderChanges(changes, prev) {
    $('changesVs').textContent = prev
      ? '— vs the ' + (prev.report_date || prev.uploaded_at.slice(0, 10)) + ' report'
      : '— first report, nothing to compare';
    var by = { stopped: [], new: [], changed: [] };
    changes.forEach(function (ch) { (by[ch.kind] || []).push(ch); });
    $('nStopped').textContent = '(' + by.stopped.length + ')';
    $('nNew').textContent = '(' + by.new.length + ')';
    $('nChanged').textContent = '(' + by.changed.length + ')';

    var list = by[curKind] || [];
    var ae = document.activeElement;
    if (ae && $('changesList').contains(ae)) return;   // don't rebuild under typing

    $('changesList').innerHTML = list.length ? list.map(function (ch) {
      return '<div class="chitem' + (ch.status === 'handled' ? ' handled' : '') + '" data-ch="' + ch.id + '">' +
        '<div><div class="nm">' + esc(ch.name || '(no name)') + '</div>' +
        '<div class="muted small mono">' + esc(ch.emplid || 'no emplid') +
        (ch.matched_by === 'name' ? ' · matched by name' : '') + '</div></div>' +
        '<div class="dt">' + esc(ch.detail) + '</div>' +
        '<input type="text" class="ch-note" placeholder="note (retired, error, called…)" value="' + esc(ch.note) + '">' +
        '<button class="' + (ch.status === 'handled' ? 'ghost' : 'primary') + ' ch-btn">' +
        (ch.status === 'handled' ? 'Reopen' : '✓ Handled') + '</button>' +
        '</div>';
    }).join('') : '<span class="muted">none' +
      (curKind === 'stopped' ? ' — nobody stopped paying 🎉' : '') + '</span>';

    Array.prototype.forEach.call(document.querySelectorAll('.chitem'), function (el) {
      var id = el.getAttribute('data-ch');
      var ch = list.find(function (x) { return String(x.id) === id; });
      el.querySelector('.ch-btn').onclick = function () {
        api('/api/changes/' + id, { method: 'POST', body: JSON.stringify({
          status: ch.status === 'handled' ? 'open' : 'handled',
          note: el.querySelector('.ch-note').value
        }) }).then(refresh);
      };
      el.querySelector('.ch-note').addEventListener('change', function () {
        api('/api/changes/' + id, { method: 'POST', body: JSON.stringify({
          status: ch.status, note: this.value
        }) });
      });
    });
  }

  // ------- rows table -------
  var rowsTimer = null;
  function wireRows() {
    $('rowSearch').addEventListener('input', function () {
      clearTimeout(rowsTimer); rowsTimer = setTimeout(loadRows, 250);
    });
    $('rowFilter').onchange = loadRows;
    loadRows();
  }

  function loadRows() {
    api('/api/imports/' + impId + '/rows?filter=' + $('rowFilter').value +
        '&q=' + encodeURIComponent($('rowSearch').value.trim())).then(function (r) {
      if (r.status !== 200) return;
      var rows = r.body.rows;
      $('rowsBody').innerHTML = rows.map(function (row) {
        var conf = row.edited ? '<span class="flag blue">fixed</span>'
          : row.confidence >= 85 ? '<span class="flag green">' + Math.round(row.confidence) + '%</span>'
          : '<span class="flag ' + (row.needs_review && !row.reviewed ? 'red' : 'yellow') + '">' +
            Math.round(row.confidence) + '%</span>';
        return '<tr><td>' + row.page + '</td>' +
          '<td class="mono">' + esc(row.emplid || '—') + '</td>' +
          '<td>' + esc(row.name || row.ocr_text.slice(0, 40)) + '</td>' +
          '<td>' + esc(row.grade) + '</td><td>' + esc(row.step) + '</td>' +
          '<td>' + conf + '</td>' +
          '<td><a class="small" href="/review.html?id=' + impId + '&row=' + row.id + '">view</a></td></tr>';
      }).join('') || '<tr><td colspan="7" class="muted">no rows match</td></tr>';
      $('rowsNote').textContent = rows.length === 2500 ? 'Showing the first 2,500 — narrow the search.' : '';
    });
  }

  // ------- delete -------
  $('doDelete').onclick = function () {
    var typed = prompt('This permanently removes this import, its rows and its page scans.\n' +
      'Only for botched uploads. Type DELETE to confirm:');
    if (typed === null) return;
    if (typed !== 'DELETE') { alert('Not deleted — you must type DELETE exactly.'); return; }
    api('/api/imports/' + impId + '/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) })
      .then(function (r) {
        if (r.status !== 200) { alert(r.body.error || 'failed'); return; }
        location.href = '/';
      });
  };
})();
