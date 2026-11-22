/**
 * Auren — cart page: quantities, removal with undo and live totals.
 */
(function () {
  'use strict';

  const { cart, productUrl, quantityStepper, clampQuantity, escapeHtml, formatPrice, priceMarkup, toast } = window.Auren;

  const root = document.querySelector('[data-cart]');
  const status = document.querySelector('[data-cart-status]');

  function summaryMarkup(count) {
    const totals = cart.totals();
    const remaining = cart.freeShippingFrom - totals.subtotal;
    return `
      <aside class="summary" aria-labelledby="summary-title">
        <h2 id="summary-title" class="summary__title">Order summary</h2>
        <dl class="summary__rows">
          <div><dt>Subtotal</dt><dd>${formatPrice(totals.subtotal)}</dd></div>
          <div><dt>Standard shipping</dt><dd>${totals.shipping ? formatPrice(totals.shipping) : 'Free'}</dd></div>
          <div class="summary__total"><dt>Total (${count} ${count === 1 ? 'item' : 'items'})</dt><dd>${formatPrice(totals.total)}</dd></div>
        </dl>
        <p class="summary__note">${
          remaining > 0
            ? `Add ${formatPrice(remaining)} more for free standard shipping.`
            : 'Your order ships free. Taxes are included in the prices shown.'
        }</p>
        <a class="btn btn--primary btn--lg btn--block" href="checkout.html">Checkout</a>
        <a class="btn btn--ghost btn--lg btn--block" href="catalog.html">Continue shopping</a>
      </aside>`;
  }

  function render() {
    const lines = cart.lines();

    if (!lines.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h2 class="empty-state__title">Your cart is empty</h2>
          <p>Nothing here yet. Start with the range, or go straight to our flagship.</p>
          <div class="empty-state__actions">
            <a class="btn btn--primary" href="catalog.html">Browse all headphones</a>
            <a class="btn btn--ghost" href="product.html?id=meridian-one">See Meridian One</a>
          </div>
        </div>`;
      return;
    }

    const count = lines.reduce((sum, line) => sum + line.qty, 0);
    root.innerHTML = `
      <div class="cart__layout">
        <div>
          <ul class="cart-list">
            ${lines
              .map(
                (line) => `
                  <li class="cart-item" data-key="${line.key}">
                    <a class="cart-item__media" href="${productUrl(line.product.id)}" tabindex="-1" aria-hidden="true">
                      <img src="${line.product.image}" alt="" width="200" height="200">
                    </a>
                    <div class="cart-item__info">
                      <h2 class="cart-item__title"><a href="${productUrl(line.product.id)}">${escapeHtml(line.product.name)}</a></h2>
                      <p class="cart-item__option">${escapeHtml(line.optionName)}: ${escapeHtml(line.optionLabel)}</p>
                    </div>
                    <div class="cart-item__controls">
                      ${quantityStepper({ value: line.qty, label: `Quantity of ${line.product.name}` })}
                      <button class="link-button" type="button" data-remove aria-label="Remove ${escapeHtml(line.product.name)} from cart">Remove</button>
                    </div>
                    <p class="cart-item__total"><span class="sr-only">Line total: </span>${priceMarkup(line.product, line.unitPrice - line.product.price, line.qty)}</p>
                  </li>`
              )
              .join('')}
          </ul>
        </div>
        ${summaryMarkup(count)}
      </div>`;
  }

  /** Re-renders and puts keyboard focus back on the same control. */
  function rerender(key, selector) {
    render();
    const item = key ? root.querySelector(`[data-key="${key}"]`) : null;
    const control = item ? item.querySelector(selector) : null;
    if (control && !control.disabled) {
      control.focus();
    } else if (item) {
      item.querySelector('[data-qty-input]').focus();
    }
  }

  function announce(message) {
    if (status) status.textContent = message;
  }

  function changeQuantity(item, quantity, selector) {
    const key = item.dataset.key;
    cart.setQuantity(key, clampQuantity(quantity));
    rerender(key, selector);
    const line = cart.lines().find((entry) => entry.key === key);
    if (line) announce(`${line.product.name}: quantity ${line.qty}. Cart total ${formatPrice(cart.totals().total)}.`);
  }

  root.addEventListener('click', (event) => {
    const item = event.target.closest('.cart-item');
    if (!item) return;

    const step = event.target.closest('[data-qty-step]');
    if (step) {
      const input = item.querySelector('[data-qty-input]');
      changeQuantity(item, Number(input.value) + Number(step.dataset.qtyStep), `[data-qty-step="${step.dataset.qtyStep}"]`);
      return;
    }

    if (event.target.closest('[data-remove]')) {
      const lines = cart.lines();
      const index = lines.findIndex((line) => line.key === item.dataset.key);
      const removed = lines[index];
      cart.remove(removed.key);
      render();
      announce(`${removed.product.name} removed from cart.`);

      // Move focus to the next sensible place.
      const next = root.querySelectorAll('.cart-item')[Math.min(index, lines.length - 2)];
      const target = next ? next.querySelector('[data-remove]') : root.querySelector('a.btn');
      if (target) target.focus();

      toast({
        title: 'Removed from cart',
        text: removed.product.name,
        image: removed.product.image,
        action: {
          label: 'Undo',
          onClick() {
            cart.restore(removed, index);
            render();
            announce(`${removed.product.name} restored.`);
          },
        },
      });
    }
  });

  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-qty-input]')) return;
    changeQuantity(event.target.closest('.cart-item'), event.target.value, '[data-qty-input]');
  });

  // Keep the page in sync if the cart changes in another tab.
  window.addEventListener('storage', render);

  render();
})();
