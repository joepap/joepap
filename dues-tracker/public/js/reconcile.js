/* Member Sync dashboard: totals + status breakdowns for the three
 * databases, and the lists where they disagree. */
(function () {
  'use strict';
  var api = Dues.api, esc = Dues.esc;
  var $ = function (id) { return document.getElementById(id); };
  var data = null;
  var curTab = 'payingNotInNep';

  var TABS = [
    ['payingNotInNep', 'Paying · not in NEP', ['emplid', 'name', 'grade', 'step'],
      'These people have union dues coming out of their paycheck but are not in NEP — enroll them.'],
    ['nepActiveNotPaying', 'NEP active · not paying', ['member_no', 'name', 'status', 'email', 'phone'],
      'Marked active in NEP but not on the payroll dues report — follow up (or their status is stale).'],
    ['payingButRetiredInNep', 'Paying but retired in NEP', ['emplid', 'name', 'member_no', 'nep_status'],
      'On the payroll dues report but NEP says retired — one of the two is wrong.'],
    ['inNepNotIaff', 'In NEP · missing at IAFF', ['member_no', 'name', 'status'],
      'In our database but not on the IAFF roster.'],
    ['inIaffNotNep', 'In IAFF · missing in NEP', ['member_no', 'name', 'status'],
      'The IAFF has them; our NEP database does not.']
  ];

  Dues.gate(function () {
    $('recXlsx').href = '/api/reconcile.xlsx?pin=' + encodeURIComponent(Dues.pin());
    refresh();
    setInterval(refresh, 30000);
  });

  function stat(num, label, cls) {
    return '<div class="stat"><div class="num ' + (cls || '') + '">' + num +
      '</div><div class="lbl">' + esc(label) + '</div></div>';
  }

  function refresh() {
    api('/api/reconcile').then(function (r) {
      if (r.status !== 200) return;
      data = r.body;
      var s = data.sources, c = data.counts;

      $('srcGrid').innerHTML =
        stat(s.dues ? c.dues_payers : '—', s.dues ? 'Dues payers (DCHR ' + s.dues.label + ')' : 'Dues payers — no report yet') +
        stat(s.nep ? c.nep_members : '—', s.nep ? 'NEP members (' + s.nep.label + ')' : 'NEP — not loaded yet') +
        stat(s.iaff ? c.iaff_members : '—', s.iaff ? 'IAFF per cap (' + s.iaff.label + ')' : 'IAFF — not loaded yet') +
        (s.nep ? stat(c.nep_active, 'NEP active') + stat(c.nep_retired, 'NEP retired') : '') +
        (s.iaff ? stat(c.iaff_active, 'IAFF active') + stat(c.iaff_retired, 'IAFF retired') : '');

      var bd = '';
      [['nep', 'NEP status breakdown'], ['iaff', 'IAFF status breakdown']].forEach(function (pair) {
        var src = s[pair[0]];
        if (!src || !src.breakdown || !src.breakdown.length) return;
        bd += '<h4 class="mt">' + pair[1] + '</h4><div class="stat-grid">' +
          src.breakdown.map(function (b) { return stat(b.c, b.label); }).join('') + '</div>';
      });
      $('breakdowns').innerHTML = bd;

      $('recTabs').innerHTML = TABS.map(function (t) {
        var n = (data[t[0]] || []).length;
        return '<button data-tab="' + t[0] + '" class="' + (curTab === t[0] ? 'active' : '') + '">' +
          t[1] + ' (' + n + ')</button>';
      }).join('');
      Array.prototype.forEach.call($('recTabs').querySelectorAll('button'), function (b) {
        b.onclick = function () { curTab = b.getAttribute('data-tab'); renderTab(); refresh(); };
      });
      renderTab();
    });
  }

  function renderTab() {
    var t = TABS.find(function (x) { return x[0] === curTab; });
    var rows = (data && data[curTab]) || [];
    $('recHead').innerHTML = '<tr>' + t[2].map(function (h) {
      return '<th>' + esc(h.replace(/_/g, ' ')) + '</th>';
    }).join('') + '</tr>';
    $('recBody').innerHTML = rows.length ? rows.map(function (r) {
      return '<tr>' + t[2].map(function (h) {
        return '<td>' + esc(r[h] == null ? '' : r[h]) + '</td>';
      }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + t[2].length + '" class="muted">none — ' + esc(t[3]) +
      ' Nothing in this list right now.</td></tr>';
  }
})();
