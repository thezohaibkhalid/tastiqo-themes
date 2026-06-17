/**
 * Flavor House — Theme JavaScript
 */

(function () {
  'use strict';

  /* -----------------------------------------------
     TastiqoCart — client-side cart (localStorage)
  ----------------------------------------------- */
  const CART_KEY = 'tastiqo_cart';

  const TastiqoCart = {
    _read() {
      try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
      catch { return []; }
    },
    _write(items) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
      this._notify();
    },
    _notify() {
      window.dispatchEvent(new CustomEvent('cart:updated'));
      this._updateBadge();
    },
    _updateBadge() {
      const count = this.getCount();
      const badges = document.querySelectorAll('#header-cart-count, #mobile-cart-count, [data-fh-cart-count]');
      badges.forEach(b => {
        b.textContent = count;
        b.style.display = count > 0 ? '' : 'none';
      });
    },
    _generateId(product_id, modifiers) {
      const modIds = (modifiers || []).map(m => m.id).sort();
      return product_id + ':' + modIds.join(',');
    },
    getItems() { return this._read(); },
    addItem(item) {
      const items = this._read();
      const existing = items.find(it => it.id === item.id);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        items.push(item);
      }
      this._write(items);
    },
    updateQuantity(id, qty) {
      let items = this._read();
      if (qty <= 0) {
        items = items.filter(it => it.id !== id);
      } else {
        const it = items.find(i => i.id === id);
        if (it) it.quantity = qty;
      }
      this._write(items);
    },
    removeItem(id) {
      this._write(this._read().filter(it => it.id !== id));
    },
    clear() {
      localStorage.removeItem(CART_KEY);
      this._notify();
    },
    getCount() {
      return this._read().reduce((s, it) => s + it.quantity, 0);
    },
    getSubtotal() {
      return this._read().reduce((s, it) => s + (it.unit_price * it.quantity), 0);
    }
  };

  window.TastiqoCart = TastiqoCart;

  const DEFAULT_MAP_CENTER = { lat: 24.8607, lng: 67.0011 };
  const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2';

  const TastiqoMap = {
    _ready: false,
    _readyCallbacks: [],
    _addrMap: null,
    _addrMarker: null,
    _ckMap: null,
    _ckMarker: null,
    onReady(cb) { if (this._ready) { cb(); return; } this._readyCallbacks.push(cb); },
    _fireReady() {
      this._ready = true;
      this._readyCallbacks.forEach(cb => { try { cb(); } catch {} });
      this._readyCallbacks = [];
    },
    _waitForLeaflet() {
      if (window.L) { this._fireReady(); return; }
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.L) { clearInterval(iv); this._fireReady(); }
        else if (tries > 100) clearInterval(iv);
      }, 100);
    },
    attachAddressPicker(initial) {
      const container = document.getElementById('addr-map');
      if (!container || !window.L) return;
      if (this._addrMap) {
        try { this._addrMap.remove(); } catch {}
        this._addrMap = null;
        this._addrMarker = null;
      }
      const hasInitial = typeof initial.lat === 'number' && typeof initial.lng === 'number';
      const center = hasInitial ? [initial.lat, initial.lng] : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];
      this._addrMap = L.map(container, { zoomControl: true, scrollWheelZoom: true }).setView(center, hasInitial ? 16 : 12);
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(this._addrMap);
      this._addrMarker = L.marker(center, { draggable: true }).addTo(this._addrMap);
      this._addrMap.on('click', (e) => { this._addrMarker.setLatLng(e.latlng); this._onAddrPinChanged(); });
      this._addrMarker.on('dragend', () => this._onAddrPinChanged());
      requestAnimationFrame(() => { if (this._addrMap) this._addrMap.invalidateSize(); });
      if (hasInitial) {
        this._writeAddrInputs(initial.lat, initial.lng);
        this._showCoords(initial.lat, initial.lng);
      } else {
        this._writeAddrInputs('', '');
        this._showCoords(null, null);
      }
    },
    locateMe() {
      const hint = document.getElementById('addr-map-hint');
      if (!navigator.geolocation) {
        if (hint) hint.textContent = 'Your browser does not support location sharing.';
        return;
      }
      if (hint) hint.textContent = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude, lng = pos.coords.longitude;
          if (this._addrMap && this._addrMarker) {
            this._addrMap.setView([lat, lng], 17);
            this._addrMarker.setLatLng([lat, lng]);
            this._onAddrPinChanged();
          }
          if (hint) hint.textContent = 'Drag the pin to fine-tune.';
        },
        (err) => {
          if (hint) hint.textContent = err.code === 1
            ? 'Permission denied — pin the location manually instead.'
            : 'Could not get your location — pin it manually.';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
    _onAddrPinChanged() {
      if (!this._addrMarker) return;
      const { lat, lng } = this._addrMarker.getLatLng();
      this._writeAddrInputs(lat, lng);
      this._showCoords(lat, lng);
      const line1El = document.getElementById('addr-line1');
      if (line1El && !line1El.value.trim()) {
        fetch(`${NOMINATIM_URL}&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`, {
          headers: { 'Accept-Language': navigator.language || 'en' },
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data && data.display_name && line1El && !line1El.value.trim()) {
              line1El.value = data.display_name;
            }
          })
          .catch(() => {});
      }
    },
    _writeAddrInputs(lat, lng) {
      const latEl = document.getElementById('addr-lat');
      const lngEl = document.getElementById('addr-lng');
      if (latEl) latEl.value = lat === '' ? '' : String(lat);
      if (lngEl) lngEl.value = lng === '' ? '' : String(lng);
    },
    _showCoords(lat, lng) {
      const el = document.getElementById('addr-map-coords');
      if (!el) return;
      if (typeof lat !== 'number' || typeof lng !== 'number') { el.textContent = ''; return; }
      el.textContent = '📍 ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
    },
    showCheckoutPin(containerId, lat, lng) {
      const container = document.getElementById(containerId);
      if (!container || !window.L) return;
      if (this._ckMap) {
        try { this._ckMap.remove(); } catch {}
        this._ckMap = null;
        this._ckMarker = null;
      }
      this._ckMap = L.map(container, {
        zoomControl: false, scrollWheelZoom: false, dragging: false,
        doubleClickZoom: false, touchZoom: false, keyboard: false,
      }).setView([lat, lng], 16);
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(this._ckMap);
      this._ckMarker = L.marker([lat, lng]).addTo(this._ckMap);
      requestAnimationFrame(() => { if (this._ckMap) this._ckMap.invalidateSize(); });
    },
  };
  TastiqoMap._waitForLeaflet();
  window.TastiqoMap = TastiqoMap;

  /* -----------------------------------------------
     Storefront data + helpers
  ----------------------------------------------- */
  let _storefrontData = null;
  function getStorefrontData() {
    if (_storefrontData) return _storefrontData;
    try {
      const el = document.getElementById('storefront-data');
      if (el) _storefrontData = JSON.parse(el.textContent);
    } catch {}
    return _storefrontData || {};
  }

  function getBranchId() {
    return getStorefrontData().branch_id || null;
  }

  function getCurrencySymbol() {
    return getStorefrontData().currency_symbol || 'Rs.';
  }

  function formatMoney(paisa) {
    let amount = (paisa / 100).toFixed(2);
    if (amount.endsWith('.00')) amount = amount.slice(0, -3);
    return getCurrencySymbol() + ' ' + amount;
  }

  function escH(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

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

  let _currentProfile = null;
  async function loadProfile() {
    try {
      const res = await CustomerAuth.apiRequest('GET', '/me');
      if (!res.ok) throw new Error();
      const c = await res.json();
      _currentProfile = c;
      document.getElementById('account-name').textContent = c.full_name || '—';
      document.getElementById('account-email').textContent = c.email || '—';
      document.getElementById('account-phone').textContent = c.phone || '—';
      renderPhoneStatus(c);
      if (document.getElementById('profile-name')) document.getElementById('profile-name').value = c.full_name || '';
      if (document.getElementById('profile-phone')) document.getElementById('profile-phone').value = c.phone || '';
    } catch {
      // Token might be invalid
    }
  }

  function renderPhoneStatus(c) {
    const statusEl = document.getElementById('account-phone-status');
    if (!statusEl) return;
    if (!c || !c.phone) { statusEl.innerHTML = ''; return; }
    if (c.phone_verified) {
      statusEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--color-success,#16a34a);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">✓ Verified</span>';
    } else {
      statusEl.innerHTML = '<span style="background:var(--color-warning,#F59E0B);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">Unverified</span> <button type="button" class="btn-link" id="account-verify-phone-btn" style="font-size:0.8rem;">Verify now</button>';
      const b = document.getElementById('account-verify-phone-btn');
      if (b) b.addEventListener('click', () => openPhoneVerifyModal(c.phone));
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

    const initial = {
      lat: addr && typeof addr.lat === 'number' ? addr.lat : null,
      lng: addr && typeof addr.lng === 'number' ? addr.lng : null,
    };
    TastiqoMap.onReady(() => {
      requestAnimationFrame(() => TastiqoMap.attachAddressPicker(initial));
    });
  }

  function closeAddressModal() { if (addressModal) addressModal.style.display = 'none'; }

  if (addAddressBtn) addAddressBtn.addEventListener('click', () => openAddressModal(null));
  if (addressCloseBtn) addressCloseBtn.addEventListener('click', closeAddressModal);
  if (addressCancelBtn) addressCancelBtn.addEventListener('click', closeAddressModal);
  if (addressModal) addressModal.addEventListener('click', e => { if (e.target === addressModal) closeAddressModal(); });

  const addrLocateBtn = document.getElementById('addr-locate-btn');
  if (addrLocateBtn) addrLocateBtn.addEventListener('click', () => TastiqoMap.locateMe());

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
    const latRaw = document.getElementById('addr-lat').value;
    const lngRaw = document.getElementById('addr-lng').value;
    const lat = latRaw === '' ? null : parseFloat(latRaw);
    const lng = lngRaw === '' ? null : parseFloat(lngRaw);
    const body = {
      label: document.getElementById('addr-label').value.trim(),
      address_line1: document.getElementById('addr-line1').value.trim(),
      address_line2: document.getElementById('addr-line2').value.trim() || null,
      city: document.getElementById('addr-city').value.trim() || null,
      postal_code: document.getElementById('addr-postal').value.trim() || null,
      delivery_notes: document.getElementById('addr-notes').value.trim() || null,
      is_default: document.getElementById('addr-default').checked,
      lat,
      lng,
    };
    if (!body.address_line1) { if (errorEl) { errorEl.textContent = 'Address line 1 is required'; errorEl.style.display = 'block'; } return; }
    if (lat === null || lng === null) {
      if (errorEl) { errorEl.textContent = 'Please drop a pin on the map so the rider can find you.'; errorEl.style.display = 'block'; }
      return;
    }
    const method = addrId ? 'PUT' : 'POST';
    const url = addrId ? '/addresses/' + addrId : '/addresses';
    const btn = document.getElementById('address-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const r = await CustomerAuth.apiRequest(method, url, body);
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed'); }
      closeAddressModal();
      loadAddresses();
      if (typeof renderDeliveryPicker === 'function') renderDeliveryPicker();
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
      const phone = (document.getElementById('profile-phone').value || '').trim() || null;
      const prevPhone = _currentProfile ? (_currentProfile.phone || null) : null;
      await CustomerAuth.apiRequest('PUT', '/me', { full_name: name, phone });
      if (profileDisplay) profileDisplay.style.display = 'block';
      if (profileForm) profileForm.style.display = 'none';
      await loadProfile();
      if (phone && phone !== prevPhone) {
        setTimeout(() => openPhoneVerifyModal(phone), 200);
      }
    });
  }

  /* -----------------------------------------------
     Phone Verification Modal
  ----------------------------------------------- */
  const phoneVerifyModal = document.getElementById('phone-verify-modal');
  const phoneVerifyCloseBtns = document.querySelectorAll('[data-close-phone-verify]');

  function openPhoneVerifyModal(phone) {
    if (!phoneVerifyModal) return;
    const input = document.getElementById('phone-verify-phone');
    if (input && phone) input.value = phone;
    phoneVerifyShowStep('phone');
    const errP = document.getElementById('phone-verify-phone-error'); if (errP) errP.style.display = 'none';
    const errO = document.getElementById('phone-verify-otp-error'); if (errO) errO.style.display = 'none';
    phoneVerifyModal.classList.add('is-open');
  }
  function closePhoneVerifyModal() { if (phoneVerifyModal) phoneVerifyModal.classList.remove('is-open'); }
  function phoneVerifyShowStep(s) {
    ['phone', 'otp', 'success'].forEach(name => {
      const el = document.getElementById('phone-verify-step-' + name);
      if (el) el.style.display = (name === s) ? 'block' : 'none';
    });
  }
  window.openPhoneVerifyModal = openPhoneVerifyModal;
  window.closePhoneVerifyModal = closePhoneVerifyModal;

  phoneVerifyCloseBtns.forEach(b => b.addEventListener('click', closePhoneVerifyModal));
  if (phoneVerifyModal) phoneVerifyModal.addEventListener('click', (e) => { if (e.target === phoneVerifyModal) closePhoneVerifyModal(); });

  const phoneSendForm = document.getElementById('phone-verify-phone-form');
  if (phoneSendForm) phoneSendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('phone-verify-send-btn');
    const errEl = document.getElementById('phone-verify-phone-error');
    const phone = document.getElementById('phone-verify-phone').value.trim();
    if (!phone) return;
    btn.querySelector('.btn-spinner').style.display = 'inline-flex';
    errEl.style.display = 'none';
    try {
      const res = await CustomerAuth.apiRequest('POST', '/phone/send-otp', { phone });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      document.getElementById('phone-verify-phone-display').textContent = phone;
      phoneVerifyShowStep('otp');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.querySelector('.btn-spinner').style.display = 'none';
    }
  });

  const phoneOtpForm = document.getElementById('phone-verify-otp-form');
  if (phoneOtpForm) phoneOtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('phone-verify-otp-btn');
    const errEl = document.getElementById('phone-verify-otp-error');
    const phone = document.getElementById('phone-verify-phone').value.trim();
    const otp = document.getElementById('phone-verify-otp').value.trim();
    if (!otp) return;
    btn.querySelector('.btn-spinner').style.display = 'inline-flex';
    errEl.style.display = 'none';
    try {
      const res = await CustomerAuth.apiRequest('POST', '/phone/verify', { phone, otp });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      phoneVerifyShowStep('success');
      loadProfile();
      setTimeout(closePhoneVerifyModal, 1500);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.querySelector('.btn-spinner').style.display = 'none';
    }
  });

  const phoneResendBtn = document.getElementById('phone-verify-resend-btn');
  if (phoneResendBtn) phoneResendBtn.addEventListener('click', async () => {
    const phone = document.getElementById('phone-verify-phone').value.trim();
    if (!phone) return;
    phoneResendBtn.textContent = 'Sending...';
    try {
      await CustomerAuth.apiRequest('POST', '/phone/send-otp', { phone });
      phoneResendBtn.textContent = 'Code resent!';
      setTimeout(() => { phoneResendBtn.textContent = 'Resend code'; }, 3000);
    } catch {
      phoneResendBtn.textContent = 'Resend code';
    }
  });

  const phoneBackBtn = document.getElementById('phone-verify-back-btn');
  if (phoneBackBtn) phoneBackBtn.addEventListener('click', () => phoneVerifyShowStep('phone'));

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

  /* -----------------------------------------------
     Checkout flow
  ----------------------------------------------- */
  async function doCheckout() {
    if (!CustomerAuth.isLoggedIn()) {
      openAuthModal();
      return;
    }

    const items = TastiqoCart.getItems();
    if (!items.length) return;

    const branchId = getBranchId();
    if (!branchId) {
      showCheckoutError('Please select a branch first.');
      return;
    }

    const addrId = window._fhSelectedAddressId;
    if (!addrId) {
      showCheckoutError('Please choose a delivery address before placing the order.');
      return;
    }
    const selectedAddr = (window._addressCache || []).find(a => a.id === addrId);
    if (!selectedAddr || typeof selectedAddr.lat !== 'number' || typeof selectedAddr.lng !== 'number') {
      showCheckoutError('This address has no map pin. Tap "Adjust pin / edit" to drop one — the rider needs it to find you.');
      return;
    }

    const apiItems = items.map(it => ({
      product_id: it.product_id,
      quantity: it.quantity,
      modifier_ids: (it.modifiers || []).map(m => m.id),
      notes: it.notes || ''
    }));

    const body = {
      branch_id: branchId,
      order_type: 'delivery',
      payment_method: 'cash',
      items: apiItems,
      address_id: addrId,
      customer_notes: ''
    };

    const checkoutBtn = document.getElementById('fh-checkout-btn');
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.textContent = 'Placing order...'; }

    try {
      const res = await fetch('/api/storefront/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CustomerAuth.getAccessToken()
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to place order');
      }
      TastiqoCart.clear();
      window.location.href = '/account/orders';
    } catch (err) {
      showCheckoutError(err.message || 'Failed to place order. Please try again.');
      if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Proceed to Checkout →'; }
    }
  }

  function showCheckoutError(msg) {
    const el = document.getElementById('fh-checkout-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  /* -----------------------------------------------
     Quantity stepper (data-fh-qty)
  ----------------------------------------------- */
  document.querySelectorAll('[data-fh-qty]').forEach(qty => {
    const valueEl = qty.querySelector('[data-fh-qty-value]');
    qty.querySelectorAll('button[data-fh-qty-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = parseInt(btn.getAttribute('data-fh-qty-step'), 10);
        let v = parseInt(valueEl.textContent, 10) || 1;
        v += step;
        if (v < 1) v = 1;
        if (v > 99) v = 99;
        valueEl.textContent = v;
        qty.dispatchEvent(new CustomEvent('qty:changed', { detail: { value: v } }));
      });
    });
  });

  /* -----------------------------------------------
     Add to Cart (Product Detail Page)
  ----------------------------------------------- */
  function initProductAddToCart() {
    const addBtn = document.getElementById('fh-add-to-cart-btn');
    if (!addBtn) return;

    const dataEl = document.getElementById('product-data');
    if (!dataEl) return;

    let product;
    try { product = JSON.parse(dataEl.textContent); } catch { return; }

    const priceDisplay = document.getElementById('product-active-price');
    const qtyEl = document.querySelector('[data-fh-qty]');
    const qtyValueEl = qtyEl ? qtyEl.querySelector('[data-fh-qty-value]') : null;

    function getQuantity() {
      return qtyValueEl ? (parseInt(qtyValueEl.textContent, 10) || 1) : 1;
    }

    function recalcTotalPrice() {
      let unitPrice = product.price;
      document.querySelectorAll('.product-modifier-groups input:checked').forEach(inp => {
        unitPrice += parseInt(inp.getAttribute('data-price-delta'), 10) || 0;
      });
      const qty = getQuantity();
      const lineTotal = unitPrice * qty;
      if (priceDisplay) priceDisplay.textContent = formatMoney(unitPrice);
      addBtn.textContent = 'Add to Cart · ' + formatMoney(lineTotal);
    }

    function enforceMaxSelections(groupEl) {
      const max = parseInt(groupEl.getAttribute('data-group-max'), 10) || 0;
      if (max <= 1) return;
      const checkboxes = groupEl.querySelectorAll('input[type="checkbox"]');
      let checkedCount = 0;
      checkboxes.forEach(cb => { if (cb.checked) checkedCount++; });
      checkboxes.forEach(cb => {
        const opt = cb.closest('.modifier-option');
        if (!cb.checked && checkedCount >= max) {
          cb.disabled = true;
          if (opt) opt.classList.add('modifier-disabled');
        } else {
          cb.disabled = false;
          if (opt) opt.classList.remove('modifier-disabled');
        }
      });
    }

    document.querySelectorAll('.product-modifier-groups input').forEach(inp => {
      inp.addEventListener('change', () => {
        recalcTotalPrice();
        const groupEl = inp.closest('.modifier-group');
        if (groupEl) enforceMaxSelections(groupEl);
      });
    });

    document.querySelectorAll('.modifier-group').forEach(g => enforceMaxSelections(g));

    if (qtyEl) qtyEl.addEventListener('qty:changed', recalcTotalPrice);
    recalcTotalPrice();

    addBtn.addEventListener('click', () => {
      // Validate required modifier groups
      let valid = true;
      document.querySelectorAll('.modifier-group[data-group-required="true"]').forEach(groupEl => {
        const checked = groupEl.querySelectorAll('input:checked');
        const min = parseInt(groupEl.getAttribute('data-group-min'), 10) || 1;
        let errEl = groupEl.querySelector('.modifier-error');
        if (checked.length < min) {
          valid = false;
          groupEl.classList.add('modifier-group-error');
          if (!errEl) {
            errEl = document.createElement('p');
            errEl.className = 'modifier-error';
            errEl.style.cssText = 'color:var(--color-error,#dc2626);font-size:0.8rem;margin-top:6px;';
            groupEl.appendChild(errEl);
          }
          const titleEl = groupEl.querySelector('.modifier-group-title');
          const name = titleEl ? titleEl.textContent.replace('Required', '').trim() : 'this option';
          errEl.textContent = 'Please select ' + name;
          errEl.style.display = 'block';
        } else {
          groupEl.classList.remove('modifier-group-error');
          if (errEl) errEl.style.display = 'none';
        }
      });
      if (!valid) return;

      const quantity = getQuantity();
      const modifiers = [];
      document.querySelectorAll('.product-modifier-groups input:checked').forEach(inp => {
        modifiers.push({
          id: inp.value,
          group_name: inp.getAttribute('data-group-name') || '',
          name: inp.getAttribute('data-option-name') || '',
          price_adjustment: parseInt(inp.getAttribute('data-price-delta'), 10) || 0
        });
      });

      let unitPrice = product.price;
      modifiers.forEach(m => { unitPrice += m.price_adjustment; });

      const cartId = TastiqoCart._generateId(product.id, modifiers);

      TastiqoCart.addItem({
        id: cartId,
        product_id: product.id,
        name: product.name,
        image_url: product.image_url || '',
        quantity,
        unit_price: unitPrice,
        modifiers,
        notes: ''
      });

      const originalText = addBtn.textContent;
      addBtn.textContent = 'Added to Cart ✓';
      addBtn.disabled = true;
      setTimeout(() => {
        addBtn.disabled = false;
        recalcTotalPrice();
      }, 1000);
    });
  }

  /* -----------------------------------------------
     Cart Page Rendering
  ----------------------------------------------- */
  function initCartPage() {
    const cartPage = document.querySelector('[data-fh-cart-page]');
    if (!cartPage) return;

    renderCart();
    renderDeliveryPicker();
    window.addEventListener('cart:updated', renderCart);

    const checkoutBtn = document.getElementById('fh-checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', doCheckout);
  }

  window._fhSelectedAddressId = null;

  function renderDeliveryPicker() {
    const container = document.getElementById('fh-delivery-picker');
    if (!container) return;
    if (!CustomerAuth.isLoggedIn()) {
      container.innerHTML =
        '<div style="border:1px solid var(--color-border);border-radius:10px;padding:0.875rem;font-size:0.85rem;line-height:1.5;">' +
        '<strong>Sign in to add a delivery address.</strong><br>' +
        '<button type="button" class="btn-link" id="fh-delivery-signin">Sign in</button>' +
        '</div>';
      const btn = document.getElementById('fh-delivery-signin');
      if (btn) btn.addEventListener('click', openAuthModal);
      return;
    }
    container.innerHTML = '<div style="font-size:0.85rem;color:var(--color-text-muted);">Loading delivery addresses…</div>';
    CustomerAuth.apiRequest('GET', '/addresses').then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(addrs => {
      window._addressCache = addrs || [];
      if (!addrs || !addrs.length) {
        container.innerHTML =
          '<div class="checkout-addr-card no-pin">' +
          '<strong>No delivery address yet.</strong>' +
          '<div style="font-size:0.8rem;color:var(--color-text-muted);margin:4px 0 8px;">Save an address with a map pin so the rider knows where to deliver.</div>' +
          '<button type="button" class="btn btn-primary btn-sm" id="fh-delivery-add">Add delivery address</button>' +
          '</div>';
        const addBtn = document.getElementById('fh-delivery-add');
        if (addBtn) addBtn.addEventListener('click', () => openAddressModal(null));
        window._fhSelectedAddressId = null;
        return;
      }
      const defaultAddr = addrs.find(a => a.is_default) || addrs[0];
      window._fhSelectedAddressId = defaultAddr.id;
      let html = '<div style="font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;">Deliver to</div>';
      html += '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;">';
      addrs.forEach(a => {
        const checked = a.id === window._fhSelectedAddressId ? 'checked' : '';
        const pinBadge = (typeof a.lat === 'number' && typeof a.lng === 'number')
          ? '<span style="color:var(--color-success,#10b981);font-size:0.7rem;font-weight:700;">📍 PINNED</span>'
          : '<span style="color:var(--color-warning,#F59E0B);font-size:0.7rem;font-weight:700;">⚠ NO PIN</span>';
        html +=
          `<label style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.625rem;border:1px solid var(--color-border);border-radius:8px;cursor:pointer;">` +
            `<input type="radio" name="fh-delivery-addr" value="${escH(a.id)}" ${checked} style="margin-top:3px;">` +
            `<div style="flex:1;font-size:0.85rem;line-height:1.4;">` +
              `<div style="font-weight:600;">${escH(a.label || 'Address')} ${pinBadge}</div>` +
              `<div>${escH(a.address_line1 || '')}</div>` +
              `<button type="button" class="btn-link" data-fh-adjust-pin="${escH(a.id)}" style="font-size:0.75rem;margin-top:4px;">Adjust pin / edit</button>` +
            `</div>` +
          `</label>`;
      });
      html += '</div>';
      html += '<button type="button" class="btn btn-outline btn-sm" id="fh-delivery-add" style="width:100%;">+ Add another address</button>';
      html += '<div id="fh-checkout-map" class="checkout-map" style="display:none;"></div>';
      container.innerHTML = html;
      container.querySelectorAll('input[name="fh-delivery-addr"]').forEach(input => {
        input.addEventListener('change', () => {
          window._fhSelectedAddressId = input.value;
          showSelectedAddrPin();
        });
      });
      container.querySelectorAll('[data-fh-adjust-pin]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-fh-adjust-pin');
          const addr = (window._addressCache || []).find(a => a.id === id);
          if (addr) openAddressModal(addr);
        });
      });
      const addBtn = document.getElementById('fh-delivery-add');
      if (addBtn) addBtn.addEventListener('click', () => openAddressModal(null));
      showSelectedAddrPin();
    }).catch(() => {
      container.innerHTML = '<div style="font-size:0.85rem;color:var(--color-text-muted);">Could not load addresses.</div>';
    });
  }

  function showSelectedAddrPin() {
    const mapEl = document.getElementById('fh-checkout-map');
    if (!mapEl) return;
    const addr = (window._addressCache || []).find(a => a.id === window._fhSelectedAddressId);
    if (addr && typeof addr.lat === 'number' && typeof addr.lng === 'number') {
      mapEl.style.display = 'block';
      TastiqoMap.onReady(() => {
        requestAnimationFrame(() => TastiqoMap.showCheckoutPin('fh-checkout-map', addr.lat, addr.lng));
      });
    } else {
      mapEl.style.display = 'none';
    }
  }

  function renderCart() {
    const filledEl = document.getElementById('fh-cart-filled');
    const emptyEl = document.getElementById('fh-cart-empty');
    const itemsEl = document.getElementById('cart-items-list');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    const errorEl = document.getElementById('fh-checkout-error');

    if (!filledEl || !emptyEl || !itemsEl) return;

    const items = TastiqoCart.getItems();

    if (!items.length) {
      filledEl.style.display = 'none';
      emptyEl.style.display = '';
      return;
    }

    filledEl.style.display = '';
    emptyEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    itemsEl.innerHTML = items.map(item => {
      const lineTotal = item.unit_price * item.quantity;
      const modText = item.modifiers && item.modifiers.length
        ? item.modifiers.map(m => escH(m.name)).join(', ')
        : '';
      const imgHtml = item.image_url
        ? `<img src="${escH(item.image_url)}" alt="${escH(item.name)}" class="cart-item-image">`
        : `<div class="cart-item-image cart-item-image-placeholder"></div>`;
      return `
        <div class="cart-item" data-cart-id="${escH(item.id)}">
          ${imgHtml}
          <div class="cart-item-info">
            <div class="cart-item-name">${escH(item.name)}</div>
            ${modText ? `<div class="cart-item-variant">${modText}</div>` : ''}
            <div class="cart-item-bottom">
              <div class="quantity-control">
                <button type="button" data-fh-cart-action="decrease" data-cart-id="${escH(item.id)}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-fh-cart-action="increase" data-cart-id="${escH(item.id)}">+</button>
                <button type="button" class="cart-item-remove" data-fh-cart-action="remove" data-cart-id="${escH(item.id)}">Remove</button>
              </div>
              <span class="cart-item-price">${formatMoney(lineTotal)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const subtotal = TastiqoCart.getSubtotal();
    if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
    if (totalEl) totalEl.textContent = formatMoney(subtotal);

    itemsEl.querySelectorAll('[data-fh-cart-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cart-id');
        const action = btn.getAttribute('data-fh-cart-action');
        const current = TastiqoCart.getItems().find(it => it.id === id);
        if (!current) return;
        if (action === 'increase') TastiqoCart.updateQuantity(id, current.quantity + 1);
        else if (action === 'decrease') TastiqoCart.updateQuantity(id, current.quantity - 1);
        else if (action === 'remove') TastiqoCart.removeItem(id);
      });
    });
  }

  /* -----------------------------------------------
     Branch selector popup (city / area / pick-up)
     Wired against /api/storefront/service-areas/* and
     /api/storefront/set-branch. The popup markup +
     branches JSON are rendered by `snippets/branch-selector.liquid`.
  ----------------------------------------------- */
  var BRANCH_LS_KEY = 'tq_storefront_branch_id';

  function fhKnownBranchIds() {
    var ids = [];
    try {
      var el = document.getElementById('tq-bs-branches-data');
      if (el && el.textContent) {
        var arr = JSON.parse(el.textContent) || [];
        arr.forEach(function(b) { if (b && b.id) ids.push(String(b.id)); });
      }
    } catch (e) {}
    return ids;
  }
  function fhSavedBranchValid(allIds) {
    try {
      var saved = localStorage.getItem(BRANCH_LS_KEY);
      return !!saved && allIds.indexOf(saved) !== -1;
    } catch (e) { return false; }
  }

  function initBranchPopup() {
    var data = getStorefrontData();
    if ((data.branch_count || 0) <= 1) return;
    var ids = fhKnownBranchIds();
    if (fhSavedBranchValid(ids)) return;
    if (!data.show_branch_popup) return;
    if (typeof window.TQBranchSelector === 'function') {
      window.TQBranchSelector({ localStorageKey: BRANCH_LS_KEY });
    }
  }

  window.TQBranchSelector = function(opts) {
    opts = opts || {};
    var overlay = document.getElementById('tq-branch-selector');
    if (!overlay) return;
    var cityInput = overlay.querySelector('#tq-bs-city-input');
    var areaInput = overlay.querySelector('#tq-bs-area-input');
    var cityCombo = overlay.querySelector('[data-tq-combo="city"]');
    var areaCombo = overlay.querySelector('[data-tq-combo="area"]');
    var cityOpts = cityCombo.querySelector('[data-tq-options]');
    var areaOpts = areaCombo.querySelector('[data-tq-options]');
    var submitBtn = overlay.querySelector('[data-tq-submit]');
    var locateBtn = overlay.querySelector('[data-tq-locate]');
    var locateLabel = overlay.querySelector('[data-tq-locate-label]');
    var errEl = overlay.querySelector('[data-tq-error]');
    var pickupList = overlay.querySelector('[data-tq-pickup-list]');
    var tabs = overlay.querySelectorAll('.tq-bs-tab');
    var panes = overlay.querySelectorAll('.tq-bs-pane');

    var state = { cities: [], areasByCity: {}, cityId: null, areaId: null, userLat: null, userLng: null };

    function setError(msg) {
      if (!msg) { errEl.style.display = 'none'; errEl.textContent = ''; return; }
      errEl.textContent = msg; errEl.style.display = 'block';
    }

    function open() {
      overlay.style.display = 'flex';
      requestAnimationFrame(function() { overlay.classList.add('is-open'); });
      document.documentElement.style.overflow = 'hidden';
    }

    tabs.forEach(function(t) {
      t.addEventListener('click', function() {
        var pane = t.getAttribute('data-tq-tab');
        tabs.forEach(function(x) { x.classList.toggle('is-active', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        panes.forEach(function(p) { p.hidden = p.getAttribute('data-tq-pane') !== pane; });
        setError('');
      });
    });

    function renderOptions(list, optsEl, onPick) {
      optsEl.innerHTML = '';
      if (list.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'is-empty';
        empty.textContent = 'No matches';
        optsEl.appendChild(empty);
        return;
      }
      list.forEach(function(it) {
        var li = document.createElement('li');
        li.textContent = it.name;
        li.setAttribute('data-id', it.id);
        li.addEventListener('mousedown', function(e) { e.preventDefault(); onPick(it); });
        optsEl.appendChild(li);
      });
    }

    function filterCities(query) {
      var q = (query || '').toLowerCase();
      var list = state.cities.filter(function(c) { return c.name.toLowerCase().indexOf(q) !== -1; });
      renderOptions(list, cityOpts, pickCity);
    }
    function filterAreas(query) {
      var areas = (state.cityId && state.areasByCity[state.cityId]) || [];
      var q = (query || '').toLowerCase();
      var list = areas.filter(function(a) { return a.name.toLowerCase().indexOf(q) !== -1; });
      renderOptions(list, areaOpts, pickArea);
    }

    function pickCity(c) {
      state.cityId = c.id;
      state.areaId = null;
      cityInput.value = c.name;
      cityCombo.classList.remove('is-open');
      areaInput.value = '';
      areaInput.disabled = false;
      areaCombo.classList.remove('is-disabled');
      submitBtn.disabled = true;
      filterAreas('');
    }
    function pickArea(a) {
      state.areaId = a.id;
      areaInput.value = a.name;
      areaCombo.classList.remove('is-open');
      submitBtn.disabled = false;
      setError('');
    }

    cityInput.addEventListener('focus', function() { filterCities(cityInput.value); cityCombo.classList.add('is-open'); });
    cityInput.addEventListener('input', function() { filterCities(cityInput.value); cityCombo.classList.add('is-open'); state.cityId = null; areaInput.value = ''; areaInput.disabled = true; areaCombo.classList.add('is-disabled'); submitBtn.disabled = true; });
    cityInput.addEventListener('blur', function() { setTimeout(function() { cityCombo.classList.remove('is-open'); }, 120); });

    areaInput.addEventListener('focus', function() { if (!areaInput.disabled) { filterAreas(areaInput.value); areaCombo.classList.add('is-open'); } });
    areaInput.addEventListener('input', function() { filterAreas(areaInput.value); areaCombo.classList.add('is-open'); state.areaId = null; submitBtn.disabled = true; });
    areaInput.addEventListener('blur', function() { setTimeout(function() { areaCombo.classList.remove('is-open'); }, 120); });

    submitBtn.addEventListener('click', function() {
      if (!state.areaId) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resolving…';
      var body = { area_id: state.areaId };
      if (state.userLat != null && state.userLng != null) {
        body.user_lat = state.userLat;
        body.user_lng = state.userLng;
      }
      fetch('/api/storefront/service-areas/resolve-branch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(res) {
          if (!res.ok || !res.data || !res.data.branch_id) {
            setError((res.data && res.data.error) || 'Could not find a branch for this area.');
            submitBtn.disabled = false; submitBtn.textContent = 'Select';
            return;
          }
          try { localStorage.setItem(opts.localStorageKey || BRANCH_LS_KEY, res.data.branch_id); } catch (e) {}
          var fd = new FormData();
          fd.append('branch_id', res.data.branch_id);
          fetch('/api/storefront/set-branch', { method: 'POST', body: fd, credentials: 'same-origin' })
            .then(function() { window.location.reload(); })
            .catch(function() { window.location.reload(); });
        })
        .catch(function() {
          setError('Network error — please try again.');
          submitBtn.disabled = false; submitBtn.textContent = 'Select';
        });
    });

    locateBtn.addEventListener('click', function() {
      if (!navigator.geolocation) { setError('Geolocation not supported on this browser.'); return; }
      locateBtn.disabled = true;
      locateLabel.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          state.userLat = pos.coords.latitude;
          state.userLng = pos.coords.longitude;
          fetch('/api/storefront/service-areas/resolve-by-location', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
              if (!res.ok || !res.data || !res.data.area_id) {
                setError((res.data && res.data.error) || 'No coverage near your location.');
              } else {
                var city = state.cities.find(function(c) { return c.id === res.data.city_id; });
                if (city) pickCity(city);
                var areas = (state.areasByCity[res.data.city_id] || []);
                var area = areas.find(function(a) { return a.id === res.data.area_id; });
                if (area) pickArea(area);
              }
            })
            .catch(function() { setError('Network error — please try again.'); })
            .finally(function() {
              locateBtn.disabled = false; locateLabel.textContent = 'Use Current Location';
            });
        },
        function(err) {
          locateBtn.disabled = false; locateLabel.textContent = 'Use Current Location';
          setError(err.code === 1 ? 'Permission denied for location.' : 'Could not get your location.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });

    fetch('/api/storefront/service-areas/cities', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        state.cities = d.cities || [];
        state.areasByCity = d.areas_by_city || {};
        renderPickup();
        if (state.cities.length === 0) {
          setError('No delivery areas configured yet.');
        }
        open();
      })
      .catch(function() { open(); });

    function renderPickup() {
      var branches = [];
      try {
        var dataEl = document.getElementById('tq-bs-branches-data');
        if (dataEl && dataEl.textContent) {
          branches = JSON.parse(dataEl.textContent) || [];
        }
      } catch (e) { branches = []; }

      if (!branches.length) {
        pickupList.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:13px;text-align:center;">No branches available.</p>';
        return;
      }
      pickupList.innerHTML = '';
      branches.forEach(function(b) {
        if (!b || !b.id || !b.name) return;
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'tq-bs-pickup-item';
        btn.innerHTML = '<div class="tq-bs-pickup-name"></div>' + (b.address ? '<div class="tq-bs-pickup-addr"></div>' : '');
        btn.querySelector('.tq-bs-pickup-name').textContent = b.name;
        if (b.address) btn.querySelector('.tq-bs-pickup-addr').textContent = b.address;
        btn.addEventListener('click', function() {
          try { localStorage.setItem(opts.localStorageKey || BRANCH_LS_KEY, b.id); } catch (e) {}
          var fd = new FormData();
          fd.append('branch_id', b.id);
          fetch('/api/storefront/set-branch', { method: 'POST', body: fd, credentials: 'same-origin' })
            .then(function() { window.location.reload(); })
            .catch(function() { window.location.reload(); });
        });
        pickupList.appendChild(btn);
      });
    }
  };

  /* -----------------------------------------------
     Init
  ----------------------------------------------- */
  TastiqoCart._updateBadge();
  initProductAddToCart();
  initCartPage();
  initBranchPopup();

})();
