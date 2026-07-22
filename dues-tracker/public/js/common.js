/* Shared PIN gate + fetch helper for the dues tracker.
 * Staff password views, admin PIN changes — same convention as check-in. */
(function () {
  'use strict';
  window.Dues = {};

  var pin = sessionStorage.getItem('dues36_pin') || '';
  var role = sessionStorage.getItem('dues36_role') || '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'X-Admin-Pin': role === 'admin' ? pin : '', 'X-Staff-Pin': pin },
      opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    return fetch(path, opts).then(function (r) {
      return r.json().then(
        function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: {} }; });
    }, function () { return { status: 0, body: { error: 'no connection' } }; });
  }

  /* Gate: hides #appBody behind #pinCard until a valid password is entered.
   * onReady(role) fires once unlocked. */
  function gate(onReady) {
    var card = document.getElementById('pinCard');
    var body = document.getElementById('appBody');
    function unlock() {
      var typed = (document.getElementById('pinBox').value || '').trim() || pin;
      if (!typed) return;
      fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: typed }) })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (x) {
          if (x.s !== 200) { alert('Wrong password'); return; }
          pin = typed; role = x.j.role;
          sessionStorage.setItem('dues36_pin', pin);
          sessionStorage.setItem('dues36_role', role);
          card.classList.add('hidden');
          body.classList.remove('hidden');
          onReady(role);
        })
        .catch(function () { alert('No connection to the server.'); });
    }
    document.getElementById('pinSave').onclick = unlock;
    document.getElementById('pinBox').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') unlock();
    });
    if (pin) { document.getElementById('pinBox').value = pin; unlock(); }
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  window.Dues.api = api;
  window.Dues.esc = esc;
  window.Dues.gate = gate;
  window.Dues.qs = qs;
  window.Dues.pin = function () { return pin; };
  window.Dues.role = function () { return role; };
})();
