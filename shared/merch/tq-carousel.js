
/* ===============================================================
   TapToBite carousel (shared by hero-carousel, deals and showcase
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
