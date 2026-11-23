/* =================================================================
   Tastiqo Bold — storefront script (vanilla, no libraries).
   Cart (localStorage) · quick add + options pop-up · order type and
   branch / delivery area · sticky category tabs with scroll spy · menu
   search · checkout · sign in with email code · orders and tracking ·
   theme-editor live preview hooks.
   Every network call goes to this storefront's own /api/storefront/*
   (and /api/track) endpoints; the server re-prices every order.
   ================================================================= */

/* >>> tq-merch carousel (generated, keep in sync across themes) */
/* ===============================================================
   Tastiqo carousel (shared by hero-carousel, deals and showcase
   sections). Vanilla, dependency-free, ~2 KB.

   Markup contract (see sections/hero-carousel.liquid):
     [data-tq-carousel]            root; data-autoplay="true|false",
                                   data-interval="<seconds>"
       [data-tq-track]             horizontal scroll-snap container
         > children                one per slide (data-block-id optional)
       [data-tq-prev] [data-tq-next]   optional arrow buttons
       [data-tq-dot="<index>"]     optional dot buttons
       [data-tq-toggle]            optional play/pause button

   Works without JS (native swipe/scroll-snap). With JS: arrows, dots,
   keyboard, autoplay that pauses on hover/focus/hidden tab and is off
   for prefers-reduced-motion. Re-initialises when the theme editor
   swaps a section (tastiqo:section:load) and jumps to a slide when
   the owner selects its block (tastiqo:block:select).
   =============================================================== */
(function () {
  if (window.TQCarousel) return;
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function init(root) {
    if (!root || root.__tqCarousel) return;
    var track = root.querySelector('[data-tq-track]');
    if (!track) return;
    var slides = Array.prototype.slice.call(track.children);
    var n = slides.length;
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-tq-dot]'));
    var prev = root.querySelector('[data-tq-prev]');
    var next = root.querySelector('[data-tq-next]');
    var toggle = root.querySelector('[data-tq-toggle]');
    var interval = Math.max(3, parseFloat(root.getAttribute('data-interval')) || 5) * 1000;
    var autoplay = root.getAttribute('data-autoplay') === 'true' && !reduceMotion && n > 1;
    // data-tq-row: a row of several cards (deals, showcase) — arrows page
    // by the visible width, no dots / autoplay / inert slides.
    var row = root.hasAttribute('data-tq-row');
    if (row) autoplay = false;
    var idx = 0, timer = null, userPaused = !autoplay, hovering = false, focused = false;
    var api = { go: go, pause: function () { setUserPaused(true); } };
    root.__tqCarousel = api;
    root.style.setProperty('--tq-interval', interval + 'ms');
    if (!autoplay && toggle) toggle.hidden = true;

    function rtl() { return getComputedStyle(track).direction === 'rtl'; }
    function go(i, instant) {
      if (!n) return;
      i = ((i % n) + n) % n;
      var target = slides[i];
      var left = target.offsetLeft - track.offsetLeft;
      if (rtl()) left = -(track.scrollWidth - track.clientWidth - left);
      track.scrollTo({ left: left, behavior: (instant || reduceMotion) ? 'auto' : 'smooth' });
      setActive(i);
    }
    function setActive(i) {
      if (i === idx && root.__tqStarted) return;
      root.__tqStarted = true;
      idx = i;
      for (var d = 0; d < dots.length; d++) {
        var on = d === i;
        dots[d].setAttribute('aria-current', on ? 'true' : 'false');
        dots[d].classList.remove('is-active');
        if (on) { void dots[d].offsetWidth; dots[d].classList.add('is-active'); }
      }
      if (!row) {
        for (var s = 0; s < n; s++) {
          if (s === i) { slides[s].removeAttribute('inert'); slides[s].removeAttribute('aria-hidden'); }
          else { slides[s].setAttribute('inert', ''); slides[s].setAttribute('aria-hidden', 'true'); }
        }
      }
      schedule();
    }
    function playing() { return autoplay && !userPaused && !hovering && !focused && !document.hidden; }
    function schedule() {
      clearTimeout(timer);
      root.classList.toggle('is-playing', playing());
      track.setAttribute('aria-live', playing() ? 'off' : 'polite');
      if (playing()) timer = setTimeout(function () { go(idx + 1); }, interval);
    }
    function setUserPaused(p) {
      userPaused = p;
      if (toggle) {
        toggle.setAttribute('aria-pressed', p ? 'true' : 'false');
        toggle.setAttribute('aria-label', p ? (toggle.getAttribute('data-label-play') || 'Play slideshow') : (toggle.getAttribute('data-label-pause') || 'Pause slideshow'));
      }
      schedule();
    }

    function page(dir) {
      var dx = track.clientWidth * 0.9 * dir * (rtl() ? -1 : 1);
      track.scrollBy({ left: dx, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    if (prev) prev.addEventListener('click', function () { row ? page(-1) : go(idx - 1); });
    if (next) next.addEventListener('click', function () { row ? page(1) : go(idx + 1); });
    if (row) {
      var sync = function () {
        var max = track.scrollWidth - track.clientWidth - 2;
        var pos = Math.abs(track.scrollLeft);
        if (prev) prev.disabled = pos <= 2;
        if (next) next.disabled = pos >= max;
      };
      track.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
      return;
    }
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () { go(parseInt(dot.getAttribute('data-tq-dot'), 10) || 0); });
    });
    if (toggle) toggle.addEventListener('click', function () { setUserPaused(!userPaused); });
    root.addEventListener('mouseenter', function () { hovering = true; schedule(); });
    root.addEventListener('mouseleave', function () { hovering = false; schedule(); });
    root.addEventListener('focusin', function () { focused = true; schedule(); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { focused = false; schedule(); } });
    track.addEventListener('touchstart', function () { setUserPaused(true); }, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    root.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var back = rtl() ? 'ArrowRight' : 'ArrowLeft';
      var fwd = rtl() ? 'ArrowLeft' : 'ArrowRight';
      if (e.key === back) { e.preventDefault(); go(idx - 1); }
      else if (e.key === fwd) { e.preventDefault(); go(idx + 1); }
    });

    // Keep dots in sync with manual swipes / scrolls.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.6) {
            var i = slides.indexOf(en.target);
            if (i >= 0 && i !== idx) setActive(i);
          }
        });
      }, { root: track, threshold: [0.6] });
      slides.forEach(function (s) { io.observe(s); });
    }
    setActive(0);
  }

  function initAll(scope) {
    var list = (scope || document).querySelectorAll ? (scope || document).querySelectorAll('[data-tq-carousel]') : [];
    if (scope && scope.matches && scope.matches('[data-tq-carousel]')) init(scope);
    for (var i = 0; i < list.length; i++) init(list[i]);
  }

  window.TQCarousel = { init: init, initAll: initAll };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }
  document.addEventListener('tastiqo:section:load', function (e) { initAll(e.detail && e.detail.target); });
  document.addEventListener('tastiqo:block:select', function (e) {
    var el = e.detail && e.detail.target;
    if (!el || !el.closest) return;
    var root = el.closest('[data-tq-carousel]');
    if (!root || !root.__tqCarousel) return;
    var track = root.querySelector('[data-tq-track]');
    var slide = el.closest('[data-tq-track] > *');
    var i = Array.prototype.indexOf.call(track.children, slide);
    if (i >= 0) { root.__tqCarousel.pause(); root.__tqCarousel.go(i, true); }
  });
})();
/* <<< tq-merch carousel */

