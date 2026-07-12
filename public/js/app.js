/* Check-in station logic. All state that matters lives server-side; this
 * page survives refresh with only station identity in localStorage. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var METHOD_LABELS = {
    portal_id: 'Portal + ID (green lane)',
    license_scan: 'License scan',
    dept_id: 'Department ID',
    other: 'Other'
  };

  // ---------- station identity ----------
  var station = localStorage.getItem('station36') || '';
  var defaultMethod = localStorage.getItem('station36_method') || 'license_scan';

  function showStationModal() {
    $('stationName').value = station;
    $('stationMethod').value = defaultMethod;
    $('stationModal').classList.remove('hidden');
    $('stationName').focus();
  }
  $('stationSave').onclick = function () {
    var name = $('stationName').value.trim();
    if (!name) return;
    station = name;
    defaultMethod = $('stationMethod').value;
    localStorage.setItem('station36', station);
    localStorage.setItem('station36_method', defaultMethod);
    $('stationChip').textContent = 'Station: ' + station;
    $('stationModal').classList.add('hidden');
  };
  $('stationChip').onclick = showStationModal;
  if (!station) showStationModal();
  else $('stationChip').textContent = 'Station: ' + station;

  // ---------- fetch helpers ----------
  function api(path, opts) {
    return fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts)).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    });
  }

  // ---------- search ----------
  var searchTimer = null;
  $('searchBox').addEventListener('input', function () {
    var q = this.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { renderResults([]); return; }
    searchTimer = setTimeout(function () {
      api('/api/search?q=' + encodeURIComponent(q)).then(function (r) {
        renderResults((r.body.members || []).map(function (m) { return { member: m }; }));
      });
    }, 120);
  });

  // Fallback: a slow-configured wedge scanner may land its payload in the
  // search box. If the box suddenly contains AAMVA, route it to the parser.
  $('searchBox').addEventListener('input', function () {
    var v = this.value;
    if (v.length > 40 && v.indexOf('ANSI') !== -1 && v.indexOf('@') !== -1) {
      this.value = '';
      handleScanPayload(v);
    }
  });

  function flagChips(m, dobMatch) {
    var chips = '';
    if (m.checked_in) chips += '<span class="flag red">CHECKED IN</span>';
    else if (!m.dues_status) chips += '<span class="flag gray">NO STATUS</span>';
    else if (!m.dues_ok) chips += '<span class="flag red">STATUS</span>';
    else chips += '<span class="flag green">OK</span>';
    if (dobMatch === true) chips += ' <span class="flag green">DOB &#10003;</span>';
    if (dobMatch === false) chips += ' <span class="flag red">DOB &#10007;</span>';
    if (m.email_list === 'bad') chips += ' <span class="flag red">EMAIL</span>';
    if (m.portal_ok === false) chips += ' <span class="flag yellow">NO PORTAL</span>';
    else if (m.info_stale) chips += ' <span class="flag yellow">STALE INFO</span>';
    return chips;
  }

  function renderResults(items, headerHtml) {
    var box = $('results');
    box.innerHTML = headerHtml || '';
    if (!items.length && headerHtml === undefined) return;
    if (!items.length) {
      box.innerHTML += '<div class="banner yellow">No roster matches. Try fewer letters, or use "Not on roster".</div>';
      return;
    }
    items.forEach(function (it) {
      var m = it.member;
      var btn = document.createElement('button');
      btn.className = 'result-row';
      btn.innerHTML =
        '<div><div class="name">' + esc(m.last_name) + (m.suffix ? ' ' + esc(m.suffix) : '') +
        ', ' + esc(m.first_name) + (m.middle_name ? ' ' + esc(m.middle_name) : '') + '</div>' +
        '<div class="sub">#' + esc(m.member_no || '—') +
        (m.age != null ? ' &middot; age ' + m.age : '') +
        (it.score ? ' &middot; match ' + it.score + '%' : '') + '</div></div>' +
        '<div class="flag-wrap" style="margin-left:auto">' + flagChips(m, it.dob_match) + '</div>';
      btn.onclick = function () { openMember(m.id); };
      $('results').appendChild(btn);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- scan handling (wedge + camera share this) ----------
  function handleScanPayload(raw) {
    // PRIVACY: parse and discard. `raw` (which contains the license number)
    // is not stored, logged, or sent anywhere. Name + DOB go to /api/match
    // for candidate ranking only — the server uses DOB transiently in that
    // request and never stores it.
    var parsed = AAMVA.parse(raw);
    raw = null;
    if (!parsed) {
      renderResults([], '<div class="banner yellow">Scan read, but not a license barcode. Try again or type the name.</div>');
      return;
    }
    var age = AAMVA.ageFromDob(parsed.dob);
    var header = '<div class="banner blue">ID scanned: <strong>' + esc(parsed.lastName) +
      ', ' + esc(parsed.firstName) + '</strong>' +
      (age != null ? ' &middot; age ' + age : '') +
      (parsed.state ? ' &middot; ' + esc(parsed.state) : '') +
      ' — confirm the match below</div>';
    api('/api/match', {
      method: 'POST',
      body: JSON.stringify({ lastName: parsed.lastName, firstName: parsed.firstName, dob: parsed.dob })
    }).then(function (r) {
      var cands = (r.body.candidates || []);
      renderResults(cands, header);
      if (!cands.length) {
        $('results').innerHTML += '<div class="banner yellow">No roster match for this ID. ' +
          'Try a manual search (name may differ from license), or "Not on roster".</div>';
        $('nfName').value = parsed.lastName + ', ' + parsed.firstName;
      }
      // Single high-confidence hit: open it directly, volunteer still confirms.
      if (cands.length === 1 && cands[0].score >= 90) openMember(cands[0].member.id);
    });
  }

  WedgeCapture.start(function (payload) {
    $('scanHint').textContent = 'USB scan received.';
    handleScanPayload(payload);
  });

  // ---------- camera ----------
  $('cameraBtn').onclick = function () {
    if (!CameraScan.isSecure()) {
      alert('Camera needs HTTPS. Open the https:// address for this server ' +
            '(and trust the cert on this iPad) — see RUNBOOK.md.');
      return;
    }
    $('cameraModal').classList.remove('hidden');
    $('camStatus').textContent = 'Starting camera…';
    CameraScan.start({
      video: $('cam'),
      // PDF417 only: licenses carry extra small 1D barcodes (MD prints an
      // inventory number in Code 128) that must not hijack the scan. Dept
      // IDs are handled by USB scanner / typing the number into search.
      formats: ['PDF417'],
      onDecoded: function (text) {
        closeCamera();
        handleScanPayload(text);
      },
      onError: function () { /* per-frame decode errors are normal */ }
    }).then(function () {
      $('camStatus').textContent = 'Point at the barcode on the BACK of the license.';
    }).catch(function (e) {
      $('camStatus').textContent = 'Camera failed: ' + (e && e.message || e);
    });
  };
  function closeCamera() {
    CameraScan.stop();
    $('cameraModal').classList.add('hidden');
  }
  $('cameraClose').onclick = closeCamera;

  // ---------- member card ----------
  var currentMember = null;
  var selectedMethod = null;

  function openMember(id) {
    api('/api/members/' + id).then(function (r) {
      if (r.status !== 200) return;
      currentMember = r.body.member;
      selectedMethod = defaultMethod;
      renderMemberCard();
      $('memberCard').classList.remove('hidden');
      $('memberCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderMemberCard() {
    var m = currentMember;
    var html = '';
    html += '<div class="member-name">' + esc(m.last_name) + (m.suffix ? ' ' + esc(m.suffix) : '') +
            ', ' + esc(m.first_name) + (m.middle_name ? ' ' + esc(m.middle_name) : '') + '</div>';
    html += '<div class="member-meta">Member #' + esc(m.member_no || '—') +
            (m.age != null ? ' &middot; age ' + m.age : '') +
            (m.rank ? ' &middot; ' + esc(m.rank) : '') +
            (m.assignment ? ' &middot; ' + esc(m.assignment) : '') +
            (m.platoon ? ' &middot; Platoon ' + esc(m.platoon) : '') +
            (m.on_paper_roll ? ' &middot; on paper dues roll' : '') + '</div>';
    if (m.dues_status) {
      html += '<div class="dues-pill ' + (m.dues_ok ? 'ok' : 'bad') + '">' +
              (m.dues_ok ? '&#10003; ' : '&#10007; NOT ELIGIBLE — ') + esc(m.dues_status.toUpperCase()) + '</div>';
    } else {
      // No status imported — show neutral, never a false green.
      html += '<div class="dues-pill" style="background:#e6e9ee;color:#5c6b7f;border:2px solid #d8dee6">' +
              'NO STATUS ON FILE &mdash; verify eligibility manually</div>';
    }

    if (m.checked_in) {
      html += '<div class="banner red">ALREADY CHECKED IN at ' + esc(m.checked_in.ts) +
              ' / Station ' + esc(m.checked_in.station) +
              (m.checked_in.ballot_no ? ' / Ballot #' + m.checked_in.ballot_no : '') + '</div>';
    }

    if (m.portal_ok === false) {
      html += '<div class="banner yellow">&#9888; No ConnectPlus portal access (status: ' +
              esc(m.portal_status) + ') — <strong>hand them a portal card</strong>' +
              ' or send to the help lane after check-in.</div>';
    }
    if (m.email_list === 'bad') {
      html += '<div class="banner red">&#9993; Known email problem — they are in a no-email/returned-mail ' +
              'group. Verify their email below; a group fix will be flagged for the office.</div>';
    } else if (m.email_list === 'missing') {
      html += '<div class="banner yellow">&#9993; Not in any email distribution group — a group fix ' +
              'will be flagged when you save below.</div>';
    }

    // Verify & update — always expanded; saving never blocks check-in.
    html += '<details id="infoCheck" open>' +
      '<summary style="font-weight:700;font-size:1.05rem;padding:10px 0;cursor:pointer">' +
      'Verify member info &mdash; &ldquo;Is this all still correct? Are you getting our emails?&rdquo;</summary>';
    html += '<label>Are you receiving our emails?</label>' +
      '<div class="method-grid" id="emailYN" style="grid-template-columns:1fr 1fr">' +
      '<button data-v="yes">Yes</button><button data-v="no">No / not sure</button></div>';
    html += '<div class="input-row">' +
      '<div><label>First name</label><input type="text" id="fixFirst" value="' + esc(m.first_name) + '"></div>' +
      '<div><label>Middle</label><input type="text" id="fixMiddle" value="' + esc(m.middle_name) + '"></div>' +
      '<div><label>Last name</label><input type="text" id="fixLast" value="' + esc(m.last_name) + '"></div></div>';
    html += '<div class="input-row">' +
      '<div><label>Email</label><input type="email" id="fixEmail" value="' + esc(m.email) + '"></div>' +
      '<div><label>Phone</label><input type="tel" id="fixPhone" value="' + esc(m.phone) + '"></div></div>';
    html += '<div class="input-row">' +
      '<div style="flex:2"><label>Street</label><input type="text" id="fixStreet" value="' + esc(m.addr_street) + '"></div>' +
      '<div><label>Apt/Unit</label><input type="text" id="fixStreet2" value="' + esc(m.addr_street2) + '"></div></div>';
    html += '<div class="input-row">' +
      '<div style="flex:2"><label>City</label><input type="text" id="fixCity" value="' + esc(m.addr_city) + '"></div>' +
      '<div><label>State</label><input type="text" id="fixState" value="' + esc(m.addr_state) + '"></div>' +
      '<div><label>Zip</label><input type="text" id="fixZip" value="' + esc(m.addr_zip) + '"></div></div>';
    html += '<div class="input-row">' +
      '<div><label>Rank</label><input type="text" id="fixRank" value="' + esc(m.rank) + '"></div>' +
      '<div><label>Assignment</label><input type="text" id="fixAssignment" value="' + esc(m.assignment) + '"></div>' +
      '<div><label>Platoon</label><input type="text" id="fixPlatoon" value="' + esc(m.platoon) + '"></div></div>';
    html += '<button class="blue mt" id="fixSave" style="width:100%">Save corrections</button>';
    html += '</details>';

    html += '<label style="margin-top:14px">Verification method</label><div class="method-grid" id="methodGrid">';
    Object.keys(METHOD_LABELS).forEach(function (k) {
      html += '<button data-m="' + k + '" class="' + (k === selectedMethod ? 'selected' : '') + '">' +
              METHOD_LABELS[k] + '</button>';
    });
    html += '</div>';
    html += '<input type="text" id="methodNote" class="' + (selectedMethod === 'other' ? '' : 'hidden') +
            '" placeholder="Required note for Other…" autocomplete="off">';

    html += '<div class="mt"><label><input type="checkbox" id="accessGranted" style="width:22px;height:22px;vertical-align:middle"' +
            (m.access_granted_at ? ' checked disabled' : '') + '> Portal access granted today (help lane)' +
            (m.access_granted_at ? ' — logged ' + esc(m.access_granted_at) : '') + '</label></div>';

    if (m.checked_in) {
      html += '<button class="big danger mt" disabled>Already checked in — no ballot</button>';
    } else {
      html += '<button class="big primary mt" id="doCheckin">&#10003; Check In + Issue Ballot</button>';
    }
    html += '<button class="ghost mt" id="closeMember" style="width:100%">Back</button>';

    $('memberCard').innerHTML = html;

    var grid = $('methodGrid');
    Array.prototype.forEach.call(grid.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        selectedMethod = b.getAttribute('data-m');
        Array.prototype.forEach.call(grid.querySelectorAll('button'), function (x) {
          x.classList.toggle('selected', x === b);
        });
        $('methodNote').classList.toggle('hidden', selectedMethod !== 'other');
      };
    });

    var emailYN = '';
    Array.prototype.forEach.call($('emailYN').querySelectorAll('button'), function (b) {
      b.onclick = function () {
        emailYN = b.getAttribute('data-v');
        Array.prototype.forEach.call($('emailYN').querySelectorAll('button'), function (x) {
          x.classList.toggle('selected', x === b);
        });
        if (emailYN === 'no') $('infoCheck').setAttribute('open', '');
      };
    });
    $('fixSave').onclick = function () { saveContactFix(emailYN); };
    if ($('accessGranted') && !m.access_granted_at) {
      $('accessGranted').onchange = function () {
        if (!this.checked) return;
        api('/api/members/' + m.id + '/access-granted', {
          method: 'POST', body: JSON.stringify({ station: station })
        });
      };
    }
    if ($('doCheckin')) $('doCheckin').onclick = doCheckin;
    $('closeMember').onclick = closeMember;
  }

  function saveContactFix(emailYN) {
    var m = currentMember;
    var val = function (id) { return $(id) ? $(id).value.trim() : ''; };
    var changed = function (v, old) { return v !== (old || '').trim() ? v : ''; };
    // Flag a ConnectPlus group fix when they say they're not getting emails,
    // or their groups already show a known problem.
    var fixGroup = (emailYN === 'no') || m.email_list === 'bad' || m.email_list === 'missing';
    api('/api/members/' + m.id + '/contact', {
      method: 'POST',
      body: JSON.stringify({
        // Only send fields the volunteer actually changed, so the export
        // shows real corrections rather than every prefilled value.
        first_name: changed(val('fixFirst'), m.first_name),
        middle_name: changed(val('fixMiddle'), m.middle_name),
        last_name: changed(val('fixLast'), m.last_name),
        email: changed(val('fixEmail'), m.email),
        phone: changed(val('fixPhone'), m.phone),
        street: changed(val('fixStreet'), m.addr_street),
        street2: changed(val('fixStreet2'), m.addr_street2),
        city: changed(val('fixCity'), m.addr_city),
        state: changed(val('fixState'), m.addr_state),
        zip: changed(val('fixZip'), m.addr_zip),
        rank: changed(val('fixRank'), m.rank),
        assignment: changed(val('fixAssignment'), m.assignment),
        platoon: changed(val('fixPlatoon'), m.platoon),
        receiving_emails: emailYN || '',
        fix_email_group: fixGroup,
        station: station
      })
    }).then(function () {
      $('fixSave').textContent = 'Saved ✓' + (fixGroup ? ' — email group flagged for the office' : '');
      $('fixSave').disabled = true;
    });
  }

  function closeMember() {
    currentMember = null;
    $('memberCard').classList.add('hidden');
    $('searchBox').value = '';
    renderResults([], '');
    $('searchBox').focus();
  }

  function doCheckin() {
    if (!station) { showStationModal(); return; }
    var note = $('methodNote') ? $('methodNote').value.trim() : '';
    if (selectedMethod === 'other' && !note) {
      $('methodNote').focus();
      $('methodNote').style.borderColor = '#b91c1c';
      return;
    }
    $('doCheckin').disabled = true;
    api('/api/checkin', {
      method: 'POST',
      body: JSON.stringify({
        member_id: currentMember.id,
        station: station,
        verification_method: selectedMethod,
        method_note: note
      })
    }).then(function (r) {
      if (r.status === 200) {
        showSuccess(r.body);
      } else if (r.status === 409) {
        showDuplicate(r.body);
      } else {
        alert('Check-in failed: ' + (r.body.error || r.status));
        $('doCheckin').disabled = false;
      }
    });
  }

  function showSuccess(body) {
    var m = body.member;
    $('successName').textContent = m.first_name + ' ' + m.last_name + ' — checked in';
    $('successBallot').textContent = body.ballot_no ? 'Ballot #' + body.ballot_no : '';
    $('successSub').textContent = body.ballot_no ? 'Hand them ballot #' + body.ballot_no : 'Hand them their ballot';
    $('successFlash').classList.remove('hidden');
    setTimeout(hideSuccess, 2600);
    $('successFlash').onclick = hideSuccess;
  }
  function hideSuccess() {
    $('successFlash').classList.add('hidden');
    closeMember();
  }

  function showDuplicate(body) {
    var ex = body.existing || {};
    $('dupDetail').textContent = (body.member ? body.member.first_name + ' ' + body.member.last_name : '') +
      ' — at ' + (ex.ts || '?') + ' / Station ' + (ex.station || '?') +
      (ex.ballot_no ? ' / Ballot #' + ex.ballot_no : '');
    $('dupOverlay').classList.remove('hidden');
  }
  $('dupClose').onclick = function () {
    $('dupOverlay').classList.add('hidden');
    closeMember();
  };

  // ---------- not found ----------
  $('notFoundBtn').onclick = function () {
    $('notFoundCard').classList.remove('hidden');
    if (!$('nfName').value) $('nfName').value = $('searchBox').value.trim();
    $('nfName').focus();
  };
  $('nfCancel').onclick = function () {
    $('notFoundCard').classList.add('hidden');
    $('nfName').value = ''; $('nfNotes').value = '';
  };
  $('nfSave').onclick = function () {
    var name = $('nfName').value.trim();
    if (!name) { $('nfName').focus(); return; }
    api('/api/notfound', {
      method: 'POST',
      body: JSON.stringify({ name_entered: name, notes: $('nfNotes').value.trim(), station: station })
    }).then(function () {
      $('notFoundCard').classList.add('hidden');
      $('nfName').value = ''; $('nfNotes').value = '';
      renderResults([], '<div class="banner blue">Logged. Direct the member to the resolution table.</div>');
    });
  };
})();
