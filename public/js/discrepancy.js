(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pin = sessionStorage.getItem('disc36_pin') || '';
  var openId = null;   // which queue item is expanded
  var timer = null;

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Admin-Pin': pin }, opts.headers || {});
    if (opts.body) opts.headers['Content-Type'] = 'application/json';
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; }).catch(function () { return { status: r.status, body: {} }; });
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function unlock() {
    pin = $('pin').value.trim() || pin;
    api('/api/discrepancy/list').then(function (r) {
      if (r.status !== 200) { alert('Wrong PIN'); return; }
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
      if (r.status !== 200) return;
      var d = r.body;
      $('counts').textContent = d.counts.pending + ' waiting · ' + d.counts.resolved + ' done';
      $('ts').textContent = '· ' + new Date().toLocaleTimeString();
      $('empty').style.display = d.pending.length ? 'none' : '';
      $('queue').innerHTML = '';
      d.pending.forEach(function (item) { $('queue').appendChild(renderItem(item)); });
      $('resolved').innerHTML = d.resolved.map(function (x) {
        return '<div class="resolved"><b>' + esc(x.name) + '</b> — ' + esc(x.outcome || 'resolved') +
          ' <span class="muted">(' + esc(x.resolved_by) + ', ' + esc((x.resolved_at || '').slice(11, 16)) + ')</span></div>';
      }).join('') || '<span class="muted">none yet</span>';
    });
  }

  function renderItem(item) {
    var div = document.createElement('div');
    div.className = 'qitem' + (openId === item.id ? ' open' : '');
    var head = '<div class="nm">' + esc(item.name) + '</div>' +
      '<div class="rs">' + esc(item.reason || '') + (item.from_station ? ' · from ' + esc(item.from_station) : '') +
      ' · ' + esc((item.ts || '').slice(11, 16)) + '</div>';
    div.innerHTML = head;
    div.onclick = function (e) {
      if (e.target.closest('.detail')) return; // don't collapse when interacting
      openId = openId === item.id ? null : item.id; refresh();
    };
    if (openId === item.id) div.appendChild(renderDetail(item));
    return div;
  }

  function renderDetail(item) {
    var wrap = document.createElement('div');
    wrap.className = 'detail';
    var det = item.detail || {};
    var html = '';
    if (det.kind === 'member') {
      var m = det.member, el = m.eligibility || {};
      html += '<div class="pill ' + (el.color || 'red') + '">' + esc(el.label || '') + '</div>';
      html += '<div class="kv"><b>Member #</b> ' + esc(m.member_no || '—') +
        '  <b>NEP status</b> ' + esc(m.dues_status || '—') + '</div>';
      html += '<div class="kv"><b>On payroll list</b> ' + (m.payroll_ok ? 'YES' : 'NO — check the paper payroll') + '</div>';
      if (m.rank || m.assignment) html += '<div class="kv"><b>Assignment</b> ' + esc(m.rank || '') + ' ' + esc(m.assignment || '') + '</div>';
      html += '<div class="muted small">Check the paper payroll report. If found, override and issue a ballot.</div>';
    } else if (det.kind === 'payroll') {
      var p = det.person;
      html += '<div class="pill yellow">' + esc((p.eligibility || {}).label || 'payroll dues — enroll') + '</div>';
      html += '<div class="kv"><b>Emplid</b> ' + esc(p.emplid || '—') + '  <b>Grade/Step</b> ' + esc(p.grade || '-') + '/' + esc(p.step || '-') + '</div>';
      html += '<div class="kv muted small">Paying dues via payroll but not in NEP. Enroll (capture contact + registration QR) and issue a ballot.</div>';
    }
    // enrollment contact capture
    html += '<label>Email (personal — not @dc.gov)</label><input type="email" id="dEmail" placeholder="name@gmail.com">';
    html += '<label>Phone</label><input type="tel" id="dPhone">';
    html += '<label>Note (optional)</label><input type="text" id="dNote">';
    html += '<div class="outcome-btns">' +
      '<button class="primary" id="dBallot">&#10003; Override &mdash; issue ballot</button>' +
      '<button class="danger" id="dDeny">No ballot</button></div>';
    html += '<div class="err" id="dErr" style="color:#b91c1c;font-weight:600;min-height:1.1em"></div>';
    wrap.innerHTML = html;

    wrap.querySelector('#dBallot').onclick = function () { resolve(item, true); };
    wrap.querySelector('#dDeny').onclick = function () {
      if (!confirm('Resolve with NO ballot for ' + item.name + '?')) return;
      resolve(item, false);
    };
    return wrap;
  }

  function resolve(item, issueBallot) {
    var email = ($('dEmail') && $('dEmail').value.trim()) || '';
    var phone = ($('dPhone') && $('dPhone').value.trim()) || '';
    var note = ($('dNote') && $('dNote').value.trim()) || '';
    var outcome = issueBallot ? 'Override — ballot issued' : 'No ballot';
    api('/api/discrepancy/' + item.id + '/resolve', {
      method: 'POST',
      body: JSON.stringify({ outcome: outcome, issue_ballot: issueBallot, email: email, phone: phone, note: note, by: 'discrepancy', station: 'Discrepancy' })
    }).then(function (r) {
      if (r.status === 400 && r.body.error === 'dc_gov_email') { $('dErr').textContent = r.body.message; return; }
      if (r.status !== 200) { $('dErr').textContent = r.body.error || 'failed'; return; }
      openId = null; refresh();
    });
  }
})();
