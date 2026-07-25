/* Shared PIN gate + fetch helper for the dues tracker.
 * Staff password views, admin PIN changes — same convention as check-in. */
(function () {
  'use strict';
  window.Dues = {};

  var pin = sessionStorage.getItem('dues36_pin') || '';
  var role = sessionStorage.getItem('dues36_role') || '';
  var name = sessionStorage.getItem('dues36_name') || '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'X-Admin-Pin': role === 'admin' ? pin : '', 'X-Staff-Pin': pin, 'X-User-Name': name },
      opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    return fetch(path, opts).then(function (r) {
      return r.json().then(
        function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: {} }; });
    }, function () { return { status: 0, body: { error: 'no connection' } }; });
  }

  /* Gate: hides #appBody behind #pinCard until a name + valid password are
   * entered — same flow as the check-in stations, so the audit trail always
   * says WHO. onReady(role) fires once unlocked. */
  function gate(onReady) {
    var card = document.getElementById('pinCard');
    var body = document.getElementById('appBody');
    var nameBox = document.getElementById('nameBox');
    function unlock() {
      var typedName = ((nameBox && nameBox.value) || '').trim() || name;
      var typed = (document.getElementById('pinBox').value || '').trim() || pin;
      if (!typed) return;
      if (typedName.length < 2) { alert('Enter your name first — it goes in the activity log.'); return; }
      fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: typed, name: typedName }) })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (x) {
          if (x.s === 429) { alert(x.j.error || 'Too many wrong passwords — wait 15 minutes.'); return; }
          if (x.s !== 200) { alert('Wrong password'); return; }
          pin = typed; role = x.j.role; name = typedName;
          sessionStorage.setItem('dues36_pin', pin);
          sessionStorage.setItem('dues36_role', role);
          sessionStorage.setItem('dues36_name', name);
          var chip = document.getElementById('whoChip');
          if (chip) {
            chip.textContent = name + (role === 'admin' ? ' · admin' : '') + '  ✕';
            chip.title = 'Sign out';
            chip.style.cursor = 'pointer';
            chip.onclick = function () {
              if (!confirm('Sign out?')) return;
              sessionStorage.removeItem('dues36_pin');
              sessionStorage.removeItem('dues36_role');
              location.reload();
            };
          }
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
    if (nameBox) {
      nameBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
      if (name) nameBox.value = name;
    }
    if (pin && name) { document.getElementById('pinBox').value = pin; unlock(); }
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
