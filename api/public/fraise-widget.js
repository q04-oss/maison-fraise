/*!
 * fraise-widget.js
 * MIT License
 *
 * Copyright (c) 2026 Box Fraise
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Usage:
 *   <div data-fraise="your-business-slug"></div>
 *   <script src="https://api.fraise.box/fraise-widget.js"></script>
 *
 * Optional attributes on the div:
 *   data-fraise-api     Override API base URL (default: https://api.fraise.box)
 *   data-fraise-theme   "light" (default) or "dark"
 *   data-fraise-tagline One-line description shown to visitors (default: "private experiences, by invitation only.")
 */

(function () {
  'use strict';

  var DEFAULT_API = 'https://api.fraise.box';

  var CSS = [
    '.fraise-widget*{box-sizing:border-box;margin:0;padding:0}',
    '.fraise-widget{font-family:"DM Mono",ui-monospace,monospace;font-size:13px;line-height:1.5}',
    '.fraise-widget[data-theme="dark"]{--fw-bg:#0C0C0E;--fw-border:#2A2A2E;--fw-text:#F2F2F7;--fw-muted:#8A8A8E;--fw-input:#1A1A1C;--fw-btn-bg:#F2F2F7;--fw-btn-text:#0C0C0E;--fw-green:#27AE60;--fw-red:#C0392B}',
    '.fraise-widget{--fw-bg:#FFFFFF;--fw-border:#E5E1DA;--fw-text:#1C1C1E;--fw-muted:#8E8E93;--fw-input:#F7F5F2;--fw-btn-bg:#1C1C1E;--fw-btn-text:#FFFFFF;--fw-green:#27AE60;--fw-red:#C0392B}',
    '.fw-wrap{background:var(--fw-bg);border:1px solid var(--fw-border);border-radius:12px;padding:1.25rem 1.5rem}',
    '.fw-eyebrow{font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--fw-muted);margin-bottom:0.5rem}',
    '.fw-heading{font-size:0.88rem;font-weight:500;color:var(--fw-text);margin-bottom:0.35rem}',
    '.fw-sub{font-size:0.72rem;color:var(--fw-muted);margin-bottom:1.25rem;line-height:1.65}',
    '.fw-form{display:flex;flex-direction:column;gap:0.6rem}',
    '.fw-input{width:100%;background:var(--fw-input);border:1px solid var(--fw-border);border-radius:8px;padding:0.6rem 0.75rem;font-family:inherit;font-size:0.8rem;color:var(--fw-text);outline:none;transition:border-color 0.15s}',
    '.fw-input:focus{border-color:var(--fw-text)}',
    '.fw-input::placeholder{color:var(--fw-muted)}',
    '.fw-btn{width:100%;background:var(--fw-btn-bg);color:var(--fw-btn-text);border:none;border-radius:9999px;padding:0.65rem 1rem;font-family:inherit;font-size:0.72rem;letter-spacing:0.06em;cursor:pointer;transition:opacity 0.15s;margin-top:0.25rem}',
    '.fw-btn:hover:not(:disabled){opacity:0.75}',
    '.fw-btn:disabled{opacity:0.4;cursor:default}',
    '.fw-err{font-size:0.7rem;color:var(--fw-red);margin-top:0.25rem}',
    '.fw-done{text-align:center;padding:0.5rem 0}',
    '.fw-done-heading{font-size:0.88rem;font-weight:500;color:var(--fw-text);margin-bottom:0.4rem}',
    '.fw-done-sub{font-size:0.72rem;color:var(--fw-muted);line-height:1.65}',
    '.fw-done-link{color:var(--fw-text);text-underline-offset:3px}',
  ].join('');

  function injectStyles() {
    if (document.getElementById('fraise-widget-styles')) return;
    var s = document.createElement('style');
    s.id = 'fraise-widget-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(el) {
    var slug    = el.getAttribute('data-fraise');
    var api     = (el.getAttribute('data-fraise-api') || DEFAULT_API).replace(/\/$/, '');
    var theme   = el.getAttribute('data-fraise-theme') === 'dark' ? 'dark' : 'light';
    var tagline = el.getAttribute('data-fraise-tagline') || 'private experiences, by invitation only.';

    if (!slug) {
      el.textContent = '[fraise: missing data-fraise slug]';
      return;
    }

    el.classList.add('fraise-widget');
    el.setAttribute('data-theme', theme);

    var wrap = document.createElement('div');
    wrap.className = 'fw-wrap';

    wrap.innerHTML = [
      '<div class="fw-eyebrow">box fraise</div>',
      '<div class="fw-heading">get considered.</div>',
      '<div class="fw-sub">' + tagline + '<br>leave your name and we\'ll consider you for future invitations.</div>',
      '<form class="fw-form" novalidate>',
      '  <input class="fw-input" type="text"  name="name"  placeholder="your name"  autocomplete="name"  required />',
      '  <input class="fw-input" type="email" name="email" placeholder="your email" autocomplete="email" required />',
      '  <button class="fw-btn" type="submit">let me know →</button>',
      '  <div class="fw-err" role="alert"></div>',
      '</form>',
    ].join('');

    el.appendChild(wrap);

    var form  = wrap.querySelector('form');
    var nameI = wrap.querySelector('input[name="name"]');
    var emailI= wrap.querySelector('input[name="email"]');
    var btn   = wrap.querySelector('button');
    var err   = wrap.querySelector('.fw-err');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';

      var name  = nameI.value.trim();
      var email = emailI.value.trim();

      if (!name)  { err.textContent = 'name required.'; nameI.focus(); return; }
      if (!email) { err.textContent = 'email required.'; emailI.focus(); return; }

      btn.disabled = true;
      btn.textContent = '—';

      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 8000);

      fetch(api + '/api/fraise/businesses/' + encodeURIComponent(slug) + '/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email }),
        signal: controller.signal,
      })
        .then(function (r) { clearTimeout(timeout); return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) {
            err.textContent = res.data.error || 'something went wrong.';
            btn.disabled = false;
            btn.textContent = 'let me know →';
            return;
          }
          var hasCredit = res.data.has_credit;
          wrap.innerHTML = [
            '<div class="fw-done">',
            '  <div class="fw-eyebrow">box fraise</div>',
            '  <div class="fw-done-heading">you\'re on the list.</div>',
            '  <div class="fw-done-sub">',
            hasCredit
              ? 'you\'re eligible for invitations. we\'ll be in touch.'
              : 'get a <a class="fw-done-link" href="https://fraise.box" target="_blank" rel="noopener">box fraise credit</a> to be eligible for invitations.',
            '  </div>',
            '</div>',
          ].join('');
        })
        .catch(function (fetchErr) {
          clearTimeout(timeout);
          btn.disabled = false;
          btn.textContent = 'let me know →';
          if (fetchErr && fetchErr.name === 'AbortError') {
            err.textContent = 'taking too long — try again or visit fraise.box directly.';
          } else if (!navigator.onLine) {
            err.textContent = 'you appear to be offline. try again when you\'re connected.';
          } else {
            err.textContent = 'couldn\'t reach the server. you can also sign up at fraise.box.';
          }
        });
    });
  }

  function init() {
    injectStyles();
    var els = document.querySelectorAll('[data-fraise]');
    for (var i = 0; i < els.length; i++) {
      mount(els[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
