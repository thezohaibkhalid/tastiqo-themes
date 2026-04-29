/* Chunk N Cheese — vanilla JS, no framework, no build step. */
(function () {
  'use strict';

  /* ── TastiqoCart — client-side cart (localStorage) ──────────────── */
  var CART_KEY = 'tastiqo_cart';

  var TastiqoCart = {
    _read: function() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch(e) { return []; } },
    _write: function(items) { localStorage.setItem(CART_KEY, JSON.stringify(items)); this._notify(); },
    _notify: function() { window.dispatchEvent(new CustomEvent('cart:updated')); this._updateBadge(); },
    _updateBadge: function() {
      var count = this.getCount();
      var badges = document.querySelectorAll('[data-cnc-cart-count]');
      badges.forEach(function(badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; });
    },
    _generateId: function(product_id, modifiers) {
      var modIds = (modifiers || []).map(function(m) { return m.id; }).sort();
      return product_id + ':' + modIds.join(',');
    },
    getItems: function() { return this._read(); },
    addItem: function(item) {
      var items = this._read();
      var existing = null;
      for (var i = 0; i < items.length; i++) { if (items[i].id === item.id) { existing = items[i]; break; } }
      if (existing) { existing.quantity += item.quantity; } else { items.push(item); }
      this._write(items);
    },
    updateQuantity: function(id, qty) {
      var items = this._read();
      if (qty <= 0) { items = items.filter(function(it) { return it.id !== id; }); }
      else { for (var i = 0; i < items.length; i++) { if (items[i].id === id) { items[i].quantity = qty; break; } } }
      this._write(items);
    },
    removeItem: function(id) { var items = this._read().filter(function(it) { return it.id !== id; }); this._write(items); },
    clear: function() { localStorage.removeItem(CART_KEY); this._notify(); },
    getCount: function() { return this._read().reduce(function(sum, it) { return sum + it.quantity; }, 0); },
    getSubtotal: function() { return this._read().reduce(function(sum, it) { return sum + (it.unit_price * it.quantity); }, 0); }
  };
  window.TastiqoCart = TastiqoCart;

  /* ── Format price ───────────────────────────────────────────────── */
  function formatMoney(paisa) {
    var amount = (paisa / 100).toFixed(2);
    if (amount.endsWith('.00')) amount = amount.slice(0, -3);
    return 'Rs. ' + amount;
  }

  /* ── Storefront data ────────────────────────────────────────────── */
  var _storefrontData = null;
  function getStorefrontData() {
    if (_storefrontData) return _storefrontData;
    try { var el = document.getElementById('storefront-data'); if (el) _storefrontData = JSON.parse(el.textContent); } catch(e) {}
    return _storefrontData || {};
  }
  function getBranchId() { return getStorefrontData().branch_id || null; }

  /* ── Checkout ───────────────────────────────────────────────────── */
  function doCheckout() {
    if (!CustomerAuth.isLoggedIn()) { openAuthModal(); return; }
    var items = TastiqoCart.getItems();
    if (!items.length) return;
    var branchId = getBranchId();
    if (!branchId) { showCheckoutError('Please select a branch first.'); return; }

    var apiItems = items.map(function(it) {
      return { product_id: it.product_id, quantity: it.quantity, modifier_ids: (it.modifiers || []).map(function(m) { return m.id; }), notes: it.notes || '' };
    });
    var body = { branch_id: branchId, order_type: 'pickup', payment_method: 'cash', items: apiItems, customer_notes: '' };
    var checkoutBtn = document.getElementById('cnc-checkout-btn');
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.textContent = 'Placing order...'; }

    fetch('/api/storefront/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CustomerAuth.getAccessToken() }, body: JSON.stringify(body) })
    .then(function(res) { if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'Failed to place order'); }); return res.json(); })
    .then(function() { TastiqoCart.clear(); window.location.href = '/account/orders'; })
    .catch(function(err) { showCheckoutError(err.message || 'Failed to place order.'); if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout'; } });
  }
  function showCheckoutError(msg) { var el = document.getElementById('cnc-checkout-error'); if (el) { el.textContent = msg; el.style.display = 'block'; } }

  /* ── Add to Cart (Product Detail Page) ──────────────────────────── */
  function initProductAddToCart() {
    var addBtn = document.getElementById('cnc-add-to-cart-btn');
    if (!addBtn) return;
    var dataEl = document.getElementById('product-data');
    if (!dataEl) return;
    var product;
    try { product = JSON.parse(dataEl.textContent); } catch(e) { return; }

    var priceDisplay = document.querySelector('.cnc-product-price');
    var qtyInput = document.querySelector('[data-cnc-qty] input');

    function recalcTotalPrice() {
      var unitPrice = product.price;
      document.querySelectorAll('.cnc-modifier-groups input:checked').forEach(function(inp) {
        unitPrice += parseInt(inp.getAttribute('data-price-delta'), 10) || 0;
      });
      var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
      var lineTotal = unitPrice * qty;
      if (priceDisplay) priceDisplay.textContent = formatMoney(unitPrice);
      addBtn.textContent = 'Add to cart \u00b7 ' + formatMoney(lineTotal);
    }

    function enforceMaxSelections(groupEl) {
      var max = parseInt(groupEl.getAttribute('data-group-max'), 10) || 0;
      if (max <= 1) return;
      var checkboxes = groupEl.querySelectorAll('input[type="checkbox"]');
      var checkedCount = 0;
      checkboxes.forEach(function(cb) { if (cb.checked) checkedCount++; });
      checkboxes.forEach(function(cb) {
        if (!cb.checked && checkedCount >= max) { cb.disabled = true; cb.closest('.cnc-modifier-option').classList.add('cnc-modifier-disabled'); }
        else { cb.disabled = false; cb.closest('.cnc-modifier-option').classList.remove('cnc-modifier-disabled'); }
      });
    }

    document.querySelectorAll('.cnc-modifier-option input[type="radio"], .cnc-modifier-option input[type="checkbox"]').forEach(function(inp) {
      inp.addEventListener('change', function() { recalcTotalPrice(); var g = inp.closest('.cnc-modifier-group'); if (g) enforceMaxSelections(g); });
    });
    document.querySelectorAll('.cnc-modifier-group').forEach(function(g) { enforceMaxSelections(g); });

    if (qtyInput) {
      document.querySelectorAll('[data-cnc-qty] button[data-cnc-qty-step]').forEach(function(btn) {
        btn.addEventListener('click', function() { setTimeout(recalcTotalPrice, 0); });
      });
      qtyInput.addEventListener('input', recalcTotalPrice);
      qtyInput.addEventListener('change', recalcTotalPrice);
    }
    recalcTotalPrice();

    addBtn.addEventListener('click', function() {
      var requiredGroups = document.querySelectorAll('.cnc-modifier-group[data-group-required="true"]');
      var valid = true;
      requiredGroups.forEach(function(groupEl) {
        var checked = groupEl.querySelectorAll('input:checked');
        var min = parseInt(groupEl.getAttribute('data-group-min'), 10) || 1;
        var errEl = groupEl.querySelector('.cnc-modifier-error');
        if (checked.length < min) {
          valid = false;
          groupEl.classList.add('cnc-modifier-group-error');
          if (!errEl) { errEl = document.createElement('p'); errEl.className = 'cnc-modifier-error'; errEl.style.cssText = 'color:#dc2626;font-size:0.8rem;margin-top:6px;'; groupEl.appendChild(errEl); }
          var title = groupEl.querySelector('.cnc-modifier-group-title');
          errEl.textContent = 'Please select ' + (title ? title.textContent.replace('Required', '').trim() : 'this option');
          errEl.style.display = 'block';
        } else {
          groupEl.classList.remove('cnc-modifier-group-error');
          if (errEl) errEl.style.display = 'none';
        }
      });
      if (!valid) return;

      var quantity = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
      var modifiers = [];
      document.querySelectorAll('.cnc-modifier-groups input:checked').forEach(function(inp) {
        modifiers.push({ id: inp.value, group_name: inp.getAttribute('data-group-name') || '', name: inp.getAttribute('data-option-name') || '', price_adjustment: parseInt(inp.getAttribute('data-price-delta'), 10) || 0 });
      });
      var unitPrice = product.price;
      modifiers.forEach(function(m) { unitPrice += m.price_adjustment; });
      var cartId = TastiqoCart._generateId(product.id, modifiers);

      TastiqoCart.addItem({ id: cartId, product_id: product.id, name: product.name, image_url: product.image_url || '', quantity: quantity, unit_price: unitPrice, modifiers: modifiers, notes: '' });
      addBtn.textContent = 'Added!';
      addBtn.disabled = true;
      setTimeout(function() { addBtn.disabled = false; recalcTotalPrice(); }, 1000);
    });
  }

  /* ── Cart Page ──────────────────────────────────────────────────── */
  function initCartPage() {
    var cartPage = document.querySelector('[data-cnc-cart-page]');
    if (!cartPage) return;
    renderCart();
    window.addEventListener('cart:updated', renderCart);
    var checkoutBtn = document.getElementById('cnc-checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', doCheckout);
  }

  function renderCart() {
    var filledEl = document.getElementById('cnc-cart-filled');
    var emptyEl = document.getElementById('cnc-cart-empty');
    var itemsEl = document.getElementById('cnc-cart-items');
    var subtotalEl = document.getElementById('cnc-cart-subtotal');
    var totalEl = document.getElementById('cnc-cart-total');
    var errorEl = document.getElementById('cnc-checkout-error');
    if (!filledEl || !emptyEl || !itemsEl) return;
    var items = TastiqoCart.getItems();

    if (!items.length) { filledEl.style.display = 'none'; emptyEl.style.display = ''; return; }
    filledEl.style.display = ''; emptyEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    var html = '';
    items.forEach(function(item) {
      var lineTotal = item.unit_price * item.quantity;
      var modText = (item.modifiers && item.modifiers.length) ? item.modifiers.map(function(m) { return m.name; }).join(', ') : '';
      html += '<div class="cnc-cart-row">';
      html += item.image_url ? '<img src="' + escHTML(item.image_url) + '" alt="' + escHTML(item.name) + '">' : '<div class="cnc-skeleton" style="width:80px;height:80px;border-radius:8px;"></div>';
      html += '<div><div class="cnc-cart-name">' + escHTML(item.name) + '</div>';
      if (modText) html += '<div class="cnc-cart-meta">' + escHTML(modText) + '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">';
      html += '<button type="button" class="cnc-qty-ctrl" data-cart-id="' + escHTML(item.id) + '" data-action="decrease" style="width:28px;height:28px;border:1px solid var(--cnc-border);border-radius:6px;background:var(--cnc-bg);color:var(--cnc-text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">\u2212</button>';
      html += '<span style="font-weight:600;min-width:20px;text-align:center;">' + item.quantity + '</span>';
      html += '<button type="button" class="cnc-qty-ctrl" data-cart-id="' + escHTML(item.id) + '" data-action="increase" style="width:28px;height:28px;border:1px solid var(--cnc-border);border-radius:6px;background:var(--cnc-bg);color:var(--cnc-text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>';
      html += '<button type="button" class="cnc-qty-ctrl" data-cart-id="' + escHTML(item.id) + '" data-action="remove" style="background:none;border:none;color:var(--cnc-error,#dc2626);font-size:0.8rem;cursor:pointer;margin-left:8px;font-weight:600;">Remove</button>';
      html += '</div></div>';
      html += '<div style="font-weight:700;color:var(--cnc-primary);white-space:nowrap;">' + formatMoney(lineTotal) + '</div></div>';
    });
    itemsEl.innerHTML = html;
    var subtotal = TastiqoCart.getSubtotal();
    if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
    if (totalEl) totalEl.textContent = formatMoney(subtotal);

    itemsEl.querySelectorAll('.cnc-qty-ctrl').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cartId = btn.getAttribute('data-cart-id'), action = btn.getAttribute('data-action');
        var current = TastiqoCart.getItems(), found = null;
        for (var i = 0; i < current.length; i++) { if (current[i].id === cartId) { found = current[i]; break; } }
        if (!found) return;
        if (action === 'increase') TastiqoCart.updateQuantity(cartId, found.quantity + 1);
        else if (action === 'decrease') TastiqoCart.updateQuantity(cartId, found.quantity - 1);
        else if (action === 'remove') TastiqoCart.removeItem(cartId);
      });
    });
  }

  /* ── Branch picker dropdown ────────────────────────────────────── */
  var branchTrigger = document.querySelector('[data-cnc-branch-trigger]');
  var branchMenu    = document.querySelector('[data-cnc-branch-menu]');
  if (branchTrigger && branchMenu) {
    branchTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = branchMenu.hasAttribute('hidden');
      if (open) { branchMenu.removeAttribute('hidden'); branchTrigger.setAttribute('aria-expanded', 'true'); }
      else { branchMenu.setAttribute('hidden', ''); branchTrigger.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('click', function (e) {
      if (!branchMenu.contains(e.target) && !branchTrigger.contains(e.target)) {
        branchMenu.setAttribute('hidden', ''); branchTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Mobile drawer ─────────────────────────────────────────────── */
  var mobileToggle = document.querySelector('[data-cnc-mobile-toggle]');
  var mobileDrawer = document.querySelector('[data-cnc-mobile-drawer]');
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', function () {
      var open = mobileDrawer.hasAttribute('hidden');
      if (open) { mobileDrawer.removeAttribute('hidden'); mobileToggle.setAttribute('aria-expanded', 'true'); }
      else { mobileDrawer.setAttribute('hidden', ''); mobileToggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ── Top loading bar ───────────────────────────────────────────── */
  var loadBar = document.getElementById('cnc-load-bar');
  if (loadBar) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || a.target === '_blank') return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      try { var url = new URL(a.href); if (url.hostname !== location.hostname) return; } catch (_) { return; }
      loadBar.classList.remove('is-done'); loadBar.classList.add('is-loading'); loadBar.style.width = '70%';
    }, true);
    window.addEventListener('pageshow', function () {
      loadBar.classList.add('is-done');
      setTimeout(function () { loadBar.classList.remove('is-loading', 'is-done'); loadBar.style.width = '0%'; }, 500);
    });
  }

  /* ── Scroll reveal ─────────────────────────────────────────────── */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    document.querySelectorAll('[data-cnc-reveal]').forEach(function (el) { io.observe(el); });
  }

  /* ── Quantity stepper ──────────────────────────────────────────── */
  document.querySelectorAll('[data-cnc-qty]').forEach(function (qty) {
    var input = qty.querySelector('input');
    qty.querySelectorAll('button[data-cnc-qty-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.getAttribute('data-cnc-qty-step'), 10) || 0;
        var v = (parseInt(input.value, 10) || 1) + step;
        if (v < 1) v = 1; if (v > 99) v = 99;
        input.value = v;
      });
    });
  });

  /* ── Customer Auth ─────────────────────────────────────────────── */
  var AUTH_API = '/api/storefront/customer';
  var AUTH_TOKENS_KEY = 'tastiqo_customer_tokens';

  var CustomerAuth = {
    getTokens: function() { try { return JSON.parse(localStorage.getItem(AUTH_TOKENS_KEY)); } catch(e) { return null; } },
    setTokens: function(d) { localStorage.setItem(AUTH_TOKENS_KEY, JSON.stringify(d)); },
    clearTokens: function() { localStorage.removeItem(AUTH_TOKENS_KEY); },
    getAccessToken: function() { var t = this.getTokens(); return t ? t.access_token : null; },
    isLoggedIn: function() { return !!this.getAccessToken(); },
    apiRequest: function(method, path, body) {
      var self = this;
      var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
      var token = this.getAccessToken();
      if (token) opts.headers['Authorization'] = 'Bearer ' + token;
      if (body) opts.body = JSON.stringify(body);
      return fetch(AUTH_API + path, opts).then(function(res) {
        if (res.status === 401 && token) {
          return self.tryRefresh().then(function(ok) {
            if (ok) { opts.headers['Authorization'] = 'Bearer ' + self.getAccessToken(); return fetch(AUTH_API + path, opts); }
            return res;
          });
        }
        return res;
      });
    },
    tryRefresh: function() {
      var self = this;
      var t = this.getTokens();
      if (!t || !t.refresh_token) return Promise.resolve(false);
      return fetch(AUTH_API + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }) })
        .then(function(r) { if (!r.ok) { self.clearTokens(); return false; } return r.json().then(function(d) { self.setTokens({ access_token: d.access_token, refresh_token: d.refresh_token, customer: d.customer }); return true; }); })
        .catch(function() { self.clearTokens(); return false; });
    }
  };

  var authModal = document.getElementById('auth-modal');
  var authOpenBtns = document.querySelectorAll('[data-open-auth]');
  var authCloseBtns = document.querySelectorAll('[data-close-auth]');

  function openAuthModal() {
    if (CustomerAuth.isLoggedIn()) { window.location.href = '/account'; return; }
    if (authModal) { authModal.classList.add('is-open'); showStep('email'); }
  }
  function closeAuthModal() { if (authModal) authModal.classList.remove('is-open'); }
  function showStep(s) {
    document.querySelectorAll('.cnc-auth-step').forEach(function(el) { el.style.display = 'none'; });
    var el = document.getElementById('auth-step-' + s);
    if (el) el.style.display = 'block';
  }

  authOpenBtns.forEach(function(b) { b.addEventListener('click', function(e) { e.preventDefault(); openAuthModal(); }); });
  authCloseBtns.forEach(function(b) { b.addEventListener('click', closeAuthModal); });
  if (authModal) authModal.addEventListener('click', function(e) { if (e.target === authModal) closeAuthModal(); });
  window.openAuthModal = openAuthModal;
  window.closeAuthModal = closeAuthModal;

  var emailForm = document.getElementById('auth-email-form');
  if (emailForm) {
    emailForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('auth-email-btn');
      var errEl = document.getElementById('auth-email-error');
      var email = document.getElementById('auth-email').value.trim();
      var name = document.getElementById('auth-name').value.trim();
      if (!email) return;
      btn.querySelector('.cnc-btn-spinner').style.display = 'inline-flex';
      errEl.style.display = 'none';
      fetch(AUTH_API + '/auth/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, full_name: name }) })
        .then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || 'Failed'); document.getElementById('auth-otp-email-display').textContent = email; showStep('otp'); }); })
        .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
        .finally(function() { btn.querySelector('.cnc-btn-spinner').style.display = 'none'; });
    });
  }

  var otpForm = document.getElementById('auth-otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('auth-otp-btn');
      var errEl = document.getElementById('auth-otp-error');
      var email = document.getElementById('auth-email').value.trim();
      var otp = document.getElementById('auth-otp').value.trim();
      if (!otp) return;
      btn.querySelector('.cnc-btn-spinner').style.display = 'inline-flex';
      errEl.style.display = 'none';
      fetch(AUTH_API + '/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, otp: otp }) })
        .then(function(r) { return r.json().then(function(d) {
          if (!r.ok) throw new Error(d.error || 'Invalid code');
          CustomerAuth.setTokens({ access_token: d.access_token, refresh_token: d.refresh_token, customer: d.customer });
          document.getElementById('auth-welcome-name').textContent = 'Welcome, ' + (d.customer.full_name || d.customer.email) + '!';
          showStep('success'); updateAuthUI();
          setTimeout(function() { closeAuthModal(); if (window.location.pathname === '/account/login') window.location.href = '/account'; }, 1200);
        }); })
        .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
        .finally(function() { btn.querySelector('.cnc-btn-spinner').style.display = 'none'; });
    });
  }

  var resendBtn = document.getElementById('auth-resend-btn');
  if (resendBtn) resendBtn.addEventListener('click', function() {
    var email = document.getElementById('auth-email').value.trim();
    resendBtn.textContent = 'Sending...';
    fetch(AUTH_API + '/auth/resend-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
      .then(function() { resendBtn.textContent = 'Code resent!'; setTimeout(function() { resendBtn.textContent = 'Resend code'; }, 3000); })
      .catch(function() { resendBtn.textContent = 'Resend code'; });
  });
  var backBtn = document.getElementById('auth-back-btn');
  if (backBtn) backBtn.addEventListener('click', function() { showStep('email'); });

  function updateAuthUI() {}
  updateAuthUI();

  /* ── Account Page ──────────────────────────────────────────────── */
  var accountPage = document.getElementById('account-page');
  var accountNotLoggedIn = document.getElementById('account-not-logged-in');
  if (accountPage || accountNotLoggedIn) {
    if (CustomerAuth.isLoggedIn()) { if (accountPage) accountPage.style.display = 'block'; loadProfile(); loadAddresses(); }
    else { if (accountNotLoggedIn) accountNotLoggedIn.style.display = 'block'; }
  }

  function loadProfile() {
    CustomerAuth.apiRequest('GET', '/me').then(function(r) { if (!r.ok) return; return r.json(); }).then(function(c) {
      if (!c) return;
      document.getElementById('account-name').textContent = c.full_name || '\u2014';
      document.getElementById('account-email').textContent = c.email || '\u2014';
      document.getElementById('account-phone').textContent = c.phone || '\u2014';
      var pn = document.getElementById('profile-name'); if (pn) pn.value = c.full_name || '';
      var pp = document.getElementById('profile-phone'); if (pp) pp.value = c.phone || '';
    });
  }

  function loadAddresses() {
    var container = document.getElementById('account-addresses-list');
    if (!container) return;
    CustomerAuth.apiRequest('GET', '/addresses').then(function(r) { if (!r.ok) throw new Error(); return r.json(); }).then(function(addrs) {
      if (!addrs || !addrs.length) { container.innerHTML = '<p style="color:var(--cnc-text-muted);">No saved addresses yet.</p>'; return; }
      container.innerHTML = addrs.map(function(a) {
        var defaultBadge = a.is_default ? '<span style="background:var(--cnc-secondary);color:var(--cnc-primary);padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-left:6px;">Default</span>' : '';
        return '<div class="cnc-address-card" style="display:flex;justify-content:space-between;align-items:flex-start;padding:1rem;border:1px solid var(--cnc-border);border-radius:0.75rem;margin-bottom:0.75rem;">' +
          '<div class="cnc-address-card-info"><div style="font-weight:600;margin-bottom:4px;">' + escHTML(a.label || 'Address') + defaultBadge + '</div>' +
          '<div style="font-size:0.9rem;">' + escHTML(a.address_line1) + (a.address_line2 ? ', ' + escHTML(a.address_line2) : '') + '</div>' +
          '<div style="color:var(--cnc-text-muted);font-size:0.85rem;">' + [a.city, a.state, a.postal_code].filter(Boolean).map(escHTML).join(', ') + '</div>' +
          (a.delivery_notes ? '<div style="color:var(--cnc-text-muted);font-size:0.8rem;font-style:italic;margin-top:4px;">Note: ' + escHTML(a.delivery_notes) + '</div>' : '') +
          '</div><div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">' +
          '<button class="cnc-btn-link" style="font-size:0.8rem;" onclick="window._editAddress(' + a.id + ')">Edit</button>' +
          '<button class="cnc-btn-link" style="font-size:0.8rem;color:var(--cnc-error,#dc2626);" onclick="window._deleteAddress(' + a.id + ')">Delete</button></div></div>';
      }).join('');
      window._addressCache = addrs;
    }).catch(function() { container.innerHTML = '<p style="color:var(--cnc-text-muted);">Failed to load addresses.</p>'; });
  }

  function escHTML(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  var addressModal = document.getElementById('address-modal');
  var addressForm = document.getElementById('address-form');
  var addAddressBtn = document.getElementById('account-add-address-btn');
  var addressCloseBtn = document.getElementById('address-modal-close');
  var addressCancelBtn = document.getElementById('address-cancel-btn');

  function openAddressModal(addr) {
    if (!addressModal) return;
    document.getElementById('address-modal-title').textContent = addr ? 'Edit Address' : 'Add Address';
    document.getElementById('address-submit-btn').textContent = addr ? 'Update Address' : 'Save Address';
    document.getElementById('addr-id').value = addr ? addr.id : '';
    document.getElementById('addr-label').value = addr ? addr.label || '' : '';
    document.getElementById('addr-line1').value = addr ? addr.address_line1 || '' : '';
    document.getElementById('addr-line2').value = addr ? addr.address_line2 || '' : '';
    document.getElementById('addr-city').value = addr ? addr.city || '' : '';
    document.getElementById('addr-postal').value = addr ? addr.postal_code || '' : '';
    document.getElementById('addr-notes').value = addr ? addr.delivery_notes || '' : '';
    document.getElementById('addr-default').checked = addr ? addr.is_default : false;
    document.getElementById('address-error').style.display = 'none';
    addressModal.style.display = 'flex';
  }
  function closeAddressModal() { if (addressModal) addressModal.style.display = 'none'; }

  if (addAddressBtn) addAddressBtn.addEventListener('click', function() { openAddressModal(null); });
  if (addressCloseBtn) addressCloseBtn.addEventListener('click', closeAddressModal);
  if (addressCancelBtn) addressCancelBtn.addEventListener('click', closeAddressModal);
  if (addressModal) addressModal.addEventListener('click', function(e) { if (e.target === addressModal) closeAddressModal(); });

  window._editAddress = function(id) { var addr = (window._addressCache || []).find(function(a) { return a.id === id; }); if (addr) openAddressModal(addr); };
  window._deleteAddress = function(id) { if (!confirm('Delete this address?')) return; CustomerAuth.apiRequest('DELETE', '/addresses/' + id).then(function(r) { if (!r.ok) throw new Error(); loadAddresses(); }).catch(function() { alert('Failed to delete address'); }); };

  if (addressForm) addressForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var addrId = document.getElementById('addr-id').value;
    var errorEl = document.getElementById('address-error');
    var body = { label: document.getElementById('addr-label').value.trim(), address_line1: document.getElementById('addr-line1').value.trim(), address_line2: document.getElementById('addr-line2').value.trim() || null, city: document.getElementById('addr-city').value.trim() || null, postal_code: document.getElementById('addr-postal').value.trim() || null, delivery_notes: document.getElementById('addr-notes').value.trim() || null, is_default: document.getElementById('addr-default').checked };
    if (!body.address_line1) { errorEl.textContent = 'Address line 1 is required'; errorEl.style.display = 'block'; return; }
    var method = addrId ? 'PUT' : 'POST', url = addrId ? '/addresses/' + addrId : '/addresses';
    var btn = document.getElementById('address-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    CustomerAuth.apiRequest(method, url, body).then(function(r) { if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Failed'); }); closeAddressModal(); loadAddresses(); })
    .catch(function(err) { errorEl.textContent = err.message || 'Failed to save address'; errorEl.style.display = 'block'; })
    .finally(function() { btn.disabled = false; btn.textContent = addrId ? 'Update Address' : 'Save Address'; });
  });

  var editToggle = document.getElementById('account-edit-toggle');
  var editCancel = document.getElementById('account-edit-cancel');
  var profileDisplay = document.getElementById('account-profile-display');
  var profileForm = document.getElementById('account-profile-form');
  if (editToggle) editToggle.addEventListener('click', function() { if (profileDisplay) profileDisplay.style.display = 'none'; if (profileForm) profileForm.style.display = 'flex'; });
  if (editCancel) editCancel.addEventListener('click', function() { if (profileDisplay) profileDisplay.style.display = 'block'; if (profileForm) profileForm.style.display = 'none'; });
  if (profileForm) profileForm.addEventListener('submit', function(e) {
    e.preventDefault();
    CustomerAuth.apiRequest('PUT', '/me', { full_name: document.getElementById('profile-name').value, phone: document.getElementById('profile-phone').value || null }).then(function() {
      if (profileDisplay) profileDisplay.style.display = 'block'; if (profileForm) profileForm.style.display = 'none'; loadProfile();
    });
  });

  var logoutBtn = document.getElementById('account-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', function() { CustomerAuth.apiRequest('POST', '/auth/logout').then(function() { CustomerAuth.clearTokens(); window.location.href = '/'; }); });

  /* ── Order History ─────────────────────────────────────────────── */
  var ordersPage = document.getElementById('orders-page');
  var ordersNotLoggedIn = document.getElementById('orders-not-logged-in');
  if (ordersPage || ordersNotLoggedIn) {
    if (CustomerAuth.isLoggedIn()) { if (ordersPage) ordersPage.style.display = 'block'; loadOrders(false); }
    else { if (ordersNotLoggedIn) ordersNotLoggedIn.style.display = 'block'; }
  }

  var ordersOffset = 0, ordersLimit = 20;
  function loadOrders(append) {
    var listEl = document.getElementById('orders-list'), emptyEl = document.getElementById('orders-empty'), pagEl = document.getElementById('orders-pagination');
    if (!listEl) return;
    fetch('/api/storefront/orders?limit=' + ordersLimit + '&offset=' + ordersOffset, { headers: { 'Authorization': 'Bearer ' + CustomerAuth.getAccessToken() } })
      .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function(data) {
        if (!data.orders.length && ordersOffset === 0) { listEl.style.display = 'none'; if (emptyEl) emptyEl.style.display = 'block'; return; }
        var html = data.orders.map(function(o) {
          var d = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          return '<div class="cnc-order-card"><div class="cnc-order-card-info"><div class="cnc-order-card-number">' + o.order_number + '</div><div class="cnc-order-card-meta">' + d + ' &middot; ' + o.order_type + '</div></div><span class="cnc-order-status-badge ' + o.status + '">' + o.status + '</span><div class="cnc-order-card-total">' + o.currency + ' ' + parseFloat(o.total).toFixed(2) + '</div></div>';
        }).join('');
        if (append) listEl.insertAdjacentHTML('beforeend', html); else listEl.innerHTML = html;
        if (data.orders.length + ordersOffset < data.total) { if (pagEl) pagEl.style.display = 'block'; } else { if (pagEl) pagEl.style.display = 'none'; }
      })
      .catch(function() { if (!append) listEl.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--cnc-text-muted);">Failed to load orders.</p>'; });
  }
  var loadMoreBtn = document.getElementById('orders-load-more');
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', function() { ordersOffset += ordersLimit; loadOrders(true); });

  /* ── Branch Selector Popup ─────────────────────────────────────── */
  function initBranchPopup() {
    var data = getStorefrontData();
    if (!data.show_branch_popup || data.branch_count <= 1) return;
    var branchForms = document.querySelectorAll('.cnc-branch-menu .cnc-branch-row, .cnc-mobile-branches .cnc-mobile-branch-row');
    if (!branchForms.length) return;

    var overlay = document.createElement('div');
    overlay.className = 'cnc-branch-popup-overlay';
    var modal = document.createElement('div');
    modal.className = 'cnc-branch-popup';
    var html = '<div class="cnc-branch-popup-icon">\uD83D\uDCCD</div><h2 class="cnc-branch-popup-title">Select Your Branch</h2><p class="cnc-branch-popup-desc">Choose a branch near you for accurate menu and pricing.</p><div class="cnc-branch-popup-list">';

    branchForms.forEach(function(form) {
      if (form.classList.contains('cnc-mobile-branch-row')) return;
      var branchId = form.querySelector('input[name="branch_id"]');
      var nameEl = form.querySelector('.cnc-branch-row-name');
      var addrEl = form.querySelector('.cnc-branch-row-addr');
      var pillEl = form.querySelector('.cnc-pill');
      if (!branchId || !nameEl) return;
      html += '<form method="post" action="/api/storefront/set-branch" class="cnc-branch-popup-item"><input type="hidden" name="branch_id" value="' + escHTML(branchId.value) + '"><button type="submit"><div class="cnc-branch-popup-item-name">' + escHTML(nameEl.textContent) + '</div>';
      if (addrEl) html += '<div class="cnc-branch-popup-item-addr">' + escHTML(addrEl.textContent) + '</div>';
      if (pillEl) html += '<span class="' + escHTML(pillEl.className) + '">' + escHTML(pillEl.textContent) + '</span>';
      html += '</button></form>';
    });
    html += '</div>';
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('is-open'); });
  }

  /* ── Init ───────────────────────────────────────────────────────── */
  TastiqoCart._updateBadge();
  initProductAddToCart();
  initCartPage();
  initBranchPopup();

})();
