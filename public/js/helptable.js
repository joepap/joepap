/*
 * Shared Help Table (a.k.a. Discrepancy Table) widget. Used two ways:
 *   - standalone at /discrepancy.html (its own PIN gate), and
 *   - as the "Help Table" tab inside /admin.html (reuses the admin PIN).
 * HelpTable.mount(containerEl, pin) builds its own markup inside containerEl,
 * wires everything, and starts a 4s refresh loop. Returns { stop() }.
 */
(function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mount(root, pin) {
    var openId = null, timer = null, searchTimer = null;

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

    root.innerHTML =
      '<section class="card">' +
        '<h3>Look up anyone</h3>' +
        '<p class="muted small">A walk-up who isn’t in the waiting list yet? Search their name (or member #) to pull them in — no need to send them back to a check-in table.</p>' +
        '<input type="text" class="ht-search" placeholder="Last name, or member #…" autocomplete="off" autocapitalize="off">' +
        '<div class="ht-sresults mt"></div>' +
      '</section>' +
      '<section class="card">' +
        '<h3>Waiting <span class="muted small ht-ts"></span></h3>' +
        '<div class="ht-queue"></div>' +
        '<div class="ht-empty muted" style="text-align:center;padding:20px">No one waiting.</div>' +
      '</section>' +
      '<section class="card"><h4>Recently resolved</h4><div class="ht-resolved"></div></section>';

    var q = function (sel) { return root.querySelector(sel); };
    var counts = null;   // optional external counter element set by caller

    function kindBadge(item) {
      return item.kind === 'collect_contact'
        ? '<span class="badge contact">GOT BALLOT · GET CONTACT</span>'
        : '<span class="badge verify">NEEDS REVIEW</span>';
    }

    function contactAndButtons(item) {
      var contact =
        '<label>Email (personal — not @dc.gov)</label><input type="email" class="d-email" placeholder="name@gmail.com" autocomplete="off">' +
        '<label>Phone</label><input type="tel" class="d-phone" autocomplete="off">' +
        '<label>Note (optional)</label><input type="text" class="d-note" autocomplete="off">';
      var btns = item.kind === 'collect_contact'
        ? '<div class="outcome-btns"><button class="primary d-savecontact">✓ Save contact &amp; done</button>' +
          '<button class="ghost d-nocontact">No info — done</button></div>'
        : '<div class="outcome-btns"><button class="primary d-ballot">✓ Override — issue ballot</button>' +
          '<button class="danger d-deny">No ballot</button></div>';
      return contact + btns + '<div class="err d-err"></div>';
    }

    function renderDetail(item) {
      var wrap = document.createElement('div');
      wrap.className = 'detail';
      var det = item.detail || {};
      var html = '';
      if (item.kind === 'collect_contact') {
        html += '<div class="pill green">✓ Checked in &amp; issued a ballot</div>';
        html += '<div class="kv muted small">They <b>already have their ballot</b> — nothing to decide. ' +
          'Collect a personal email and/or phone (see the reason line above: portal invite, or ' +
          'NEP enrollment — for enrollment also hand them a registration QR card).</div>';
        if (det.kind === 'member' && det.member)
          html += '<div class="kv"><b>Member #</b> ' + esc(det.member.member_no || '—') +
            '  <b>NEP status</b> ' + esc(det.member.dues_status || '—') + '</div>';
      } else if (det.kind === 'member' && det.member) {
        var m = det.member, el = m.eligibility || {};
        html += '<div class="pill ' + (el.color || 'red') + '">' + esc(el.label || '') + '</div>';
        html += '<div class="kv"><b>Member #</b> ' + esc(m.member_no || '—') + '  <b>NEP status</b> ' + esc(m.dues_status || '—') + '</div>';
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
      if ((b = wrap.querySelector('.d-ballot'))) b.onclick = function () { resolve(wrap, item, { issue_ballot: true, outcome: 'Override — ballot issued' }); };
      if ((b = wrap.querySelector('.d-deny'))) b.onclick = function () {
        if (!confirm('Resolve with NO ballot for ' + item.name + '?')) return;
        resolve(wrap, item, { issue_ballot: false, outcome: 'No ballot' });
      };
      if ((b = wrap.querySelector('.d-savecontact'))) b.onclick = function () { resolve(wrap, item, { issue_ballot: false, outcome: 'Contact collected', requireContact: true }); };
      if ((b = wrap.querySelector('.d-nocontact'))) b.onclick = function () { resolve(wrap, item, { issue_ballot: false, outcome: 'No contact — declined/none' }); };
    }

    function renderItem(item) {
      var div = document.createElement('div');
      var isOpen = openId === item.id;
      div.className = 'qitem' + (isOpen ? ' open' : '') + (item.kind === 'collect_contact' ? ' contact' : '');
      div.innerHTML =
        '<div class="qhead"><div class="nm">' + esc(item.name) + '</div><div class="tap">' + (isOpen ? '▾' : '▸') + '</div></div>' +
        '<div class="rs">' + kindBadge(item) + ' ' + esc(item.reason || '') +
        (item.from_station ? ' · from ' + esc(item.from_station) : '') + ' · ' + esc((item.ts || '').slice(11, 16)) + '</div>';
      div.querySelector('.qhead').onclick = function () { openId = (openId === item.id) ? null : item.id; refresh(); };
      if (isOpen) { try { div.appendChild(renderDetail(item)); } catch (e) { /* keep the row usable */ } }
      return div;
    }

    function resolve(wrap, item, opts) {
      var email = (wrap.querySelector('.d-email') || {}).value; email = (email || '').trim();
      var phone = (wrap.querySelector('.d-phone') || {}).value; phone = (phone || '').trim();
      var note = (wrap.querySelector('.d-note') || {}).value; note = (note || '').trim();
      var errEl = wrap.querySelector('.d-err');
      if (opts.requireContact && !email && !phone) { if (errEl) errEl.textContent = 'Enter an email or phone — or tap "No info — done".'; return; }
      api('/api/discrepancy/' + item.id + '/resolve', {
        method: 'POST',
        body: JSON.stringify({ outcome: opts.outcome, issue_ballot: !!opts.issue_ballot, email: email, phone: phone, note: note, by: 'help-table', station: 'Help Table' })
      }).then(function (r) {
        if (r.status === 400 && r.body.error === 'dc_gov_email') { if (errEl) errEl.textContent = r.body.message; return; }
        if (r.status !== 200) { if (errEl) errEl.textContent = (r.status === 0 ? 'No connection — try again.' : (r.body.error || 'failed')); return; }
        openId = null; refresh();
      });
    }

    function refresh() {
      // Never yank the DOM out from under someone typing INTO A QUEUE CARD
      // (the contact fields we're about to rebuild). Focus in the search box
      // is fine — that lives in a separate section we never touch here, so new
      // arrivals must still poll in live while the worker searches.
      var ae = document.activeElement;
      var queueEl = q('.ht-queue');
      if (ae && queueEl && queueEl.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        return Promise.resolve();
      }
      return api('/api/discrepancy/list').then(function (r) {
        if (r.status !== 200) { if (r.status === 0) q('.ht-ts').textContent = '· no connection'; return; }
        var d = r.body;
        if (counts) counts.textContent = d.counts.pending + ' waiting · ' + d.counts.resolved + ' done';
        q('.ht-ts').textContent = '· ' + new Date().toLocaleTimeString();
        q('.ht-empty').style.display = d.pending.length ? 'none' : '';
        var queue = q('.ht-queue');
        // Preserve typed-but-unsaved contact input (and any error text) on the
        // open item across the rebuild — the 4s tick must never eat input.
        var saved = null;
        var openEl = queue.querySelector('.qitem.open');
        if (openEl) {
          saved = {
            email: (openEl.querySelector('.d-email') || {}).value || '',
            phone: (openEl.querySelector('.d-phone') || {}).value || '',
            note: (openEl.querySelector('.d-note') || {}).value || '',
            err: (openEl.querySelector('.d-err') || {}).textContent || ''
          };
        }
        queue.innerHTML = '';
        d.pending.forEach(function (item) { try { queue.appendChild(renderItem(item)); } catch (e) { /* skip bad item */ } });
        var openEl2 = queue.querySelector('.qitem.open');
        if (saved && openEl2) {
          var set = function (sel, val) { var el = openEl2.querySelector(sel); if (el && val) el.value = val; };
          set('.d-email', saved.email); set('.d-phone', saved.phone); set('.d-note', saved.note);
          var errEl = openEl2.querySelector('.d-err');
          if (errEl && saved.err) errEl.textContent = saved.err;
        }
        q('.ht-resolved').innerHTML = d.resolved.map(function (x) {
          return '<div class="resolved"><b>' + esc(x.name) + '</b> — ' + esc(x.outcome || 'resolved') +
            ' <span class="muted">(' + esc(x.resolved_by) + ', ' + esc((x.resolved_at || '').slice(11, 16)) + ')</span></div>';
        }).join('') || '<span class="muted">none yet</span>';
      });
    }

    // Walk-up search
    q('.ht-search').addEventListener('input', function () {
      var term = this.value.trim(), results = q('.ht-sresults');
      clearTimeout(searchTimer);
      if (term.length < 2) { results.innerHTML = ''; return; }
      searchTimer = setTimeout(function () {
        api('/api/search?q=' + encodeURIComponent(term)).then(function (r) {
          if (r.status !== 200) { results.innerHTML = '<div class="muted small">' + (r.status === 0 ? 'No connection.' : 'Search failed.') + '</div>'; return; }
          // Each row carries its eligibility pill so the worker sees
          // green/red/yellow before even tapping.
          var pill = function (el) {
            if (!el) return '';
            var color = el.color === 'green' ? 'green' : el.color === 'yellow' ? 'yellow' : 'red';
            return ' <span class="pill ' + color + '" style="font-size:.72rem;padding:2px 8px;margin:0">' + esc(el.label || '') + '</span>';
          };
          var rows = (r.body.members || []).map(function (m) {
            return { html: esc(m.last_name + ', ' + m.first_name + (m.member_no ? ' · #' + m.member_no : '')) +
              (m.checked_in ? ' <span class="pill red" style="font-size:.72rem;padding:2px 8px;margin:0">CHECKED IN</span>' : pill(m.eligibility)),
              body: { member_id: m.id } };
          });
          (r.body.payroll_only || []).forEach(function (p) {
            rows.push({ html: esc(p.last_name + ', ' + p.first_name) +
              ' <span class="pill yellow" style="font-size:.72rem;padding:2px 8px;margin:0">PAYROLL · NOT IN NEP</span>',
              body: { payroll_id: p.payroll_id } });
          });
          if (!rows.length) { results.innerHTML = '<div class="muted small">No match.</div>'; return; }
          results.innerHTML = '';
          rows.slice(0, 8).forEach(function (row) {
            var btn = document.createElement('button');
            btn.className = 'sresult'; btn.innerHTML = row.html;
            btn.onclick = function () { addToQueue(row.body, results); };
            results.appendChild(btn);
          });
        });
      }, 150);
    });

    function addToQueue(body, results) {
      body.reason = 'Walk-up at Help Table'; body.station = 'Help Table';
      api('/api/discrepancy', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
        if (r.status !== 200) { alert(r.status === 0 ? 'No connection — try again.' : (r.body.error || 'Could not add')); return; }
        openId = r.body.id; q('.ht-search').value = ''; results.innerHTML = ''; refresh();
      });
    }

    refresh();
    timer = setInterval(refresh, 4000);
    return {
      stop: function () { clearInterval(timer); },
      setCounter: function (el) { counts = el; },
      refresh: refresh
    };
  }

  window.HelpTable = { mount: mount };
})();
