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

})();
