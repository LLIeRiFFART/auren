/**
 * Auren — demonstration checkout.
 * Validates the form in the browser and shows a confirmation.
 * Nothing is sent anywhere and no payment is processed.
 */
(function () {
  'use strict';

  const { cart, setupValidation, escapeHtml, formatPrice, priceMarkup } = window.Auren;

  const checkout = document.querySelector('[data-checkout]');
  const emptyState = document.querySelector('[data-checkout-empty]');
  const confirmation = document.querySelector('[data-confirmation]');
  const form = document.querySelector('[data-checkout-form]');
  const summary = document.querySelector('[data-summary]');

  const DEMO_CARD = { cardName: 'Alex Morgan', cardNumber: '4242 4242 4242 4242', cardCvc: '123' };

  const selectedDelivery = () => new FormData(form).get('delivery') || 'standard';

  /* ---------- Order summary ---------- */

  function linesMarkup(lines) {
    return lines
      .map(
        (line) => `
          <li class="summary-item">
            <span class="summary-item__media"><img src="${line.product.image}" alt="" width="120" height="120"><span class="summary-item__qty" aria-hidden="true">${line.qty}</span></span>
            <span class="summary-item__text">
              <span class="summary-item__name">${escapeHtml(line.product.name)}</span>
              <span class="summary-item__option">${escapeHtml(line.optionLabel)}<span class="sr-only">, quantity ${line.qty}</span></span>
            </span>
            <span class="summary-item__price">${priceMarkup(line.product, line.unitPrice - line.product.price, line.qty)}</span>
          </li>`
      )
      .join('');
  }

  function totalsMarkup(totals, delivery) {
    return `
      <dl class="summary__rows">
        <div><dt>Subtotal</dt><dd>${formatPrice(totals.subtotal)}</dd></div>
        <div><dt>${delivery === 'express' ? 'Express shipping' : 'Standard shipping'}</dt><dd>${totals.shipping ? formatPrice(totals.shipping) : 'Free'}</dd></div>
        <div class="summary__total"><dt>Total</dt><dd>${formatPrice(totals.total)}</dd></div>
      </dl>`;
  }

  function renderSummary() {
    const lines = cart.lines();
    const delivery = selectedDelivery();
    const totals = cart.totals(delivery);
    summary.innerHTML = `
      <h2 id="summary-title" class="summary__title">Order summary</h2>
      <ul class="summary__items">${linesMarkup(lines)}</ul>
      ${totalsMarkup(totals, delivery)}
      <a class="link-button summary__edit" href="cart.html">Edit cart</a>`;

    // Standard shipping is free above the threshold.
    const standard = cart.totals('standard').shipping;
    document.querySelector('[data-standard-price]').textContent = standard ? formatPrice(standard) : 'Free';
  }

  /* ---------- Input formatting ---------- */

  function formatCardNumber(value) {
    return value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
  }

  function formatExpiry(value) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }

  function demoExpiry() {
    const year = (new Date().getFullYear() + 2) % 100;
    return `12/${String(year).padStart(2, '0')}`;
  }

  /* ---------- Confirmation ---------- */

  function deliveryWindow(delivery) {
    const [from, to] = delivery === 'express' ? [1, 2] : [3, 5];
    const addBusinessDays = (days) => {
      const date = new Date();
      let added = 0;
      while (added < days) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
      }
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };
    return `${addBusinessDays(from)} – ${addBusinessDays(to)}`;
  }

  function showConfirmation(data) {
    const lines = cart.lines();
    const totals = cart.totals(data.delivery);
    const orderNumber = `AU-${String(Math.floor(100000 + Math.random() * 900000))}`;
    const addressParts = [data.address, data.apartment, `${data.city}, ${data.region} ${data.zip}`, data.country].filter(Boolean);

    confirmation.innerHTML = `
      <div class="confirmation__head">
        <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>Demo order confirmed</p>
        <h1 class="confirmation__title" tabindex="-1" data-confirmation-title>Thank you, ${escapeHtml(data.firstName)}.</h1>
        <p class="confirmation__lead">Order <strong>${orderNumber}</strong> passed every check. Because this is a portfolio demonstration, no payment was taken, nothing was sent to a server and no email will arrive.</p>
      </div>
      <div class="confirmation__grid">
        <section class="panel" aria-labelledby="confirm-delivery">
          <h2 id="confirm-delivery" class="panel__title">Delivery</h2>
          <dl class="detail-list">
            <div><dt>Ship to</dt><dd>${escapeHtml(`${data.firstName} ${data.lastName}`)}<br>${addressParts.map(escapeHtml).join('<br>')}</dd></div>
            <div><dt>Method</dt><dd>${data.delivery === 'express' ? 'Express' : 'Standard'} — estimated ${deliveryWindow(data.delivery)}</dd></div>
            <div><dt>Contact</dt><dd>${escapeHtml(data.email)}</dd></div>
          </dl>
        </section>
        <section class="panel" aria-labelledby="confirm-items">
          <h2 id="confirm-items" class="panel__title">Items</h2>
          <ul class="summary__items">${linesMarkup(lines)}</ul>
          ${totalsMarkup(totals, data.delivery)}
        </section>
      </div>
      <div class="confirmation__actions">
        <a class="btn btn--primary btn--lg" href="catalog.html">Continue shopping</a>
        <a class="btn btn--ghost btn--lg" href="index.html">Back to home</a>
      </div>`;

    cart.clear();
    checkout.hidden = true;
    confirmation.hidden = false;
    document.title = 'Order confirmed — Auren';
    window.scrollTo({ top: 0 });
    confirmation.querySelector('[data-confirmation-title]').focus({ preventScroll: true });
  }

  /* ---------- Start ---------- */

  if (!cart.lines().length) {
    checkout.hidden = true;
    emptyState.hidden = false;
    return;
  }

  renderSummary();

  form.addEventListener('change', (event) => {
    if (event.target.name === 'delivery') renderSummary();
  });

  form.elements.cardNumber.addEventListener('input', (event) => {
    event.target.value = formatCardNumber(event.target.value);
  });
  form.elements.cardExpiry.addEventListener('input', (event) => {
    event.target.value = formatExpiry(event.target.value);
  });
  form.elements.cardCvc.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  });

  document.querySelector('[data-demo-card]').addEventListener('click', () => {
    Object.entries({ ...DEMO_CARD, cardExpiry: demoExpiry() }).forEach(([name, value]) => {
      const input = form.elements[name];
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    form.elements.cardName.focus();
  });

  setupValidation(form, showConfirmation);

  // If the cart is emptied in another tab, leave the form.
  window.addEventListener('storage', () => {
    if (confirmation.hidden && !cart.lines().length) window.location.reload();
    else if (confirmation.hidden) renderSummary();
  });
})();
