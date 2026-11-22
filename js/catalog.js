/**
 * Auren — catalogue: search, filters and sorting working together.
 * The current selection is mirrored in the URL so it can be shared.
 */
(function () {
  'use strict';

  const { categories, products, getCategory, productCard, escapeHtml, observeReveals, icons, isNewVisit } = window.Auren;

  const PRICE_RANGES = {
    'under-150': { label: 'Under $150', test: (price) => price < 150 },
    '150-300': { label: '$150 – $300', test: (price) => price >= 150 && price <= 300 },
    '300-500': { label: '$300 – $500', test: (price) => price > 300 && price <= 500 },
    'over-500': { label: 'Over $500', test: (price) => price > 500 },
  };

  const SORTERS = {
    featured: (a, b) => products.indexOf(a) - products.indexOf(b),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    name: (a, b) => a.name.localeCompare(b.name),
  };

  const elements = {
    title: document.querySelector('[data-catalog-title]'),
    intro: document.querySelector('[data-catalog-intro]'),
    chips: document.querySelector('[data-category-chips]'),
    form: document.querySelector('[data-filters]'),
    filtersToggle: document.querySelector('[data-filters-toggle]'),
    search: document.querySelector('[data-search]'),
    sort: document.querySelector('[data-sort]'),
    count: document.querySelector('[data-result-count]'),
    active: document.querySelector('[data-active-filters]'),
    grid: document.querySelector('[data-grid]'),
    empty: document.querySelector('[data-empty]'),
  };

  const defaults = () => ({ query: '', category: 'all', wireless: false, wired: false, anc: false, mic: false, price: 'any', sort: 'featured' });
  let state = defaults();

  /* ---------- URL <-> state ---------- */

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = defaults();
    if (isNewVisit) {
      let changed = false;
      ['q', 'category', 'connection', 'features', 'price', 'sort'].forEach((key) => {
        if (params.has(key)) changed = true;
        params.delete(key);
      });
      if (changed) {
        const query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
      }
      return next;
    }
    next.query = (params.get('q') || '').slice(0, 80);
    if (getCategory(params.get('category'))) next.category = params.get('category');
    const connection = (params.get('connection') || '').split(',');
    next.wireless = connection.includes('wireless');
    next.wired = connection.includes('wired');
    const features = (params.get('features') || '').split(',');
    next.anc = features.includes('anc');
    next.mic = features.includes('mic');
    if (PRICE_RANGES[params.get('price')]) next.price = params.get('price');
    if (SORTERS[params.get('sort')]) next.sort = params.get('sort');
    return next;
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category !== 'all') params.set('category', state.category);
    const connection = ['wireless', 'wired'].filter((key) => state[key]);
    if (connection.length) params.set('connection', connection.join(','));
    const features = ['anc', 'mic'].filter((key) => state[key]);
    if (features.length) params.set('features', features.join(','));
    if (state.price !== 'any') params.set('price', state.price);
    if (state.sort !== 'featured') params.set('sort', state.sort);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }

  /* ---------- Filtering ---------- */

  function searchText(product) {
    const category = getCategory(product.category);
    return [
      product.name,
      product.tagline,
      product.description,
      category.name,
      category.label,
      product.wireless ? 'wireless bluetooth' : 'wired cable',
      product.anc ? 'anc noise cancelling' : '',
      product.mic ? 'microphone mic' : '',
      ...product.features,
      ...product.keys.map((pair) => pair.join(' ')),
    ]
      .join(' ')
      .toLowerCase();
  }

  const searchIndex = new Map(products.map((product) => [product.id, searchText(product)]));

  function filterProducts() {
    const words = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    const oneConnection = state.wireless !== state.wired;
    return products
      .filter((product) => {
        if (state.category !== 'all' && product.category !== state.category) return false;
        if (oneConnection && product.wireless !== state.wireless) return false;
        if (state.anc && !product.anc) return false;
        if (state.mic && !product.mic) return false;
        if (state.price !== 'any' && !PRICE_RANGES[state.price].test(product.price)) return false;
        const haystack = searchIndex.get(product.id);
        return words.every((word) => haystack.includes(word));
      })
      .sort(SORTERS[state.sort]);
  }

  /* ---------- Rendering ---------- */

  function renderChips() {
    const all = [{ id: 'all', name: 'All', count: products.length }].concat(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        count: products.filter((product) => product.category === category.id).length,
      }))
    );
    elements.chips.innerHTML = all
      .map(
        (chip) => `
          <button class="chip${chip.id === state.category ? ' is-active' : ''}" type="button" data-category="${chip.id}" aria-pressed="${chip.id === state.category}">
            <span class="chip__label">${escapeHtml(chip.name)}</span> <span class="chip__count">${chip.count}</span>
          </button>`
      )
      .join('');
  }

  function activeFilters() {
    const list = [];
    if (state.query) list.push({ key: 'query', label: `“${state.query}”` });
    if (state.category !== 'all') list.push({ key: 'category', label: getCategory(state.category).name });
    if (state.wireless) list.push({ key: 'wireless', label: 'Wireless' });
    if (state.wired) list.push({ key: 'wired', label: 'Wired' });
    if (state.anc) list.push({ key: 'anc', label: 'Noise cancelling' });
    if (state.mic) list.push({ key: 'mic', label: 'Microphone' });
    if (state.price !== 'any') list.push({ key: 'price', label: PRICE_RANGES[state.price].label });
    return list;
  }

  function syncControls() {
    elements.search.value = state.query;
    elements.sort.value = state.sort;
    ['wireless', 'wired', 'anc', 'mic'].forEach((key) => {
      elements.form.elements[key].checked = state[key];
    });
    elements.form.elements.price.value = state.price;
  }

  function render() {
    const results = filterProducts();
    const filters = activeFilters();
    const category = state.category === 'all' ? null : getCategory(state.category);

    document.title = `${category ? category.label : 'All headphones'} — Auren`;
    elements.title.textContent = category ? category.label : 'All headphones';
    elements.intro.textContent = category
      ? `${category.blurb}. ${products.filter((product) => product.category === category.id).length} models in this range.`
      : '20 models · 5 ranges · 2-year warranty';

    renderChips();

    elements.count.textContent =
      results.length === products.length
        ? `Showing all ${products.length} models`
        : `Showing ${results.length} of ${products.length} models`;

    elements.active.innerHTML = filters.length
      ? filters
          .map(
            (filter) => `
              <li><button class="filter-tag" type="button" data-clear="${filter.key}" aria-label="Remove filter: ${escapeHtml(filter.label)}">${escapeHtml(filter.label)}${icons.close}</button></li>`
          )
          .join('') + '<li><button class="link-button" type="button" data-reset>Reset all</button></li>'
      : '';
    elements.active.closest('[data-filter-status]').hidden = filters.length === 0;

    elements.grid.innerHTML = results.map(productCard).join('');
    elements.grid.hidden = results.length === 0;
    elements.empty.hidden = results.length !== 0;
    elements.filtersToggle.querySelector('[data-filter-count]').textContent = filters.length ? ` (${filters.length})` : '';
    observeReveals(elements.grid);
  }

  function update(patch) {
    state = { ...state, ...patch };
    writeUrl();
    render();
  }

  function reset() {
    state = { ...defaults(), sort: state.sort };
    syncControls();
    writeUrl();
    render();
  }

  /* ---------- Events ---------- */

  let searchTimer = 0;
  elements.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => update({ query: elements.search.value.trim() }), 140);
  });
  elements.search.closest('form').addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    update({ query: elements.search.value.trim() });
  });

  elements.sort.addEventListener('change', () => update({ sort: elements.sort.value }));

  elements.form.addEventListener('change', () => {
    const fields = elements.form.elements;
    update({
      wireless: fields.wireless.checked,
      wired: fields.wired.checked,
      anc: fields.anc.checked,
      mic: fields.mic.checked,
      price: fields.price.value,
    });
  });
  elements.form.addEventListener('submit', (event) => event.preventDefault());

  elements.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;
    update({ category: chip.dataset.category });
    // The chips are re-rendered; keep keyboard focus on the chosen one.
    const next = elements.chips.querySelector(`[data-category="${chip.dataset.category}"]`);
    if (next) next.focus();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset]')) {
      reset();
      elements.search.focus();
      return;
    }
    const clear = event.target.closest('[data-clear]');
    if (!clear) return;
    const key = clear.dataset.clear;
    const cleared = { query: '', category: 'all', price: 'any' };
    update({ [key]: key in cleared ? cleared[key] : false });
    syncControls();
    elements.search.focus();
  });

  elements.filtersToggle.addEventListener('click', () => {
    const open = elements.filtersToggle.getAttribute('aria-expanded') !== 'true';
    elements.filtersToggle.setAttribute('aria-expanded', String(open));
    elements.form.classList.toggle('is-open', open);
  });

  /* ---------- Start ---------- */

  state = readUrl();
  syncControls();
  render();

  if (new URLSearchParams(window.location.search).get('focus') === 'search') {
    elements.search.focus();
  }
})();
