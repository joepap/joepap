(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pin = sessionStorage.getItem('disc36_pin') || '';
  var openId = null;    // which queue item is expanded
  var timer = null;
  var searchTimer = null;

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Admin-Pin': pin }, opts.headers || {});
    if (opts.body) opts.headers['Content-Type'] = 'application/json';
    return fetch(path, opts).then(function (r) {
      return r.json().then(
        function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: {} }; }
      );
    }, function () { return { status: 0, body: { error: 'no connection' } }; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function unlock() {
    pin = $('pin').value.trim() || pin;
    api('/api/discrepancy/list').then(function (r) {
      if (r.status !== 200) { alert(r.status === 0 ? 'No connection — check signal.' : 'Wrong PIN'); return; }
      sessionStorage.setItem('disc36_pin', pin);
      $('pinCard').classList.add('hidden');
      $('body').classList.remove('hidden');
      refresh(); clearInterval(timer); timer = setInterval(refresh, 4000);
    });
  }
  $('unlock').onclick = unlock;
  $('pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
  if (pin) unlock();

  function refresh() {
    api('/api/discrepancy/list').then(function (r) {
      if (r.status !== 200) { if (r.status === 0) $('ts').textContent = '· no connection'; return; }
      var d = r.body;
      $('counts').textContent = d.counts.pending + ' waiting · ' + d.counts.resolved + ' done';
      $('ts').textContent = '· ' + new Date().toLocaleTimeString();
      $('empty').style.display = d.pending.length ? 'none' : '';
      $('queue').innerHTML = '';
      d.pending.forEach(function (item) {
        try { $('queue').appendChild(renderItem(item)); }
        catch (e) { /* one bad item must never break the whole queue */ }
      });
      $('resolved').innerHTML = d.resolved.map(function (x) {
        return '<div class="resolved"><b>' + esc(x.name) + '</b> — ' + esc(x.outcome || 'resolved') +
          ' <span class="muted">(' + esc(x.resolved_by) + ', ' + esc((x.resolved_at || '').slice(11, 16)) + ')</span></div>';
      }).join('') || '<span class="muted">none yet</span>';
    });
  }

  // Badge + colour per queue-item type.
  function kindBadge(item) {
    if (item.kind === 'collect_contact')
      return '<span class="badge contact">GOT BALLOT · GET CONTACT</span>';
    return '<span class="badge verify">NEEDS REVIEW</span>';
  }

  function renderItem(item) {
    var div = document.createElement('div');
    var isOpen = openId === item.id;
    div.className = 'qitem' + (isOpen ? ' open' : '') + (item.kind === 'collect_contact' ? ' contact' : '');
    div.innerHTML =
      '<div class="qhead">' +
        '<div class="nm">' + esc(item.name) + '</div>' +
        '<div class="tap">' + (isOpen ? '▾' : '▸') + '</div>' +
      '</div>' +
      '<div class="rs">' + kindBadge(item) + ' ' + esc(item.reason || '') +
        (item.from_station ? ' · from ' + esc(item.from_station) : '') +
        ' · ' + esc((item.ts || '').slice(11, 16)) + '</div>';
    div.querySelector('.qhead').onclick = function () {
      openId = (openId === item.id) ? null : item.id;
      refresh();
    };
    if (isOpen) {
      try { div.appendChild(renderDetail(item)); }
      catch (e) {
        var err = document.createElement('div');
        err.className = 'detail';
        err.innerHTML = '<div class="err">Could not load details. You can still resolve below.</div>' +
          contactAndButtons(item);
        div.appendChild(err);
        wireDetail(err, item);
      }
    }
    return div;
  }

  // Shared contact-capture + action buttons markup.
  function contactAndButtons(item) {
    var contact =
      '<label>Email (personal — not @dc.gov)</label><input type="email" id="dEmail" placeholder="name@gmail.com" autocomplete="off">' +
      '<label>Phone</label><input type="tel" id="dPhone" autocomplete="off">' +
      '<label>Note (optional)</label><input type="text" id="dNote" autocomplete="off">';
    var btns;
    if (item.kind === 'collect_contact') {
      // Already checked in and holding a ballot — we only need their contact.
      btns = '<div class="outcome-btns">' +
        '<button class="primary" id="dSaveContact">&#10003; Save contact &amp; done</button>' +
        '<button class="ghost" id="dNoContact">No info — done</button></div>';
    } else {
      btns = '<div class="outcome-btns">' +
        '<button class="primary" id="dBallot">&#10003; Override &mdash; issue ballot</button>' +
        '<button class="danger" id="dDeny">No ballot</button></div>';
    }
    return contact + btns + '<div class="err" id="dErr"></div>';
  }

  function renderDetail(item) {
    var wrap = document.createElement('div');
    wrap.className = 'detail';
    var det = item.detail || {};
    var html = '';

    if (item.kind === 'collect_contact') {
      html += '<div class="pill green">&#10003; Checked in &amp; issued a ballot</div>';
      html += '<div class="kv muted small">This member is a <b>data record</b> in NEP (no online portal account). ' +
        'Collect a personal email and/or phone so we can send a portal invite after the meeting. ' +
        'They already have their ballot — nothing else is needed.</div>';
      if (det.kind === 'member' && det.member) {
        var mm = det.member;
        html += '<div class="kv"><b>Member #</b> ' + esc(mm.member_no || '—') +
          '  <b>NEP status</b> ' + esc(mm.dues_status || '—') + '</div>';
      }
    } else if (det.kind === 'member' && det.member) {
      var m = det.member, el = m.eligibility || {};
      html += '<div class="pill ' + (el.color || 'red') + '">' + esc(el.label || '') + '</div>';
      html += '<div class="kv"><b>Member #</b> ' + esc(m.member_no || '—') +
        '  <b>NEP status</b> ' + esc(m.dues_status || '—') + '</div>';
      html += '<div class="kv"><b>On payroll list</b> ' + (m.payroll_ok ? 'YES' : 'NO — check the paper payroll') + '</div>';
      if (m.rank || m.assignment) html += '<div class="kv"><b>Assignment</b> ' + esc(m.rank || '') + ' ' + esc(m.assignment || '') + '</div>';
      html += '<div class="muted small">Check the paper payroll report. If found, override and issue a ballot.</div>';
    } else if (det.kind === 'payroll' && det.person) {
      var p = det.person;
      html += '<div class="pill green">' + esc((p.eligibility || {}).label || 'Dues verified') + '</div>';
      html += '<div class="kv"><b>Emplid</b> ' + esc(p.emplid || '—') + '  <b>Grade/Step</b> ' + esc(p.grade || '-') + '/' + esc(p.step || '-') + '</div>';
      html += '<div class="kv muted small">Paying dues via payroll but not in NEP. Enroll (capture contact + registration QR) and issue a ballot.</div>';
    } else {
      html += '<div class="kv muted small">Look this person up on the paper payroll, then decide below.</div>';
    }

    html += contactAndButtons(item);
    wrap.innerHTML = html;
    wireDetail(wrap, item);
    return wrap;
  }

  function wireDetail(wrap, item) {
    var b;
    if ((b = wrap.querySelector('#dBallot'))) b.onclick = function () { resolve(item, { issue_ballot: true, outcome: 'Override — ballot issued' }); };
    if ((b = wrap.querySelector('#dDeny'))) b.onclick = function () {
      if (!confirm('Resolve with NO ballot for ' + item.name + '?')) return;
      resolve(item, { issue_ballot: false, outcome: 'No ballot' });
    };
    if ((b = wrap.querySelector('#dSaveContact'))) b.onclick = function () {
      resolve(item, { issue_ballot: false, outcome: 'Contact collected', requireContact: true });
    };
    if ((b = wrap.querySelector('#dNoContact'))) b.onclick = function () {
      resolve(item, { issue_ballot: false, outcome: 'No contact — declined/none' });
    };
  }

  function resolve(item, opts) {
    var email = ($('dEmail') && $('dEmail').value.trim()) || '';
    var phone = ($('dPhone') && $('dPhone').value.trim()) || '';
    var note = ($('dNote') && $('dNote').value.trim()) || '';
    var errEl = $('dErr');
    if (opts.requireContact && !email && !phone) {
      if (errEl) errEl.textContent = 'Enter an email or phone — or tap "No info — done".';
      return;
    }
    api('/api/discrepancy/' + item.id + '/resolve', {
      method: 'POST',
      body: JSON.stringify({ outcome: opts.outcome, issue_ballot: !!opts.issue_ballot,
        email: email, phone: phone, note: note, by: 'help-table', station: 'Help Table' })
    }).then(function (r) {
      if (r.status === 400 && r.body.error === 'dc_gov_email') { if (errEl) errEl.textContent = r.body.message; return; }
      if (r.status !== 200) { if (errEl) errEl.textContent = (r.status === 0 ? 'No connection — try again.' : (r.body.error || 'failed')); return; }
      openId = null; refresh();
    });
  }

  // ---------- walk-up search (pull anyone into the queue) ----------
  var sb = $('discSearch');
  if (sb) sb.addEventListener('input', function () {
    var q = this.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { $('searchResults').innerHTML = ''; return; }
    searchTimer = setTimeout(function () {
      api('/api/search?q=' + encodeURIComponent(q)).then(function (r) {
        if (r.status !== 200) { $('searchResults').innerHTML = '<div class="muted small">' + (r.status === 0 ? 'No connection.' : 'Search failed.') + '</div>'; return; }
        var rows = (r.body.members || []).map(function (m) {
          return { label: m.last_name + ', ' + m.first_name + (m.member_no ? ' · #' + m.member_no : ''),
            body: { member_id: m.id } };
        });
        (r.body.payroll_only || []).forEach(function (p) {
          rows.push({ label: p.last_name + ', ' + p.first_name + ' · payroll (not in NEP)',
            body: { payroll_id: p.payroll_id } });
        });
        if (!rows.length) { $('searchResults').innerHTML = '<div class="muted small">No match.</div>'; return; }
        $('searchResults').innerHTML = '';
        rows.slice(0, 8).forEach(function (row) {
          var btn = document.createElement('button');
          btn.className = 'sresult';
          btn.textContent = row.label;
          btn.onclick = function () { addToQueue(row.body); };
          $('searchResults').appendChild(btn);
        });
      });
    }, 150);
  });

  function addToQueue(body) {
    body.reason = 'Walk-up at Help Table';
    body.station = 'Help Table';
    api('/api/discrepancy', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
      if (r.status !== 200) { alert(r.status === 0 ? 'No connection — try again.' : (r.body.error || 'Could not add')); return; }
      openId = r.body.id;                 // auto-expand the person just added
      $('discSearch').value = '';
      $('searchResults').innerHTML = '';
      refresh();
    });
  }
})();
