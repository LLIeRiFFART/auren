/**
 * Auren — shared storefront logic used by every page:
 * cart storage, formatting, product cards, toasts, header behaviour,
 * scroll reveals and form validation.
 */
(function () {
  'use strict';

  const { categories, products } = window.AurenData;

  const STORAGE_KEY = 'auren.cart.session.v2';
  const VISIT_KEY = 'auren.visit.v1';
  const MAX_QUANTITY = 10;
  const FREE_SHIPPING_FROM = 150;
  const STANDARD_SHIPPING = 12;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function startVisit() {
    let internalNavigation = false;
    try {
      const scriptURL = document.currentScript?.src || new URL('js/app.js', window.location.href).href;
      const siteRoot = new URL('../', scriptURL);
      const referrer = new URL(document.referrer);
      const pages = new Set(['', 'index.html', 'catalog.html', 'product.html', 'cart.html', 'checkout.html', 'help.html']);
      internalNavigation = referrer.origin === siteRoot.origin &&
        referrer.pathname.startsWith(siteRoot.pathname) &&
        pages.has(referrer.pathname.slice(siteRoot.pathname.length));
    } catch (error) {
      // No referrer (address bar/bookmark) is a new entry, not an internal link.
    }
    let fresh = true;
    try {
      const navigation = performance.getEntriesByType('navigation')[0]?.type || 'navigate';
      const active = window.sessionStorage.getItem(VISIT_KEY) === '1';
      fresh = !active || (navigation === 'navigate' && !internalNavigation);
      if (fresh) window.sessionStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.setItem(VISIT_KEY, '1');
    } catch (error) {
      // If storage is blocked, the existing in-memory cart remains available.
    }
    try {
      // Migrate away from the old cross-visit cart without importing stale items.
      window.localStorage.removeItem('auren.cart.v1');
    } catch (error) {
      // Storage can be unavailable in private/embedded contexts.
    }
    return fresh;
  }

  const isNewVisit = startVisit();

  /* ---------- Helpers ---------- */

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function formatPrice(amount) {
    const options = Number.isInteger(amount)
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return `$${amount.toLocaleString('en-US', options)}`;
  }

  function getProduct(id) {
    return products.find((product) => product.id === id) || null;
  }

  function getCategory(id) {
    return categories.find((category) => category.id === id) || null;
  }

  function productUrl(id) {
    return `product.html?id=${encodeURIComponent(id)}`;
  }

  const icons = {
    star: '<svg class="icon icon--star" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3l2 4.3 4.7.6-3.5 3.2.9 4.6L8 11.7 3.9 14l.9-4.6L1.3 6.2 6 5.6z" fill="currentColor"/></svg>',
    arrow: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };

  /* ---------- Cart ---------- */

  let memoryCart = [];

  function sanitizeCart(raw) {
    if (!Array.isArray(raw)) return [];
    const items = [];
    raw.forEach((entry) => {
      const product = entry && getProduct(entry.id);
      if (!product) return;
      const option = Number.isInteger(entry.option) && product.option.values[entry.option] ? entry.option : 0;
      const quantity = Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number(entry.qty)) || 1));
      const existing = items.find((item) => item.id === product.id && item.option === option);
      if (existing) {
        existing.qty = Math.min(MAX_QUANTITY, existing.qty + quantity);
      } else {
        items.push({ id: product.id, option, qty: quantity });
      }
    });
    return items;
  }

  function readCart() {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      memoryCart = sanitizeCart(stored ? JSON.parse(stored) : []);
    } catch (error) {
      // Storage unavailable (private mode, blocked): keep the in-memory cart.
    }
    return memoryCart.map((item) => ({ ...item }));
  }

  function writeCart(items) {
    memoryCart = sanitizeCart(items);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCart));
    } catch (error) {
      // Ignore: the cart still works for this page view.
    }
    document.dispatchEvent(new CustomEvent('cart:change'));
  }

  const lineKey = (id, option) => `${id}:${option}`;

  const cart = {
    maxQuantity: MAX_QUANTITY,
    freeShippingFrom: FREE_SHIPPING_FROM,

    /** Cart lines enriched with product data and prices. */
    lines() {
      return readCart().map((item) => {
        const product = getProduct(item.id);
        const option = product.option.values[item.option];
        const unitPrice = product.price + option.delta;
        return {
          key: lineKey(item.id, item.option),
          product,
          optionIndex: item.option,
          optionName: product.option.name,
          optionLabel: option.label,
          unitPrice,
          qty: item.qty,
          total: unitPrice * item.qty,
        };
      });
    },

    count() {
      return readCart().reduce((sum, item) => sum + item.qty, 0);
    },

    /** Returns the quantity actually added (may be capped). */
    add(id, option = 0, quantity = 1) {
      const items = readCart();
      const existing = items.find((item) => item.id === id && item.option === option);
      const before = existing ? existing.qty : 0;
      const after = Math.min(MAX_QUANTITY, before + quantity);
      if (existing) {
        existing.qty = after;
      } else {
        items.push({ id, option, qty: after });
      }
      writeCart(items);
      return after - before;
    },

    setQuantity(key, quantity) {
      const items = readCart();
      const item = items.find((entry) => lineKey(entry.id, entry.option) === key);
      if (!item) return;
      item.qty = Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity) || 1));
      writeCart(items);
    },

    remove(key) {
      writeCart(readCart().filter((entry) => lineKey(entry.id, entry.option) !== key));
    },

    /** Puts a previously removed line back (used by "Undo"). */
    restore(line, index) {
      const items = readCart();
      items.splice(Math.min(index, items.length), 0, { id: line.product.id, option: line.optionIndex, qty: line.qty });
      writeCart(items);
    },

    clear() {
      writeCart([]);
    },

    /** Totals; `delivery` is "standard" or "express". */
    totals(delivery = 'standard') {
      const subtotal = cart.lines().reduce((sum, line) => sum + line.total, 0);
      let shipping = 0;
      if (subtotal > 0) {
        shipping = delivery === 'express' ? 18 : subtotal >= FREE_SHIPPING_FROM ? 0 : STANDARD_SHIPPING;
      }
      return { subtotal, shipping, total: subtotal + shipping };
    },
  };

  /* ---------- Toasts ---------- */

  let toastTimer = 0;

  /**
   * Shows a short confirmation. `action` is either { label, href }
   * or { label, onClick }.
   */
  function toast({ title, text = '', image = '', action = null, duration = 5000 }) {
    const region = document.querySelector('[data-toasts]');
    if (!region) return;
    window.clearTimeout(toastTimer);
    region.innerHTML = '';

    const element = document.createElement('div');
    element.className = 'toast';
    element.innerHTML = `
      ${image ? `<img class="toast__image" src="${escapeHtml(image)}" alt="" width="56" height="56">` : ''}
      <p class="toast__text"><strong>${escapeHtml(title)}</strong>${text ? `<span>${escapeHtml(text)}</span>` : ''}</p>
      ${action && action.href ? `<a class="toast__action" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>` : ''}
      ${action && action.onClick ? `<button class="toast__action" type="button" data-toast-action>${escapeHtml(action.label)}</button>` : ''}
      <button class="toast__close" type="button" aria-label="Dismiss notification">${icons.close}</button>`;

    const dismiss = () => {
      window.clearTimeout(toastTimer);
      element.remove();
    };
    element.querySelector('.toast__close').addEventListener('click', dismiss);
    const actionButton = element.querySelector('[data-toast-action]');
    if (actionButton) {
      actionButton.addEventListener('click', () => {
        action.onClick();
        dismiss();
      });
    }

    region.appendChild(element);
    toastTimer = window.setTimeout(dismiss, duration);
  }

  /** Adds to the cart and confirms it to the customer. */
  function addToCart(id, option = 0, quantity = 1) {
    const product = getProduct(id);
    if (!product) return 0;
    const added = cart.add(id, option, quantity);
    if (added > 0) {
      toast({
        title: added > 1 ? `Added ${added} to cart` : 'Added to cart',
        text: `${product.name} · ${product.option.values[option].label}`,
        image: product.image,
        action: { label: 'View cart', href: 'cart.html' },
      });
    } else {
      toast({
        title: `Limit of ${MAX_QUANTITY} per item`,
        text: `Your cart already has ${MAX_QUANTITY} × ${product.name}.`,
        image: product.image,
        action: { label: 'View cart', href: 'cart.html' },
      });
    }
    return added;
  }

  /* ---------- Product card ---------- */

  function ratingMarkup(product) {
    return `<p class="rating">${icons.star}<span>${product.rating.toFixed(1)}</span><span class="rating__count">(${product.reviews.toLocaleString('en-US')}<span class="sr-only"> reviews</span>)</span></p>`;
  }

  /** Comparison prices are display-only; cart calculations use product.price. */
  function priceMarkup(product, delta = 0, quantity = 1) {
    const current = (product.price + delta) * quantity;
    const previous = (product.compareAtPrice + delta) * quantity;
    return `<span class="price-pair"><span class="price__current"><span class="sr-only">Price: </span>${formatPrice(current)}</span>${previous > current ? `<s class="price__old"><span class="sr-only">Previous price: </span>${formatPrice(previous)}</s>` : ''}</span>`;
  }

  function productCard(product) {
    const category = getCategory(product.category);
    const url = productUrl(product.id);
    const inCart = cart.lines().some((line) => line.product.id === product.id);
    const specs = product.keys
      .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join('');

    return `
      <li class="product-card" data-reveal>
        <article>
          <a class="product-card__media" href="${url}" tabindex="-1" aria-hidden="true">
            <img src="${product.image}" alt="" width="1000" height="1000" loading="lazy" decoding="async">
            ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
          </a>
          <div class="product-card__body">
            <div class="product-card__meta">
              <p class="product-card__category">${escapeHtml(category.name)} · ${product.wireless ? 'Wireless' : 'Wired'}</p>
              ${ratingMarkup(product)}
            </div>
            <h3 class="product-card__title"><a href="${url}">${escapeHtml(product.name)}</a></h3>
            <p class="product-card__tagline">${escapeHtml(product.tagline)}</p>
            <dl class="product-card__specs">${specs}</dl>
            <div class="product-card__foot">
              <p class="price">${priceMarkup(product)}</p>
              <button class="btn btn--primary btn--sm${inCart ? ' is-added' : ''}" type="button" data-add-to-cart="${product.id}" aria-label="${inCart ? `${escapeHtml(product.name)} is in cart. Add one more` : `Add ${escapeHtml(product.name)} to cart`}">${inCart ? `${icons.check}<span>In cart</span>` : 'Add to cart'}</button>
            </div>
          </div>
        </article>
      </li>`;
  }

  /* ---------- Header ---------- */

  function syncProductCartButtons() {
    const productIds = new Set(cart.lines().map((line) => line.product.id));
    document.querySelectorAll('[data-add-to-cart]').forEach((button) => {
      const product = getProduct(button.dataset.addToCart);
      if (!product) return;
      const inCart = productIds.has(product.id);
      button.classList.toggle('is-added', inCart);
      button.innerHTML = inCart ? `${icons.check}<span>In cart</span>` : 'Add to cart';
      button.setAttribute('aria-label', inCart
        ? `${product.name} is in cart. Add one more`
        : `Add ${product.name} to cart`);
    });
  }

  function updateCartBadge() {
    syncProductCartButtons();
    const count = cart.count();
    document.querySelectorAll('[data-cart-count]').forEach((badge) => {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
    document.querySelectorAll('[data-cart-link]').forEach((link) => {
      link.setAttribute('aria-label', count === 1 ? 'Cart, 1 item' : `Cart, ${count} items`);
    });
  }

  function initHeader() {
    const header = document.querySelector('[data-header]');
    if (!header) return;

    // Solid background once the page is scrolled.
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mark the current page in the navigation.
    const here = new URL(window.location.href);
    const currentFile = here.pathname.split('/').pop() || 'index.html';
    const currentCategory = here.searchParams.get('category');
    header.querySelectorAll('.site-nav a').forEach((link) => {
      const target = new URL(link.getAttribute('href'), window.location.href);
      const file = target.pathname.split('/').pop();
      const category = target.searchParams.get('category');
      if (file === currentFile && category === currentCategory) link.setAttribute('aria-current', 'page');
    });

    // Mobile menu.
    const toggle = header.querySelector('[data-nav-toggle]');
    const nav = header.querySelector('[data-nav]');
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      header.classList.toggle('is-nav-open', open);
      document.documentElement.classList.toggle('has-nav-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', () => setOpen(false));
  }

  /* ---------- Scroll reveals ---------- */

  let revealObserver = null;

  function observeReveals(root = document) {
    const elements = root.querySelectorAll('[data-reveal]:not(.is-revealed)');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-revealed'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          // Stagger items that enter together (a row of cards, for example).
          entries
            .filter((entry) => entry.isIntersecting)
            .forEach((entry, index) => {
              entry.target.style.transitionDelay = `${Math.min(index, 5) * 60}ms`;
              entry.target.classList.add('is-revealed');
              revealObserver.unobserve(entry.target);
            });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
      );
    }
    elements.forEach((element) => revealObserver.observe(element));
  }

  /* ---------- Quantity stepper ---------- */

  function quantityStepper({ value = 1, label = 'Quantity' }) {
    return `
      <div class="qty" role="group" aria-label="${escapeHtml(label)}">
        <button class="qty__button" type="button" data-qty-step="-1" aria-label="Decrease quantity"${value <= 1 ? ' disabled' : ''}>&minus;</button>
        <input class="qty__input" type="number" inputmode="numeric" min="1" max="${MAX_QUANTITY}" value="${value}" aria-label="${escapeHtml(label)}" data-qty-input>
        <button class="qty__button" type="button" data-qty-step="1" aria-label="Increase quantity"${value >= MAX_QUANTITY ? ' disabled' : ''}>+</button>
      </div>`;
  }

  function clampQuantity(value) {
    return Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number(value)) || 1));
  }

  /* ---------- Form validation ---------- */

  function luhn(digits) {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = Number(digits[i]);
      if (double) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      double = !double;
    }
    return sum % 10 === 0;
  }

  const validators = {
    email: (value) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? '' : 'Enter a valid email address, like name@example.com.'),
    phone: (value) => (value.replace(/\D/g, '').length >= 7 ? '' : 'Enter a phone number with at least 7 digits.'),
    zip: (value) => (/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(value) ? '' : 'Enter a valid ZIP or postal code.'),
    card: (value) => {
      const digits = value.replace(/\s/g, '');
      return /^\d{13,19}$/.test(digits) && luhn(digits) ? '' : 'Enter a valid card number (try the demo card).';
    },
    expiry: (value) => {
      const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(value);
      if (!match) return 'Use the format MM/YY.';
      const month = Number(match[1]);
      const year = 2000 + Number(match[2]);
      if (month < 1 || month > 12) return 'Enter a month between 01 and 12.';
      const now = new Date();
      const expired = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
      return expired ? 'This card has expired.' : '';
    },
    cvc: (value) => (/^\d{3,4}$/.test(value) ? '' : 'Enter the 3 or 4 digit security code.'),
  };

  function fieldError(input) {
    const value = input.value.trim();
    const label = input.dataset.label || 'This field';
    if (!value) return input.required ? `${label} is required.` : '';
    const minLength = Number(input.getAttribute('minlength')) || 0;
    if (minLength && value.length < minLength) return `${label} needs at least ${minLength} characters.`;
    const rule = validators[input.dataset.validate];
    return rule ? rule(value) : '';
  }

  function showFieldError(input, message) {
    const field = input.closest('[data-field]');
    const error = field ? field.querySelector('.field__error') : null;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (field) field.classList.toggle('has-error', Boolean(message));
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
  }

  /**
   * Wires up validation for a form. Fields are checked on blur, re-checked
   * while typing once they have an error, and all together on submit.
   */
  function setupValidation(form, onValid) {
    const inputs = () => [...form.querySelectorAll('input[name], select[name], textarea[name]')].filter((input) => input.type !== 'radio');
    const summary = form.querySelector('[data-form-summary]');

    form.addEventListener('focusout', (event) => {
      if (event.target.matches('input, select, textarea') && event.target.type !== 'radio') {
        showFieldError(event.target, fieldError(event.target));
      }
    });
    form.addEventListener('input', (event) => {
      if (event.target.getAttribute('aria-invalid') === 'true') {
        showFieldError(event.target, fieldError(event.target));
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const invalid = [];
      inputs().forEach((input) => {
        const message = fieldError(input);
        showFieldError(input, message);
        if (message) invalid.push(input);
      });

      if (summary) {
        summary.hidden = invalid.length === 0;
        summary.textContent = invalid.length
          ? `Please fix ${invalid.length === 1 ? 'the highlighted field' : `the ${invalid.length} highlighted fields`} to continue.`
          : '';
      }
      if (invalid.length) {
        invalid[0].focus();
        return;
      }
      onValid(Object.fromEntries(new FormData(form).entries()));
    });
  }

  /* Gentle magnetic movement on the two hero actions, including reset on exit. */
  function initMagneticButtons() {
    if (reducedMotion) return;
    const query = window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');
    let active = null;
    let bounds = null;
    function reset() {
      if (active) active.style.translate = '';
      active = null;
      bounds = null;
    }
    document.addEventListener('pointermove', (event) => {
      const button = event.target.closest('.hero__actions .btn');
      if (!query.matches || event.pointerType !== 'mouse' || !button) {
        reset();
        return;
      }
      if (active !== button) {
        reset();
        active = button;
        bounds = button.getBoundingClientRect();
      }
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      button.style.translate = `${(x * 5).toFixed(2)}px ${(y * 4).toFixed(2)}px`;
    });
    document.addEventListener('pointerout', (event) => {
      if (active && !active.contains(event.relatedTarget)) reset();
    });
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    window.addEventListener('scroll', reset, { passive: true });
    query.addEventListener('change', reset);
  }

  /* ---------- Global wiring ---------- */

  const initializedAccordions = new WeakSet();

  function initAccordions(root = document) {
    if (reducedMotion || !Element.prototype.animate) return;
    root.querySelectorAll('.accordion details').forEach((details) => {
      if (initializedAccordions.has(details)) return;
      const summary = details.querySelector('summary');
      if (!summary) return;
      initializedAccordions.add(details);
      let expanded = details.open;
      let animation = null;
      summary.addEventListener('click', (event) => {
        event.preventDefault();
        const start = details.getBoundingClientRect().height;
        if (animation) animation.cancel();
        expanded = !expanded;
        summary.setAttribute('aria-expanded', String(expanded));
        details.toggleAttribute('data-closing', !expanded);
        // Keep native details open until a closing animation finishes.
        details.open = true;
        details.style.overflow = 'hidden';
        details.style.height = 'auto';
        const border = parseFloat(getComputedStyle(details).borderTopWidth) +
          parseFloat(getComputedStyle(details).borderBottomWidth);
        const end = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + border;
        details.style.height = `${start}px`;
        animation = details.animate([{ height: `${start}px` }, { height: `${end}px` }], {
          duration: 500,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        });
        animation.onfinish = () => {
          details.open = expanded;
          details.style.height = '';
          details.style.overflow = '';
          details.removeAttribute('data-closing');
          animation = null;
        };
      });
    });
  }

  function updateCopyrightYear() {
    const firstYear = 2027;
    const year = Math.max(firstYear, new Date().getFullYear());
    const label = year === firstYear ? String(firstYear) : `${firstYear}-${year}`;
    document.querySelectorAll('[data-copyright-year]').forEach((node) => {
      node.textContent = label;
    });
  }

  function init() {
    initAccordions();
    updateCopyrightYear();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateCopyrightYear();
    });
    initHeader();
    initMagneticButtons();
    updateCartBadge();
    observeReveals();

    document.addEventListener('cart:change', updateCartBadge);
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY || event.key === null) document.dispatchEvent(new CustomEvent('cart:change'));
    });
    window.addEventListener('pageshow', updateCartBadge);

    // Quick "Add to cart" buttons on product cards.
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-to-cart]');
      if (!button) return;
      addToCart(button.dataset.addToCart);
    });
  }

  window.Auren = {
    categories,
    products,
    cart,
    icons,
    reducedMotion,
    isNewVisit,
    escapeHtml,
    formatPrice,
    getProduct,
    getCategory,
    productUrl,
    productCard,
    ratingMarkup,
    priceMarkup,
    quantityStepper,
    clampQuantity,
    addToCart,
    toast,
    observeReveals,
    initAccordions,
    setupValidation,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
