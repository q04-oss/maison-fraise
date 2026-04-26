/**
 * fraise widget — claim a spot inline
 * MIT License — Copyright (c) 2026 Box Fraise / Rajzyngier Research
 *
 * Usage:
 *   <script src="https://api.fraise.box/fraise-widget.js?event=42"></script>
 *
 * Params:
 *   event  — event ID (required)
 *   api    — API base URL (default: https://api.fraise.box)
 *   label  — claim button label (default: "claim a spot")
 */
(function () {
  'use strict';

  var instanceId = 'fw-' + (window._fwCount = ((window._fwCount || 0) + 1));
  var script     = document.currentScript;
  var params     = new URLSearchParams(script ? script.src.split('?')[1] : '');
  var eventId    = params.get('event') || '';
  var apiBase    = params.get('api') || 'https://api.fraise.box';
  var label      = params.get('label') || 'claim a spot';

  if (!eventId) { console.warn('[fraise widget] no event id set'); return; }

  // ── Mount point ───────────────────────────────────────────────────────────────
  var mount = document.createElement('div');
  if (script && script.parentNode) { script.parentNode.insertBefore(mount, script); }
  else { document.body.appendChild(mount); }

  // ── Styles ────────────────────────────────────────────────────────────────────
  if (!document.getElementById('fw-styles')) {
    var style = document.createElement('style');
    style.id = 'fw-styles';
    style.textContent = [
      '.fw{font-family:"DM Mono",monospace;font-size:14px;color:#1C1C1E;max-width:420px;width:100%}',
      '.fw *{box-sizing:border-box;margin:0;padding:0}',
      '.fw-card{background:#F7F5F2;border:1px solid #E5E1DA;border-radius:12px;padding:1.25rem;margin-bottom:0.75rem}',
      '.fw-biz{font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:#8E8E93;margin-bottom:0.35rem}',
      '.fw-title{font-size:0.95rem;font-weight:500;margin-bottom:0.5rem}',
      '.fw-desc{font-size:0.72rem;color:#8E8E93;line-height:1.65;margin-bottom:0.75rem}',
      '.fw-meta{display:flex;gap:1.5rem;font-size:0.68rem;color:#8E8E93;margin-bottom:0.75rem}',
      '.fw-progress{height:4px;background:#E5E1DA;border-radius:9999px;overflow:hidden;margin-bottom:0.85rem}',
      '.fw-progress-fill{height:100%;background:#1C1C1E;border-radius:9999px;transition:width 0.4s}',
      '.fw-progress-fill.ready{background:#27AE60}',
      '.fw-btn{font-family:"DM Mono",monospace;font-size:0.78rem;letter-spacing:0.06em;text-transform:uppercase',
        ';background:#1C1C1E;color:#fff;border:none;border-radius:9999px;padding:0.65rem 1.5rem',
        ';cursor:pointer;transition:opacity 0.15s}',
      '.fw-btn:hover{opacity:0.8}',
      '.fw-btn:disabled{opacity:0.4;cursor:not-allowed}',
      '.fw-btn-full{width:100%}',
      '.fw-btn-ghost{background:none;color:#8E8E93;border:1px solid #E5E1DA}',
      '.fw-btn-ghost:hover{color:#1C1C1E;border-color:#1C1C1E;opacity:1}',
      '.fw-form{display:none;flex-direction:column;gap:0.65rem;margin-top:0.75rem}',
      '.fw-form.open{display:flex}',
      '.fw-label{font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:#8E8E93;display:block;margin-bottom:0.2rem}',
      '.fw-input{width:100%;font-family:"DM Mono",monospace;font-size:0.82rem;background:#F0EDE8',
        ';border:1px solid #E5E1DA;border-radius:8px;padding:0.55rem 0.8rem;color:#1C1C1E;outline:none',
        ';transition:border-color 0.15s}',
      '.fw-input:focus{border-color:#1C1C1E;background:#fff}',
      '.fw-card-el{background:#F0EDE8;border:1px solid #E5E1DA;border-radius:8px;padding:0.65rem 0.8rem}',
      '.fw-card-el.StripeElement--focus{border-color:#1C1C1E;background:#fff}',
      '.fw-err{font-size:0.68rem;color:#C0392B;display:none}',
      '.fw-err.on{display:block}',
      '.fw-done{font-size:0.8rem;line-height:1.7;display:none;padding-top:0.25rem}',
      '.fw-done.on{display:block}',
      '.fw-toggle{font-family:"DM Mono",monospace;font-size:0.65rem;color:#8E8E93;background:none;border:none',
        ';cursor:pointer;text-decoration:underline;text-underline-offset:3px;margin-top:0.35rem;padding:0}',
      '.fw-toggle:hover{color:#1C1C1E}',
      '.fw-divider{border:none;border-top:1px solid #E5E1DA;margin:0.65rem 0}',
      '.fw-note{font-size:0.62rem;color:#8E8E93;line-height:1.6}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  var ev = null;
  var memberToken = localStorage.getItem('fraise_member_token') || null;
  var member = null;
  var mode = 'idle'; // idle | auth-login | auth-signup | credits | done
  var stripe = null;
  var cardEl = null;
  var cardMounted = false;

  // ── Build skeleton ────────────────────────────────────────────────────────────
  mount.innerHTML = '<div class="fw" id="' + instanceId + '-root"></div>';
  var root = document.getElementById(instanceId + '-root');

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function renderSkeleton() {
    var html = [
      '<div class="fw-card">',
        '<div class="fw-biz" id="' + instanceId + '-biz"></div>',
        '<div class="fw-title" id="' + instanceId + '-title">—</div>',
        '<div class="fw-desc" id="' + instanceId + '-desc"></div>',
        '<div class="fw-meta">',
          '<span id="' + instanceId + '-price">1 credit</span>',
          '<span id="' + instanceId + '-seats"></span>',
        '</div>',
        '<div class="fw-progress"><div class="fw-progress-fill" id="' + instanceId + '-fill"></div></div>',
        '<button class="fw-btn fw-btn-full" id="' + instanceId + '-claim-btn" onclick="window._fw_' + instanceId + '_claim()">' + esc(label) + '</button>',
        '<div class="fw-form" id="' + instanceId + '-form">',
          // login / signup / credits rendered dynamically
        '</div>',
        '<div class="fw-err" id="' + instanceId + '-err"></div>',
        '<div class="fw-done" id="' + instanceId + '-done">',
          "you're in. we'll be in touch when the date is set.",
        '</div>',
      '</div>',
    ].join('');
    root.innerHTML = html;
  }

  // ── Load event ────────────────────────────────────────────────────────────────
  function loadEvent() {
    fetch(apiBase + '/api/fraise/events/' + eventId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        ev = data;
        document.getElementById(instanceId + '-biz').textContent   = ev.business_name || '';
        document.getElementById(instanceId + '-title').textContent = ev.title || '';
        document.getElementById(instanceId + '-desc').textContent  = ev.description || '';
        var seatsLeft = ev.max_seats - ev.seats_claimed;
        document.getElementById(instanceId + '-seats').textContent = seatsLeft > 0 ? seatsLeft + ' spots left' : 'full';
        var pct = Math.min(100, Math.round((ev.seats_claimed / ev.min_seats) * 100));
        var fill = document.getElementById(instanceId + '-fill');
        fill.style.width = pct + '%';
        if (ev.status !== 'open') fill.classList.add('ready');
        var btn = document.getElementById(instanceId + '-claim-btn');
        if (ev.seats_claimed >= ev.max_seats) { btn.disabled = true; btn.textContent = 'sold out'; }
      })
      .catch(function () {});
  }

  // ── Member session ────────────────────────────────────────────────────────────
  function loadMember(cb) {
    if (!memberToken) { if (cb) cb(null); return; }
    fetch(apiBase + '/api/fraise/members/me', { headers: { 'x-member-token': memberToken } })
      .then(function (r) {
        if (!r.ok) { memberToken = null; localStorage.removeItem('fraise_member_token'); if (cb) cb(null); return; }
        return r.json();
      })
      .then(function (data) { member = data; if (cb) cb(member); })
      .catch(function () { if (cb) cb(null); });
  }

  // ── Claim flow ────────────────────────────────────────────────────────────────
  window['_fw_' + instanceId + '_claim'] = function () {
    var btn = document.getElementById(instanceId + '-claim-btn');
    btn.disabled = true;
    clearErr();
    if (!memberToken) { btn.disabled = false; showAuthForm('login'); return; }
    loadMember(function (m) {
      if (!m) { btn.disabled = false; showAuthForm('login'); return; }
      if (m.credit_balance < 1) { btn.disabled = false; showCreditsForm(); return; }
      doClaim(btn);
    });
  };

  function doClaim(btn) {
    fetch(apiBase + '/api/fraise/events/' + eventId + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-member-token': memberToken },
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || 'claim failed');
        member.credit_balance = res.data.credit_balance;
        showDone();
        localStorage.setItem('fraise_member_token', memberToken);
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        showErr(err.message || 'something went wrong.');
      });
  }

  function showDone() {
    hideForm();
    document.getElementById(instanceId + '-claim-btn').style.display = 'none';
    document.getElementById(instanceId + '-done').classList.add('on');
  }

  function showErr(msg) {
    var el = document.getElementById(instanceId + '-err');
    el.textContent = msg; el.classList.add('on');
  }

  function clearErr() {
    var el = document.getElementById(instanceId + '-err');
    el.textContent = ''; el.classList.remove('on');
  }

  // ── Auth form ─────────────────────────────────────────────────────────────────
  function showAuthForm(view) {
    var form = document.getElementById(instanceId + '-form');
    form.innerHTML = '';

    if (view === 'login') {
      form.innerHTML = [
        '<hr class="fw-divider">',
        '<span class="fw-label">email</span><input class="fw-input" type="email" id="' + instanceId + '-li-email" placeholder="you@example.com" autocomplete="email">',
        '<span class="fw-label">password</span><input class="fw-input" type="password" id="' + instanceId + '-li-pw" placeholder="••••••••" autocomplete="current-password">',
        '<button class="fw-btn fw-btn-full" id="' + instanceId + '-li-btn" onclick="window._fw_' + instanceId + '_login()">sign in →</button>',
        '<button class="fw-toggle" onclick="window._fw_' + instanceId + '_toSignup()">no account? create one</button>',
      ].join('');
      form.classList.add('open');
      document.getElementById(instanceId + '-li-pw').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') window['_fw_' + instanceId + '_login']();
      });
    } else {
      form.innerHTML = [
        '<hr class="fw-divider">',
        '<span class="fw-label">name</span><input class="fw-input" type="text" id="' + instanceId + '-su-name" placeholder="full name" autocomplete="name">',
        '<span class="fw-label">email</span><input class="fw-input" type="email" id="' + instanceId + '-su-email" placeholder="you@example.com" autocomplete="email">',
        '<span class="fw-label">password</span><input class="fw-input" type="password" id="' + instanceId + '-su-pw" placeholder="8+ characters" autocomplete="new-password">',
        '<button class="fw-btn fw-btn-full" id="' + instanceId + '-su-btn" onclick="window._fw_' + instanceId + '_signup()">create account →</button>',
        '<button class="fw-toggle" onclick="window._fw_' + instanceId + '_toLogin()">have an account? sign in</button>',
      ].join('');
      form.classList.add('open');
      document.getElementById(instanceId + '-su-pw').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') window['_fw_' + instanceId + '_signup']();
      });
    }
  }

  window['_fw_' + instanceId + '_toLogin']  = function () { clearErr(); showAuthForm('login'); };
  window['_fw_' + instanceId + '_toSignup'] = function () { clearErr(); showAuthForm('signup'); };

  window['_fw_' + instanceId + '_login'] = function () {
    var email = (document.getElementById(instanceId + '-li-email') || {}).value || '';
    var pw    = (document.getElementById(instanceId + '-li-pw')    || {}).value || '';
    var btn   = document.getElementById(instanceId + '-li-btn');
    clearErr();
    if (!email.trim() || !pw) { showErr('email and password required.'); return; }
    btn.disabled = true; btn.textContent = '—';
    fetch(apiBase + '/api/fraise/members/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password: pw }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || 'login failed');
        memberToken = res.data.token; member = res.data;
        localStorage.setItem('fraise_member_token', memberToken);
        hideForm();
        if (member.credit_balance < 1) { showCreditsForm(); return; }
        var claimBtn = document.getElementById(instanceId + '-claim-btn');
        claimBtn.disabled = true;
        doClaim(claimBtn);
      })
      .catch(function (e) { showErr(e.message); btn.disabled = false; btn.textContent = 'sign in →'; });
  };

  window['_fw_' + instanceId + '_signup'] = function () {
    var name  = (document.getElementById(instanceId + '-su-name')  || {}).value || '';
    var email = (document.getElementById(instanceId + '-su-email') || {}).value || '';
    var pw    = (document.getElementById(instanceId + '-su-pw')    || {}).value || '';
    var btn   = document.getElementById(instanceId + '-su-btn');
    clearErr();
    if (!name.trim() || !email.trim() || pw.length < 8) { showErr('name, email, and password (8+ chars) required.'); return; }
    btn.disabled = true; btn.textContent = '—';
    fetch(apiBase + '/api/fraise/members/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password: pw }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || 'signup failed');
        memberToken = res.data.token; member = res.data;
        localStorage.setItem('fraise_member_token', memberToken);
        hideForm();
        showCreditsForm(); // new account → need credits
      })
      .catch(function (e) { showErr(e.message); btn.disabled = false; btn.textContent = 'create account →'; });
  };

  // ── Credits form ──────────────────────────────────────────────────────────────
  function showCreditsForm() {
    var form = document.getElementById(instanceId + '-form');
    form.innerHTML = [
      '<hr class="fw-divider">',
      '<p class="fw-note">you need a credit to claim this spot. CA$120 · no expiry.</p>',
      '<span class="fw-label">card</span><div class="fw-card-el" id="' + instanceId + '-card-el"></div>',
      '<button class="fw-btn fw-btn-full" id="' + instanceId + '-pay-btn" onclick="window._fw_' + instanceId + '_pay()">pay CA$120 →</button>',
    ].join('');
    form.classList.add('open');
    loadStripeAndMount();
  }

  function loadStripeAndMount() {
    var PK = 'pk_live_51R3UWEGkzAbVnPaCoqp8w7a6zxOiXUBhJiuBKMGG7v96W7LBGIlLLhJFm1YrqdFBJv63qy00LmQSbJxq';
    if (window.Stripe) { mountStripeCard(window.Stripe); return; }
    if (window._fwStripeLoading) { window._fwStripeQueue = window._fwStripeQueue || []; window._fwStripeQueue.push(mountStripeCard); return; }
    window._fwStripeLoading = true; window._fwStripeQueue = [mountStripeCard];
    var s = document.createElement('script'); s.src = 'https://js.stripe.com/v3/';
    s.onload = function () {
      window._fwStripeLoading = false;
      (window._fwStripeQueue || []).forEach(function (fn) { fn(window.Stripe); });
      window._fwStripeQueue = [];
    };
    document.head.appendChild(s);
  }

  function mountStripeCard(Stripe) {
    if (cardMounted) return;
    stripe = Stripe(/* PK */ 'pk_live_51R3UWEGkzAbVnPaCoqp8w7a6zxOiXUBhJiuBKMGG7v96W7LBGIlLLhJFm1YrqdFBJv63qy00LmQSbJxq');
    var elements = stripe.elements();
    cardEl = elements.create('card', {
      style: { base: { fontFamily: '"DM Mono", monospace', fontSize: '13px', color: '#1C1C1E', '::placeholder': { color: '#8E8E93' } } }
    });
    cardEl.mount('#' + instanceId + '-card-el');
    cardMounted = true;
  }

  window['_fw_' + instanceId + '_pay'] = function () {
    if (!stripe || !cardEl) { showErr('payment not ready — try again.'); return; }
    var btn = document.getElementById(instanceId + '-pay-btn');
    clearErr(); btn.disabled = true; btn.textContent = '—';
    fetch(apiBase + '/api/fraise/members/credits/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': memberToken },
      body: JSON.stringify({ credits: 1 }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (co) {
        if (!co.ok) throw new Error(co.data.error || 'checkout failed');
        return stripe.confirmCardPayment(co.data.client_secret, {
          payment_method: { card: cardEl, billing_details: { email: member.email, name: member.name } }
        });
      })
      .then(function (result) {
        if (result.error) throw new Error(result.error.message);
        return fetch(apiBase + '/api/fraise/members/credits/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': memberToken },
          body: JSON.stringify({ payment_intent_id: result.paymentIntent.id }),
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || 'confirmation failed');
        member.credit_balance = res.data.credit_balance;
        hideForm();
        var claimBtn = document.getElementById(instanceId + '-claim-btn');
        claimBtn.disabled = true;
        doClaim(claimBtn);
      })
      .catch(function (e) {
        showErr(e.message);
        btn.disabled = false; btn.textContent = 'pay CA$120 →';
      });
  };

  function hideForm() {
    var form = document.getElementById(instanceId + '-form');
    form.classList.remove('open');
    form.innerHTML = '';
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  renderSkeleton();
  loadEvent();

}());