(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var DATA = {};
  try { DATA = JSON.parse(d.getElementById('tb-data').textContent) || {}; } catch (e) { DATA = {}; }
  var EDITOR = !!DATA.editor;
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function on(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var store = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ── Money: same layout as the server (money.Format) ─────────── */
  var MINOR = DATA.minor || 100, CUR = String(DATA.currency || 'PKR').toUpperCase(), SYM = DATA.symbol || CUR;
  var EXP = Math.round(Math.log(MINOR) / Math.LN10);
  function money(minor) {
    minor = Math.round(Number(minor) || 0);
    var neg = minor < 0; minor = Math.abs(minor);
    var whole = String(Math.floor(minor / MINOR)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var frac = minor % MINOR, f = '';
    if (EXP > 0 && (frac !== 0 || CUR !== 'PKR')) { f = '.' + String(frac).padStart(EXP, '0'); }
    var attached = ['€', '£', '$', '₺', '₴', '₾'].indexOf(SYM) >= 0;
    return (neg ? '-' : '') + (attached ? SYM + whole + f : SYM + ' ' + whole + f);
  }

  /* ── Toast ───────────────────────────────────────────────────── */
  var toastEl = $('[data-tb-toast]'), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ── Dialogs (native <dialog>: focus trap, Esc, inert page) ──── */
  var lastFocus = null;
  function openDialog(dlg) {
    if (!dlg || dlg.open) return;
    lastFocus = d.activeElement;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  d.addEventListener('close', function (e) {
    if (e.target && e.target.tagName === 'DIALOG' && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (x) {} }
  }, true);
  d.addEventListener('click', function (e) {
    var t = e.target;
    if (t.tagName === 'DIALOG' && t.open) { // backdrop click
      var r = t.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(t);
    }
    var closer = t.closest && t.closest('[data-tb-close]');
    if (closer) { closeDialog(closer.closest('dialog')); }
    var opener = t.closest && t.closest('[data-tb-open-dialog]');
    if (opener) { e.preventDefault(); openDialog(d.getElementById(opener.getAttribute('data-tb-open-dialog'))); }
  });

  /* ── Cart ────────────────────────────────────────────────────── */
  var CART_KEY = 'tb_cart_v1';
  var Cart = {
    items: store.get(CART_KEY, []),
    save: function () { store.set(CART_KEY, this.items); renderCart(); },
    count: function () { return this.items.reduce(function (n, i) { return n + i.qty; }, 0); },
    subtotal: function () { return this.items.reduce(function (n, i) { return n + i.unit * i.qty; }, 0); },
    add: function (line) {
      var key = line.id + '|' + (line.mods || []).map(function (m) { return m.id; }).sort().join(',') + '|' + (line.notes || '');
      var ex = this.items.filter(function (i) { return i.key === key; })[0];
      if (ex) ex.qty = Math.min(99, ex.qty + line.qty); else { line.key = key; this.items.push(line); }
      this.save();
    },
    setQty: function (key, qty) {
      this.items = this.items.filter(function (i) { if (i.key === key) i.qty = qty; return i.qty > 0; });
      this.save();
    },
    clear: function () { this.items = []; this.save(); }
  };
  if (!Array.isArray(Cart.items)) Cart.items = [];

  function lineHTML(i, small) {
    var mods = (i.mods || []).map(function (m) { return esc(m.label); }).join(', ');
    return '<div class="tb-line">' +
      (i.image ? '<img class="tb-line__img" src="' + esc(i.image) + '" alt="" width="56" height="56" loading="lazy">' : '<span class="tb-line__img" aria-hidden="true"></span>') +
      '<div><div class="tb-line__name">' + esc(i.name) + '</div>' +
      (mods ? '<div class="tb-line__mods">' + mods + '</div>' : '') +
      (i.notes ? '<div class="tb-line__mods">“' + esc(i.notes) + '”</div>' : '') + '</div>' +
      '<div class="tb-line__side"><span class="tb-line__price">' + money(i.unit * i.qty) + '</span>' +
      '<div class="tb-qty tb-qty--sm"><button type="button" class="tb-qty__btn" data-tb-line="' + esc(i.key) + '" data-d="-1" aria-label="One less ' + esc(i.name) + '"><svg class="tb-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>' +
      '<span class="tb-qty__val" aria-label="Quantity">' + i.qty + '</span>' +
      '<button type="button" class="tb-qty__btn" data-tb-line="' + esc(i.key) + '" data-d="1" aria-label="One more ' + esc(i.name) + '"><svg class="tb-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div></div></div>';
  }

  function renderCart() {
    var n = Cart.count(), sub = Cart.subtotal();
    $$('[data-tb-cart-count]').forEach(function (el) { el.textContent = n; });
    $$('[data-tb-cart-total]').forEach(function (el) { el.textContent = n ? money(sub) : (el.closest('.tb-tabbar') ? 'Cart' : ''); });
    $$('[data-tb-open-cart]').forEach(function (el) { el.setAttribute('aria-label', n ? 'Open cart, ' + n + ' item' + (n === 1 ? '' : 's') + ', ' + money(sub) : 'Open cart, empty'); });
    $$('[data-tb-floatcart]').forEach(function (el) { el.hidden = n === 0; });
    var lines = $('[data-tb-cart-lines]'), foot = $('[data-tb-cart-foot]');
    if (lines) {
      lines.innerHTML = n ? Cart.items.map(function (i) { return lineHTML(i); }).join('') : '<p class="tb-empty">Your cart is empty. Add something tasty!</p>';
      if (foot) foot.hidden = !n;
      var st = $('[data-tb-cart-subtotal]'); if (st) st.textContent = money(sub);
    }
    renderCheckout();
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tb-line]');
    if (!b) return;
    var key = b.getAttribute('data-tb-line'), it = Cart.items.filter(function (i) { return i.key === key; })[0];
    if (it) Cart.setQty(key, Math.max(0, Math.min(99, it.qty + Number(b.getAttribute('data-d')))));
  });
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tb-open-cart]');
    if (!b) return;
    e.preventDefault();
    if (location.pathname === '/cart' || location.pathname === '/checkout') { var c = $('[data-tb-checkout]'); if (c) c.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
    openDialog($('[data-tb-cart-drawer]'));
  });
  function bump() {
    $$('.tb-cartbtn, .tb-floatcart').forEach(function (el) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); });
  }

  /* ── Item form: options with min / max rules ─────────────────── */
  function groupsHTML(groups) {
    return (groups || []).map(function (g) {
      var max = Number(g.max) || 0, min = Number(g.min) || 0, multi = max !== 1;
      var rule = (g.required || min > 0 ? 'Required' : 'Optional') + (max === 1 ? ' · choose 1' : (max > 1 ? ' · up to ' + max : ''));
      return '<fieldset class="tb-group" data-tb-group data-id="' + esc(g.id) + '" data-min="' + min + '" data-max="' + max + '" data-required="' + (!!g.required) + '">' +
        '<legend class="tb-group__title">' + esc(g.title) + ' <span class="tb-group__rule">' + rule + '</span></legend>' +
        (g.options || []).map(function (o) {
          return '<label class="tb-opt"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="g-' + esc(g.id) + '" value="' + esc(o.id) + '" data-price="' + (Number(o.price_delta) || 0) + '" data-label="' + esc(o.label) + '"' + (o.is_default && !multi ? ' checked' : '') + '>' +
            '<span class="tb-opt__label">' + esc(o.label) + '</span>' + (o.price_delta > 0 ? '<span class="tb-opt__price">+' + money(o.price_delta) + '</span>' : '') + '</label>';
        }).join('') + '</fieldset>';
    }).join('');
  }

  function bindItemForm(form, item, onDone) {
    if (!form || form.__tb) return; form.__tb = true;
    var qty = 1, qv = $('[data-tb-qty-val]', form), submit = $('[data-tb-item-submit]', form), err = $('[data-tb-item-error]', form);
    function selected() {
      var mods = [], unit = Number(item.price) || 0;
      $$('[data-tb-group] input:checked', form).forEach(function (inp) { unit += Number(inp.getAttribute('data-price')) || 0; mods.push({ id: inp.value, label: inp.getAttribute('data-label') }); });
      return { mods: mods, unit: unit };
    }
    function enforce() {
      $$('[data-tb-group]', form).forEach(function (g) {
        var max = Number(g.getAttribute('data-max')) || 0, boxes = $$('input[type=checkbox]', g);
        if (!boxes.length || max < 1) return;
        var n = boxes.filter(function (b) { return b.checked; }).length;
        boxes.forEach(function (b) { b.disabled = !b.checked && n >= max; });
      });
    }
    function refresh() {
      enforce();
      var s = selected();
      if (qv) qv.textContent = qty;
      if (submit) submit.textContent = 'Add to order · ' + money(s.unit * qty);
    }
    function validate() {
      var bad = null;
      $$('[data-tb-group]', form).forEach(function (g) {
        var min = Number(g.getAttribute('data-min')) || 0;
        if (g.getAttribute('data-required') === 'true' && min < 1) min = 1;
        var n = $$('input:checked', g).length, ok = n >= min;
        g.classList.toggle('is-invalid', !ok);
        if (!ok && !bad) bad = g;
      });
      return bad;
    }
    on(form, 'change', function () { if (err) err.hidden = true; $$('.is-invalid', form).forEach(function (g) { g.classList.remove('is-invalid'); }); refresh(); });
    on(form, 'click', function (e) {
      var st = e.target.closest('[data-tb-step]');
      if (st) { qty = Math.max(1, Math.min(99, qty + Number(st.getAttribute('data-tb-step')))); refresh(); }
    });
    on(form, 'submit', function (e) {
      e.preventDefault();
      var bad = validate();
      if (bad) {
        if (err) { var min = Number(bad.getAttribute('data-min')) || 1; err.textContent = 'Please choose ' + (min > 1 ? min + ' options' : 'an option') + ' for “' + $('legend', bad).firstChild.textContent.trim() + '”.'; err.hidden = false; }
        var first = $('input', bad); if (first) first.focus();
        return;
      }
      var s = selected(), notes = form.elements.notes ? form.elements.notes.value.trim() : '';
      Cart.add({ id: item.id, name: item.name, image: item.image || '', url: item.url || '', unit: s.unit, qty: qty, mods: s.mods, notes: notes });
      toast(qty + ' × ' + item.name + ' added');
      bump();
      if (onDone) onDone();
      qty = 1; if (form.elements.notes) form.elements.notes.value = ''; refresh();
    });
    refresh();
  }

  var itemModal = $('[data-tb-item-modal]');
  function openItemModal(item, groups) {
    if (!itemModal) return;
    var form = $('[data-tb-item-form]', itemModal);
    var fresh = form.cloneNode(true); form.parentNode.replaceChild(fresh, form); form = fresh;
    $('[data-tb-item-name]', form).textContent = item.name;
    $('[data-tb-item-base]', form).textContent = item.priceMoney || money(item.price);
    $('[data-tb-item-media]', form).innerHTML = item.image ? '<img src="' + esc(item.image) + '" alt="" width="800" height="450">' : '';
    $('[data-tb-item-groups]', form).innerHTML = groupsHTML(groups);
    var err = $('[data-tb-item-error]', form); if (err) err.hidden = true;
    bindItemForm(form, item, function () { closeDialog(itemModal); });
    openDialog(itemModal);
  }
  function itemFromEl(el) {
    return { id: el.getAttribute('data-id'), name: el.getAttribute('data-name'), price: Number(el.getAttribute('data-price')) || 0, priceMoney: el.getAttribute('data-price-money'), image: el.getAttribute('data-image'), url: el.getAttribute('data-url') };
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tq-add]');
    if (!b) return;
    e.preventDefault();
    var item = itemFromEl(b), modsEl = b.parentNode && b.parentNode.querySelector('script[data-tq-mods]'), groups = [];
    if (modsEl) { try { groups = JSON.parse(modsEl.textContent) || []; } catch (x) { groups = []; } }
    if (groups.length) { openItemModal(item, groups); return; }
    Cart.add({ id: item.id, name: item.name, image: item.image, url: item.url, unit: item.price, qty: 1, mods: [], notes: '' });
    b.classList.remove('is-added'); void b.offsetWidth; b.classList.add('is-added');
    toast(item.name + ' added'); bump();
  });
  var pageForm = $('[data-tb-item-page]');
  if (pageForm) bindItemForm(pageForm, itemFromEl(pageForm));

  /* ── Order type + branch / delivery area ─────────────────────── */
  var MODE_KEY = 'tq_storefront_order_type', AREA_KEY = 'tq_storefront_area_id', AREA_INFO = 'tb_area_info';
  var mode = store.get(MODE_KEY, null);
  if (mode !== 'pickup' && mode !== 'delivery') { try { mode = localStorage.getItem(MODE_KEY); } catch (e) {} }
  if (mode !== 'pickup') mode = 'delivery';
  var area = store.get(AREA_INFO, null); // {id, name, city, fee, min, lat, lng}
  var ICONS = { delivery: '<svg class="tb-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h6.8l2.2-7H14M4 13h6l1.5 4M14 6h2.5l1 4"/></svg>', pickup: '<svg class="tb-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M10 20v-5h4v5"/></svg>' };
  function setMode(m, silent) {
    mode = m === 'pickup' ? 'pickup' : 'delivery';
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    renderMode();
    if (!silent) renderCheckout();
  }
  function placeLabel() {
    var b = DATA.branch || {};
    if (mode === 'pickup') return b.name || 'Choose a branch';
    if (area && area.name) return area.name + (area.city ? ', ' + area.city : '');
    return null;
  }
  function renderMode() {
    $$('[data-tb-set-mode]').forEach(function (el) { el.setAttribute('aria-checked', String(el.getAttribute('data-tb-set-mode') === mode)); });
    $$('[data-tb-mode-label]').forEach(function (el) { el.textContent = mode === 'pickup' ? 'Pickup' : 'Delivery'; });
    $$('[data-tb-mode-icon]').forEach(function (el) { el.innerHTML = ICONS[mode]; });
    $$('[data-tb-place-prefix]').forEach(function (el) { el.textContent = mode === 'pickup' ? 'Pick up from' : 'Deliver to'; });
    var label = placeLabel();
    $$('[data-tb-place-label]').forEach(function (el) {
      if (!el.__def) el.__def = el.textContent;
      el.textContent = label || (mode === 'delivery' ? 'Choose your area' : el.__def);
    });
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tb-set-mode]');
    if (!b || b.closest('[data-tb-location-modal]')) return;
    setMode(b.getAttribute('data-tb-set-mode'));
    if (mode === 'delivery' && !area && !EDITOR) openLocation();
    if (mode === 'pickup' && (DATA.branches || []).length > 1 && !EDITOR && !store.get('tb_branch_chosen', false)) openLocation();
  });
  // radio-group arrow keys
  d.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('[role=radiogroup] [role=radio]');
    if (!b || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    var all = $$('[role=radio]', b.parentNode), i = all.indexOf(b), n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
    n.focus(); n.click(); e.preventDefault();
  });

  var locModal = $('[data-tb-location-modal]'), locMode = mode, areasCache = null;
  function setBranch(branchId) {
    var fd = new FormData(); fd.append('branch_id', branchId);
    store.set('tb_branch_chosen', true);
    if (EDITOR) return Promise.resolve();
    return fetch('/api/storefront/set-branch', { method: 'POST', body: fd, credentials: 'same-origin', redirect: 'manual' })
      .then(function () { if (!DATA.branch || DATA.branch.id !== branchId) location.reload(); });
  }
  function loadAreas() {
    if (areasCache) return Promise.resolve(areasCache);
    return fetch('/api/storefront/service-areas/cities', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : { cities: [] }; })
      .then(function (j) { areasCache = j || { cities: [] }; return areasCache; }).catch(function () { return { cities: [] }; });
  }
  function renderLocModal() {
    if (!locModal) return;
    $$('[data-tb-set-mode]', locModal).forEach(function (el) { el.setAttribute('aria-checked', String(el.getAttribute('data-tb-set-mode') === locMode)); });
    $('[data-tb-loc-delivery]', locModal).hidden = locMode !== 'delivery';
    $('[data-tb-loc-pickup]', locModal).hidden = locMode !== 'pickup';
    var err = $('[data-tb-loc-error]', locModal); err.hidden = true;
    if (locMode === 'delivery') {
      var citySel = $('[data-tb-city]', locModal), areaSel = $('[data-tb-area]', locModal), info = $('[data-tb-area-info]', locModal);
      loadAreas().then(function (j) {
        var cities = j.cities || [];
        if (!cities.length) { citySel.innerHTML = '<option value="">No delivery areas yet</option>'; citySel.disabled = true; areaSel.disabled = true; info.textContent = 'Online delivery is not set up yet. Choose Pickup, or call us to order.'; return; }
        citySel.disabled = false;
        var cur = area && area.city_id;
        citySel.innerHTML = '<option value="">Choose your city</option>' + cities.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
        function fillAreas() {
          var list = (j.areas_by_city || {})[citySel.value] || [];
          areaSel.disabled = !list.length;
          areaSel.innerHTML = '<option value="">' + (citySel.value ? 'Choose your area' : 'Choose your city first') + '</option>' + list.map(function (a) { return '<option value="' + esc(a.id) + '"' + (area && a.id === area.id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('');
          showInfo();
        }
        function showInfo() {
          var a = ((j.areas_by_city || {})[citySel.value] || []).filter(function (x) { return x.id === areaSel.value; })[0];
          info.textContent = a ? 'Delivery fee ' + (a.delivery_fee ? money(a.delivery_fee) : 'free') + (a.min_order ? ' · minimum order ' + money(a.min_order) : '') : '';
        }
        citySel.onchange = fillAreas; areaSel.onchange = showInfo;
        fillAreas();
      });
    }
  }
  function openLocation() { if (!locModal) return; locMode = mode; renderLocModal(); openDialog(locModal); }
  d.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-tb-open-location]')) { e.preventDefault(); openLocation(); }
  });
  if (locModal) {
    on(locModal, 'click', function (e) {
      var b = e.target.closest('[data-tb-set-mode]');
      if (b) { locMode = b.getAttribute('data-tb-set-mode'); renderLocModal(); }
    });
    on($('[data-tb-loc-save]', locModal), 'click', function () {
      var err = $('[data-tb-loc-error]', locModal);
      function fail(m) { err.textContent = m; err.hidden = false; }
      if (locMode === 'pickup') {
        var r = $('input[name="tb-branch"]:checked', locModal);
        if (!r) return fail('Please choose a branch.');
        setMode('pickup'); closeDialog(locModal);
        return setBranch(r.value);
      }
      var citySel = $('[data-tb-city]', locModal), areaSel = $('[data-tb-area]', locModal);
      if (!areaSel.value) return fail('Please choose your area.');
      var j = areasCache || {}, a = ((j.areas_by_city || {})[citySel.value] || []).filter(function (x) { return x.id === areaSel.value; })[0];
      var city = (j.cities || []).filter(function (c) { return c.id === citySel.value; })[0];
      fetch('/api/storefront/service-areas/resolve-branch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ area_id: areaSel.value }) })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (!res.ok) return fail(res.body && res.body.error ? res.body.error : 'Sorry, we do not deliver there yet.');
          area = { id: a.id, name: a.name, city: city ? city.name : '', city_id: citySel.value, fee: a.delivery_fee, min: a.min_order, lat: a.lat, lng: a.lng };
          store.set(AREA_INFO, area); try { localStorage.setItem(AREA_KEY, a.id); } catch (x) {}
          setMode('delivery'); closeDialog(locModal);
          if (res.body.is_open === false) toast(res.body.branch_name + ' is closed right now');
          setBranch(res.body.branch_id);
        }).catch(function () { fail('Could not check your area. Please try again.'); });
    });
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tb-pick-branch]');
    if (!b) return;
    setMode('pickup'); setBranch(b.getAttribute('data-tb-pick-branch'));
  });

  /* ── Header height, sticky category tabs, scroll spy, search ─── */
  var header = $('[data-tb-header]');
  function measure() { if (header) root.style.setProperty('--header-h', header.getBoundingClientRect().height + 'px'); }
  measure(); on(window, 'resize', measure, { passive: true });
  on(window, 'scroll', function () { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); }, { passive: true });

  function initTabs(scope) {
    $$('[data-tb-cattabs]', scope).forEach(function (nav) {
      if (nav.__tb) return; nav.__tb = true;
      var tabs = $$('[data-tb-cattab]', nav), map = {};
      tabs.forEach(function (t) {
        var id = t.getAttribute('data-tb-cattab'), target = d.getElementById(id);
        if (!target) { t.setAttribute('href', t.getAttribute('data-href')); return; }
        map[id] = t;
        on(t, 'click', function (e) { e.preventDefault(); target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); history.replaceState(null, '', '#' + id); setActive(t); });
      });
      function setActive(t) {
        tabs.forEach(function (x) { var a = x === t; x.classList.toggle('is-active', a); if (a) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
        if (t && t.scrollIntoView) { var list = t.closest('ul'); if (list) list.scrollTo({ left: t.offsetLeft - 16, behavior: reduceMotion ? 'auto' : 'smooth' }); }
      }
      if (!('IntersectionObserver' in window) || !Object.keys(map).length) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting && map[en.target.id]) setActive(map[en.target.id]); });
      }, { rootMargin: '-35% 0px -60% 0px' });
      Object.keys(map).forEach(function (id) { io.observe(d.getElementById(id)); });
    });
  }
  initTabs(d);

  function initSearch(scope) {
    $$('[data-tb-menu-search]', scope).forEach(function (inp) {
      if (inp.__tb) return; inp.__tb = true;
      var menu = inp.closest('.tb-menu');
      on(inp, 'input', function () {
        var q = inp.value.trim().toLowerCase(), any = false;
        $$('[data-tb-menu-cat]', menu).forEach(function (cat) {
          var shown = 0;
          $$('[data-tb-menu-item]', cat).forEach(function (li) { var m = !q || li.getAttribute('data-search').indexOf(q) >= 0; li.hidden = !m; if (m) shown++; });
          cat.hidden = shown === 0; if (shown) any = true;
        });
        var none = $('[data-tb-menu-noresults]', menu); if (none) none.hidden = any;
      });
    });
  }
  initSearch(d);

  /* ── Announcement rotation ───────────────────────────────────── */
  function initRotate(scope) {
    $$('[data-tb-rotate]', scope).forEach(function (bar) {
      if (bar.__tb || reduceMotion) return; bar.__tb = true;
      var msgs = $$('.tb-announce__msg', bar), i = 0, paused = false;
      if (msgs.length < 2) return;
      on(bar, 'mouseenter', function () { paused = true; }); on(bar, 'mouseleave', function () { paused = false; });
      on(bar, 'focusin', function () { paused = true; }); on(bar, 'focusout', function () { paused = false; });
      bar.__t = setInterval(function () {
        if (paused || d.hidden) return;
        msgs[i].hidden = true; i = (i + 1) % msgs.length; msgs[i].hidden = false;
      }, (Number(bar.getAttribute('data-interval')) || 5) * 1000);
    });
  }
  initRotate(d);

  /* ── Customer auth (email one-time code) ─────────────────────── */
  var AUTH_KEY = 'tastiqo_customer_tokens', AUTH = '/api/storefront/customer';
  var Auth = {
    tokens: function () { return store.get(AUTH_KEY, null); },
    token: function () { var t = this.tokens(); return t && t.access_token; },
    customer: function () { var t = this.tokens(); return t && t.customer; },
    set: function (t) { store.set(AUTH_KEY, t); },
    clear: function () { store.del(AUTH_KEY); },
    refresh: function () {
      var t = this.tokens();
      if (!t || !t.refresh_token) return Promise.resolve(false);
      return fetch(AUTH + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }) })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) { Auth.set({ access_token: j.access_token, refresh_token: j.refresh_token, customer: j.customer || t.customer }); return true; })
        .catch(function () { Auth.clear(); return false; });
    }
  };
  function api(method, path, body, extraHeaders) {
    function go() {
      var h = { 'Content-Type': 'application/json' }, tk = Auth.token();
      if (tk) h.Authorization = 'Bearer ' + tk;
      if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
      return fetch(path, { method: method, headers: h, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
    }
    return go().then(function (r) {
      if (r.status === 401 && Auth.token()) return Auth.refresh().then(function (ok) { return ok ? go() : r; });
      return r;
    }).then(function (r) {
      return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { ok: r.ok, status: r.status, body: j }; });
    });
  }
  function errText(res, fallback) { return (res && res.body && (res.body.error || res.body.message)) || fallback; }

  function initLogin(scope, onIn) {
    $$('[data-tb-login]', scope).forEach(function (box) {
      if (box.__tb) return; box.__tb = true;
      var f1 = $('[data-tb-login-email]', box), f2 = $('[data-tb-login-code]', box), err = $('[data-tb-login-error]', box), email = '';
      function fail(m) { err.textContent = m; err.hidden = false; }
      function busy(f, b) { var btn = $('button[type=submit]', f); if (btn) btn.disabled = b; }
      on(f1, 'submit', function (e) {
        e.preventDefault(); err.hidden = true;
        email = f1.elements.email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');
        busy(f1, true);
        api('POST', AUTH + '/auth/initiate', { email: email, full_name: f1.elements.full_name.value.trim() }).then(function (res) {
          busy(f1, false);
          if (!res.ok) return fail(errText(res, 'Could not send the code. Please try again.'));
          f1.hidden = true; f2.hidden = false; $('[data-tb-login-to]', box).textContent = email; f2.elements.otp.focus();
        });
      });
      on(f2, 'submit', function (e) {
        e.preventDefault(); err.hidden = true; busy(f2, true);
        api('POST', AUTH + '/auth/verify', { email: email, otp: f2.elements.otp.value.trim() }).then(function (res) {
          busy(f2, false);
          if (!res.ok) return fail(errText(res, 'That code did not work. Check it and try again.'));
          Auth.set({ access_token: res.body.access_token, refresh_token: res.body.refresh_token, customer: res.body.customer });
          toast('Signed in'); authChanged();
          if (onIn) onIn(); else if (box.closest('[data-tb-login-page]')) {
            var ret = new URLSearchParams(location.search).get('return') || '/account';
            location.href = ret.charAt(0) === '/' && ret.charAt(1) !== '/' ? ret : '/account';
          }
        });
      });
      on($('[data-tb-login-resend]', box), 'click', function () { api('POST', AUTH + '/auth/resend-otp', { email: email }).then(function () { toast('New code sent'); }); });
      on($('[data-tb-login-back]', box), 'click', function () { f2.hidden = true; f1.hidden = false; err.hidden = true; });
    });
  }
  var authListeners = [];
  function authChanged() { authListeners.forEach(function (fn) { fn(); }); }

  /* ── Checkout ────────────────────────────────────────────────── */
  var co = $('[data-tb-checkout]'), coAddresses = [], coAddrId = store.get('tb_addr_id', null), coGeo = null, placing = false;
  function renderCheckout() {
    if (!co) return;
    var n = Cart.count(), sub = Cart.subtotal();
    $('[data-tb-co-empty]', co).hidden = n > 0;
    $('[data-tb-co-body]', co).hidden = n === 0;
    if (!n) return;
    $('[data-tb-co-lines]', co).innerHTML = Cart.items.map(function (i) { return lineHTML(i); }).join('');
    $('[data-tb-co-subtotal]', co).textContent = money(sub);
    var fee = mode === 'delivery' && area ? (Number(area.fee) || 0) : 0;
    $('[data-tb-co-feerow]', co).hidden = mode !== 'delivery';
    $('[data-tb-co-fee]', co).textContent = area ? (fee ? money(fee) : 'Free') : 'Choose your area';
    $('[data-tb-co-total]', co).textContent = money(sub + fee);
    var minEl = $('[data-tb-co-minorder]', co), min = mode === 'delivery' && area ? Number(area.min) || 0 : 0;
    minEl.hidden = !(min && sub < min);
    if (min && sub < min) minEl.textContent = 'Minimum order for delivery to ' + area.name + ' is ' + money(min) + '. Add ' + money(min - sub) + ' more.';
    $('[data-tb-co-address]', co).hidden = mode !== 'delivery' || !Auth.token();
    var signed = !!Auth.token();
    $('[data-tb-co-auth]', co).hidden = signed;
    $('[data-tb-co-me]', co).hidden = !signed;
    if (signed) { var c = Auth.customer() || {}; $('[data-tb-co-me-name]', co).textContent = c.full_name || c.name || 'you'; $('[data-tb-co-me-email]', co).textContent = c.email ? '(' + c.email + ')' : ''; var ph = $('[data-tb-co-phone]', co); if (ph && !ph.value && c.phone) ph.value = c.phone; }
  }
  function loadAddresses() {
    if (!co || !Auth.token()) return;
    api('GET', AUTH + '/addresses').then(function (res) {
      coAddresses = (res.ok && (Array.isArray(res.body) ? res.body : (res.body && (res.body.addresses || res.body.data)))) || [];
      var box = $('[data-tb-co-addresses]', co);
      if (!coAddresses.length) { box.innerHTML = '<p class="tb-fine">No saved addresses yet — add one below.</p>'; $('[data-tb-co-newaddr]', co).open = true; return; }
      if (!coAddrId || !coAddresses.some(function (a) { return a.id === coAddrId; })) coAddrId = (coAddresses.filter(function (a) { return a.is_default; })[0] || coAddresses[0]).id;
      box.innerHTML = coAddresses.map(function (a) {
        return '<label class="tb-addr"><input type="radio" name="tb-addr" value="' + esc(a.id) + '"' + (a.id === coAddrId ? ' checked' : '') + '><span><strong>' + esc(a.label || 'Address') + '</strong><br><span class="tb-fine">' + esc([a.address_line1, a.address_line2, a.city].filter(Boolean).join(', ')) + '</span></span></label>';
      }).join('');
    });
  }
  if (co) {
    initLogin(co, function () { renderCheckout(); loadAddresses(); });
    authListeners.push(function () { renderCheckout(); loadAddresses(); });
    on(co, 'change', function (e) { if (e.target.name === 'tb-addr') { coAddrId = e.target.value; store.set('tb_addr_id', coAddrId); } });
    on($('[data-tb-co-geo]', co), 'click', function () {
      var st = $('[data-tb-co-geo-status]', co);
      if (!navigator.geolocation) { st.textContent = 'Location is not available on this device.'; return; }
      st.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(function (p) { coGeo = { lat: p.coords.latitude, lng: p.coords.longitude }; st.textContent = 'Location added ✓'; }, function () { st.textContent = 'Could not get your location — we will use your area.'; }, { enableHighAccuracy: true, timeout: 10000 });
    });
    on($('[data-tb-co-addr-form]', co), 'submit', function (e) {
      e.preventDefault();
      var f = e.target, line1 = f.elements.address_line1.value.trim(), err = $('[data-tb-co-error]', co);
      if (!line1) { f.elements.address_line1.focus(); return; }
      var pos = coGeo || (area && area.lat ? { lat: area.lat, lng: area.lng } : null);
      api('POST', AUTH + '/addresses', { label: 'Home', address_line1: line1, address_line2: f.elements.address_line2.value.trim(), city: area ? area.city : '', delivery_notes: f.elements.delivery_notes.value.trim(), lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, is_default: !coAddresses.length })
        .then(function (res) {
          if (!res.ok) { err.textContent = errText(res, 'Could not save the address.'); err.hidden = false; return; }
          coAddrId = res.body && res.body.id; store.set('tb_addr_id', coAddrId); f.reset(); $('[data-tb-co-newaddr]', co).open = false; loadAddresses(); toast('Address saved');
        });
    });
    on($('[data-tb-co-place]', co), 'click', function () {
      var err = $('[data-tb-co-error]', co), btn = this;
      function fail(m) { err.textContent = m; err.hidden = false; btn.disabled = false; placing = false; }
      if (placing) return;
      err.hidden = true;
      if (!Cart.count()) return fail('Your cart is empty.');
      if (!Auth.token()) { var lf = $('[data-tb-co-auth] input', co); if (lf) lf.focus(); return fail('Please sign in with your email first (step 3).'); }
      var branchId = DATA.branch && DATA.branch.id;
      if (!branchId) { openLocation(); return fail('Please choose a branch.'); }
      if (mode === 'delivery') {
        if (!area) { openLocation(); return fail('Please choose your delivery area.'); }
        if (!coAddrId) return fail('Please add your delivery address.');
        if (area.min && Cart.subtotal() < area.min) return fail('Add a little more to reach the delivery minimum.');
      }
      placing = true; btn.disabled = true;
      var phoneEl = $('[data-tb-co-phone]', co), phone = phoneEl ? phoneEl.value.trim() : '', c = Auth.customer() || {};
      var pre = phone && phone !== c.phone ? api('PUT', AUTH + '/me', { full_name: c.full_name || '', phone: phone }) : Promise.resolve(null);
      var key = store.get('tb_idem', null) || ('tb-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      store.set('tb_idem', key);
      pre.then(function () {
        var notes = $('[data-tb-co-notes]', co).value.trim();
        return api('POST', '/api/storefront/orders', {
          branch_id: branchId, order_type: mode, payment_method: 'cash',
          address_id: mode === 'delivery' ? coAddrId : undefined, delivery_area_id: mode === 'delivery' ? area.id : undefined,
          customer_notes: notes || undefined,
          items: Cart.items.map(function (i) { return { product_id: i.id, quantity: i.qty, modifier_ids: (i.mods || []).map(function (m) { return m.id; }), notes: i.notes || undefined }; })
        }, { 'Idempotency-Key': key });
      }).then(function (res) {
        if (!res.ok) return fail(errText(res, 'Could not place your order. Please try again.'));
        store.del('tb_idem'); Cart.clear();
        location.href = '/account/orders/' + encodeURIComponent(res.body.id) + '?placed=1';
      }).catch(function () { fail('Network problem — please try again.'); });
    });
  }

  /* ── Account, orders, tracking ───────────────────────────────── */
  var STEPS_DELIVERY = [['pending', 'Order placed'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready'], ['out_for_delivery', 'On the way'], ['completed', 'Delivered']];
  var STEPS_PICKUP = [['pending', 'Order placed'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready for pickup'], ['completed', 'Collected']];
  function statusLabel(s) { return String(s || '').replace(/_/g, ' '); }
  function amount(o, k) { return o[k] == null ? '' : money(Math.round(Number(o[k]) * MINOR)); }
  function fmtDate(s) { try { return new Date(s).toLocaleString(DATA.locale || undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }); } catch (e) { return ''; } }
  function orderRows(list) {
    if (!list.length) return '<p class="tb-fine">No orders yet. <a href="/menu">Order something tasty</a></p>';
    return list.map(function (o) {
      var bad = o.status === 'cancelled' || o.status === 'rejected', done = o.status === 'completed';
      return '<a class="tb-orderrow" href="/account/orders/' + encodeURIComponent(o.id) + '"><span><strong>#' + esc(o.order_number || String(o.id).slice(0, 8)) + '</strong><br><span class="tb-orderrow__meta">' + esc(fmtDate(o.created_at)) + ' · ' + esc(o.order_type || '') + '</span></span>' +
        '<span style="text-align:right"><span class="tb-pill' + (bad ? ' tb-pill--bad' : (done ? '' : ' tb-pill--live')) + '">' + esc(statusLabel(o.status)) + '</span><br><strong>' + amount(o, 'total') + '</strong></span></a>';
    }).join('');
  }
  function initOrders() {
    $$('[data-tb-orders]').forEach(function (box) {
      if (!Auth.token()) { box.innerHTML = '<p>Sign in to see your orders.</p><p><a class="tb-btn tb-btn--primary" href="/account/login?return=' + encodeURIComponent(location.pathname) + '">Sign in</a></p>'; return; }
      api('GET', '/api/storefront/orders?limit=' + (Number(box.getAttribute('data-limit')) || 20) + '&offset=0').then(function (res) {
        if (res.status === 401) { Auth.clear(); return initOrders(); }
        var list = res.ok ? (Array.isArray(res.body) ? res.body : (res.body && (res.body.orders || res.body.data)) || []) : [];
        box.innerHTML = res.ok ? orderRows(list) : '<p class="tb-error">Could not load your orders.</p>';
      });
    });
  }
  function renderOrder(box, o) {
    var steps = o.order_type === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY, idx = -1, st = o.status;
    steps.forEach(function (s, i) { if (s[0] === st) idx = i; });
    if (st === 'out_for_delivery' && o.order_type !== 'delivery') idx = 3;
    var cancelled = st === 'cancelled' || st === 'rejected';
    var items = (o.items || []).map(function (it) {
      var mods = (it.modifiers || []).map(function (m) { return esc(m.name || m.modifier_name || ''); }).filter(Boolean).join(', ');
      return '<div class="tb-sumrow"><span>' + (it.quantity || 1) + ' × ' + esc(it.product_name || it.name || '') + (mods ? '<br><span class="tb-fine">' + mods + '</span>' : '') + '</span><span>' + amount(it, 'subtotal') + '</span></div>';
    }).join('');
    box.innerHTML = '<p><strong>Order #' + esc(o.order_number || '') + '</strong> · <span class="tb-pill' + (cancelled ? ' tb-pill--bad' : ' tb-pill--live') + '">' + esc(statusLabel(st)) + '</span></p>' +
      (o.tracking_code ? '<p class="tb-fine">Tracking code: <strong>' + esc(o.tracking_code) + '</strong></p>' : '') +
      (cancelled ? '<p class="tb-notice tb-notice--warn">This order was cancelled' + (o.cancel_reason ? ': ' + esc(o.cancel_reason) : '.') + '</p>' :
        '<ol class="tb-steps">' + steps.map(function (s, i) { return '<li class="' + (i < idx ? 'is-done' : (i === idx ? (st === 'completed' ? 'is-done' : 'is-now') : '')) + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + s[1] + '</li>'; }).join('') + '</ol>') +
      (o.estimated_ready_minutes && !cancelled && st !== 'completed' ? '<p class="tb-fine">Estimated ready in about ' + Number(o.estimated_ready_minutes) + ' minutes.</p>' : '') +
      (items ? '<div class="tb-card__title" style="margin-top:16px">Items</div>' + items : '') +
      '<div class="tb-sumrow tb-sumrow--total"><span>Total</span><strong>' + amount(o, 'total') + '</strong></div>';
    return st === 'completed' || cancelled;
  }
  function initOrder() {
    var sec = $('[data-tb-order]'); if (!sec) return;
    var id = sec.getAttribute('data-id') || location.pathname.split('/').pop(), box = $('[data-tb-order-body]', sec), timer;
    if (new URLSearchParams(location.search).get('placed')) toast('Order placed — thank you!');
    function load() {
      if (!Auth.token()) { box.innerHTML = '<p>Sign in to follow this order, or track it with your tracking code on <a href="/account/orders">My orders</a>.</p>'; return; }
      api('GET', '/api/storefront/orders/' + encodeURIComponent(id)).then(function (res) {
        if (!res.ok) { box.innerHTML = '<p class="tb-error">We could not find this order.</p>'; return; }
        var finished = renderOrder(box, res.body.order || res.body);
        clearTimeout(timer); if (!finished && !d.hidden) timer = setTimeout(load, 20000);
      });
    }
    on(d, 'visibilitychange', function () { if (!d.hidden) load(); });
    load();
  }
  function initTrackForm() {
    var f = $('[data-tb-track-form]'); if (!f) return;
    on(f, 'submit', function (e) {
      e.preventDefault();
      var out = $('[data-tb-track-result]');
      fetch('/api/track/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracking_code: f.elements.tracking_code.value.trim(), phone: f.elements.phone.value.trim() }) })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (!res.ok) { out.innerHTML = '<p class="tb-error">' + esc(errText(res, 'Order not found.')) + '</p>'; return; }
          var o = res.body.order || res.body; renderOrder(out, o);
        }).catch(function () { out.innerHTML = '<p class="tb-error">Network problem — please try again.</p>'; });
    });
  }
  function initAccount() {
    var acc = $('[data-tb-account]'); if (!acc) return;
    var outEl = $('[data-tb-acc-out]', acc), inEl = $('[data-tb-acc-in]', acc);
    function show() {
      var signed = !!Auth.token(); outEl.hidden = signed; inEl.hidden = !signed;
      if (!signed) return;
      api('GET', AUTH + '/me').then(function (res) {
        if (res.status === 401) { Auth.clear(); return show(); }
        var c = res.body || {}, f = $('[data-tb-acc-profile]', acc);
        f.elements.full_name.value = c.full_name || ''; f.elements.phone.value = c.phone || ''; $('[data-tb-acc-email]', acc).textContent = c.email || '';
      });
      api('GET', AUTH + '/addresses').then(function (res) {
        var list = res.ok ? (Array.isArray(res.body) ? res.body : (res.body && res.body.addresses) || []) : [];
        $('[data-tb-acc-addresses]', acc).innerHTML = list.length ? list.map(function (a) { return '<p><strong>' + esc(a.label || 'Address') + '</strong><br><span class="tb-fine">' + esc([a.address_line1, a.address_line2, a.city].filter(Boolean).join(', ')) + '</span></p>'; }).join('') : '<p class="tb-fine">Addresses you add at checkout show here.</p>';
      });
      initOrders();
    }
    on($('[data-tb-acc-profile]', acc), 'submit', function (e) {
      e.preventDefault(); var f = e.target;
      api('PUT', AUTH + '/me', { full_name: f.elements.full_name.value.trim(), phone: f.elements.phone.value.trim() }).then(function (res) {
        $('[data-tb-acc-saved]', acc).textContent = res.ok ? 'Saved ✓' : errText(res, 'Could not save.');
        if (res.ok) { var t = Auth.tokens(); if (t) { t.customer = res.body; Auth.set(t); } }
      });
    });
    on($('[data-tb-logout]', acc), 'click', function () {
      api('POST', AUTH + '/auth/logout', { refresh_token: (Auth.tokens() || {}).refresh_token }).then(function () { Auth.clear(); location.href = '/'; });
    });
    authListeners.push(show);
    show();
  }

  /* ── Theme editor live preview (bridge events, data only) ────── */
  var HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  var VARS = { color_primary: '--u-primary', color_secondary: '--u-accent', color_accent: '--u-deep', color_button: '--u-button', color_button_text: '--u-button-text', color_badge: '--u-badge', color_badge_text: '--u-badge-text', color_error: '--u-sale', color_success: '--u-success', color_warning: '--u-warning', color_background: '--u-bg', color_surface: '--u-surface', color_text: '--u-text', color_text_muted: '--u-muted', color_border: '--u-border' };
  var SCHEMES = ['fire-red', 'cheese-yellow', 'charcoal', 'fresh-green', 'ocean'];
  d.addEventListener('tastiqo:theme:settings', function (e) {
    var s = (e.detail && e.detail.settings) || {}, st = root.style;
    if (SCHEMES.indexOf(s.color_scheme) >= 0) root.setAttribute('data-scheme', s.color_scheme);
    if (['light', 'dark', 'auto'].indexOf(s.color_mode) >= 0) root.setAttribute('data-mode', s.color_mode);
    Object.keys(VARS).forEach(function (k) {
      if (!(k in s)) return;
      var v = String(s[k] || '').trim();
      if (HEX.test(v)) st.setProperty(VARS[k], v); else st.removeProperty(VARS[k]);
    });
    var r = Number(s.border_radius);
    if (isFinite(r) && s.border_radius !== '' && s.border_radius != null) st.setProperty('--radius', Math.max(0, Math.min(28, r)) + 'px');
    if (s.button_style) st.setProperty('--btn-radius', s.button_style === 'square' ? '0px' : (s.button_style === 'rounded' ? Math.min(14, isFinite(r) ? r : 16) + 'px' : '999px'));
    var nums = { base_font_size: ['--font-size', 'px', 1], page_width: ['--page-width', 'px', 1], spacing_sections: ['--section-space', 'px', 1], logo_width: ['--logo-width', 'px', 1], heading_scale: ['--h-scale', '', 100], body_scale: ['--b-scale', '', 100], button_scale: ['--btn-scale', '', 100], button_border_thickness: ['--btn-border', 'px', 1] };
    Object.keys(nums).forEach(function (k) { var n = Number(s[k]); if (s[k] !== undefined && s[k] !== '' && isFinite(n)) st.setProperty(nums[k][0], (n / nums[k][2]) + nums[k][1]); });
    var fonts = { font_heading: '--font-heading', font_body: '--font-body' };
    Object.keys(fonts).forEach(function (k) {
      if (!(k in s)) return;
      var f = String(s[k] || '');
      if (!f || f === 'system' || !/^[A-Za-z ]{2,40}$/.test(f)) st.removeProperty(fonts[k]); else st.setProperty(fonts[k], "'" + f + "', var(--font-system)");
    });
    root.classList.toggle('tb-caps', s.heading_case === 'uppercase');
    root.classList.toggle('tb-static-header', s.header_sticky === false);
    measure();
  });
  d.addEventListener('tastiqo:section:load', function (e) {
    var t = e.detail && e.detail.target;
    initTabs(t || d); initSearch(t || d); initRotate(t || d); renderMode(); renderCart();
    if (t && t.querySelector && t.querySelector('[data-tb-header]')) { header = $('[data-tb-header]'); measure(); }
  });
  d.addEventListener('tastiqo:section:unload', function (e) {
    var t = e.detail && e.detail.target;
    $$('[data-tb-rotate]', t || d).forEach(function (b) { clearInterval(b.__t); });
  });

  /* ── Boot ────────────────────────────────────────────────────── */
  renderMode(); renderCart();
  initLogin(d); initAccount(); initOrders(); initOrder(); initTrackForm();
  if (co && Auth.token()) loadAddresses();
  if (DATA.ask_location && !EDITOR) {
    var hasAreasNeed = (DATA.branches || []).length > 1;
    if ((hasAreasNeed && DATA.needs_branch && !store.get('tb_branch_chosen', false)) || (mode === 'delivery' && !area && hasAreasNeed)) {
      setTimeout(openLocation, 600);
    }
  }
})();
