(function () {
  'use strict';

  // ── Per-instance counter (avoids ID collisions when multiple widgets on same page) ──
  var instanceId = 'tf-' + (window._tfWidgetCount = ((window._tfWidgetCount || 0) + 1));

  // ── Parse config from the script tag ──────────────────────────────────────
  var currentScript = document.currentScript;
  var params = new URLSearchParams(currentScript ? currentScript.src.split('?')[1] : '');
  var slug        = params.get('slug') || '';
  var priceCents  = parseInt(params.get('price') || '12000');
  var label       = params.get('label') || 'join the table';
  var apiBase     = params.get('api') || 'https://api.fraise.box';

  if (!slug) { console.warn('[table widget] no slug set'); return; }

  // ── Find or create mount point ─────────────────────────────────────────────
  var mount = document.querySelector('[data-table-slug="' + slug + '"]');
  if (!mount) {
    mount = document.createElement('div');
    if (currentScript && currentScript.parentNode) {
      currentScript.parentNode.insertBefore(mount, currentScript);
    } else {
      document.body.appendChild(mount);
    }
  }

  // ── Inject scoped styles ───────────────────────────────────────────────────
  if (!document.getElementById('tf-widget-styles')) {
    var style = document.createElement('style');
    style.id = 'tf-widget-styles';
    style.textContent = [
      '.tf{font-family:"DM Mono",monospace;font-size:14px;color:#1A1A18;max-width:420px;width:100%}',
      '.tf *{box-sizing:border-box;margin:0;padding:0}',
      '.tf-join{font-family:inherit;font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase',
        ';background:#1A1A18;color:#fff;border:none;border-radius:9999px;padding:0.65rem 1.5rem',
        ';cursor:pointer;transition:opacity 0.15s}',
      '.tf-join:hover{opacity:0.8}',
      '.tf-form{display:none;flex-direction:column;gap:0.65rem;margin-top:1rem}',
      '.tf-form.open{display:flex}',
      '.tf-label{font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:#8A8880;display:block;margin-bottom:0.25rem}',
      '.tf-input{width:100%;font-family:inherit;font-size:0.85rem;background:#F0EDE8',
        ';border:1px solid #E2DDD6;border-radius:8px;padding:0.6rem 0.85rem;color:#1A1A18;outline:none',
        ';transition:border-color 0.15s}',
      '.tf-input:focus{border-color:#1A1A18;background:#fff}',
      '.tf-card{background:#F0EDE8;border:1px solid #E2DDD6;border-radius:8px;padding:0.7rem 0.85rem}',
      '.tf-total{display:flex;justify-content:space-between;font-size:0.78rem;padding-top:0.5rem',
        ';border-top:1px solid #E2DDD6}',
      '.tf-total-label{color:#8A8880}',
      '.tf-pay{width:100%;font-family:inherit;font-size:0.78rem;letter-spacing:0.06em;text-transform:uppercase',
        ';background:#1A1A18;color:#fff;border:none;border-radius:9999px;padding:0.7rem',
        ';cursor:pointer;transition:opacity 0.15s}',
      '.tf-pay:hover{opacity:0.8}',
      '.tf-pay:disabled{opacity:0.4;cursor:not-allowed}',
      '.tf-err{font-size:0.7rem;color:#c0392b;display:none}',
      '.tf-err.on{display:block}',
      '.tf-done{font-size:0.8rem;color:#1A1A18;line-height:1.7;display:none}',
      '.tf-done.on{display:block}',
      '.tf-note{font-size:0.65rem;color:#8A8880;margin-top:0.35rem;line-height:1.6}',
      '.tf-cancel{font-family:inherit;font-size:0.65rem;color:#8A8880;background:none;border:none',
        ';cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px;margin-top:0.25rem}',
      '.tf-cancel:hover{color:#1A1A18}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Format price ───────────────────────────────────────────────────────────
  function fmt(cents) {
    return 'CA$' + (cents / 100).toFixed(0);
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  mount.innerHTML = [
    '<div class="tf">',
      '<button class="tf-join" id="tf-open-' + instanceId + '">' + label + '</button>',
      '<div class="tf-form" id="tf-form-' + instanceId + '">',
        '<div>',
          '<label class="tf-label" for="tf-name-' + instanceId + '">your name</label>',
          '<input class="tf-input" id="tf-name-' + instanceId + '" type="text" placeholder="full name" autocomplete="name" />',
        '</div>',
        '<div>',
          '<label class="tf-label" for="tf-email-' + instanceId + '">email</label>',
          '<input class="tf-input" id="tf-email-' + instanceId + '" type="email" placeholder="you@example.com" autocomplete="email" />',
        '</div>',
        '<div>',
          '<label class="tf-label">payment</label>',
          '<div class="tf-card" id="tf-card-' + instanceId + '"></div>',
        '</div>',
        '<div class="tf-total">',
          '<span class="tf-total-label">total</span>',
          '<span>' + fmt(priceCents) + '</span>',
        '</div>',
        '<div class="tf-err" id="tf-err-' + instanceId + '"></div>',
        '<button class="tf-pay" id="tf-pay-' + instanceId + '">pay ' + fmt(priceCents) + '</button>',
        '<button class="tf-cancel" id="tf-cancel-' + instanceId + '">cancel</button>',
        '<p class="tf-note">date tbd — you\'ll be notified when a date is set. full refund if it doesn\'t work for you.</p>',
      '</div>',
      '<div class="tf-done" id="tf-done-' + instanceId + '">',
        'you\'re in.<br/>',
        '<span style="font-size:0.7rem;color:#8A8880;">we\'ll be in touch when the date is set.</span>',
      '</div>',
    '</div>',
  ].join('');

  var openBtn   = document.getElementById('tf-open-'   + instanceId);
  var form      = document.getElementById('tf-form-'   + instanceId);
  var cancelBtn = document.getElementById('tf-cancel-' + instanceId);
  var payBtn    = document.getElementById('tf-pay-'    + instanceId);
  var errEl     = document.getElementById('tf-err-'    + instanceId);
  var doneEl    = document.getElementById('tf-done-'   + instanceId);

  openBtn.addEventListener('click', function () {
    openBtn.style.display = 'none';
    form.classList.add('open');
    document.getElementById('tf-name-' + instanceId).focus();
  });

  cancelBtn.addEventListener('click', function () {
    form.classList.remove('open');
    openBtn.style.display = '';
  });

  // ── Load Stripe and mount card element ─────────────────────────────────────
  var stripeInstance = null;
  var cardEl = null;

  function loadStripe(cb) {
    if (window.Stripe) { cb(window.Stripe); return; }
    // Only ever inject Stripe.js once — queue callbacks if already loading
    if (window._tfStripeLoading) { window._tfStripeQueue.push(cb); return; }
    var existing = document.querySelector('script[src^="https://js.stripe.com/v3"]');
    if (existing) { existing.addEventListener('load', function () { cb(window.Stripe); }); return; }
    window._tfStripeLoading = true;
    window._tfStripeQueue = [cb];
    var s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = function () {
      window._tfStripeLoading = false;
      window._tfStripeQueue.forEach(function (fn) { fn(window.Stripe); });
      window._tfStripeQueue = [];
    };
    document.head.appendChild(s);
  }

  loadStripe(function (Stripe) {
    stripeInstance = Stripe('pk_live_51R3UWEGkzAbVnPaCoqp8w7a6zxOiXUBhJiuBKMGG7v96W7LBGIlLLhJHNWP3qcllZBLH4oLjJFm1YrqdFBJv63qy00LmQSbJxq');
    var elements = stripeInstance.elements();
    cardEl = elements.create('card', {
      style: {
        base: {
          fontFamily: '"DM Mono", monospace',
          fontSize: '14px',
          color: '#1A1A18',
          '::placeholder': { color: '#8A8880' },
        }
      }
    });
    cardEl.mount('#tf-card-' + instanceId);
  });

  // ── Pay ───────────────────────────────────────────────────────────────────
  payBtn.addEventListener('click', async function () {
    var name  = document.getElementById('tf-name-'  + instanceId).value.trim();
    var email = document.getElementById('tf-email-' + instanceId).value.trim();

    errEl.textContent = '';
    errEl.classList.remove('on');

    if (!name || !email) {
      errEl.textContent = 'name and email required.';
      errEl.classList.add('on');
      return;
    }
    if (!stripeInstance || !cardEl) {
      errEl.textContent = 'payment not ready — try again.';
      errEl.classList.add('on');
      return;
    }

    payBtn.disabled = true;
    payBtn.textContent = '—';

    try {
      // 1. Create payment intent
      var coRes = await fetch(apiBase + '/api/table/pool/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, name: name, email: email, amount_cents: priceCents }),
      });
      var coData = await coRes.json();
      if (!coRes.ok) throw new Error(coData.error || 'checkout failed');

      // 2. Confirm card payment
      var result = await stripeInstance.confirmCardPayment(coData.client_secret, {
        payment_method: { card: cardEl, billing_details: { name: name, email: email } }
      });
      if (result.error) throw new Error(result.error.message);

      // 3. Confirm membership
      var joinRes = await fetch(apiBase + '/api/table/pool/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug,
          name: name,
          email: email,
          payment_intent_id: result.paymentIntent.id,
        }),
      });
      if (!joinRes.ok) {
        var joinData = await joinRes.json().catch(function () { return {}; });
        throw new Error(joinData.error || 'membership save failed — contact support with reference: ' + result.paymentIntent.id);
      }

      // 4. Show confirmation
      form.classList.remove('open');
      doneEl.classList.add('on');

    } catch (err) {
      payBtn.disabled = false;
      payBtn.textContent = 'pay ' + fmt(priceCents);
      errEl.textContent = err.message || 'something went wrong.';
      errEl.classList.add('on');
    }
  });

})();
