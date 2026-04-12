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
})();
