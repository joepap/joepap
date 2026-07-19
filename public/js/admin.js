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
    fetch('/api/export/notfound.csv', { headers: { 'X-Admin-Pin': pin } }).then(function (r) {
      if (r.status === 200) {
        sessionStorage.setItem('admin36_pin', pin);
        $('pinCard').classList.add('hidden');
        $('adminBody').classList.remove('hidden');
        loadSettings();
        refreshStats();
        setInterval(refreshStats, 5000);
        setupTabs();
      } else {
        alert('Wrong PIN');
      }
    });
  }
  $('pinSave').onclick = unlock;
  $('pinBox').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
  if (pin) { $('pinBox').value = pin; unlock(); }

  // ---------- tabs (Dashboard | Help Table) ----------
  var helpHandle = null;
  function setupTabs() {
    $('tabDash').onclick = function () {
      $('tabDash').classList.add('active'); $('tabHelp').classList.remove('active');
      $('dashTab').classList.remove('hidden'); $('helpTableTab').classList.add('hidden');
    };
    $('tabHelp').onclick = function () {
      $('tabHelp').classList.add('active'); $('tabDash').classList.remove('active');
      $('helpTableTab').classList.remove('hidden'); $('dashTab').classList.add('hidden');
      // Mount the shared Help Table once, reusing the admin PIN already entered.
      if (!helpHandle && window.HelpTable) helpHandle = window.HelpTable.mount($('helpTableTab'), pin);
    };
  }

  // ---------- stats ----------
  var METHOD_LABELS = { portal_id: 'Portal + ID', license_scan: 'License scan', dept_id: 'Dept ID', other: 'Other' };

  var lastStats = null;
  function refreshStats() {
    api('/api/stats').then(function (r) { return r.body; }).then(function (s) {
      lastStats = s;
      $('statsTs').textContent = '· updated ' + new Date().toLocaleTimeString();
      if ($('tabHelpCount')) $('tabHelpCount').textContent = s.discrepancy_pending ? '(' + s.discrepancy_pending + ')' : '';
      var turnout = s.payroll_total ? Math.round((s.checked_in / s.payroll_total) * 100) : null;
      $('statGrid').innerHTML =
        stat(s.checked_in, 'Checked in') +
        (s.payroll_total ? stat(turnout + '%', 'Turnout (of dues-payers)') : '') +
        (s.payroll_total ? stat(Math.max(0, s.payroll_total - s.checked_in), 'Eligible not yet in') : '') +
        stat(s.payroll_total || 0, 'On payroll (eligible)') +
        stat(s.ballots_issued, 'Ballots issued') +
        stat(s.members_total, 'Roster size') +
        stat(s.not_found, 'Not found') +
        stat(s.access_granted_today, 'Access granted') +
        stat(s.contact_corrections, 'Contact fixes') +
        stat(s.email_group_flags, 'Email-group flags') +
        stat(s.discrepancy_pending, 'Discrepancy queue') +
        stat(s.payroll_only_checked_in, 'Payroll-only voted') +
        stat(s.voided, 'Voided') +
        (s.mail_enabled
          ? stat(s.emails_sent, 'Emails sent') +
            stat(s.emails_failed, 'Emails failed') +
            stat(s.emails_skipped, 'No email on file')
          : '');
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
    ['middle_name', 'Middle name'],
    ['member_no', 'Member #'], ['dues_status', 'Member status'], ['portal_status', 'Portal status'],
    ['email', 'Email'], ['phone', 'Phone'], ['last_updated', 'Last updated'],
    ['dob', 'Date of birth (optional)'], ['dept_id', 'Dept ID / pat tag (optional)'],
    ['groups', 'Groups (email lists)'], ['street', 'Street address'], ['street2', 'Street address 2'],
    ['city', 'City'], ['state', 'State'], ['zip', 'Zip'],
    ['rank', 'Rank'], ['platoon', 'Platoon'], ['assignment', 'Assignment / company'],
    ['appt_date', 'Appointment date'], ['paramedic', 'Paramedic']
  ];
  // Mirror of the server's fallback rule — used only to pre-check the
  // good-standing boxes; the admin's final selection is what gets sent.
  var BAD_DUES = /(suspend|delinq|arrear|expell|lapsed|inactive|not.?in.?good|owe[sd]?|drop|deceased|resign|quit|alumni|blank)/i;
  var lastPreview = null;

  function buildMapGrid(gridEl, headers, fields) {
    gridEl.innerHTML = fields.map(function (f) {
      var picked = false; // first matching header wins; never double-select
      return '<div><label>' + f[1] + '</label><select data-field="' + f[0] + '">' +
        '<option value="">— none —</option>' +
        headers.map(function (h) {
          var sel = !picked && guess(f[0], h) ? (picked = true, ' selected') : '';
          return '<option value="' + esc(h) + '"' + sel + '>' + esc(h) + '</option>';
        }).join('') + '</select></div>';
    }).join('');
  }
  function guess(field, header) {
    // Keep digits: "Street Address 2" must not collapse into "Street Address".
    var h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    var map = {
      full_name: ['fullname', 'membername', 'name'],
      last_name: ['lastname', 'last', 'surname'],
      first_name: ['firstname', 'first', 'givenname'],
      middle_name: ['middlename', 'middle', 'middleinitial', 'mi'],
      member_no: ['memberno', 'membernumber', 'memberid', 'cardno', 'iaffmembernumber', 'iaffnumber'],
      dues_status: ['duesstatus', 'dues', 'memberstatus', 'standing'],
      portal_status: ['status', 'portalstatus', 'accountstatus'],
      email: ['email', 'emailaddress'],
      phone: ['phone', 'cell', 'mobile', 'phonenumber', 'cellphone'],
      last_updated: ['lastupdated', 'updated', 'modified', 'lastmodified', 'datemodified'],
      dob: ['dateofbirth', 'dob', 'birthdate', 'birthday'],
      dept_id: ['pattag', 'pattagnumber', 'pattagno', 'fdid', 'deptid', 'departmentid',
                'employeeid', 'employeenumber', 'badge', 'badgenumber', 'badgeno'],
      groups: ['groups', 'emailgroups', 'lists'],
      street: ['streetaddress', 'street', 'address', 'addressline'],
      street2: ['streetaddress2', 'street2', 'address2', 'addressline2', 'apt', 'unit'],
      city: ['city', 'town'],
      state: ['state', 'province'],
      zip: ['zip', 'zipcode', 'postalcode', 'postal'],
      rank: ['rank', 'dcfirerank', 'firerank'],
      platoon: ['platoon', 'shift'],
      assignment: ['assignment', 'currentcompany', 'company', 'station', 'unit'],
      appt_date: ['appointmentdate', 'apptdate', 'dateofappointment', 'hiredate'],
      paramedic: ['paramedic', 'medic', 'als']
    };
    return (map[field] || []).indexOf(h) !== -1;
  }

  function renderDuesValues() {
    var col = null;
    Array.prototype.forEach.call($('mapGrid').querySelectorAll('select'), function (s) {
      if (s.getAttribute('data-field') === 'dues_status') col = s.value;
    });
    var d = lastPreview && col && lastPreview.distincts && lastPreview.distincts[col];
    if (!d) { $('duesValuesArea').classList.add('hidden'); return; }
    $('duesValuesArea').classList.remove('hidden');
    $('duesValues').innerHTML = d.map(function (v) {
      // Local 36 rule: only Active members vote — pre-check "Active" alone.
      var checked = v.value.trim().toLowerCase() === 'active' ? ' checked' : '';
      return '<label style="display:block;font-weight:400;margin:6px 0">' +
        '<input type="checkbox" class="duesVal" value="' + esc(v.value) + '"' + checked +
        ' style="width:20px;height:20px;vertical-align:middle"> ' +
        esc(v.value) + ' <span class="muted">(' + v.count + ')</span></label>';
    }).join('');
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
      lastPreview = r.body;
      buildMapGrid($('mapGrid'), r.body.headers, FIELDS);
      $('mappingArea').classList.remove('hidden');
      $('importStatus').textContent = r.body.total + ' rows detected';
      renderDuesValues();
      Array.prototype.forEach.call($('mapGrid').querySelectorAll('select'), function (s) {
        if (s.getAttribute('data-field') === 'dues_status') s.onchange = renderDuesValues;
      });
    });
  });

  $('doImport').onclick = function () {
    var f = $('rosterFile').files[0];
    if (!f) return;
    var mapping = readMapping($('mapGrid'));
    if (!mapping.full_name && !mapping.last_name) { alert('Map Full name, or Last name.'); return; }
    if ($('replaceExisting').checked) {
      // Guard against wiping a live event; echo the real count.
      var live = (lastStats && lastStats.checked_in) || 0;
      var msg = live > 0
        ? '⚠️ Replace roster will DELETE ' + live + ' live check-ins and all members. ' +
          'Do NOT do this during the event. Continue?'
        : 'Replace roster? This clears ALL existing members and check-ins.';
      if (!confirm(msg)) return;
    }
    var fd = new FormData();
    fd.append('file', f);
    fd.append('mapping', JSON.stringify(mapping));
    fd.append('replace', $('replaceExisting').checked ? 'true' : 'false');
    if (!$('duesValuesArea').classList.contains('hidden')) {
      var good = [];
      Array.prototype.forEach.call(document.querySelectorAll('.duesVal:checked'), function (c) {
        good.push(c.value);
      });
      fd.append('dues_good_values', JSON.stringify(good));
    }
    $('importStatus').textContent = 'importing…';
    api('/api/import/roster', { method: 'POST', body: fd }).then(function (r) {
      $('importStatus').textContent = r.status === 200
        ? ('✓ imported ' + r.body.imported + ' members' +
           (r.body.rematch ? ' — re-matched payroll: ' + r.body.rematch.matched + ' eligible' : ''))
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

  // ---------- dept ID list ----------
  $('deptFile').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('file', f);
    api('/api/import/preview', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { alert(r.body.error || 'preview failed'); return; }
      buildMapGrid($('deptMapGrid'), r.body.headers,
        [['dept_id', 'Dept ID / pat tag'], ['member_no', 'Member #'],
         ['full_name', 'Full name'], ['last_name', 'Last name'], ['first_name', 'First name']]);
      $('deptMapArea').classList.remove('hidden');
    });
  });
  $('doDeptImport').onclick = function () {
    var f = $('deptFile').files[0];
    if (!f) return;
    var mapping = readMapping($('deptMapGrid'));
    if (!mapping.dept_id) { alert('Map the Dept ID column.'); return; }
    var fd = new FormData();
    fd.append('file', f);
    fd.append('mapping', JSON.stringify(mapping));
    $('deptStatus').textContent = 'importing…';
    api('/api/import/deptids', { method: 'POST', body: fd }).then(function (r) {
      if (r.status !== 200) { $('deptStatus').textContent = 'failed: ' + (r.body.error || r.status); return; }
      $('deptStatus').textContent = '✓ attached ' + r.body.updated + ' dept IDs';
      $('deptUnmatched').innerHTML = r.body.unmatched.length
        ? '<div class="banner yellow mt">Could not match (fix and re-import, or handle by name search):<br>' +
          r.body.unmatched.slice(0, 50).map(esc).join('<br>') +
          (r.body.unmatched.length > 50 ? '<br>…and ' + (r.body.unmatched.length - 50) + ' more' : '') + '</div>'
        : '';
    });
  };

  // ---------- payroll dues list ----------
  $('doPayrollImport').onclick = function () {
    var f = $('payrollFile').files[0];
    if (!f) { alert('Choose the payroll CSV first.'); return; }
    var fd = new FormData();
    fd.append('file', f);
    $('payrollStatus').textContent = 'importing…';
    api('/api/import/payroll', { method: 'POST', body: fd }).then(function (r) {
      $('payrollStatus').textContent = r.status === 200
        ? ('✓ ' + r.body.total + ' rows — ' + r.body.matched + ' matched NEP, ' + r.body.payrollOnly + ' payroll-only')
        : ('failed: ' + (r.body.error || r.status));
      refreshStats();
    });
  };

  // ---------- exports ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function (b) {
    b.onclick = function () {
      // PIN via query string for a plain download link.
      window.location = b.getAttribute('data-export') + '?pin=' + encodeURIComponent(pin);
    };
  });

  // ---------- event reset ----------
  $('resetEvent').onclick = function () {
    // Echo the live check-in count into the required token so an accidental
    // mid-event reset is nearly impossible.
    api('/api/stats').then(function (r) { return r.body; }).then(function (s) {
      var live = s.checked_in || 0;
      var token = live > 0 ? 'RESET-' + live : 'RESET';
      var warn = live > 0
        ? '⚠️ There are ' + live + ' LIVE check-ins. Resetting deletes all of them permanently.\n\n' +
          'Only do this if the event has NOT started (clearing rehearsal data).\n\nType ' + token + ' to confirm:'
        : 'This clears ALL check-ins, corrections, not-found, discrepancies, email log and ' +
          'provisional members (roster + payroll + settings are kept).\n\nType RESET to confirm:';
      var typed = prompt(warn);
      if (typed !== token) { if (typed !== null) alert('Not reset — you must type ' + token + ' exactly.'); return; }
      api('/api/admin/reset-event', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) })
        .then(function (r) {
          $('resetStatus').textContent = r.status === 200 ? '✓ event data cleared' : 'failed: ' + (r.body.error || r.status);
          refreshStats();
        });
    });
  };

  // ---------- settings ----------
  function loadSettings() {
    api('/api/config').then(function (r) { return r.body; }).then(function (c) {
      $('staleDays').value = c.stale_days;
      $('ballotNumbering').value = c.ballot_numbering;
      $('emailOkGroups').value = c.email_ok_groups || '';
      $('emailBadGroups').value = c.email_bad_groups || '';
      $('curStationPin').textContent = c.station_pin || '';
      $('collectDataRecord').checked = c.collect_datarecord_contact !== 'off';
      $('mailHost').value = c.mail_host || '';
      $('mailPort').value = c.mail_port || '587';
      $('mailUser').value = c.mail_user || '';
      $('mailFrom').value = c.mail_from || '';
      $('meetingLink').value = c.meeting_link || '';
      $('mailSubject').value = c.mail_subject || '';
      $('mailBody').value = c.mail_body || '';
      $('mailEnabled').checked = c.mail_enabled === 'on';
      $('mailPassSet').textContent = c.mail_pass_set ? '(one is stored ✓)' : '(none stored yet)';
      $('mailBadge').textContent = c.mail_enabled === 'on' ? '· ON' : '· off';
    });
  }

  // ---------- check-in email ----------
  $('saveMail').onclick = function () {
    var body = {
      mail_enabled: $('mailEnabled').checked ? 'on' : 'off',
      mail_host: $('mailHost').value.trim(),
      mail_port: $('mailPort').value.trim() || '587',
      mail_user: $('mailUser').value.trim(),
      mail_from: $('mailFrom').value.trim(),
      meeting_link: $('meetingLink').value.trim(),
      mail_subject: $('mailSubject').value,
      mail_body: $('mailBody').value
    };
    if ($('mailPass').value) body.mail_pass = $('mailPass').value;
    if (body.mail_enabled === 'on' && !(body.mail_host && body.mail_user && body.mail_from)) {
      $('mailStatus').textContent = 'Fill in host, username and From before turning it on.';
      return;
    }
    api('/api/config', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
      $('mailStatus').textContent = r.status === 200 ? '✓ saved — now Send test to prove it works' : 'failed';
      $('mailPass').value = '';
      loadSettings();
    });
  };
  $('sendMailTest').onclick = function () {
    var to = $('mailTestTo').value.trim();
    if (!to) { $('mailStatus').textContent = 'Enter an address to send the test to.'; return; }
    $('mailStatus').textContent = 'sending test…';
    api('/api/admin/mail-test', { method: 'POST', body: JSON.stringify({ to: to }) }).then(function (r) {
      $('mailStatus').textContent = r.status === 200
        ? '✓ test sent to ' + to + ' — check the inbox (and spam)'
        : '✗ ' + (r.body.error || 'failed');
    });
  };
  $('saveSettings').onclick = function () {
    var body = {
      stale_days: $('staleDays').value,
      ballot_numbering: $('ballotNumbering').value,
      email_ok_groups: $('emailOkGroups').value,
      email_bad_groups: $('emailBadGroups').value,
      collect_datarecord_contact: $('collectDataRecord').checked ? 'on' : 'off'
    };
    var np = $('newPin').value.trim();
    if (np) body.admin_pin = np;
    var nsp = $('newStationPin').value.trim();
    if (nsp) body.station_pin = nsp;
    api('/api/config', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 200) {
        if (np) { pin = np; sessionStorage.setItem('admin36_pin', pin); $('newPin').value = ''; }
        $('settingsStatus').textContent = '✓ saved';
      } else $('settingsStatus').textContent = 'failed';
    });
  };
})();
