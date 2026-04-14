/* Cheesious Bites — minimal vanilla JS for header interactions + animations.
   No build step, no framework. Total ~3KB. */
(function () {
  'use strict';

  // ── Branch picker dropdown ────────────────────────────────────────────
  var branchTrigger = document.querySelector('[data-cb-branch-trigger]');
  var branchMenu    = document.querySelector('[data-cb-branch-menu]');
  if (branchTrigger && branchMenu) {
    branchTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = branchMenu.hasAttribute('hidden');
      if (open) {
        branchMenu.removeAttribute('hidden');
        branchTrigger.setAttribute('aria-expanded', 'true');
      } else {
        branchMenu.setAttribute('hidden', '');
        branchTrigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', function (e) {
      if (!branchMenu.contains(e.target) && !branchTrigger.contains(e.target)) {
        branchMenu.setAttribute('hidden', '');
        branchTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── Mobile drawer ─────────────────────────────────────────────────────
  var mobileToggle = document.querySelector('[data-cb-mobile-toggle]');
  var mobileDrawer = document.querySelector('[data-cb-mobile-drawer]');
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', function () {
      var open = mobileDrawer.hasAttribute('hidden');
      if (open) {
        mobileDrawer.removeAttribute('hidden');
        mobileToggle.setAttribute('aria-expanded', 'true');
      } else {
        mobileDrawer.setAttribute('hidden', '');
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── Top loading bar on link clicks ────────────────────────────────────
  var loadBar = document.getElementById('cb-load-bar');
  if (loadBar) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      // Skip same-hash, off-site, target=_blank, modifier-click links.
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || a.target === '_blank') return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      try {
        var url = new URL(a.href);
        if (url.hostname !== location.hostname) return;
      } catch (_) { return; }
      loadBar.classList.remove('is-done');
      loadBar.classList.add('is-loading');
      loadBar.style.width = '70%';
    }, true);
    // Reset on actual page load completion
    window.addEventListener('pageshow', function () {
      loadBar.classList.add('is-done');
      setTimeout(function () {
        loadBar.classList.remove('is-loading', 'is-done');
        loadBar.style.width = '0%';
      }, 500);
    });
  }

  // ── Reveal on scroll for elements with .cb-anim-up ────────────────────
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    document.querySelectorAll('[data-cb-reveal]').forEach(function (el) { io.observe(el); });
  }

  // ── Quantity stepper for product page ─────────────────────────────────
  document.querySelectorAll('[data-cb-qty]').forEach(function (qty) {
    var input = qty.querySelector('input');
    qty.querySelectorAll('button[data-cb-qty-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.getAttribute('data-cb-qty-step'), 10) || 0;
        var v = (parseInt(input.value, 10) || 1) + step;
        if (v < 1) v = 1;
        if (v > 99) v = 99;
        input.value = v;
      });
    });
  });

  /* -----------------------------------------------
     Customer Auth System (Cheesious Bites)
  ----------------------------------------------- */
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

  // Auth modal
  var authModal = document.getElementById('auth-modal');
  var authOpenBtns = document.querySelectorAll('[data-open-auth]');
  var authCloseBtns = document.querySelectorAll('[data-close-auth]');

  function openAuthModal() {
    if (CustomerAuth.isLoggedIn()) { window.location.href = '/account'; return; }
    if (authModal) { authModal.classList.add('is-open'); showStep('email'); }
  }
  function closeAuthModal() { if (authModal) authModal.classList.remove('is-open'); }
  function showStep(s) {
    document.querySelectorAll('.cb-auth-step').forEach(function(el) { el.style.display = 'none'; });
    var el = document.getElementById('auth-step-' + s);
    if (el) el.style.display = 'block';
  }

  authOpenBtns.forEach(function(b) { b.addEventListener('click', function(e) { e.preventDefault(); openAuthModal(); }); });
  authCloseBtns.forEach(function(b) { b.addEventListener('click', closeAuthModal); });
  if (authModal) authModal.addEventListener('click', function(e) { if (e.target === authModal) closeAuthModal(); });
  window.openAuthModal = openAuthModal;
  window.closeAuthModal = closeAuthModal;

  // Email form
  var emailForm = document.getElementById('auth-email-form');
  if (emailForm) {
    emailForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('auth-email-btn');
      var errEl = document.getElementById('auth-email-error');
      var email = document.getElementById('auth-email').value.trim();
      var name = document.getElementById('auth-name').value.trim();
      if (!email) return;
      btn.querySelector('.cb-btn-spinner').style.display = 'inline-flex';
      errEl.style.display = 'none';
      fetch(AUTH_API + '/auth/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, full_name: name }) })
        .then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || 'Failed'); document.getElementById('auth-otp-email-display').textContent = email; showStep('otp'); }); })
        .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
        .finally(function() { btn.querySelector('.cb-btn-spinner').style.display = 'none'; });
    });
  }

  // OTP form
  var otpForm = document.getElementById('auth-otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('auth-otp-btn');
      var errEl = document.getElementById('auth-otp-error');
      var email = document.getElementById('auth-email').value.trim();
      var otp = document.getElementById('auth-otp').value.trim();
      if (!otp) return;
      btn.querySelector('.cb-btn-spinner').style.display = 'inline-flex';
      errEl.style.display = 'none';
      fetch(AUTH_API + '/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, otp: otp }) })
        .then(function(r) { return r.json().then(function(d) {
          if (!r.ok) throw new Error(d.error || 'Invalid code');
          CustomerAuth.setTokens({ access_token: d.access_token, refresh_token: d.refresh_token, customer: d.customer });
          var wn = d.customer.full_name || d.customer.email;
          document.getElementById('auth-welcome-name').textContent = 'Welcome, ' + wn + '!';
          showStep('success');
          updateAuthUI();
          setTimeout(function() { closeAuthModal(); if (window.location.pathname === '/account/login') window.location.href = '/account'; }, 1200);
        }); })
        .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
        .finally(function() { btn.querySelector('.cb-btn-spinner').style.display = 'none'; });
    });
  }

  // Resend & back
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

  /* -----------------------------------------------
     Account Page Logic
  ----------------------------------------------- */
  var accountPage = document.getElementById('account-page');
  var accountNotLoggedIn = document.getElementById('account-not-logged-in');
  if (accountPage || accountNotLoggedIn) {
    if (CustomerAuth.isLoggedIn()) {
      if (accountPage) accountPage.style.display = 'block';
      loadProfile(); loadAddresses();
    } else {
      if (accountNotLoggedIn) accountNotLoggedIn.style.display = 'block';
    }
  }

  function loadProfile() {
    CustomerAuth.apiRequest('GET', '/me').then(function(r) { if (!r.ok) return; return r.json(); }).then(function(c) {
      if (!c) return;
      document.getElementById('account-name').textContent = c.full_name || '—';
      document.getElementById('account-email').textContent = c.email || '—';
      document.getElementById('account-phone').textContent = c.phone || '—';
      var pn = document.getElementById('profile-name'); if (pn) pn.value = c.full_name || '';
      var pp = document.getElementById('profile-phone'); if (pp) pp.value = c.phone || '';
    });
  }

  function loadAddresses() {
    var container = document.getElementById('account-addresses-list');
    if (!container) return;
    CustomerAuth.apiRequest('GET', '/addresses').then(function(r) { if (!r.ok) throw new Error(); return r.json(); }).then(function(addrs) {
      if (!addrs || !addrs.length) { container.innerHTML = '<p style="color:var(--cb-text-muted);">No saved addresses yet.</p>'; return; }
      container.innerHTML = addrs.map(function(a) {
        var defaultBadge = a.is_default ? '<span style="background:var(--cb-accent);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-left:6px;">Default</span>' : '';
        return '<div class="cb-address-card" style="display:flex;justify-content:space-between;align-items:flex-start;padding:1rem;border:1px solid var(--cb-border);border-radius:0.75rem;margin-bottom:0.75rem;">' +
          '<div class="cb-address-card-info">' +
            '<div style="font-weight:600;margin-bottom:4px;">' + escHTML(a.label || 'Address') + defaultBadge + '</div>' +
            '<div style="font-size:0.9rem;">' + escHTML(a.address_line1) + (a.address_line2 ? ', ' + escHTML(a.address_line2) : '') + '</div>' +
            '<div style="color:var(--cb-text-muted);font-size:0.85rem;">' + [a.city, a.state, a.postal_code].filter(Boolean).map(escHTML).join(', ') + '</div>' +
            (a.delivery_notes ? '<div style="color:var(--cb-text-muted);font-size:0.8rem;font-style:italic;margin-top:4px;">Note: ' + escHTML(a.delivery_notes) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">' +
            '<button class="cb-btn-link" style="font-size:0.8rem;" onclick="window._editAddress(' + a.id + ')">Edit</button>' +
            '<button class="cb-btn-link" style="font-size:0.8rem;color:var(--cb-error,#dc2626);" onclick="window._deleteAddress(' + a.id + ')">Delete</button>' +
          '</div>' +
        '</div>';
      }).join('');
      window._addressCache = addrs;
    }).catch(function() { container.innerHTML = '<p style="color:var(--cb-text-muted);">Failed to load addresses.</p>'; });
  }

  function escHTML(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  // Address modal
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

  window._editAddress = function(id) {
    var addr = (window._addressCache || []).find(function(a) { return a.id === id; });
    if (addr) openAddressModal(addr);
  };

  window._deleteAddress = function(id) {
    if (!confirm('Delete this address?')) return;
    CustomerAuth.apiRequest('DELETE', '/addresses/' + id).then(function(r) {
      if (!r.ok) throw new Error();
      loadAddresses();
    }).catch(function() { alert('Failed to delete address'); });
  };

  if (addressForm) addressForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var addrId = document.getElementById('addr-id').value;
    var errorEl = document.getElementById('address-error');
    var body = {
      label: document.getElementById('addr-label').value.trim(),
      address_line1: document.getElementById('addr-line1').value.trim(),
      address_line2: document.getElementById('addr-line2').value.trim() || null,
      city: document.getElementById('addr-city').value.trim() || null,
      postal_code: document.getElementById('addr-postal').value.trim() || null,
      delivery_notes: document.getElementById('addr-notes').value.trim() || null,
      is_default: document.getElementById('addr-default').checked
    };
    if (!body.address_line1) { errorEl.textContent = 'Address line 1 is required'; errorEl.style.display = 'block'; return; }
    var method = addrId ? 'PUT' : 'POST';
    var url = addrId ? '/addresses/' + addrId : '/addresses';
    var btn = document.getElementById('address-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    CustomerAuth.apiRequest(method, url, body).then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Failed'); });
      closeAddressModal(); loadAddresses();
    }).catch(function(err) {
      errorEl.textContent = err.message || 'Failed to save address';
      errorEl.style.display = 'block';
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = addrId ? 'Update Address' : 'Save Address';
    });
  });

  // Profile edit
  var editToggle = document.getElementById('account-edit-toggle');
  var editCancel = document.getElementById('account-edit-cancel');
  var profileDisplay = document.getElementById('account-profile-display');
  var profileForm = document.getElementById('account-profile-form');
  if (editToggle) editToggle.addEventListener('click', function() { if (profileDisplay) profileDisplay.style.display = 'none'; if (profileForm) profileForm.style.display = 'flex'; });
  if (editCancel) editCancel.addEventListener('click', function() { if (profileDisplay) profileDisplay.style.display = 'block'; if (profileForm) profileForm.style.display = 'none'; });
  if (profileForm) profileForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var name = document.getElementById('profile-name').value;
    var phone = document.getElementById('profile-phone').value || null;
    CustomerAuth.apiRequest('PUT', '/me', { full_name: name, phone: phone }).then(function() {
      if (profileDisplay) profileDisplay.style.display = 'block';
      if (profileForm) profileForm.style.display = 'none';
      loadProfile();
    });
  });

  // Logout
  var logoutBtn = document.getElementById('account-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', function() {
    CustomerAuth.apiRequest('POST', '/auth/logout').then(function() { CustomerAuth.clearTokens(); window.location.href = '/'; });
  });

  /* -----------------------------------------------
     Order History
  ----------------------------------------------- */
  var ordersPage = document.getElementById('orders-page');
  var ordersNotLoggedIn = document.getElementById('orders-not-logged-in');
  if (ordersPage || ordersNotLoggedIn) {
    if (CustomerAuth.isLoggedIn()) { if (ordersPage) ordersPage.style.display = 'block'; loadOrders(false); }
    else { if (ordersNotLoggedIn) ordersNotLoggedIn.style.display = 'block'; }
  }

  var ordersOffset = 0, ordersLimit = 20;
  function loadOrders(append) {
    var listEl = document.getElementById('orders-list');
    var emptyEl = document.getElementById('orders-empty');
    var pagEl = document.getElementById('orders-pagination');
    if (!listEl) return;
    fetch('/api/storefront/orders?limit=' + ordersLimit + '&offset=' + ordersOffset, { headers: { 'Authorization': 'Bearer ' + CustomerAuth.getAccessToken() } })
      .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function(data) {
        if (!data.orders.length && ordersOffset === 0) { listEl.style.display = 'none'; if (emptyEl) emptyEl.style.display = 'block'; return; }
        var html = data.orders.map(function(o) {
          var d = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          return '<div class="cb-order-card"><div class="cb-order-card-info"><div class="cb-order-card-number">' + o.order_number + '</div><div class="cb-order-card-meta">' + d + ' &middot; ' + o.order_type + '</div></div><span class="cb-order-status-badge ' + o.status + '">' + o.status + '</span><div class="cb-order-card-total">' + o.currency + ' ' + parseFloat(o.total).toFixed(2) + '</div></div>';
        }).join('');
        if (append) listEl.insertAdjacentHTML('beforeend', html); else listEl.innerHTML = html;
        if (data.orders.length + ordersOffset < data.total) { if (pagEl) pagEl.style.display = 'block'; } else { if (pagEl) pagEl.style.display = 'none'; }
      })
      .catch(function() { if (!append) listEl.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--cb-text-muted);">Failed to load orders.</p>'; });
  }

  var loadMoreBtn = document.getElementById('orders-load-more');
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', function() { ordersOffset += ordersLimit; loadOrders(true); });

})();
