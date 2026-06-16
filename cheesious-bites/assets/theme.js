/* Cheesious Bites — minimal vanilla JS for header interactions + animations.
   No build step, no framework. Total ~3KB. */
(function () {
  'use strict';

  /* -----------------------------------------------
     TastiqoCart — client-side cart (localStorage)
  ----------------------------------------------- */
  var CART_KEY = 'tastiqo_cart';

  var TastiqoCart = {
    _read: function() {
      try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
      catch(e) { return []; }
    },
    _write: function(items) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
      this._notify();
    },
    _notify: function() {
      window.dispatchEvent(new CustomEvent('cart:updated'));
      this._updateBadge();
    },
    _updateBadge: function() {
      var count = this.getCount();
      var badges = document.querySelectorAll('[data-cb-cart-count]');
      badges.forEach(function(badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? '' : 'none';
      });
    },
    _generateId: function(product_id, modifiers) {
      var modIds = (modifiers || []).map(function(m) { return m.id; }).sort();
      return product_id + ':' + modIds.join(',');
    },
    getItems: function() { return this._read(); },
    addItem: function(item) {
      var items = this._read();
      var existing = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === item.id) { existing = items[i]; break; }
      }
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        items.push(item);
      }
      this._write(items);
    },
    updateQuantity: function(id, qty) {
      var items = this._read();
      if (qty <= 0) {
        items = items.filter(function(it) { return it.id !== id; });
      } else {
        for (var i = 0; i < items.length; i++) {
          if (items[i].id === id) { items[i].quantity = qty; break; }
        }
      }
      this._write(items);
    },
    removeItem: function(id) {
      var items = this._read().filter(function(it) { return it.id !== id; });
      this._write(items);
    },
    clear: function() {
      localStorage.removeItem(CART_KEY);
      this._notify();
    },
    getCount: function() {
      return this._read().reduce(function(sum, it) { return sum + it.quantity; }, 0);
    },
    getSubtotal: function() {
      return this._read().reduce(function(sum, it) { return sum + (it.unit_price * it.quantity); }, 0);
    }
  };

  // Expose globally for cross-page use
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

    onReady: function(cb) {
      if (this._ready) { cb(); return; }
      this._readyCallbacks.push(cb);
    },
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
      this._addrMap = L.map(container, { zoomControl: true, scrollWheelZoom: true }).setView(center, hasInitial ? 16 : 12);
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(this._addrMap);
      this._addrMarker = L.marker(center, { draggable: true }).addTo(this._addrMap);
      this._addrMap.on('click', function(e) { self._addrMarker.setLatLng(e.latlng); self._onAddrPinChanged(); });
      this._addrMarker.on('dragend', function() { self._onAddrPinChanged(); });
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
          if (hint) {
            hint.textContent = err.code === 1
              ? 'Permission denied — pin the location manually instead.'
              : 'Could not get your location — pin it manually.';
          }
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
        fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } })
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

  /* -----------------------------------------------
     Format price (paisa → Rs. X)
  ----------------------------------------------- */
  function formatMoney(paisa) {
    var amount = (paisa / 100).toFixed(2);
    // Remove trailing .00
    if (amount.endsWith('.00')) amount = amount.slice(0, -3);
    return 'Rs. ' + amount;
  }

  /* -----------------------------------------------
     Storefront data (injected by server into layout)
  ----------------------------------------------- */
  var _storefrontData = null;
  function getStorefrontData() {
    if (_storefrontData) return _storefrontData;
    try {
      var el = document.getElementById('storefront-data');
      if (el) _storefrontData = JSON.parse(el.textContent);
    } catch(e) {}
    return _storefrontData || {};
  }

  function getBranchId() {
    return getStorefrontData().branch_id || null;
  }

  /* -----------------------------------------------
     Checkout flow
  ----------------------------------------------- */
  function doCheckout() {
    if (!CustomerAuth.isLoggedIn()) {
      openAuthModal();
      return;
    }

    var items = TastiqoCart.getItems();
    if (!items.length) return;

    var branchId = getBranchId();
    if (!branchId) {
      showCheckoutError('Please select a branch first.');
      return;
    }

    // Require a selected delivery address with a valid pin — the rider
    // can't navigate without lat/lng.
    var addrId = window._cbSelectedAddressId;
    if (!addrId) {
      showCheckoutError('Please choose a delivery address before placing the order.');
      return;
    }
    var selectedAddr = (window._addressCache || []).find(function(a) { return a.id === addrId; });
    if (!selectedAddr || typeof selectedAddr.lat !== 'number' || typeof selectedAddr.lng !== 'number') {
      showCheckoutError('This address has no map pin. Tap "Adjust pin / edit" to drop one — the rider needs it to find you.');
      return;
    }

    var apiItems = items.map(function(it) {
      return {
        product_id: it.product_id,
        quantity: it.quantity,
        modifier_ids: (it.modifiers || []).map(function(m) { return m.id; }),
        notes: it.notes || ''
      };
    });

    var body = {
      branch_id: branchId,
      order_type: 'delivery',
      payment_method: 'cash',
      items: apiItems,
      address_id: addrId,
      customer_notes: ''
    };

    var checkoutBtn = document.getElementById('cb-checkout-btn');
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.textContent = 'Placing order...'; }

    fetch('/api/storefront/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CustomerAuth.getAccessToken()
      },
      body: JSON.stringify(body)
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'Failed to place order'); });
      return res.json();
    })
    .then(function() {
      TastiqoCart.clear();
      window.location.href = '/account/orders';
    })
    .catch(function(err) {
      showCheckoutError(err.message || 'Failed to place order. Please try again.');
      if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout →'; }
    });
  }

  function showCheckoutError(msg) {
    var el = document.getElementById('cb-checkout-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  /* -----------------------------------------------
     Add to Cart (Product Detail Page)
  ----------------------------------------------- */
  function initProductAddToCart() {
    var addBtn = document.getElementById('cb-add-to-cart-btn');
    if (!addBtn) return;

    var dataEl = document.getElementById('product-data');
    if (!dataEl) return;

    var product;
    try { product = JSON.parse(dataEl.textContent); } catch(e) { return; }

    // --- Real-time price updates ---
    var priceDisplay = document.querySelector('.cb-product-price');
    var qtyInput = document.querySelector('[data-cb-qty] input');

    function recalcTotalPrice() {
      var unitPrice = product.price;
      var checkedInputs = document.querySelectorAll('.cb-modifier-groups input:checked');
      checkedInputs.forEach(function(inp) {
        unitPrice += parseInt(inp.getAttribute('data-price-delta'), 10) || 0;
      });
      var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
      var lineTotal = unitPrice * qty;
      if (priceDisplay) priceDisplay.textContent = formatMoney(unitPrice);
      addBtn.textContent = 'Add to cart · ' + formatMoney(lineTotal);
    }

    // --- Enforce max selections on checkbox groups ---
    function enforceMaxSelections(groupEl) {
      var max = parseInt(groupEl.getAttribute('data-group-max'), 10) || 0;
      if (max <= 1) return; // radio groups handle themselves
      var checkboxes = groupEl.querySelectorAll('input[type="checkbox"]');
      var checkedCount = 0;
      checkboxes.forEach(function(cb) { if (cb.checked) checkedCount++; });
      checkboxes.forEach(function(cb) {
        if (!cb.checked && checkedCount >= max) {
          cb.disabled = true;
          cb.closest('.cb-modifier-option').classList.add('cb-modifier-disabled');
        } else {
          cb.disabled = false;
          cb.closest('.cb-modifier-option').classList.remove('cb-modifier-disabled');
        }
      });
    }

    // Listen for modifier changes
    var modifierInputs = document.querySelectorAll('.cb-modifier-option input[type="radio"], .cb-modifier-option input[type="checkbox"]');
    modifierInputs.forEach(function(inp) {
      inp.addEventListener('change', function() {
        recalcTotalPrice();
        var groupEl = inp.closest('.cb-modifier-group');
        if (groupEl) enforceMaxSelections(groupEl);
      });
    });

    // Enforce max on page load for pre-checked defaults
    document.querySelectorAll('.cb-modifier-group').forEach(function(g) { enforceMaxSelections(g); });

    // Listen for quantity changes
    if (qtyInput) {
      // Observe value changes from stepper buttons via MutationObserver on the input value
      var qtyStepButtons = document.querySelectorAll('[data-cb-qty] button[data-cb-qty-step]');
      qtyStepButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          // Delay slightly so the stepper updates the value first
          setTimeout(recalcTotalPrice, 0);
        });
      });
      qtyInput.addEventListener('input', recalcTotalPrice);
      qtyInput.addEventListener('change', recalcTotalPrice);
    }

    // Set initial button text with price
    recalcTotalPrice();

    addBtn.addEventListener('click', function() {
      // Validate required modifier groups
      var requiredGroups = document.querySelectorAll('.cb-modifier-group[data-group-required="true"]');
      var valid = true;
      requiredGroups.forEach(function(groupEl) {
        var groupId = groupEl.getAttribute('data-group-id');
        var checked = groupEl.querySelectorAll('input:checked');
        var min = parseInt(groupEl.getAttribute('data-group-min'), 10) || 1;
        var errEl = groupEl.querySelector('.cb-modifier-error');
        if (checked.length < min) {
          valid = false;
          groupEl.classList.add('cb-modifier-group-error');
          if (!errEl) {
            errEl = document.createElement('p');
            errEl.className = 'cb-modifier-error';
            errEl.style.cssText = 'color:#dc2626;font-size:0.8rem;margin-top:6px;';
            groupEl.appendChild(errEl);
          }
          var title = groupEl.querySelector('.cb-modifier-group-title');
          var name = title ? title.textContent.replace('Required', '').trim() : 'this option';
          errEl.textContent = 'Please select ' + name;
          errEl.style.display = 'block';
        } else {
          groupEl.classList.remove('cb-modifier-group-error');
          if (errEl) errEl.style.display = 'none';
        }
      });
      if (!valid) return;

      var quantity = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

      // Collect selected modifiers
      var modifiers = [];
      var modInputs = document.querySelectorAll('.cb-modifier-groups input:checked');
      modInputs.forEach(function(inp) {
        modifiers.push({
          id: inp.value,
          group_name: inp.getAttribute('data-group-name') || '',
          name: inp.getAttribute('data-option-name') || '',
          price_adjustment: parseInt(inp.getAttribute('data-price-delta'), 10) || 0
        });
      });

      // Calculate unit price = base price + modifier deltas
      var unitPrice = product.price;
      modifiers.forEach(function(m) { unitPrice += m.price_adjustment; });

      var cartId = TastiqoCart._generateId(product.id, modifiers);

      TastiqoCart.addItem({
        id: cartId,
        product_id: product.id,
        name: product.name,
        image_url: product.image_url || '',
        quantity: quantity,
        unit_price: unitPrice,
        modifiers: modifiers,
        notes: ''
      });

      // Visual feedback
      addBtn.textContent = 'Added!';
      addBtn.disabled = true;
      setTimeout(function() {
        addBtn.disabled = false;
        recalcTotalPrice();
      }, 1000);
    });
  }

  /* -----------------------------------------------
     Cart Page Rendering
  ----------------------------------------------- */
  function initCartPage() {
    var cartPage = document.querySelector('[data-cb-cart-page]');
    if (!cartPage) return;

    renderCart();
    renderDeliveryPicker();
    window.addEventListener('cart:updated', renderCart);

    var checkoutBtn = document.getElementById('cb-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', doCheckout);
    }
  }

  // Selected address for the in-flight checkout. Set by renderDeliveryPicker;
  // read by doCheckout. Kept on window for cross-call access without a
  // module-level closure.
  window._cbSelectedAddressId = null;

  function renderDeliveryPicker() {
    var container = document.getElementById('cb-delivery-picker');
    if (!container) return;

    if (!CustomerAuth.isLoggedIn()) {
      container.innerHTML =
        '<div style="border:1px solid var(--cb-border);border-radius:10px;padding:0.875rem;font-size:0.85rem;line-height:1.5;">' +
        '<strong>Sign in to add a delivery address.</strong><br>' +
        '<button type="button" class="cb-btn-link" id="cb-delivery-signin">Sign in</button>' +
        '</div>';
      var btn = document.getElementById('cb-delivery-signin');
      if (btn) btn.addEventListener('click', openAuthModal);
      return;
    }

    container.innerHTML = '<div style="font-size:0.85rem;color:var(--cb-text-muted);">Loading delivery addresses…</div>';

    CustomerAuth.apiRequest('GET', '/addresses').then(function(r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function(addrs) {
      window._addressCache = addrs || [];
      if (!addrs || !addrs.length) {
        container.innerHTML =
          '<div class="cb-checkout-addr-card no-pin">' +
          '<strong>No delivery address yet.</strong>' +
          '<div style="font-size:0.8rem;color:var(--cb-text-muted);margin:4px 0 8px;">Save an address with a map pin so the rider knows where to deliver.</div>' +
          '<button type="button" class="cb-btn cb-btn-primary cb-btn-sm" id="cb-delivery-add">Add delivery address</button>' +
          '</div>';
        var addBtn = document.getElementById('cb-delivery-add');
        if (addBtn) addBtn.addEventListener('click', function() { openAddressModal(null); });
        window._cbSelectedAddressId = null;
        return;
      }

      // Default to the rider-flagged default address, falling back to first.
      var defaultAddr = addrs.find(function(a) { return a.is_default; }) || addrs[0];
      window._cbSelectedAddressId = defaultAddr.id;

      var html = '<div style="font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;">Deliver to</div>';
      html += '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;">';
      addrs.forEach(function(a) {
        var checked = a.id === window._cbSelectedAddressId ? 'checked' : '';
        var pinBadge = (typeof a.lat === 'number' && typeof a.lng === 'number')
          ? '<span style="color:var(--cb-success);font-size:0.7rem;font-weight:700;">📍 PINNED</span>'
          : '<span style="color:var(--cb-warning,#F59E0B);font-size:0.7rem;font-weight:700;">⚠ NO PIN</span>';
        html +=
          '<label style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.625rem;border:1px solid var(--cb-border);border-radius:8px;cursor:pointer;">' +
            '<input type="radio" name="cb-delivery-addr" value="' + escHTML(a.id) + '" ' + checked + ' style="margin-top:3px;">' +
            '<div style="flex:1;font-size:0.85rem;line-height:1.4;">' +
              '<div style="font-weight:600;">' + escHTML(a.label || 'Address') + ' ' + pinBadge + '</div>' +
              '<div>' + escHTML(a.address_line1 || '') + '</div>' +
              '<button type="button" class="cb-btn-link" data-cb-adjust-pin="' + escHTML(a.id) + '" style="font-size:0.75rem;margin-top:4px;">Adjust pin / edit</button>' +
            '</div>' +
          '</label>';
      });
      html += '</div>';
      html += '<button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="cb-delivery-add" style="width:100%;">+ Add another address</button>';
      html += '<div id="cb-checkout-map" class="cb-checkout-map" style="display:none;"></div>';

      container.innerHTML = html;

      // Radio change → update selection + map preview
      container.querySelectorAll('input[name="cb-delivery-addr"]').forEach(function(input) {
        input.addEventListener('change', function() {
          window._cbSelectedAddressId = input.value;
          showSelectedAddrPin();
        });
      });
      // Adjust pin / edit → open modal in edit mode
      container.querySelectorAll('[data-cb-adjust-pin]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.getAttribute('data-cb-adjust-pin');
          var addr = (window._addressCache || []).find(function(a) { return a.id === id; });
          if (addr) openAddressModal(addr);
        });
      });
      var addBtn = document.getElementById('cb-delivery-add');
      if (addBtn) addBtn.addEventListener('click', function() { openAddressModal(null); });

      showSelectedAddrPin();
    }).catch(function() {
      container.innerHTML = '<div style="font-size:0.85rem;color:var(--cb-text-muted);">Could not load addresses.</div>';
    });
  }

  function showSelectedAddrPin() {
    var mapEl = document.getElementById('cb-checkout-map');
    if (!mapEl) return;
    var addr = (window._addressCache || []).find(function(a) { return a.id === window._cbSelectedAddressId; });
    if (addr && typeof addr.lat === 'number' && typeof addr.lng === 'number') {
      mapEl.style.display = 'block';
      TastiqoMap.onReady(function() {
        requestAnimationFrame(function() { TastiqoMap.showCheckoutPin('cb-checkout-map', addr.lat, addr.lng); });
      });
    } else {
      mapEl.style.display = 'none';
    }
  }

  // Re-render the picker after any address mutation (add / edit / delete).
  window.addEventListener('storage', function(e) {
    if (e.key === 'tastiqo_addresses_changed') renderDeliveryPicker();
  });

  function renderCart() {
    var filledEl = document.getElementById('cb-cart-filled');
    var emptyEl = document.getElementById('cb-cart-empty');
    var itemsEl = document.getElementById('cb-cart-items');
    var subtotalEl = document.getElementById('cb-cart-subtotal');
    var totalEl = document.getElementById('cb-cart-total');
    var errorEl = document.getElementById('cb-checkout-error');

    if (!filledEl || !emptyEl || !itemsEl) return;

    var items = TastiqoCart.getItems();

    if (!items.length) {
      filledEl.style.display = 'none';
      emptyEl.style.display = '';
      return;
    }

    filledEl.style.display = '';
    emptyEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    var html = '';
    items.forEach(function(item) {
      var lineTotal = item.unit_price * item.quantity;
      var modText = '';
      if (item.modifiers && item.modifiers.length) {
        modText = item.modifiers.map(function(m) { return m.name; }).join(', ');
      }
      html += '<div class="cb-cart-row">';
      if (item.image_url) {
        html += '<img src="' + escHTML(item.image_url) + '" alt="' + escHTML(item.name) + '">';
      } else {
        html += '<div class="cb-skeleton" style="width:80px;height:80px;border-radius:8px;"></div>';
      }
      html += '<div>';
      html += '<div class="cb-cart-name">' + escHTML(item.name) + '</div>';
      if (modText) html += '<div class="cb-cart-meta">' + escHTML(modText) + '</div>';
      html += '<div class="cb-cart-qty-controls" style="display:flex;align-items:center;gap:8px;margin-top:8px;">';
      html += '<button type="button" class="cb-qty-ctrl" data-cart-id="' + escHTML(item.id) + '" data-action="decrease" style="width:28px;height:28px;border:1px solid var(--cb-border);border-radius:6px;background:var(--cb-surface);color:var(--cb-text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>';
      html += '<span style="font-weight:600;min-width:20px;text-align:center;">' + item.quantity + '</span>';
      html += '<button type="button" class="cb-qty-ctrl" data-cart-id="' + escHTML(item.id) + '" data-action="increase" style="width:28px;height:28px;border:1px solid var(--cb-border);border-radius:6px;background:var(--cb-surface);color:var(--cb-text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>';
      html += '<button type="button" class="cb-qty-ctrl" data-cart-id="' + escHTML(item.id) + '" data-action="remove" style="background:none;border:none;color:var(--cb-error,#dc2626);font-size:0.8rem;cursor:pointer;margin-left:8px;font-weight:600;">Remove</button>';
      html += '</div>';
      html += '</div>';
      html += '<div style="font-weight:700;color:var(--cb-accent);white-space:nowrap;">' + formatMoney(lineTotal) + '</div>';
      html += '</div>';
    });

    itemsEl.innerHTML = html;

    var subtotal = TastiqoCart.getSubtotal();
    if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
    if (totalEl) totalEl.textContent = formatMoney(subtotal);

    // Wire up quantity controls
    itemsEl.querySelectorAll('.cb-qty-ctrl').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cartId = btn.getAttribute('data-cart-id');
        var action = btn.getAttribute('data-action');
        var current = TastiqoCart.getItems();
        var found = null;
        for (var i = 0; i < current.length; i++) {
          if (current[i].id === cartId) { found = current[i]; break; }
        }
        if (!found) return;
        if (action === 'increase') {
          TastiqoCart.updateQuantity(cartId, found.quantity + 1);
        } else if (action === 'decrease') {
          TastiqoCart.updateQuantity(cartId, found.quantity - 1);
        } else if (action === 'remove') {
          TastiqoCart.removeItem(cartId);
        }
      });
    });
  }

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

  var _currentProfile = null;
  function loadProfile() {
    CustomerAuth.apiRequest('GET', '/me').then(function(r) { if (!r.ok) return; return r.json(); }).then(function(c) {
      if (!c) return;
      _currentProfile = c;
      document.getElementById('account-name').textContent = c.full_name || '—';
      document.getElementById('account-email').textContent = c.email || '—';
      document.getElementById('account-phone').textContent = c.phone || '—';
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
      statusEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--cb-success);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">✓ Verified</span>';
    } else {
      statusEl.innerHTML = '<span style="background:var(--cb-warning,#F59E0B);color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">Unverified</span> <button type="button" class="cb-btn-link" id="account-verify-phone-btn" style="font-size:0.8rem;">Verify now</button>';
      var b = document.getElementById('account-verify-phone-btn');
      if (b) b.addEventListener('click', function() { openPhoneVerifyModal(c.phone); });
    }
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

    // Attach the map after Maps is ready. If still loading, defer.
    var initial = {
      lat: addr && typeof addr.lat === 'number' ? addr.lat : null,
      lng: addr && typeof addr.lng === 'number' ? addr.lng : null,
    };
    TastiqoMap.onReady(function() {
      // Google Maps needs the container to be visible (display:flex set above)
      // before it can size the canvas. requestAnimationFrame ensures layout
      // has flushed so the map renders at full width.
      requestAnimationFrame(function() { TastiqoMap.attachAddressPicker(initial); });
    });
  }

  function closeAddressModal() { if (addressModal) addressModal.style.display = 'none'; }

  if (addAddressBtn) addAddressBtn.addEventListener('click', function() { openAddressModal(null); });
  if (addressCloseBtn) addressCloseBtn.addEventListener('click', closeAddressModal);
  if (addressCancelBtn) addressCancelBtn.addEventListener('click', closeAddressModal);
  if (addressModal) addressModal.addEventListener('click', function(e) { if (e.target === addressModal) closeAddressModal(); });

  // "Use my current location" inside the address modal.
  var addrLocateBtn = document.getElementById('addr-locate-btn');
  if (addrLocateBtn) addrLocateBtn.addEventListener('click', function() { TastiqoMap.locateMe(); });

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
    var method = addrId ? 'PUT' : 'POST';
    var url = addrId ? '/addresses/' + addrId : '/addresses';
    var btn = document.getElementById('address-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    CustomerAuth.apiRequest(method, url, body).then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Failed'); });
      closeAddressModal();
      loadAddresses();
      // Refresh checkout picker if it's on the page.
      if (typeof renderDeliveryPicker === 'function') renderDeliveryPicker();
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
    var phone = (document.getElementById('profile-phone').value || '').trim() || null;
    var prevPhone = _currentProfile ? (_currentProfile.phone || null) : null;
    CustomerAuth.apiRequest('PUT', '/me', { full_name: name, phone: phone }).then(function(r) {
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
    btn.querySelector('.cb-btn-spinner').style.display = 'inline-flex';
    errEl.style.display = 'none';
    CustomerAuth.apiRequest('POST', '/phone/send-otp', { phone: phone })
      .then(function(r) { return r.json().then(function(d) {
        if (!r.ok) throw new Error(d.error || 'Failed to send code');
        document.getElementById('phone-verify-phone-display').textContent = phone;
        phoneVerifyShowStep('otp');
      }); })
      .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
      .finally(function() { btn.querySelector('.cb-btn-spinner').style.display = 'none'; });
  });

  var phoneOtpForm = document.getElementById('phone-verify-otp-form');
  if (phoneOtpForm) phoneOtpForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var btn = document.getElementById('phone-verify-otp-btn');
    var errEl = document.getElementById('phone-verify-otp-error');
    var phone = document.getElementById('phone-verify-phone').value.trim();
    var otp = document.getElementById('phone-verify-otp').value.trim();
    if (!otp) return;
    btn.querySelector('.cb-btn-spinner').style.display = 'inline-flex';
    errEl.style.display = 'none';
    CustomerAuth.apiRequest('POST', '/phone/verify', { phone: phone, otp: otp })
      .then(function(r) { return r.json().then(function(d) {
        if (!r.ok) throw new Error(d.error || 'Invalid code');
        phoneVerifyShowStep('success');
        loadProfile();
        setTimeout(closePhoneVerifyModal, 1500);
      }); })
      .catch(function(err) { errEl.textContent = err.message; errEl.style.display = 'block'; })
      .finally(function() { btn.querySelector('.cb-btn-spinner').style.display = 'none'; });
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

  /* -----------------------------------------------
     Branch Selector Popup (first visit)

     Suppression rules — popup is hidden if ANY of:
       1. data.show_branch_popup === false (server cookie picked up and matched a branch)
       2. localStorage has a saved branch_id matching one of the available
          branches — resilient against cookie loss (incognito, expiry,
          Fiber→net/http adapter quirks dropping Set-Cookie, etc.)
       3. there's only one branch

     On selection we save the branch_id to localStorage BEFORE the form
     posts, so even if the server-side Set-Cookie fails for any reason
     the popup won't come back next page load. The form still POSTs to
     /api/storefront/set-branch so SSR keeps the cookie as the canonical
     source of truth.
  ----------------------------------------------- */
  var BRANCH_LS_KEY = 'tq_storefront_branch_id';

  function getKnownBranchIds() {
    var ids = [];
    document.querySelectorAll('.cb-branch-row input[name="branch_id"], .cb-mobile-branch-row input[name="branch_id"]').forEach(function(input) {
      if (input.value) ids.push(input.value);
    });
    return ids;
  }

  function savedBranchValid(allIds) {
    try {
      var saved = localStorage.getItem(BRANCH_LS_KEY);
      return !!saved && allIds.indexOf(saved) !== -1;
    } catch (e) { return false; }
  }

  // Bind localStorage persistence to the inline branch-switcher forms in
  // the header (and mobile drawer) so a tap there ALSO suppresses the
  // popup on later visits. Runs once at page load — not behind the
  // show_popup gate so it always wires up.
  function bindHeaderBranchPersistence() {
    document.querySelectorAll('.cb-branch-row, .cb-mobile-branch-row').forEach(function(f) {
      if (f.tagName !== 'FORM') return;
      var inp = f.querySelector('input[name="branch_id"]');
      if (!inp) return;
      f.addEventListener('submit', function() {
        try { localStorage.setItem(BRANCH_LS_KEY, inp.value || ''); } catch (e) {}
      });
    });
  }
  bindHeaderBranchPersistence();

  function initBranchPopup() {
    var data = getStorefrontData();
    if (data.branch_count <= 1) return;
    var ids = getKnownBranchIds();
    // Client-side suppression wins — even if the server still says
    // show_branch_popup=true (cookie lost / not yet round-tripped), a
    // valid saved branch in localStorage means "user already chose."
    if (savedBranchValid(ids)) return;
    if (!data.show_branch_popup) return;

    var branchForms = document.querySelectorAll('.cb-branch-menu .cb-branch-row, .cb-mobile-branches .cb-mobile-branch-row');
    if (!branchForms.length) return;

    var overlay = document.createElement('div');
    overlay.className = 'cb-branch-popup-overlay';

    var modal = document.createElement('div');
    modal.className = 'cb-branch-popup';

    var html = '<div class="cb-branch-popup-icon">📍</div>';
    html += '<h2 class="cb-branch-popup-title">Select Your Branch</h2>';
    html += '<p class="cb-branch-popup-desc">Choose a branch near you for accurate menu and pricing.</p>';
    html += '<div class="cb-branch-popup-list">';

    branchForms.forEach(function(form) {
      if (form.classList.contains('cb-mobile-branch-row')) return; // skip duplicates from mobile drawer
      var branchId = form.querySelector('input[name="branch_id"]');
      var nameEl = form.querySelector('.cb-branch-row-name');
      var addrEl = form.querySelector('.cb-branch-row-addr');
      var pillEl = form.querySelector('.cb-pill');
      if (!branchId || !nameEl) return;

      html += '<form method="post" action="/api/storefront/set-branch" class="cb-branch-popup-item" data-branch-id="' + escHTML(branchId.value) + '">';
      html += '<input type="hidden" name="branch_id" value="' + escHTML(branchId.value) + '">';
      html += '<button type="submit">';
      html += '<div class="cb-branch-popup-item-name">' + escHTML(nameEl.textContent) + '</div>';
      if (addrEl) html += '<div class="cb-branch-popup-item-addr">' + escHTML(addrEl.textContent) + '</div>';
      if (pillEl) html += '<span class="' + escHTML(pillEl.className) + '">' + escHTML(pillEl.textContent) + '</span>';
      html += '</button>';
      html += '</form>';
    });

    html += '</div>';
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Persist the choice to localStorage BEFORE the form submits.
    overlay.querySelectorAll('form[data-branch-id]').forEach(function(f) {
      f.addEventListener('submit', function() {
        try { localStorage.setItem(BRANCH_LS_KEY, f.getAttribute('data-branch-id') || ''); } catch (e) {}
      });
    });

    requestAnimationFrame(function() {
      overlay.classList.add('is-open');
    });
  }

  /* -----------------------------------------------
     Initialize Cart Features
  ----------------------------------------------- */
  TastiqoCart._updateBadge();
  initProductAddToCart();
  initCartPage();
  initBranchPopup();

})();
