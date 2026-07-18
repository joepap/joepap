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
  var stationPin = localStorage.getItem('station36_pin') || '';
  var defaultMethod = localStorage.getItem('station36_method') || 'license_scan';

  function showStationModal(msg) {
    $('stationName').value = station;
    $('stationPin').value = stationPin;
    $('stationMethod').value = defaultMethod;
    $('stationModal').classList.remove('hidden');
    ($('stationName').value ? $('stationPin') : $('stationName')).focus();
    if (msg) alert(msg);
  }
  $('stationSave').onclick = function () {
    var name = $('stationName').value.trim();
    var pin = $('stationPin').value.trim();
    if (!name || !pin) return;
    // Verify the PIN before accepting it.
    fetch('/api/search?q=zz', { headers: { 'X-Station-Pin': pin } }).then(function (r) {
      if (r.status === 401) { alert('Wrong station PIN — check with the organizer.'); return; }
      station = name;
      stationPin = pin;
      defaultMethod = $('stationMethod').value;
      localStorage.setItem('station36', station);
      localStorage.setItem('station36_pin', stationPin);
      localStorage.setItem('station36_method', defaultMethod);
      $('stationChip').textContent = '\u{1F464} ' + station;
      $('stationModal').classList.add('hidden');
    });
  };
  $('stationChip').onclick = function () { showStationModal(); };
  if (!station || !stationPin) showStationModal();
  else $('stationChip').textContent = '\u{1F464} ' + station;

  // ---------- fetch helpers ----------
  // Never lets a network hiccup silently kill the page: a failed fetch (or a
  // non-JSON reply from a restarting server) resolves to status 0 so every
  // caller can show "no connection" and re-enable its buttons.
  function api(path, opts) {
    return fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json', 'X-Station-Pin': stationPin }
    }, opts)).then(function (r) {
      if (r.status === 401) showStationModal();
      return r.json().then(
        function (j) { return { status: r.status, body: j }; },
        function () { return { status: 0, body: { error: 'bad reply — server restarting?' } }; }
      );
    }, function () {
      return { status: 0, body: { error: 'no connection' } };
    });
  }

  // ---------- search ----------
  var searchTimer = null;
  $('searchBox').addEventListener('input', function () {
    var q = this.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { renderResults([], ''); return; }
    searchTimer = setTimeout(function () {
      api('/api/search?q=' + encodeURIComponent(q)).then(function (r) {
        if (r.status === 0) {
          renderResults([], '<div class="banner red">No connection — check cellular signal and type again.</div>');
          return;
        }
        var items = (r.body.members || []).map(function (m) { return { member: m }; });
        // Payroll-only people (paying dues, not in NEP) appear as yellow rows.
        (r.body.payroll_only || []).forEach(function (p) { items.push({ member: p, payrollOnly: true }); });
        renderResults(items);
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
    var el = m.eligibility || {};
    if (m.checked_in) chips += '<span class="flag red">CHECKED IN</span>';
    else if (el.state === 'payroll_only') chips += '<span class="flag yellow">PAYROLL · ENROLL</span>';
    else if (el.color === 'green') chips += '<span class="flag green">ELIGIBLE</span>';
    else if (el.color === 'yellow') chips += '<span class="flag yellow">PAYROLL · ENROLL</span>';
    else chips += '<span class="flag red">VERIFY</span>';
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
    // An explicit banner (confirmation / error) stands alone — no filler.
    if (!items.length && headerHtml !== undefined) return;
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
        '<div class="sub">' + (it.payrollOnly ? 'payroll dues · not in NEP'
          : '#' + esc(m.member_no || '—') + (m.age != null ? ' &middot; age ' + m.age : '') +
            (it.score ? ' &middot; match ' + it.score + '%' : '')) + '</div></div>' +
        '<div class="flag-wrap" style="margin-left:auto">' + flagChips(m, it.dob_match) + '</div>';
      btn.onclick = it.payrollOnly ? function () { openPayrollOnly(m); } : function () { openMember(m.id); };
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

  // Payroll-only person (yellow): minimal card, routes to Discrepancy Table.
  function openPayrollOnly(p) {
    currentMember = p;
    var html = '<div class="member-name">' + esc(p.last_name) + ', ' + esc(p.first_name) +
      (p.middle_name ? ' ' + esc(p.middle_name) : '') + '</div>';
    html += '<div class="member-meta">Emplid ' + esc(p.emplid || '—') +
      (p.grade ? ' &middot; grade ' + esc(p.grade) : '') + (p.step ? ' &middot; step ' + esc(p.step) : '') + '</div>';
    html += '<div class="dues-pill ok">' + esc(p.eligibility.label) + '</div>';
    html += '<div class="dues-pill" style="background:#fef9c3;color:#a16207;border:2px solid #facc15">' +
      'NOT IN NEP DATABASE — enroll at the help table</div>';
    html += '<div class="banner yellow">On the payroll dues list but <strong>not in NEP</strong>. ' +
      'Gets a ballot &mdash; send to the Discrepancy Table to enroll (capture email/phone) and issue.</div>';
    html += '<button class="big warn mt" id="sendDisc">&rarr; Send to Discrepancy Table</button>';
    html += '<button class="ghost mt" id="closeMember" style="width:100%">Back</button>';
    $('memberCard').innerHTML = html;
    $('sendDisc').onclick = function () { sendToDiscrepancy(p); };
    $('closeMember').onclick = closeMember;
    $('memberCard').classList.remove('hidden');
    $('memberCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openMember(id) {
    api('/api/members/' + id).then(function (r) {
      if (r.status !== 200) return;
      currentMember = r.body.member;
      selectedMethod = defaultMethod;
      renderMemberCard();
      $('memberCard').classList.remove('hidden');
      $('memberCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Non-dues-payer: surface the loud red screen up front so a volunteer
      // can't miss it (the card also shows it, but this is unmissable).
      if (currentMember.dues_block) showDuesBlock(currentMember);
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
    // Pill 1 — dues, from the server's authoritative model (payroll-first).
    var el = m.eligibility || { color: 'red', label: 'NOT VERIFIED', ballot: false };
    var pillCls = el.color === 'green' ? 'ok' : el.color === 'yellow' ? '' : 'bad';
    var pillStyle = el.color === 'yellow'
      ? ' style="background:#fef9c3;color:#a16207;border:2px solid #facc15"' : '';
    html += '<div class="dues-pill ' + pillCls + '"' + pillStyle + '>' + esc(el.label) + '</div>';
    if (m.dues_block && m.dues_block_note) html += '<div class="muted small">' + esc(m.dues_block_note) + '</div>';
    // Pill 2 — NEP database: green = in it, yellow = payroll-only (enroll at
    // the help table). Info updates happen via the meeting link they get by
    // text/email — nothing is edited in the check-in line.
    if (m.source === 'payroll') {
      html += '<div class="dues-pill" style="background:#fef9c3;color:#a16207;border:2px solid #facc15">' +
              'NOT IN NEP DATABASE — enroll at the help table</div>';
    } else {
      html += '<div class="dues-pill ok">NEP DATABASE &#10003;' +
              (m.dues_status ? ' (' + esc(m.dues_status) + ')' : '') + '</div>';
    }

    if (m.checked_in) {
      html += '<div class="banner red">ALREADY CHECKED IN at ' + esc(m.checked_in.ts) +
              ' / ' + esc(m.checked_in.station) +
              (m.checked_in.ballot_no ? ' / Ballot #' + m.checked_in.ballot_no : '') + '</div>';
    }

    if (m.portal_ok === false) {
      html += '<div class="banner yellow">&#9888; No ConnectPlus portal access (status: ' +
              esc(m.portal_status) + ') — after check-in, tell them to ' +
              '<strong>proceed to the help table</strong> (secondary table).</div>';
    }

    html += '<label style="margin-top:14px">Verification method</label><div class="method-grid" id="methodGrid">';
    Object.keys(METHOD_LABELS).forEach(function (k) {
      html += '<button data-m="' + k + '" class="' + (k === selectedMethod ? 'selected' : '') + '">' +
              METHOD_LABELS[k] + '</button>';
    });
    html += '</div>';
    html += '<input type="text" id="methodNote" class="' + (selectedMethod === 'other' ? '' : 'hidden') +
            '" placeholder="Required note for Other…" autocomplete="off">';

    if (m.checked_in) {
      html += '<button class="big danger mt" disabled>Already checked in — no ballot</button>';
    } else if (el.ballot) {
      html += '<button class="big primary mt" id="doCheckin">&#10003; Check In + Issue Ballot</button>';
    } else {
      // Red/blocked at the main table — cannot issue a ballot here. Route to
      // the Discrepancy Table for a human to verify/resolve.
      html += '<button class="big warn mt" id="sendDisc">&rarr; Send to Discrepancy Table</button>';
      html += '<div class="muted small mt">Not eligible at this table. The Discrepancy Table will verify and decide.</div>';
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

    if ($('doCheckin')) $('doCheckin').onclick = doCheckin;
    if ($('sendDisc')) $('sendDisc').onclick = function () { sendToDiscrepancy(m); };
    $('closeMember').onclick = closeMember;
  }

  function sendToDiscrepancy(m) {
    var body = m.source === 'payroll'
      ? { payroll_id: m.payroll_id, reason: 'payroll-only — enroll + ballot', station: station }
      : { member_id: m.id, reason: (m.eligibility && m.eligibility.label) || 'verify', station: station };
    $('sendDisc').disabled = true;
    api('/api/discrepancy', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 200) {
        renderResults([], '<div class="banner blue">Sent to the Discrepancy Table. Direct ' +
          esc(m.first_name) + ' there.</div>');
        $('memberCard').classList.add('hidden');
      } else { alert('Could not send: ' + (r.body.error || r.status)); $('sendDisc').disabled = false; }
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
      } else if (r.status === 409 && r.body.error === 'dues_block') {
        showDuesBlock(r.body.member);
      } else if (r.status === 409) {
        showDuplicate(r.body);
      } else if (r.status === 0) {
        alert('No connection — the check-in did NOT go through. Check signal and tap the button again.');
        if ($('doCheckin')) $('doCheckin').disabled = false;
      } else {
        alert('Check-in failed: ' + (r.body.error || r.status));
        if ($('doCheckin')) $('doCheckin').disabled = false;
      }
    });
  }

  function showSuccess(body) {
    var m = body.member;
    $('successName').textContent = m.first_name + ' ' + m.last_name + ' — checked in';
    $('successBallot').textContent = body.ballot_no ? 'Ballot #' + body.ballot_no : '';
    $('successSub').textContent = body.ballot_no ? 'Hand them ballot #' + body.ballot_no : 'Hand them their ballot';
    $('successFlash').classList.remove('hidden');
    // Reset to a fresh scan/search screen IMMEDIATELY (behind the flash) so
    // the station is ready for the next member the moment the flash clears.
    closeMember();
    setTimeout(hideSuccess, 2600);
    $('successFlash').onclick = hideSuccess;
  }
  function hideSuccess() {
    $('successFlash').classList.add('hidden');
    $('searchBox').focus();
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

  function showDuesBlock(m) {
    $('duesDetail').textContent = (m ? m.last_name + ', ' + m.first_name : '') +
      (m && m.member_no ? '  (#' + m.member_no + ')' : '');
    $('duesOverlay').classList.remove('hidden');
  }
  $('duesClose').onclick = function () {
    $('duesOverlay').classList.add('hidden');
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
    $('nfSave').disabled = true;
    api('/api/notfound', {
      method: 'POST',
      body: JSON.stringify({ name_entered: name, notes: $('nfNotes').value.trim(), station: station })
    }).then(function (r) {
      $('nfSave').disabled = false;
      if (r.status !== 200) {
        alert(r.status === 0
          ? 'No connection — NOT logged. Check signal and tap again.'
          : 'Could not log: ' + (r.body.error || r.status));
        return;
      }
      // Back to a fresh check-in screen, with a confirmation banner.
      $('notFoundCard').classList.add('hidden');
      $('nfName').value = ''; $('nfNotes').value = '';
      $('searchBox').value = '';
      renderResults([], '<div class="banner blue">&#10003; Logged. Direct the member to the help table.</div>');
      $('searchBox').focus();
    });
  };
})();
