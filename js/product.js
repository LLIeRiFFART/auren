/**
 * Auren — universal product page.
 * Reads the product id from the URL (product.html?id=…) and renders
 * the matching product from the shared catalogue data.
 */
(function () {
  'use strict';

  const {
    products, cart, icons, getProduct, getCategory, productCard, ratingMarkup, quantityStepper,
    clampQuantity, addToCart, escapeHtml, formatPrice, priceMarkup, observeReveals, initAccordions,
  } = window.Auren;

  const root = document.querySelector('[data-product]');
  const relatedSection = document.querySelector('[data-related]');
  const product = getProduct(new URLSearchParams(window.location.search).get('id'));

  /* ---------- Not found ---------- */

  if (!product) {
    document.title = 'Product not found — Auren';
    root.innerHTML = `
      <div class="empty-state">
        <h1 class="empty-state__title">We couldn’t find that product</h1>
        <p>The link may be out of date, or the model is no longer in the range.</p>
        <a class="btn btn--primary" href="catalog.html">Browse all headphones</a>
      </div>`;
    return;
  }

  const category = getCategory(product.category);
  document.title = `${product.name} — Auren`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', `${product.name}: ${product.tagline}`);

  /* ---------- Gallery views ---------- */

  // Only genuine photographs: no artificial zoomed copies of the overview.
  const views = [{ label: 'Overview', src: product.image, alt: product.alt }];
  if (product.gallery) {
    product.gallery.forEach((image) => views.push({ label: image.label, src: image.src, alt: image.alt }));
  }

  /* ---------- Markup ---------- */

  const optionsMarkup = product.option.values
    .map(
      (value, index) => `
        <label class="option">
          <input class="option__input" type="radio" name="option" value="${index}"${index === 0 ? ' checked' : ''}>
          <span class="option__body">
            <span class="option__label">${escapeHtml(value.label)}</span>
            <span class="option__price">${value.delta ? `+${formatPrice(value.delta)}` : 'Included'}</span>
          </span>
        </label>`
    )
    .join('');

  const specsMarkup = Object.entries(product.specs)
    .map(([label, value]) => `<div class="spec-table__row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');

  root.innerHTML = `
    <div class="product__layout">
      <div class="gallery">
        <div class="gallery__main">
          <img class="gallery__image" src="${views[0].src}" alt="${escapeHtml(views[0].alt)}" width="1000" height="1000" data-gallery-image>
          ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
        </div>
        <div class="gallery__thumbs" role="group" aria-label="Product views">
          ${views
            .map(
              (view, index) => `
                <button class="gallery__thumb${index === 0 ? ' is-active' : ''}" type="button" data-view="${index}" aria-pressed="${index === 0}">
                  <span class="gallery__thumb-media"><img src="${view.src}" alt="" width="160" height="160"></span>
                  <span class="gallery__thumb-label">${escapeHtml(view.label)}</span>
                </button>`
            )
            .join('')}
        </div>
      </div>

      <div class="product__info">
        <p class="product__category"><a href="catalog.html?category=${category.id}">${escapeHtml(category.label)}</a></p>
        <h1 class="product__title">${escapeHtml(product.name)}</h1>
        <p class="product__tagline">${escapeHtml(product.tagline)}</p>
        ${ratingMarkup(product)}

        <p class="product__price" aria-live="polite" data-price>${priceMarkup(product)}</p>

        <form class="buy" data-buy>
          <fieldset class="option-group">
            <legend>${escapeHtml(product.option.name)}</legend>
            <div class="option-group__list">${optionsMarkup}</div>
          </fieldset>

          <div class="buy__row">
            ${quantityStepper({ value: 1, label: 'Quantity' })}
            <button class="btn btn--ghost btn--lg buy__add" type="submit">Add to cart</button>
          </div>
          <button class="btn btn--primary btn--lg buy__now" type="button" data-buy-now>Buy now</button>
        </form>

        <p class="stock"><span class="stock__dot" aria-hidden="true"></span>In stock — ships within one business day</p>

        <ul class="assurances">
          <li>${icons.check}<span>Free standard shipping on orders over ${formatPrice(cart.freeShippingFrom)}</span></li>
          <li>${icons.check}<span>30-day returns with a prepaid label</span></li>
          <li>${icons.check}<span>Two-year warranty, serviced in-house</span></li>
        </ul>
      </div>
    </div>

    <div class="product__details">
      <div class="product__column">
        <section aria-labelledby="overview-title">
          <h2 id="overview-title">Overview</h2>
          <p class="product__description">${escapeHtml(product.description)}</p>
          <ul class="feature-list">
            ${product.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}
          </ul>
        </section>

        <section aria-labelledby="box-title">
          <h2 id="box-title">In the box</h2>
          <ul class="box-list">
            ${product.box.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </section>
      </div>

      <div class="product__column">
        <section id="specs" aria-labelledby="specs-title">
          <h2 id="specs-title">Specifications</h2>
          <dl class="spec-table">${specsMarkup}</dl>
        </section>

        <section id="delivery" aria-labelledby="delivery-title">
          <h2 id="delivery-title">Shipping &amp; returns</h2>
          <div class="accordion">
            <details open>
              <summary>Delivery</summary>
              <p>Orders placed before 2 pm ship the same business day. Standard delivery takes 3–5 business days and is free over ${formatPrice(cart.freeShippingFrom)}; express delivery (1–2 business days) is $18.</p>
            </details>
            <details>
              <summary>Returns</summary>
              <p>Try ${escapeHtml(product.name)} at home for 30 days. If it isn’t right, send it back with the prepaid label in the box for a full refund — opened ear tips and cushions included.</p>
            </details>
            <details>
              <summary>Warranty &amp; repairs</summary>
              <p>Every Auren product carries a two-year warranty. Batteries, cushions and cables are stocked as spare parts for at least seven years.</p>
            </details>
          </div>
          <p class="product__help"><a class="link-arrow" href="help.html">Shipping, returns and contact ${icons.arrow}</a></p>
        </section>
      </div>
    </div>`;

  initAccordions(root);

  /* ---------- Gallery behaviour ---------- */

  const mainImage = root.querySelector('[data-gallery-image]');
  const thumbs = [...root.querySelectorAll('[data-view]')];

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const view = views[Number(thumb.dataset.view)];
      if (mainImage.getAttribute('src') !== view.src) mainImage.src = view.src;
      mainImage.alt = view.alt;
      thumbs.forEach((other) => {
        const on = other === thumb;
        other.classList.toggle('is-active', on);
        other.setAttribute('aria-pressed', String(on));
      });
    });
  });

  /* ---------- Buying ---------- */

  const form = root.querySelector('[data-buy]');
  const priceOutput = root.querySelector('[data-price]');
  const quantityInput = form.querySelector('[data-qty-input]');
  const stepButtons = [...form.querySelectorAll('[data-qty-step]')];

  const selectedOption = () => Number(new FormData(form).get('option')) || 0;

  function setQuantity(value) {
    const quantity = clampQuantity(value);
    quantityInput.value = String(quantity);
    stepButtons[0].disabled = quantity <= 1;
    stepButtons[1].disabled = quantity >= cart.maxQuantity;
    return quantity;
  }

  form.addEventListener('change', (event) => {
    if (event.target.name === 'option') {
      priceOutput.innerHTML = priceMarkup(product, product.option.values[selectedOption()].delta);
    }
    if (event.target === quantityInput) setQuantity(quantityInput.value);
  });

  stepButtons.forEach((button) => {
    button.addEventListener('click', () => setQuantity(Number(quantityInput.value) + Number(button.dataset.qtyStep)));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addToCart(product.id, selectedOption(), setQuantity(quantityInput.value));
  });

  form.querySelector('[data-buy-now]').addEventListener('click', () => {
    cart.add(product.id, selectedOption(), setQuantity(quantityInput.value));
    window.location.href = 'checkout.html';
  });

  /* ---------- Related products ---------- */

  const sameCategory = products.filter((item) => item.category === product.category && item.id !== product.id);
  const others = products
    .filter((item) => item.category !== product.category)
    .sort((a, b) => Math.abs(a.price - product.price) - Math.abs(b.price - product.price));
  const related = sameCategory.concat(others).slice(0, 4);

  relatedSection.querySelector('[data-related-grid]').innerHTML = related.map(productCard).join('');
  relatedSection.hidden = false;
  observeReveals(relatedSection);
})();
