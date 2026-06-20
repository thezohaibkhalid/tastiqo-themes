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

  var DEFAULT_CENTER = { lat: 24.8607, lng: 67.0011 };
  var OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2';

  var TastiqoMap = {
    _ready: false,
    _readyCallbacks: [],
    _addrMap: null,
    _addrMarker: null,
    _ckMap: null,
    _ckMarker: null,
    onReady: function(cb) { if (this._ready) { cb(); return; } this._readyCallbacks.push(cb); },
    _fireReady: function() {
      this._ready = true;
      this._readyCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
      this._readyCallbacks = [];
    },
    _waitForLeaflet: function() {
      var self = this;
      if (window.L) { this._fireReady(); return; }
      var tries = 0;
      var iv = setInterval(function() {
        tries++;
        if (window.L) { clearInterval(iv); self._fireReady(); }
        else if (tries > 100) clearInterval(iv);
      }, 100);
    },
    attachAddressPicker: function(initial) {
      var self = this;
      var container = document.getElementById('addr-map');
      if (!container || !window.L) return;
      if (this._addrMap) {
        try { this._addrMap.remove(); } catch(e) {}
        this._addrMap = null;
        this._addrMarker = null;
      }
      var hasInitial = typeof initial.lat === 'number' && typeof initial.lng === 'number';
      var center = hasInitial ? [initial.lat, initial.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];
      this._addrMap = L.map(container, { zoomControl: true, scrollWheelZoom: true })
        .setView(center, hasInitial ? 16 : 12);
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(this._addrMap);
      this._addrMarker = L.marker(center, { draggable: true }).addTo(this._addrMap);
      this._addrMap.on('click', function(e) { self._addrMarker.setLatLng(e.latlng); self._onAddrPinChanged(); });
      this._addrMarker.on('dragend', function() { self._onAddrPinChanged(); });
      // invalidateSize after modal show; container has zero size at construction
      requestAnimationFrame(function() { if (self._addrMap) self._addrMap.invalidateSize(); });
      if (hasInitial) {
        this._writeAddrInputs(initial.lat, initial.lng);
        this._showCoords(initial.lat, initial.lng);
      } else {
        this._writeAddrInputs('', '');
        this._showCoords(null, null);
      }
    },
    locateMe: function() {
      var self = this;
      var hint = document.getElementById('addr-map-hint');
      if (!navigator.geolocation) {
        if (hint) hint.textContent = 'Your browser does not support location sharing.';
        return;
      }
      if (hint) hint.textContent = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          var lat = pos.coords.latitude, lng = pos.coords.longitude;
          if (self._addrMap && self._addrMarker) {
            self._addrMap.setView([lat, lng], 17);
            self._addrMarker.setLatLng([lat, lng]);
            self._onAddrPinChanged();
          }
          if (hint) hint.textContent = 'Drag the pin to fine-tune.';
        },
        function(err) {
          if (hint) hint.textContent = err.code === 1
            ? 'Permission denied — pin the location manually instead.'
            : 'Could not get your location — pin it manually.';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
    _onAddrPinChanged: function() {
      if (!this._addrMarker) return;
      var pos = this._addrMarker.getLatLng();
      var lat = pos.lat, lng = pos.lng;
      this._writeAddrInputs(lat, lng);
      this._showCoords(lat, lng);
      var line1El = document.getElementById('addr-line1');
      if (line1El && !line1El.value.trim()) {
        var url = NOMINATIM_URL + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);
        fetch(url, { headers: { 'Accept-Language': (navigator.language || 'en') } })
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(data) {
            if (data && data.display_name && line1El && !line1El.value.trim()) {
              line1El.value = data.display_name;
            }
          })
          .catch(function() {});
      }
    },
    _writeAddrInputs: function(lat, lng) {
      var latEl = document.getElementById('addr-lat');
      var lngEl = document.getElementById('addr-lng');
      if (latEl) latEl.value = lat === '' ? '' : String(lat);
      if (lngEl) lngEl.value = lng === '' ? '' : String(lng);
    },
    _showCoords: function(lat, lng) {
      var el = document.getElementById('addr-map-coords');
      if (!el) return;
      if (typeof lat !== 'number' || typeof lng !== 'number') { el.textContent = ''; return; }
      el.textContent = '📍 ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
    },
    showCheckoutPin: function(containerId, lat, lng) {
      var container = document.getElementById(containerId);
      if (!container || !window.L) return;
      if (this._ckMap) {
        try { this._ckMap.remove(); } catch(e) {}
        this._ckMap = null;
        this._ckMarker = null;
      }
      this._ckMap = L.map(container, {
        zoomControl: false, scrollWheelZoom: false, dragging: false,
        doubleClickZoom: false, touchZoom: false, keyboard: false,
      }).setView([lat, lng], 16);
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(this._ckMap);
      this._ckMarker = L.marker([lat, lng]).addTo(this._ckMap);
      var self = this;
      requestAnimationFrame(function() { if (self._ckMap) self._ckMap.invalidateSize(); });
    },
  };
  TastiqoMap._waitForLeaflet();
  window.TastiqoMap = TastiqoMap;

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

    var addrId = window._cncSelectedAddressId;
    if (!addrId) { showCheckoutError('Please choose a delivery address before placing the order.'); return; }
    var selectedAddr = (window._addressCache || []).find(function(a) { return a.id === addrId; });
    if (!selectedAddr || typeof selectedAddr.lat !== 'number' || typeof selectedAddr.lng !== 'number') {
      showCheckoutError('This address has no map pin. Tap "Adjust pin / edit" to drop one — the rider needs it to find you.');
      return;
    }

    var apiItems = items.map(function(it) {
      return { product_id: it.product_id, quantity: it.quantity, modifier_ids: (it.modifiers || []).map(function(m) { return m.id; }), notes: it.notes || '' };
    });
    var body = { branch_id: branchId, order_type: 'delivery', payment_method: 'cash', items: apiItems, address_id: addrId, customer_notes: '' };
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
    renderDeliveryPicker();
    window.addEventListener('cart:updated', renderCart);
    var checkoutBtn = document.getElementById('cnc-checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', doCheckout);
  }

  window._cncSelectedAddressId = null;

  function renderDeliveryPicker() {
    var container = document.getElementById('cnc-delivery-picker');
    if (!container) return;
    if (!CustomerAuth.isLoggedIn()) {
      container.innerHTML =
        '<div style="border:1px solid var(--cnc-border);border-radius:10px;padding:0.875rem;font-size:0.85rem;line-height:1.5;">' +
        '<strong>Sign in to add a delivery address.</strong><br>' +
        '<button type="button" class="cnc-btn-link" id="cnc-delivery-signin">Sign in</button>' +
        '</div>';
      var btn = document.getElementById('cnc-delivery-signin');
      if (btn) btn.addEventListener('click', openAuthModal);
      return;
    }
    container.innerHTML = '<div style="font-size:0.85rem;color:var(--cnc-text-muted);">Loading delivery addresses…</div>';
    CustomerAuth.apiRequest('GET', '/addresses').then(function(r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function(addrs) {
      window._addressCache = addrs || [];
      if (!addrs || !addrs.length) {
        container.innerHTML =
          '<div class="cnc-checkout-addr-card no-pin">' +
          '<strong>No delivery address yet.</strong>' +
          '<div style="font-size:0.8rem;color:var(--cnc-text-muted);margin:4px 0 8px;">Save an address with a map pin so the rider knows where to deliver.</div>' +
          '<button type="button" class="cnc-btn cnc-btn-primary cnc-btn-sm" id="cnc-delivery-add">Add delivery address</button>' +
          '</div>';
        var addBtn = document.getElementById('cnc-delivery-add');
        if (addBtn) addBtn.addEventListener('click', function() { openAddressModal(null); });
        window._cncSelectedAddressId = null;
        return;
      }
      var defaultAddr = addrs.find(function(a) { return a.is_default; }) || addrs[0];
      window._cncSelectedAddressId = defaultAddr.id;
      var html = '<div style="font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;">Deliver to</div>';
      html += '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;">';
      addrs.forEach(function(a) {
        var checked = a.id === window._cncSelectedAddressId ? 'checked' : '';
        var pinBadge = (typeof a.lat === 'number' && typeof a.lng === 'number')
          ? '<span style="color:var(--cnc-success);font-size:0.7rem;font-weight:700;">📍 PINNED</span>'
          : '<span style="color:var(--cnc-warning,#F59E0B);font-size:0.7rem;font-weight:700;">⚠ NO PIN</span>';
        html +=
          '<label style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.625rem;border:1px solid var(--cnc-border);border-radius:8px;cursor:pointer;">' +
            '<input type="radio" name="cnc-delivery-addr" value="' + escHTML(a.id) + '" ' + checked + ' style="margin-top:3px;">' +
            '<div style="flex:1;font-size:0.85rem;line-height:1.4;">' +
              '<div style="font-weight:600;">' + escHTML(a.label || 'Address') + ' ' + pinBadge + '</div>' +
              '<div>' + escHTML(a.address_line1 || '') + '</div>' +
              '<button type="button" class="cnc-btn-link" data-cnc-adjust-pin="' + escHTML(a.id) + '" style="font-size:0.75rem;margin-top:4px;">Adjust pin / edit</button>' +
            '</div>' +
          '</label>';
      });
      html += '</div>';
      html += '<button type="button" class="cnc-btn cnc-btn-outline cnc-btn-sm" id="cnc-delivery-add" style="width:100%;">+ Add another address</button>';
      html += '<div id="cnc-checkout-map" class="cnc-checkout-map" style="display:none;"></div>';
      container.innerHTML = html;
      container.querySelectorAll('input[name="cnc-delivery-addr"]').forEach(function(input) {
        input.addEventListener('change', function() {
          window._cncSelectedAddressId = input.value;
          showSelectedAddrPin();
        });
      });
      container.querySelectorAll('[data-cnc-adjust-pin]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.getAttribute('data-cnc-adjust-pin');
          var addr = (window._addressCache || []).find(function(a) { return a.id === id; });
          if (addr) openAddressModal(addr);
        });
      });
      var addBtn = document.getElementById('cnc-delivery-add');
      if (addBtn) addBtn.addEventListener('click', function() { openAddressModal(null); });
      showSelectedAddrPin();
    }).catch(function() {
      container.innerHTML = '<div style="font-size:0.85rem;color:var(--cnc-text-muted);">Could not load addresses.</div>';
    });
  }

  function showSelectedAddrPin() {
    var mapEl = document.getElementById('cnc-checkout-map');
    if (!mapEl) return;
    var addr = (window._addressCache || []).find(function(a) { return a.id === window._cncSelectedAddressId; });
    if (addr && typeof addr.lat === 'number' && typeof addr.lng === 'number') {
      mapEl.style.display = 'block';
      TastiqoMap.onReady(function() {
        requestAnimationFrame(function() { TastiqoMap.showCheckoutPin('cnc-checkout-map', addr.lat, addr.lng); });
      });
    } else {
      mapEl.style.display = 'none';
    }
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

  var _currentProfile = null;
  function loadProfile() {
    CustomerAuth.apiRequest('GET', '/me').then(function(r) { if (!r.ok) return; return r.json(); }).then(function(c) {
      if (!c) return;
      _currentProfile = c;
      document.getElementById('account-name').textContent = c.full_name || '\u2014';
      document.getElementById('account-email').textContent = c.email || '\u2014';
      document.getElementById('account-phone').textContent = c.phone || '\u2014';
      renderPhoneStatus(c);
      var pn = document.getElementById('profile-name'); if (pn) pn.value = c.full_name || '';
      var pp = document.getElementById('profile-phone'); if (pp) pp.value = c.phone || '';
    });
  }

  function renderPhoneStatus(c) {
    var statusEl = document.getElementById('account-phone-status');
    if (!statusEl) return;
    if (!c || !c.phone) { statusEl.innerHTML = ''; return; }
    if (c.phone_verified) {
      statusEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--cnc-success);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">\u2713 Verified</span>';
    } else {
      statusEl.innerHTML = '<span style="background:var(--cnc-warning,#F59E0B);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">Unverified</span> <button type="button" class="cnc-btn-link" id="account-verify-phone-btn" style="font-size:0.8rem;">Verify now</button>';
      var b = document.getElementById('account-verify-phone-btn');
      if (b) b.addEventListener('click', function() { openPhoneVerifyModal(c.phone); });
    }
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

    var initial = {
      lat: addr && typeof addr.lat === 'number' ? addr.lat : null,
      lng: addr && typeof addr.lng === 'number' ? addr.lng : null,
    };
    TastiqoMap.onReady(function() {
      requestAnimationFrame(function() { TastiqoMap.attachAddressPicker(initial); });
    });
  }
  function closeAddressModal() { if (addressModal) addressModal.style.display = 'none'; }

  if (addAddressBtn) addAddressBtn.addEventListener('click', function() { openAddressModal(null); });
  if (addressCloseBtn) addressCloseBtn.addEventListener('click', closeAddressModal);
  if (addressCancelBtn) addressCancelBtn.addEventListener('click', closeAddressModal);
  if (addressModal) addressModal.addEventListener('click', function(e) { if (e.target === addressModal) closeAddressModal(); });

  var addrLocateBtn = document.getElementById('addr-locate-btn');
  if (addrLocateBtn) addrLocateBtn.addEventListener('click', function() { TastiqoMap.locateMe(); });

  window._editAddress = function(id) { var addr = (window._addressCache || []).find(function(a) { return a.id === id; }); if (addr) openAddressModal(addr); };
  window._deleteAddress = function(id) { if (!confirm('Delete this address?')) return; CustomerAuth.apiRequest('DELETE', '/addresses/' + id).then(function(r) { if (!r.ok) throw new Error(); loadAddresses(); }).catch(function() { alert('Failed to delete address'); }); };

  if (addressForm) addressForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var addrId = document.getElementById('addr-id').value;
    var errorEl = document.getElementById('address-error');
    var latRaw = document.getElementById('addr-lat').value;
    var lngRaw = document.getElementById('addr-lng').value;
    var lat = latRaw === '' ? null : parseFloat(latRaw);
    var lng = lngRaw === '' ? null : parseFloat(lngRaw);
    var body = {
      label: document.getElementById('addr-label').value.trim(),
      address_line1: document.getElementById('addr-line1').value.trim(),
      address_line2: document.getElementById('addr-line2').value.trim() || null,
      city: document.getElementById('addr-city').value.trim() || null,
      postal_code: document.getElementById('addr-postal').value.trim() || null,
      delivery_notes: document.getElementById('addr-notes').value.trim() || null,
      is_default: document.getElementById('addr-default').checked,
      lat: lat,
      lng: lng,
    };
    if (!body.address_line1) { errorEl.textContent = 'Address line 1 is required'; errorEl.style.display = 'block'; return; }
    if (lat === null || lng === null) {
      errorEl.textContent = 'Please drop a pin on the map so the rider can find you.';
      errorEl.style.display = 'block';
      return;
    }
    var method = addrId ? 'PUT' : 'POST', url = addrId ? '/addresses/' + addrId : '/addresses';
    var btn = document.getElementById('address-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    CustomerAuth.apiRequest(method, url, body).then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Failed'); });
      closeAddressModal();
      loadAddresses();
      if (typeof renderDeliveryPicker === 'function') renderDeliveryPicker();
    })
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
    var name = document.getElementById('profile-name').value;
    var phone = (document.getElementById('profile-phone').value || '').trim() || null;
    var prevPhone = _currentProfile ? (_currentProfile.phone || null) : null;
    CustomerAuth.apiRequest('PUT', '/me', { full_name: name, phone: phone }).then(function() {
      if (profileDisplay) profileDisplay.style.display = 'block';
      if (profileForm) profileForm.style.display = 'none';
      if (phone && phone !== prevPhone) {
        loadProfile();
        setTimeout(function() { openPhoneVerifyModal(phone); }, 200);
      } else {
        loadProfile();
      }
    });
  });

  /* -----------------------------------------------
     Phone Verification Modal
  ----------------------------------------------- */
  var phoneVerifyModal = document.getElementById('phone-verify-modal');
  var phoneVerifyCloseBtns = document.querySelectorAll('[data-close-phone-verify]');

  function openPhoneVerifyModal(phone) {
    if (!phoneVerifyModal) return;
    var input = document.getElementById('phone-verify-phone');
    if (input && phone) input.value = phone;
    phoneVerifyShowStep('phone');
    var errP = document.getElementById('phone-verify-phone-error'); if (errP) errP.style.display = 'none';
    var errO = document.getElementById('phone-verify-otp-error'); if (errO) errO.style.display = 'none';
    phoneVerifyModal.classList.add('is-open');
  }
  function closePhoneVerifyModal() { if (phoneVerifyModal) phoneVerifyModal.classList.remove('is-open'); }
  function phoneVerifyShowStep(s) {
    ['phone', 'otp', 'success'].forEach(function(name) {
      var el = document.getElementById('phone-verify-step-' + name);
      if (el) el.style.display = (name === s) ? 'block' : 'none';
    });
  }
  window.openPhoneVerifyModal = openPhoneVerifyModal;
  window.closePhoneVerifyModal = closePhoneVerifyModal;

  phoneVerifyCloseBtns.forEach(function(b) { b.addEventListener('click', closePhoneVerifyModal); });
  if (phoneVerifyModal) phoneVerifyModal.addEventListener('click', function(e) { if (e.target === phoneVerifyModal) closePhoneVerifyModal(); });

  var phoneSendForm = document.getElementById('phone-verify-phone-form');
  if (phoneSendForm) phoneSendForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var btn = document.getElementById('phone-verify-send-btn');
    var errEl = document.getElementById('phone-verify-phone-error');
    var phone = document.getElementById('phone-verify-phone').value.trim();
    if (!phone) return;
    btn.querySelector('.cnc-btn-spinner').style.display = 'inline-flex';
    errEl.style.display = 'none';
    CustomerAuth.apiRequest('POST', '/phone/send-otp', { phone: phone })
      .then(function(r) { return r.json().then(function(d) {
        if (!r.ok) throw new Error(d.error || 'Failed to send code');
        document.getElementById('phone-verify-phone-display').textContent = phone;
        phoneVerifyShowStep('otp');
      }); })
      .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
      .finally(function() { btn.querySelector('.cnc-btn-spinner').style.display = 'none'; });
  });

  var phoneOtpForm = document.getElementById('phone-verify-otp-form');
  if (phoneOtpForm) phoneOtpForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var btn = document.getElementById('phone-verify-otp-btn');
    var errEl = document.getElementById('phone-verify-otp-error');
    var phone = document.getElementById('phone-verify-phone').value.trim();
    var otp = document.getElementById('phone-verify-otp').value.trim();
    if (!otp) return;
    btn.querySelector('.cnc-btn-spinner').style.display = 'inline-flex';
    errEl.style.display = 'none';
    CustomerAuth.apiRequest('POST', '/phone/verify', { phone: phone, otp: otp })
      .then(function(r) { return r.json().then(function(d) {
        if (!r.ok) throw new Error(d.error || 'Invalid code');
        phoneVerifyShowStep('success');
        loadProfile();
        setTimeout(closePhoneVerifyModal, 1500);
      }); })
      .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
      .finally(function() { btn.querySelector('.cnc-btn-spinner').style.display = 'none'; });
  });

  var phoneResendBtn = document.getElementById('phone-verify-resend-btn');
  if (phoneResendBtn) phoneResendBtn.addEventListener('click', function() {
    var phone = document.getElementById('phone-verify-phone').value.trim();
    if (!phone) return;
    phoneResendBtn.textContent = 'Sending...';
    CustomerAuth.apiRequest('POST', '/phone/send-otp', { phone: phone })
      .then(function() { phoneResendBtn.textContent = 'Code resent!'; setTimeout(function() { phoneResendBtn.textContent = 'Resend code'; }, 3000); })
      .catch(function() { phoneResendBtn.textContent = 'Resend code'; });
  });

  var phoneBackBtn = document.getElementById('phone-verify-back-btn');
  if (phoneBackBtn) phoneBackBtn.addEventListener('click', function() { phoneVerifyShowStep('phone'); });

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
  // Suppression: popup hides if localStorage already has a valid saved
  // branch_id (cookie-loss-tolerant) OR if the server says it's satisfied.
  var BRANCH_LS_KEY    = 'tq_storefront_branch_id';
  var AREA_LS_KEY      = 'tq_storefront_area_id';
  var AREA_NAME_LS_KEY = 'tq_storefront_area_name';
  var ORDER_TYPE_LS_KEY = 'tq_storefront_order_type';

  function savedLocation() {
    try {
      return {
        areaId:    localStorage.getItem(AREA_LS_KEY),
        areaName:  localStorage.getItem(AREA_NAME_LS_KEY),
        branchId:  localStorage.getItem(BRANCH_LS_KEY),
        orderType: localStorage.getItem(ORDER_TYPE_LS_KEY),
      };
    } catch (e) { return {}; }
  }

  function updateAreaChip() {
    var chip = document.querySelector('[data-cb-area-chip]');
    if (!chip) return;
    var label = chip.querySelector('[data-cb-area-name]');
    var saved = savedLocation();
    if (label) label.textContent = saved.areaName || 'Choose area';
  }

  function initBranchPopup() {
    var saved = savedLocation();
    var chip = document.querySelector('[data-cb-area-chip]');
    if (chip) chip.addEventListener('click', function() { window.TQBranchSelector(); });
    updateAreaChip();
    if (saved.areaId || saved.branchId) return;
    if (typeof window.TQBranchSelector === 'function') {
      window.TQBranchSelector();
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
    var submitBtn = overlay.querySelector('[data-tq-submit-delivery]');
    var locateBtn = overlay.querySelector('[data-tq-locate]');
    var locateLabel = overlay.querySelector('[data-tq-locate-label]');
    var deliveryErr = overlay.querySelector('[data-tq-pane-error="delivery"]');
    var pickupErr = overlay.querySelector('[data-tq-pane-error="pickup"]');
    var tabs = overlay.querySelectorAll('[data-tq-tab]');
    var panes = overlay.querySelectorAll('[data-tq-pane]');

    var pCityInput  = overlay.querySelector('#tq-bs-pickup-city-input');
    var pBranchInput = overlay.querySelector('#tq-bs-pickup-branch-input');
    var pCityCombo  = overlay.querySelector('[data-tq-combo="pickup-city"]');
    var pBranchCombo = overlay.querySelector('[data-tq-combo="pickup-branch"]');
    var pCityOpts   = pCityCombo.querySelector('[data-tq-options]');
    var pBranchOpts = pBranchCombo.querySelector('[data-tq-options]');
    var pSubmitBtn  = overlay.querySelector('[data-tq-submit-pickup]');
    var pLocateBtn  = overlay.querySelector('[data-tq-locate-pickup]');
    var pLocateLabel = overlay.querySelector('[data-tq-locate-pickup-label]');

    var state = {
      cities: [], areasByCity: {}, cityId: null, areaId: null, areaName: null,
      userLat: null, userLng: null,
      pickupCities: [], pickupBranchesByCity: {}, pickupCity: null, pickupBranch: null, pickupLoaded: false,
    };

    function setError(msg, target) {
      var el = target === 'pickup' ? pickupErr : deliveryErr;
      if (!el) return;
      if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
      el.textContent = msg; el.style.display = 'block';
    }

    function switchTab(name) {
      tabs.forEach(function(t) {
        var active = t.getAttribute('data-tq-tab') === name;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panes.forEach(function(p) {
        p.style.display = p.getAttribute('data-tq-pane') === name ? 'block' : 'none';
      });
      if (name === 'pickup' && !state.pickupLoaded) loadPickupBranches();
    }

    function loadPickupBranches() {
      var data = getStorefrontData();
      var groups = (data && data.branches_by_city) || [];
      state.pickupCities = groups.map(function(g) { return { id: g.city, name: g.city }; });
      state.pickupBranchesByCity = {};
      groups.forEach(function(g) { state.pickupBranchesByCity[g.city] = g.branches || []; });
      state.pickupLoaded = true;
    }

    function filterPickupCities(query) {
      var q = (query || '').toLowerCase();
      var list = state.pickupCities.filter(function(c) { return c.name.toLowerCase().indexOf(q) !== -1; });
      renderOptions(list, pCityOpts, pickPickupCity);
    }
    function filterPickupBranches(query) {
      var branches = (state.pickupCity && state.pickupBranchesByCity[state.pickupCity]) || [];
      var q = (query || '').toLowerCase();
      var list = branches.filter(function(b) { return b.name.toLowerCase().indexOf(q) !== -1; });
      renderOptions(list, pBranchOpts, pickPickupBranch);
    }
    function pickPickupCity(c) {
      state.pickupCity = c.id;
      state.pickupBranch = null;
      pCityInput.value = c.name;
      pCityCombo.classList.remove('is-open');
      pBranchInput.value = '';
      pBranchInput.disabled = false;
      pBranchCombo.classList.remove('is-disabled');
      pSubmitBtn.disabled = true;
      filterPickupBranches('');
    }
    function pickPickupBranch(b) {
      state.pickupBranch = b;
      pBranchInput.value = b.name;
      pBranchCombo.classList.remove('is-open');
      pSubmitBtn.disabled = false;
      setError('', 'pickup');
    }

    function commitPickup() {
      var b = state.pickupBranch;
      if (!b) return;
      try {
        localStorage.setItem(BRANCH_LS_KEY, b.id);
        localStorage.setItem(AREA_NAME_LS_KEY, b.name);
        localStorage.setItem(ORDER_TYPE_LS_KEY, 'pickup');
        localStorage.removeItem(AREA_LS_KEY);
      } catch (e) {}
      pSubmitBtn.disabled = true;
      pSubmitBtn.textContent = 'Saving…';
      var fd = new FormData();
      fd.append('branch_id', b.id);
      fetch('/api/storefront/set-branch', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function() { window.location.reload(); })
        .catch(function() { window.location.reload(); });
    }

    tabs.forEach(function(t) { t.addEventListener('click', function() { switchTab(t.getAttribute('data-tq-tab')); }); });

    function open() {
      overlay.style.display = 'flex';
      requestAnimationFrame(function() { overlay.classList.add('is-open'); });
      document.documentElement.style.overflow = 'hidden';
      switchTab('delivery');
    }

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
      state.areaName = a.name;
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
          try {
            localStorage.setItem(BRANCH_LS_KEY, res.data.branch_id);
            if (state.areaId) localStorage.setItem(AREA_LS_KEY, state.areaId);
            if (state.areaName) localStorage.setItem(AREA_NAME_LS_KEY, state.areaName);
            localStorage.setItem(ORDER_TYPE_LS_KEY, 'delivery');
          } catch (e) {}
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

    pCityInput.addEventListener('focus', function() { filterPickupCities(pCityInput.value); pCityCombo.classList.add('is-open'); });
    pCityInput.addEventListener('input', function() { filterPickupCities(pCityInput.value); pCityCombo.classList.add('is-open'); state.pickupCity = null; pBranchInput.value = ''; pBranchInput.disabled = true; pBranchCombo.classList.add('is-disabled'); pSubmitBtn.disabled = true; });
    pCityInput.addEventListener('blur', function() { setTimeout(function() { pCityCombo.classList.remove('is-open'); }, 120); });

    pBranchInput.addEventListener('focus', function() { if (!pBranchInput.disabled) { filterPickupBranches(pBranchInput.value); pBranchCombo.classList.add('is-open'); } });
    pBranchInput.addEventListener('input', function() { filterPickupBranches(pBranchInput.value); pBranchCombo.classList.add('is-open'); state.pickupBranch = null; pSubmitBtn.disabled = true; });
    pBranchInput.addEventListener('blur', function() { setTimeout(function() { pBranchCombo.classList.remove('is-open'); }, 120); });

    pSubmitBtn.addEventListener('click', commitPickup);

    pLocateBtn.addEventListener('click', function() {
      if (!navigator.geolocation) { setError('Geolocation not supported on this browser.', 'pickup'); return; }
      pLocateBtn.disabled = true;
      pLocateLabel.textContent = 'Fetching Location…';
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          fetch('/api/storefront/service-areas/resolve-by-location', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
              if (!res.ok || !res.data || !res.data.city_name) {
                setError('Could not match your location to a city.', 'pickup');
              } else {
                var matched = state.pickupCities.find(function(c) { return c.name.toLowerCase() === String(res.data.city_name).toLowerCase(); });
                if (matched) { pickPickupCity(matched); setError('', 'pickup'); }
                else setError('No outlets in your city.', 'pickup');
              }
            })
            .catch(function() { setError('Network error — please try again.', 'pickup'); })
            .finally(function() { pLocateBtn.disabled = false; pLocateLabel.textContent = 'Use Current Location'; });
        },
        function(err) {
          pLocateBtn.disabled = false; pLocateLabel.textContent = 'Use Current Location';
          setError(err.code === 1 ? 'Permission denied for location.' : 'Could not get your location.', 'pickup');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });

    loadPickupBranches();

    fetch('/api/storefront/service-areas/cities', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        state.cities = d.cities || [];
        state.areasByCity = d.areas_by_city || {};
        if (state.cities.length === 0) {
          setError('No delivery areas configured yet.');
        }
        open();
      })
      .catch(function() { open(); });
  };
  initBranchPopup();

})();
