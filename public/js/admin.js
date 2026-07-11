(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var pin = sessionStorage.getItem('admin36_pin') || '';

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Admin-Pin': pin }, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- PIN gate ----------
  function unlock() {
    pin = $('pinBox').value.trim() || pin;
    // Validate against an admin-only endpoint.
    api('/api/export/notfound.csv').then(function () {
      return fetch('/api/config').then(function (r) { return r.json(); });
    });
    fetch('/api/export/notfound.csv', { headers: { 'X-Admin-Pin': pin } }).then(function (r) {
      if (r.status === 200) {
        sessionStorage.setItem('admin36_pin', pin);
        $('pinCard').classList.add('hidden');
        $('adminBody').classList.remove('hidden');
        loadSettings();
        refreshStats();
        setInterval(refreshStats, 5000);
      } else {
        alert('Wrong PIN');
      }
    });
  }
  $('pinSave').onclick = unlock;
  $('pinBox').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
  if (pin) { $('pinBox').value = pin; unlock(); }

  // ---------- stats ----------
  var METHOD_LABELS = { portal_id: 'Portal + ID', license_scan: 'License scan', dept_id: 'Dept ID', other: 'Other' };

  function refreshStats() {
    fetch('/api/stats').then(function (r) { return r.json(); }).then(function (s) {
      $('statsTs').textContent = '· updated ' + new Date().toLocaleTimeString();
      $('statGrid').innerHTML =
        stat(s.checked_in, 'Checked in') +
        stat(s.ballots_issued, 'Ballots issued') +
        stat(s.members_total, 'Roster size') +
        stat(s.not_found, 'Not found') +
        stat(s.access_granted_today, 'Access granted') +
        stat(s.contact_corrections, 'Contact fixes') +
        stat(s.voided, 'Voided');
      $('methodGrid').innerHTML = (s.by_method || []).map(function (m) {
        return stat(m.c, METHOD_LABELS[m.verification_method] || m.verification_method);
      }).join('') || '<span class="muted">none yet</span>';
      $('stationTable').querySelector('tbody').innerHTML = (s.by_station || []).map(function (st) {
        return '<tr><td>' + esc(st.station) + '</td><td>' + st.c + '</td><td>' + st.last_10min +
               '</td><td>' + esc(st.last_ts || '') + '</td></tr>';
      }).join('');
      $('recentTable').querySelector('tbody').innerHTML = (s.recent || []).map(function (c) {
        return '<tr><td>' + esc(c.ts) + '</td><td>' + esc(c.last_name + ', ' + c.first_name) +
               '</td><td>' + esc(c.member_no || '') + '</td><td>' + esc(c.station) +
               '</td><td>' + esc(METHOD_LABELS[c.verification_method] || '') +
               '</td><td>' + (c.ballot_no || '') +
               '</td><td><button class="ghost small" style="min-height:36px;padding:6px 12px" data-void="' +
               c.id + '">Void</button></td></tr>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('[data-void]'), function (b) {
        b.onclick = function () {
          var reason = prompt('Void reason (logged):');
          if (reason === null) return;
          api('/api/checkin/' + b.getAttribute('data-void') + '/void', {
            method: 'POST', body: JSON.stringify({ reason: reason, by: 'admin' })
          }).then(refreshStats);
        };
      });
    });
  }
  function stat(num, label) {
    return '<div class="stat"><div class="num">' + num + '</div><div class="lbl">' + esc(label) + '</div></div>';
  }

  // ---------- roster import ----------
  var FIELDS = [
    ['full_name', 'Full name'], ['last_name', 'Last name'], ['first_name', 'First name'],
    ['member_no', 'Member #'], ['dues_status', 'Dues status'], ['email', 'Email'],
    ['phone', 'Phone'], ['last_updated', 'Last updated']
  ];

  function buildMapGrid(gridEl, headers, fields) {
    gridEl.innerHTML = fields.map(function (f) {
      return '<div><label>' + f[1] + '</label><select data-field="' + f[0] + '">' +
        '<option value="">— none —</option>' +
        headers.map(function (h) {
          var sel = guess(f[0], h) ? ' selected' : '';
          return '<option value="' + esc(h) + '"' + sel + '>' + esc(h) + '</option>';
        }).join('') + '</select></div>';
    }).join('');
  }
  function guess(field, header) {
    var h = header.toLowerCase().replace(/[^a-z]/g, '');
    var map = {
      full_name: ['fullname', 'membername', 'name'],
      last_name: ['lastname', 'last', 'surname'],
      first_name: ['firstname', 'first', 'givenname'],
      member_no: ['memberno', 'membernumber', 'memberid', 'cardno', 'id'],
      dues_status: ['duesstatus', 'dues', 'status', 'standing'],
      email: ['email', 'emailaddress'],
      phone: ['phone', 'cell', 'mobile', 'phonenumber', 'cellphone'],
      last_updated: ['lastupdated', 'updated', 'modified', 'lastmodified', 'datemodified']
    };
    return (map[field] || []).indexOf(h) !== -1;
  }
  function readMapping(gridEl) {
    var mapping = {};
    Array.prototype.forEach.call(gridEl.querySelectorAll('select'), function (s) {
      if (s.value) mapping[s.getAttribute('data-field')] = s.value;
    });
    return mapping;
  }

  $('rosterFile').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('file', f);
    api('/api/import/preview', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { alert(r.body.error || 'preview failed'); return; }
      buildMapGrid($('mapGrid'), r.body.headers, FIELDS);
      $('mappingArea').classList.remove('hidden');
      $('importStatus').textContent = r.body.total + ' rows detected';
    });
  });

  $('doImport').onclick = function () {
    var f = $('rosterFile').files[0];
    if (!f) return;
    var mapping = readMapping($('mapGrid'));
    if (!mapping.full_name && !mapping.last_name) { alert('Map Full name, or Last name.'); return; }
    if ($('replaceExisting').checked &&
        !confirm('Replace roster? This clears ALL existing members and check-ins.')) return;
    var fd = new FormData();
    fd.append('file', f);
    fd.append('mapping', JSON.stringify(mapping));
    fd.append('replace', $('replaceExisting').checked ? 'true' : 'false');
    $('importStatus').textContent = 'importing…';
    api('/api/import/roster', { method: 'POST', body: fd }).then(function (r) {
      $('importStatus').textContent = r.status === 200
        ? ('✓ imported ' + r.body.imported + ' members')
        : ('failed: ' + (r.body.error || r.status));
      refreshStats();
    });
  };

  // ---------- paper roll ----------
  $('paperFile').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('file', f);
    api('/api/import/preview', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { alert(r.body.error || 'preview failed'); return; }
      buildMapGrid($('paperMapGrid'), r.body.headers,
        [['member_no', 'Member #'], ['full_name', 'Full name'], ['last_name', 'Last name'], ['first_name', 'First name']]);
      $('paperMapArea').classList.remove('hidden');
    });
  });
  $('doPaperImport').onclick = function () {
    var f = $('paperFile').files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('file', f);
    fd.append('mapping', JSON.stringify(readMapping($('paperMapGrid'))));
    $('paperStatus').textContent = 'importing…';
    api('/api/import/paper', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { $('paperStatus').textContent = 'failed: ' + (r.body.error || r.status); return; }
      $('paperStatus').textContent = '✓ flagged ' + r.body.flagged;
      $('paperUnmatched').innerHTML = r.body.unmatched.length
        ? '<div class="banner yellow mt">Unmatched names:<br>' + r.body.unmatched.map(esc).join('<br>') + '</div>'
        : '';
    });
  };

  // ---------- exports ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function (b) {
    b.onclick = function () {
      // PIN via query string for a plain download link.
      window.location = b.getAttribute('data-export') + '?pin=' + encodeURIComponent(pin);
    };
  });

  // ---------- settings ----------
  function loadSettings() {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      $('staleDays').value = c.stale_days;
      $('ballotNumbering').value = c.ballot_numbering;
    });
  }
  $('saveSettings').onclick = function () {
    var body = {
      stale_days: $('staleDays').value,
      ballot_numbering: $('ballotNumbering').value
    };
    var np = $('newPin').value.trim();
    if (np) body.admin_pin = np;
    api('/api/config', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 200) {
        if (np) { pin = np; sessionStorage.setItem('admin36_pin', pin); $('newPin').value = ''; }
        $('settingsStatus').textContent = '✓ saved';
      } else $('settingsStatus').textContent = 'failed';
    });
  };
})();
