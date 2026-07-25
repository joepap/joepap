/* Home: dashboard numbers, upload, import history, settings. */
(function () {
  'use strict';
  var api = Dues.api, esc = Dues.esc;
  var $ = function (id) { return document.getElementById(id); };
  var isAdmin = false;

  Dues.gate(function (role) {
    isAdmin = role === 'admin';
    if ($('reportDate')) $('reportDate').value = new Date().toISOString().slice(0, 10);
    refresh();
    setInterval(refresh, 5000);
    if (isAdmin) loadSettings();
    else {
      $('uploadCard').innerHTML = '<h3>Import a new report</h3>' +
        '<p class="muted">Importing needs the admin PIN — sign out and back in with it.</p>';
      $('settingsBody').innerHTML = '<p class="muted">Admin PIN required.</p>';
    }
  });

  function stat(num, label, cls) {
    return '<div class="stat"><div class="num ' + (cls || '') + '">' + num +
      '</div><div class="lbl">' + esc(label) + '</div></div>';
  }

  var STATUS_FLAG = {
    processing: '<span class="flag blue">READING…</span>',
    review: '<span class="flag yellow">NEEDS REVIEW</span>',
    ready: '<span class="flag green">DONE</span>',
    failed: '<span class="flag red">FAILED</span>'
  };

  function refresh() {
    api('/api/state').then(function (r) {
      if (r.status !== 200) return;
      var d = r.body;
      // Staff view replaces the upload card, so these fields may not exist.
      var dy = $('duesYear');
      if (dy && !dy.value && d.dues_year) dy.value = d.dues_year;

      var latest = d.latest;
      $('statGrid').innerHTML = latest
        ? stat(latest.total_rows, 'Dues payers (latest report)') +
          stat(latest.stopped, 'Stopped last time', latest.stopped ? 'red' : '') +
          stat(latest.new_payers, 'New payers', latest.new_payers ? 'green' : '') +
          stat(latest.changed, 'Grade/step changes') +
          stat(d.imports.length, 'Reports on file')
        : '<span class="muted">No finalized reports yet. Upload the first one below — ' +
          'it becomes the baseline the next report is compared against.</span>';

      drawTrend(d.trend || []);

      $('importList').innerHTML = d.imports.length ? d.imports.map(function (i) {
        var date = i.report_date || (i.uploaded_at || '').slice(0, 10);
        var nums = '';
        if (i.status === 'ready') {
          nums = '<span class="flag red">' + i.stopped + ' stopped</span>' +
                 '<span class="flag green">' + i.new_payers + ' new</span>' +
                 '<span class="flag gray">' + i.changed + ' changed</span>';
        } else if (i.status === 'review') {
          nums = '<span class="flag yellow">' + i.flagged_rows + ' to review</span>';
        } else if (i.status === 'processing') {
          nums = '<span class="flag blue">page ' + i.pages_done + '/' + (i.pages || '?') + '</span>';
        }
        return '<div class="imp-row" data-id="' + i.id + '">' +
          '<div class="date">' + esc(date) + '</div>' +
          '<div class="meta">' + esc(i.filename) + ' · ' + i.total_rows + ' rows' +
          (i.prev_date ? ' · vs ' + esc(i.prev_date) : '') + '</div>' +
          '<div class="nums">' + nums + '</div>' +
          (STATUS_FLAG[i.status] || '') + '</div>';
      }).join('') : '<span class="muted">none yet — upload the first report above</span>';
      Array.prototype.forEach.call(document.querySelectorAll('.imp-row'), function (el) {
        el.onclick = function () { location.href = '/import.html?id=' + el.getAttribute('data-id'); };
      });
    });
  }

  function drawTrend(trend) {
    if (trend.length < 2) { $('trendWrap').classList.add('hidden'); return; }
    $('trendWrap').classList.remove('hidden');
    var svg = $('spark');
    var W = svg.clientWidth || 600, H = 90, pad = 8;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var vals = trend.map(function (t) { return t.total; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    var x = function (i) { return pad + i * (W - 2 * pad) / (trend.length - 1); };
    var y = function (v) { return H - pad - (v - min) * (H - 2 * pad) / (max - min); };
    var pts = vals.map(function (v, i) { return x(i) + ',' + y(v); }).join(' ');
    svg.innerHTML =
      '<polyline fill="none" stroke="#1d4ed8" stroke-width="3" points="' + pts + '"/>' +
      vals.map(function (v, i) {
        return '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="#1d4ed8"/>' +
          '<text x="' + x(i) + '" y="' + (y(v) - 8) + '" text-anchor="middle" ' +
          'font-size="11" font-weight="700" fill="#33404f">' + v + '</text>';
      }).join('');
    $('sparkLabels').textContent = trend[0].label + '  →  ' + trend[trend.length - 1].label;
  }

  // ---------- PDF upload ----------
  $('doUpload').onclick = function () {
    var f = $('pdfFile').files[0];
    if (!f) { alert('Choose the report PDF first.'); return; }
    var fd = new FormData();
    fd.append('file', f);
    fd.append('report_date', $('reportDate').value);
    fd.append('dues_year', $('duesYear').value);
    $('doUpload').disabled = true;
    $('uploadStatus').textContent = 'Uploading ' + Math.round(f.size / 1024 / 1024 * 10) / 10 + ' MB…';
    api('/api/imports', { method: 'POST', body: fd }).then(function (r) {
      $('doUpload').disabled = false;
      if (r.status !== 200) { $('uploadStatus').textContent = '✗ ' + (r.body.error || 'upload failed'); return; }
      location.href = '/import.html?id=' + r.body.id;
    });
  };

  // ---------- spreadsheet path ----------
  var SHEET_FIELDS = [['emplid', 'Emplid'], ['name', 'Name (LAST,FIRST M)'], ['last_name', 'Last name'],
    ['first_name', 'First name'], ['middle_name', 'Middle'], ['grade', 'Grade'], ['step', 'Step']];
  $('sheetFile').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('file', f);
    api('/api/sheet/preview', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { $('sheetStatus').textContent = '✗ ' + (r.body.error || 'preview failed'); return; }
      $('sheetStatus').textContent = r.body.total + ' rows detected';
      $('sheetMapArea').classList.remove('hidden');
      $('sheetMapGrid').innerHTML = SHEET_FIELDS.map(function (fld) {
        var guessRe = { emplid: /empl/i, name: /^name|member.?name/i, last_name: /last/i,
          first_name: /first/i, middle_name: /middle|^mi$/i, grade: /grade/i, step: /step/i }[fld[0]];
        return '<div><label>' + fld[1] + '</label><select data-field="' + fld[0] + '">' +
          '<option value="">— none —</option>' +
          r.body.headers.map(function (h) {
            var sel = guessRe && guessRe.test(h) ? ' selected' : '';
            return '<option value="' + esc(h) + '"' + sel + '>' + esc(h) + '</option>';
          }).join('') + '</select></div>';
      }).join('');
    });
  });
  $('doSheetImport').onclick = function () {
    var f = $('sheetFile').files[0];
    if (!f) return;
    var mapping = {};
    Array.prototype.forEach.call($('sheetMapGrid').querySelectorAll('select'), function (s) {
      if (s.value) mapping[s.getAttribute('data-field')] = s.value;
    });
    var fd = new FormData();
    fd.append('file', f);
    fd.append('mapping', JSON.stringify(mapping));
    fd.append('report_date', $('reportDate').value);
    fd.append('dues_year', $('duesYear').value);
    $('sheetStatus').textContent = 'importing…';
    api('/api/sheet/import', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { $('sheetStatus').textContent = '✗ ' + (r.body.error || 'failed'); return; }
      location.href = '/import.html?id=' + r.body.id;
    });
  };

  // ---------- settings ----------
  function loadSettings() {
    api('/api/config').then(function (r) {
      if (r.status !== 200) return;
      var c = r.body;
      $('settingsBody').innerHTML =
        '<div class="input-row">' +
        '<div><label>Review threshold (flag rows under this % confidence)</label>' +
        '<input type="number" id="cfgThreshold" min="50" max="100" value="' + esc(c.review_threshold) + '"></div>' +
        '<div><label>Default dues year</label>' +
        '<input type="number" id="cfgYear" value="' + esc(c.dues_year) + '"></div>' +
        '</div>' +
        '<div class="input-row">' +
        '<div><label>Staff password (viewing) — current: ' + esc(c.staff_pin) + '</label>' +
        '<input type="text" id="cfgStaffPin" placeholder="leave blank to keep"></div>' +
        '<div><label>Admin PIN — change</label>' +
        '<input type="text" id="cfgAdminPin" placeholder="leave blank to keep"></div>' +
        '</div>' +
        '<h4 class="mt">“Report imported” email <span class="muted" id="mailBadge">' +
        (c.mail_enabled === 'on' ? '· ON' : '· off') + '</span></h4>' +
        '<p class="muted small">Sends you a one-line summary (stopped payers count) when a report is finalized. ' +
        'Gmail: host smtp.gmail.com, port 587, an App Password (not the normal one).</p>' +
        '<label style="font-weight:400"><input type="checkbox" id="cfgMailOn"' +
        (c.mail_enabled === 'on' ? ' checked' : '') + ' style="width:20px;height:20px;vertical-align:middle"> enabled</label>' +
        '<div class="input-row">' +
        '<div><label>SMTP host</label><input type="text" id="cfgMailHost" value="' + esc(c.mail_host) + '"></div>' +
        '<div><label>Port</label><input type="number" id="cfgMailPort" value="' + esc(c.mail_port) + '"></div>' +
        '</div>' +
        '<div class="input-row">' +
        '<div><label>Username</label><input type="text" id="cfgMailUser" value="' + esc(c.mail_user) + '"></div>' +
        '<div><label>App password ' + (c.mail_pass_set ? '(one is stored ✓)' : '(none yet)') + '</label>' +
        '<input type="password" id="cfgMailPass" placeholder="leave blank to keep"></div>' +
        '</div>' +
        '<div class="input-row">' +
        '<div><label>From</label><input type="email" id="cfgMailFrom" value="' + esc(c.mail_from) + '"></div>' +
        '<div><label>Send summaries to</label><input type="email" id="cfgMailTo" value="' + esc(c.mail_to) + '"></div>' +
        '</div>' +
        '<div class="input-row mt">' +
        '<button class="primary" id="saveSettings">Save settings</button>' +
        '<input type="email" id="mailTestTo" placeholder="send a test to…">' +
        '<button id="sendMailTest">Send test</button>' +
        '</div>' +
        '<div class="muted mt" id="settingsStatus"></div>';

      $('saveSettings').onclick = function () {
        var body = {
          review_threshold: $('cfgThreshold').value,
          dues_year: $('cfgYear').value,
          mail_enabled: $('cfgMailOn').checked ? 'on' : 'off',
          mail_host: $('cfgMailHost').value,
          mail_port: $('cfgMailPort').value,
          mail_user: $('cfgMailUser').value,
          mail_from: $('cfgMailFrom').value,
          mail_to: $('cfgMailTo').value
        };
        if ($('cfgStaffPin').value.trim()) body.staff_pin = $('cfgStaffPin').value.trim();
        if ($('cfgAdminPin').value.trim()) body.admin_pin = $('cfgAdminPin').value.trim();
        if ($('cfgMailPass').value) body.mail_pass = $('cfgMailPass').value;
        api('/api/config', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
          if (r.status !== 200) { $('settingsStatus').textContent = 'failed'; return; }
          if (body.admin_pin) {
            sessionStorage.setItem('dues36_pin', body.admin_pin);
          }
          $('settingsStatus').textContent = '✓ saved';
          loadSettings();
        });
      };
      $('sendMailTest').onclick = function () {
        var to = $('mailTestTo').value.trim();
        if (!to) { $('settingsStatus').textContent = 'Enter an address for the test.'; return; }
        $('settingsStatus').textContent = 'sending…';
        api('/api/mail-test', { method: 'POST', body: JSON.stringify({ to: to }) }).then(function (r) {
          $('settingsStatus').textContent = r.status === 200
            ? '✓ test sent to ' + to + ' — check the inbox (and spam)'
            : '✗ ' + (r.body.error || 'failed');
        });
      };
    });
  }
})();
