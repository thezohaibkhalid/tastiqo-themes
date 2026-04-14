/**
 * Flavor House — Theme JavaScript
 */

(function () {
  'use strict';

  /* -----------------------------------------------
     Mobile Menu
  ----------------------------------------------- */
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const menuClose = document.getElementById('mobile-menu-close');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => mobileMenu.classList.add('is-open'));
  }
  if (menuClose && mobileMenu) {
    menuClose.addEventListener('click', () => mobileMenu.classList.remove('is-open'));
  }

  /* -----------------------------------------------
     Branch Selector Modal
  ----------------------------------------------- */
  const branchModal = document.getElementById('branch-modal');
  const branchOpenBtns = document.querySelectorAll('[data-open-branch-selector]');
  const branchCloseBtns = document.querySelectorAll('[data-close-branch-selector]');

  function openBranchSelector() {
    if (branchModal) branchModal.classList.add('is-open');
  }

  function closeBranchSelector() {
    if (branchModal) branchModal.classList.remove('is-open');
  }

  branchOpenBtns.forEach(btn => btn.addEventListener('click', openBranchSelector));
  branchCloseBtns.forEach(btn => btn.addEventListener('click', closeBranchSelector));

  // Close on backdrop click
  if (branchModal) {
    branchModal.addEventListener('click', (e) => {
      if (e.target === branchModal) closeBranchSelector();
    });
  }

  // Auto-open branch selector if needed
  if (branchModal && branchModal.dataset.autoOpen === 'true') {
    if (!localStorage.getItem('branch_selected')) {
      openBranchSelector();
    }
  }

  // Handle branch selection to save to local storage
  const branchForms = document.querySelectorAll('form[action="/api/storefront/set-branch"]');
  branchForms.forEach(form => {
    form.addEventListener('submit', () => {
      localStorage.setItem('branch_selected', 'true');
    });
  });

  // Expose globally for inline onclick usage
  window.openBranchSelector = openBranchSelector;
  window.closeBranchSelector = closeBranchSelector;

  /* -----------------------------------------------
     Inline Branch Dropdown (Header)
  ----------------------------------------------- */
  const branchDropdownToggle = document.getElementById('branch-dropdown-toggle');
  const branchDropdownMenu = document.getElementById('branch-dropdown-menu');

  if (branchDropdownToggle && branchDropdownMenu) {
    branchDropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = branchDropdownMenu.classList.contains('is-open');
      if (isOpen) {
        branchDropdownMenu.classList.remove('is-open');
        branchDropdownToggle.setAttribute('aria-expanded', 'false');
      } else {
        branchDropdownMenu.classList.add('is-open');
        branchDropdownToggle.setAttribute('aria-expanded', 'true');
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!branchDropdownToggle.contains(e.target) && !branchDropdownMenu.contains(e.target)) {
        branchDropdownMenu.classList.remove('is-open');
        branchDropdownToggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Close dropdown on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && branchDropdownMenu.classList.contains('is-open')) {
        branchDropdownMenu.classList.remove('is-open');
        branchDropdownToggle.setAttribute('aria-expanded', 'false');
        branchDropdownToggle.focus();
      }
    });
  }

  /* -----------------------------------------------
     Product Page — Variant Selection
  ----------------------------------------------- */
  document.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.variant-options');
      if (!group) return;
      group.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      // Update displayed price
      const price = btn.dataset.price;
      const priceEl = document.getElementById('product-active-price');
      if (priceEl && price) priceEl.textContent = price;
    });
  });

  /* -----------------------------------------------
     Quantity Controls
  ----------------------------------------------- */
  document.querySelectorAll('.quantity-control').forEach(control => {
    const minus = control.querySelector('[data-qty-minus]');
    const plus = control.querySelector('[data-qty-plus]');
    const display = control.querySelector('[data-qty-value]');
    if (!minus || !plus || !display) return;

    let qty = parseInt(display.textContent) || 1;

    minus.addEventListener('click', () => {
      if (qty > 1) {
        qty--;
        display.textContent = qty;
      }
    });

    plus.addEventListener('click', () => {
      qty++;
      display.textContent = qty;
    });
  });

  /* -----------------------------------------------
     Menu Filter Tabs
  ----------------------------------------------- */
  document.querySelectorAll('.menu-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterBar = btn.closest('.menu-filter-list');
      if (filterBar) {
        filterBar.querySelectorAll('.menu-filter-btn').forEach(b => b.classList.remove('active'));
      }
      btn.classList.add('active');

      const target = btn.dataset.category;
      const grid = document.getElementById('menu-grid');
      if (!grid || !target) return;

      grid.querySelectorAll('.menu-category-group').forEach(group => {
        if (target === 'all') {
          group.style.display = '';
        } else {
          group.style.display = group.dataset.category === target ? '' : 'none';
        }
      });
    });
  });

  /* -----------------------------------------------
     Smooth scroll for anchor links
  ----------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* -----------------------------------------------
     Customer Auth System
  ----------------------------------------------- */
  const AUTH_API = '/api/storefront/customer';
  const AUTH_TOKENS_KEY = 'tastiqo_customer_tokens';

  // Token storage
  const CustomerAuth = {
    getTokens() {
      try { return JSON.parse(localStorage.getItem(AUTH_TOKENS_KEY)); } catch { return null; }
    },
    setTokens(data) {
      localStorage.setItem(AUTH_TOKENS_KEY, JSON.stringify(data));
    },
    clearTokens() {
      localStorage.removeItem(AUTH_TOKENS_KEY);
    },
    getAccessToken() {
      const t = this.getTokens();
      return t ? t.access_token : null;
    },
    isLoggedIn() {
      return !!this.getAccessToken();
    },
    async apiRequest(method, path, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      const token = this.getAccessToken();
      if (token) opts.headers['Authorization'] = 'Bearer ' + token;
      if (body) opts.body = JSON.stringify(body);

      let res = await fetch(AUTH_API + path, opts);

      // Auto-refresh on 401
      if (res.status === 401 && token) {
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          opts.headers['Authorization'] = 'Bearer ' + this.getAccessToken();
          res = await fetch(AUTH_API + path, opts);
        }
      }
      return res;
    },
    async tryRefresh() {
      const t = this.getTokens();
      if (!t || !t.refresh_token) return false;
      try {
        const res = await fetch(AUTH_API + '/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: t.refresh_token })
        });
        if (!res.ok) { this.clearTokens(); return false; }
        const data = await res.json();
        this.setTokens({ access_token: data.access_token, refresh_token: data.refresh_token, customer: data.customer });
        return true;
      } catch { this.clearTokens(); return false; }
    }
  };

  // Auth modal
  const authModal = document.getElementById('auth-modal');
  const authOpenBtns = document.querySelectorAll('[data-open-auth]');
  const authCloseBtns = document.querySelectorAll('[data-close-auth]');

  function openAuthModal() {
    if (CustomerAuth.isLoggedIn()) {
      window.location.href = '/account';
      return;
    }
    if (authModal) {
      authModal.classList.add('is-open');
      showStep('email');
    }
  }

  function closeAuthModal() {
    if (authModal) authModal.classList.remove('is-open');
  }

  function showStep(step) {
    document.querySelectorAll('.auth-step').forEach(el => el.style.display = 'none');
    const el = document.getElementById('auth-step-' + step);
    if (el) el.style.display = 'block';
  }

  authOpenBtns.forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(); }));
  authCloseBtns.forEach(btn => btn.addEventListener('click', closeAuthModal));
  if (authModal) authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });

  window.openAuthModal = openAuthModal;
  window.closeAuthModal = closeAuthModal;

  // Email form
  const emailForm = document.getElementById('auth-email-form');
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('auth-email-btn');
      const errEl = document.getElementById('auth-email-error');
      const email = document.getElementById('auth-email').value.trim();
      const name = document.getElementById('auth-name').value.trim();

      if (!email) return;
      btn.querySelector('.btn-spinner').style.display = 'inline-flex';
      btn.querySelector('span:first-child').textContent = 'Sending...';
      errEl.style.display = 'none';

      try {
        const res = await fetch(AUTH_API + '/auth/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, full_name: name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send code');
        document.getElementById('auth-otp-email-display').textContent = email;
        showStep('otp');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.querySelector('.btn-spinner').style.display = 'none';
        btn.querySelector('span:first-child').textContent = 'Continue';
      }
    });
  }

  // OTP form
  const otpForm = document.getElementById('auth-otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('auth-otp-btn');
      const errEl = document.getElementById('auth-otp-error');
      const email = document.getElementById('auth-email').value.trim();
      const otp = document.getElementById('auth-otp').value.trim();

      if (!otp) return;
      btn.querySelector('.btn-spinner').style.display = 'inline-flex';
      btn.querySelector('span:first-child').textContent = 'Verifying...';
      errEl.style.display = 'none';

      try {
        const res = await fetch(AUTH_API + '/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid code');

        CustomerAuth.setTokens({ access_token: data.access_token, refresh_token: data.refresh_token, customer: data.customer });
        const welcomeName = data.customer.full_name || data.customer.email;
        document.getElementById('auth-welcome-name').textContent = 'Welcome, ' + welcomeName + '!';
        showStep('success');
        updateAuthUI();
        setTimeout(() => {
          closeAuthModal();
          if (window.location.pathname === '/account/login') window.location.href = '/account';
        }, 1200);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.querySelector('.btn-spinner').style.display = 'none';
        btn.querySelector('span:first-child').textContent = 'Verify & Sign In';
      }
    });
  }

  // Resend OTP
  const resendBtn = document.getElementById('auth-resend-btn');
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      const email = document.getElementById('auth-email').value.trim();
      resendBtn.textContent = 'Sending...';
      try {
        await fetch(AUTH_API + '/auth/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        resendBtn.textContent = 'Code resent!';
        setTimeout(() => { resendBtn.textContent = 'Resend code'; }, 3000);
      } catch {
        resendBtn.textContent = 'Resend code';
      }
    });
  }

  // Back to email
  const backBtn = document.getElementById('auth-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => showStep('email'));

  // Update UI based on login state
  function updateAuthUI() {
    const isLoggedIn = CustomerAuth.isLoggedIn();
    const accountBtn = document.getElementById('header-account-btn');
    if (accountBtn) {
      if (isLoggedIn) {
        accountBtn.classList.add('is-logged-in');
        accountBtn.removeAttribute('data-open-auth');
        accountBtn.onclick = () => { window.location.href = '/account'; };
      } else {
        accountBtn.classList.remove('is-logged-in');
      }
    }
  }

  // Run on page load
  updateAuthUI();

  /* -----------------------------------------------
     Account Page Logic
  ----------------------------------------------- */
  const accountPage = document.getElementById('account-page');
  const accountNotLoggedIn = document.getElementById('account-not-logged-in');

  if (accountPage || accountNotLoggedIn) {
    if (CustomerAuth.isLoggedIn()) {
      if (accountPage) accountPage.style.display = 'block';
      loadProfile();
      loadAddresses();
    } else {
      if (accountNotLoggedIn) accountNotLoggedIn.style.display = 'block';
    }
  }

  async function loadProfile() {
    try {
      const res = await CustomerAuth.apiRequest('GET', '/me');
      if (!res.ok) throw new Error();
      const c = await res.json();
      document.getElementById('account-name').textContent = c.full_name || '—';
      document.getElementById('account-email').textContent = c.email || '—';
      document.getElementById('account-phone').textContent = c.phone || '—';
      if (document.getElementById('profile-name')) document.getElementById('profile-name').value = c.full_name || '';
      if (document.getElementById('profile-phone')) document.getElementById('profile-phone').value = c.phone || '';
    } catch {
      // Token might be invalid
    }
  }

  let _addressCache = [];

  async function loadAddresses() {
    const container = document.getElementById('account-addresses-list');
    if (!container) return;
    try {
      const res = await CustomerAuth.apiRequest('GET', '/addresses');
      if (!res.ok) throw new Error();
      const addresses = await res.json();
      _addressCache = addresses || [];
      if (!addresses || !addresses.length) {
        container.innerHTML = '<p class="text-muted">No saved addresses yet.</p>';
        return;
      }
      container.innerHTML = addresses.map(a => {
        const defaultBadge = a.is_default ? '<span style="background:var(--color-primary);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-left:6px;">Default</span>' : '';
        return `<div class="address-card" style="display:flex;justify-content:space-between;align-items:flex-start;padding:1rem;border:1px solid var(--color-border);border-radius:0.5rem;margin-bottom:0.75rem;">
          <div class="address-card-info">
            <div style="font-weight:600;margin-bottom:4px;">${escH(a.label || 'Address')}${defaultBadge}</div>
            <div style="font-size:0.9rem;">${escH(a.address_line1)}${a.address_line2 ? ', ' + escH(a.address_line2) : ''}</div>
            <div class="text-muted" style="font-size:0.85rem;">${[a.city, a.state, a.postal_code].filter(Boolean).map(escH).join(', ')}</div>
            ${a.delivery_notes ? '<div class="text-muted" style="font-size:0.8rem;font-style:italic;margin-top:4px;">Note: ' + escH(a.delivery_notes) + '</div>' : ''}
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;margin-left:12px;">
            <button class="btn-link" style="font-size:0.8rem;" onclick="window._editAddress(${a.id})">Edit</button>
            <button class="btn-link" style="font-size:0.8rem;color:var(--color-error, #dc2626);" onclick="window._deleteAddress(${a.id})">Delete</button>
          </div>
        </div>`;
      }).join('');
    } catch {
      container.innerHTML = '<p class="text-muted">Failed to load addresses.</p>';
    }
  }

  function escH(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  // Address modal
  const addressModal = document.getElementById('address-modal');
  const addressForm = document.getElementById('address-form');
  const addAddressBtn = document.getElementById('account-add-address-btn');
  const addressCloseBtn = document.getElementById('address-modal-close');
  const addressCancelBtn = document.getElementById('address-cancel-btn');

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
    const errorEl = document.getElementById('address-error');
    if (errorEl) errorEl.style.display = 'none';
    addressModal.style.display = 'flex';
  }

  function closeAddressModal() { if (addressModal) addressModal.style.display = 'none'; }

  if (addAddressBtn) addAddressBtn.addEventListener('click', () => openAddressModal(null));
  if (addressCloseBtn) addressCloseBtn.addEventListener('click', closeAddressModal);
  if (addressCancelBtn) addressCancelBtn.addEventListener('click', closeAddressModal);
  if (addressModal) addressModal.addEventListener('click', e => { if (e.target === addressModal) closeAddressModal(); });

  window._editAddress = function(id) {
    const addr = _addressCache.find(a => a.id === id);
    if (addr) openAddressModal(addr);
  };

  window._deleteAddress = function(id) {
    if (!confirm('Delete this address?')) return;
    CustomerAuth.apiRequest('DELETE', '/addresses/' + id).then(r => { if (r.ok) loadAddresses(); });
  };

  if (addressForm) addressForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const addrId = document.getElementById('addr-id').value;
    const errorEl = document.getElementById('address-error');
    const body = {
      label: document.getElementById('addr-label').value.trim(),
      address_line1: document.getElementById('addr-line1').value.trim(),
      address_line2: document.getElementById('addr-line2').value.trim() || null,
      city: document.getElementById('addr-city').value.trim() || null,
      postal_code: document.getElementById('addr-postal').value.trim() || null,
      delivery_notes: document.getElementById('addr-notes').value.trim() || null,
      is_default: document.getElementById('addr-default').checked
    };
    if (!body.address_line1) { if (errorEl) { errorEl.textContent = 'Address line 1 is required'; errorEl.style.display = 'block'; } return; }
    const method = addrId ? 'PUT' : 'POST';
    const url = addrId ? '/addresses/' + addrId : '/addresses';
    const btn = document.getElementById('address-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const r = await CustomerAuth.apiRequest(method, url, body);
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed'); }
      closeAddressModal(); loadAddresses();
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message || 'Failed to save'; errorEl.style.display = 'block'; }
    } finally {
      btn.disabled = false;
      btn.textContent = addrId ? 'Update Address' : 'Save Address';
    }
  });

  // Profile edit toggle
  const editToggle = document.getElementById('account-edit-toggle');
  const editCancel = document.getElementById('account-edit-cancel');
  const profileDisplay = document.getElementById('account-profile-display');
  const profileForm = document.getElementById('account-profile-form');

  if (editToggle) editToggle.addEventListener('click', () => {
    if (profileDisplay) profileDisplay.style.display = 'none';
    if (profileForm) profileForm.style.display = 'flex';
  });
  if (editCancel) editCancel.addEventListener('click', () => {
    if (profileDisplay) profileDisplay.style.display = 'block';
    if (profileForm) profileForm.style.display = 'none';
  });

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profile-name').value;
      const phone = document.getElementById('profile-phone').value || null;
      await CustomerAuth.apiRequest('PUT', '/me', { full_name: name, phone });
      if (profileDisplay) profileDisplay.style.display = 'block';
      if (profileForm) profileForm.style.display = 'none';
      loadProfile();
    });
  }

  // Logout
  const logoutBtn = document.getElementById('account-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await CustomerAuth.apiRequest('POST', '/auth/logout');
      CustomerAuth.clearTokens();
      window.location.href = '/';
    });
  }

  /* -----------------------------------------------
     Order History Page Logic
  ----------------------------------------------- */
  const ordersPage = document.getElementById('orders-page');
  const ordersNotLoggedIn = document.getElementById('orders-not-logged-in');

  if (ordersPage || ordersNotLoggedIn) {
    if (CustomerAuth.isLoggedIn()) {
      if (ordersPage) ordersPage.style.display = 'block';
      loadOrders();
    } else {
      if (ordersNotLoggedIn) ordersNotLoggedIn.style.display = 'block';
    }
  }

  let ordersOffset = 0;
  const ordersLimit = 20;

  async function loadOrders(append) {
    const listEl = document.getElementById('orders-list');
    const emptyEl = document.getElementById('orders-empty');
    const paginationEl = document.getElementById('orders-pagination');
    if (!listEl) return;

    try {
      const res = await fetch('/api/storefront/orders?limit=' + ordersLimit + '&offset=' + ordersOffset, {
        headers: { 'Authorization': 'Bearer ' + CustomerAuth.getAccessToken() }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (!data.orders.length && ordersOffset === 0) {
        listEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      const html = data.orders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
          <div class="order-card">
            <div class="order-card-info">
              <div class="order-card-number">${o.order_number}</div>
              <div class="order-card-meta">${date} &middot; ${o.order_type}</div>
            </div>
            <span class="order-status-badge ${o.status}">${o.status}</span>
            <div class="order-card-total">${o.currency} ${parseFloat(o.total).toFixed(2)}</div>
          </div>
        `;
      }).join('');

      if (append) {
        listEl.insertAdjacentHTML('beforeend', html);
      } else {
        listEl.innerHTML = html;
      }

      if (data.orders.length + ordersOffset < data.total) {
        if (paginationEl) paginationEl.style.display = 'block';
      } else {
        if (paginationEl) paginationEl.style.display = 'none';
      }
    } catch {
      if (!append) listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">Failed to load orders.</p>';
    }
  }

  const loadMoreBtn = document.getElementById('orders-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      ordersOffset += ordersLimit;
      loadOrders(true);
    });
  }

})();
