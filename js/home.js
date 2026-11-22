/**
 * Auren — home page: categories, featured products, the 3D hero
 * and the "Inside Meridian One" section.
 *
 * 3D can be controlled from the URL for testing:
 *   ?3d=off    disable 3D (text and product photographs remain)
 *   ?3d=force  skip the low-power and frame-rate checks
 */
(function () {
  'use strict';

  const { categories, products, getProduct, productCard, formatPrice, escapeHtml, observeReveals, reducedMotion } = window.Auren;

  const FEATURED_COUNT = 6;
  const mode3d = new URLSearchParams(window.location.search).get('3d');

  /* ---------- 3D capability ---------- */

  function webglAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch (error) {
      return false;
    }
  }

  function lowPowerDevice() {
    const connection = navigator.connection;
    return Boolean((connection && connection.saveData) || (navigator.deviceMemory && navigator.deviceMemory <= 2));
  }

  const can3d = mode3d !== 'off' && webglAvailable() && (mode3d === 'force' || !lowPowerDevice());

  function whenIdle(callback) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 1200 });
    } else {
      window.setTimeout(callback, 200);
    }
  }

  /* ---------- Categories ---------- */

  function renderCategories() {
    const list = document.querySelector('[data-categories]');
    if (!list) return;
    list.innerHTML = categories
      .map((category) => {
        const items = products.filter((product) => product.category === category.id);
        const from = Math.min(...items.map((product) => product.price));
        const cover = getProduct(category.cover);
        return `
          <li data-reveal>
            <a class="category-tile" href="catalog.html?category=${category.id}">
              <span class="category-tile__media"><img src="${cover.image}" alt="" width="1000" height="1000" loading="lazy" decoding="async"></span>
              <span class="category-tile__text">
                <span class="category-tile__name">${escapeHtml(category.name)}</span>
                <span class="category-tile__meta">${items.length} models · from ${formatPrice(from)}</span>
              </span>
            </a>
          </li>`;
      })
      .join('');
    observeReveals(list);
  }

  /* ---------- Featured products ---------- */

  function renderFeatured() {
    const grid = document.querySelector('[data-featured]');
    if (!grid) return;
    grid.innerHTML = products.slice(0, FEATURED_COUNT).map(productCard).join('');
    observeReveals(grid);
  }

  function initFeaturedLayout() {
    const section = document.querySelector('.featured');
    const container = section?.querySelector('.container');
    const header = section?.querySelector('.section-head');
    const title = header?.querySelector('.section-title');
    const link = header?.querySelector('.link-arrow');
    if (!container || !title || !link) return;
    let measuredWidth = -1;

    function update() {
      measuredWidth = container.clientWidth;
      const measure = document.createElement('div');
      measure.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;display:flex;width:max-content;contain:layout style;';
      measure.setAttribute('aria-hidden', 'true');
      measure.inert = true;
      const clones = [title, link].map((element) => {
        const clone = element.cloneNode(true);
        const styles = getComputedStyle(element);
        clone.removeAttribute('id');
        Object.assign(clone.style, {
          font: styles.font,
          letterSpacing: styles.letterSpacing,
          whiteSpace: 'nowrap',
          width: 'max-content',
          maxWidth: 'none',
          margin: '0',
          flex: 'none',
        });
        measure.appendChild(clone);
        return clone;
      });
      document.body.appendChild(measure);
      const needed = clones.reduce((sum, clone) => sum + clone.getBoundingClientRect().width, 0) +
        (parseFloat(getComputedStyle(header).columnGap) || 32);
      measure.remove();
      section.classList.toggle('is-compact', needed + 1 > measuredWidth);
    }

    update();
    const observer = new ResizeObserver(() => {
      if (container.clientWidth !== measuredWidth) update();
    });
    observer.observe(container);
    window.addEventListener('resize', update);
    document.fonts.ready.then(update);
  }

  /* ---------- Hero ---------- */

  function initHeroEntrance() {
    const hero = document.querySelector('.hero');
    const title = hero?.querySelector('.hero__title');
    if (!hero || !title || reducedMotion) return;

    // Keep a single accessible heading while its visual words reveal in sequence.
    const text = title.textContent.trim();
    const accessibleText = document.createElement('span');
    accessibleText.className = 'sr-only';
    accessibleText.textContent = text;
    title.replaceChildren(accessibleText);
    text.split(/\s+/).forEach((word, index, words) => {
      const span = document.createElement('span');
      span.className = 'hero__reveal-word';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--word-delay', `${120 + index * 85}ms`);
      span.textContent = word;
      title.append(span);
      if (index < words.length - 1) title.append(' ');
    });
    hero.classList.add('is-entering');

    const stats = hero.querySelector('.hero__stats');
    if (!stats) return;
    const counters = [...stats.querySelectorAll('[data-count-to]')];
    const smallView = window.matchMedia('(max-width: 467px)');
    let frameId = 0;
    let wasVisible = false;
    let hasPlayed = false;
    const showValues = (progress) => counters.forEach((counter) => {
      counter.textContent = String(Math.round(Number(counter.dataset.countTo) * progress));
    });
    showValues(0);

    function startCounters() {
      cancelAnimationFrame(frameId);
      showValues(0);
      stats.classList.remove('is-revealing');
      void stats.offsetWidth;
      stats.classList.add('is-revealing');
      hasPlayed = true;
      const start = performance.now();
      const duration = 900;
      function frame(now) {
        const progress = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        showValues(eased);
        if (progress < 1) frameId = requestAnimationFrame(frame);
      }
      frameId = requestAnimationFrame(frame);
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible && !wasVisible && (!hasPlayed || smallView.matches)) startCounters();
      if (!visible) {
        cancelAnimationFrame(frameId);
        showValues(smallView.matches || !hasPlayed ? 0 : 1);
        if (smallView.matches) stats.classList.remove('is-revealing');
      }
      wasVisible = visible;
    }, { threshold: 0.05 });
    observer.observe(stats);

    let lastWidth = window.innerWidth;
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      window.clearTimeout(resizeTimer);
      if (!smallView.matches) return;
      resizeTimer = window.setTimeout(() => {
        if (!smallView.matches) return;
        const bounds = stats.getBoundingClientRect();
        wasVisible = bounds.bottom > 0 && bounds.top < window.innerHeight;
        if (wasVisible) startCounters();
        else showValues(0);
      }, 120);
    });
  }

  function initHero() {
    const visual = document.querySelector('[data-hero-visual]');
    if (!visual) return;
    const showFallback = () => visual.classList.add('is-fallback');

    if (!can3d) {
      showFallback();
      return;
    }

    whenIdle(() => {
      import('./three/hero.js')
        .then(({ createHero }) => {
          createHero(visual, {
            reducedMotion,
            guard: mode3d !== 'force',
            onFail() {
              visual.classList.remove('is-3d');
              showFallback();
            },
          });
          window.requestAnimationFrame(() => {
            visual.classList.add('is-3d');
            visual.classList.remove('is-fallback');
          });
        })
        .catch(() => {
          showFallback();
        });
    });
  }

  /* ---------- Inside Meridian One ---------- */

  function initAnatomy() {
    const section = document.querySelector('[data-anatomy]');
    if (!section) return;

    const stage = section.querySelector('[data-anatomy-stage]');
    const presentation = section.querySelector('[data-anatomy-presentation]');
    const panel = section.querySelector('.anatomy__panel');
    const detailList = section.querySelector('.anatomy__parts');
    const actions = section.querySelector('.anatomy__actions');
    const hotspotLayer = section.querySelector('[data-anatomy-hotspots]');
    const toggle = section.querySelector('[data-anatomy-toggle]');
    const toggleLabel = toggle.querySelector('[data-anatomy-toggle-label]');
    const toggleWrap = section.querySelector('[data-anatomy-toggle-wrap]');
    const heads = [...section.querySelectorAll('[data-part]')];
    const items = heads.map((head) => head.closest('.anatomy-part'));

    // Share of the scroll distance used to pull the earcup apart.
    const EXPLODE_PHASE = 0.2;

    // Scroll-driven mode needs 3D, room on screen and motion allowed.
    const scrollyQuery = window.matchMedia('(min-width: 1024px) and (min-height: 760px)');
    const stackedQuery = window.matchMedia('(max-width: 1023px)');
    let scrolly = can3d && !reducedMotion && scrollyQuery.matches;
    let scene = null;
    let active = -1;
    let exploded = false;
    let manualInitialized = false;
    let manualSceneInitialized = false;

    // Numbered hotspots over the canvas mirror the list.
    const hotspots = heads.map((head, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotspot';
      button.tabIndex = -1;
      button.textContent = String(index + 1);
      button.setAttribute('aria-label', `${index + 1}. ${head.querySelector('.anatomy-part__name').textContent}`);
      button.setAttribute('aria-controls', head.getAttribute('aria-controls'));
      button.addEventListener('click', () => choose(index));
      hotspotLayer.appendChild(button);
      return button;
    });

    function setActive(index) {
      active = index;
      heads.forEach((head, i) => {
        const on = i === index;
        head.setAttribute('aria-expanded', String(on));
        items[i].classList.toggle('is-active', on);
        hotspots[i].classList.toggle('is-active', on);
        hotspots[i].setAttribute('aria-pressed', String(on));
      });
      if (scene) scene.setActive(index);
    }

    function setExploded(value, { immediate = false } = {}) {
      exploded = value;
      if (scene) scene.setExplode(value ? 1 : 0, { immediate: immediate || reducedMotion });
      toggleLabel.textContent = value ? 'Reassemble' : 'Take apart';
      toggle.setAttribute('aria-pressed', String(value));
      section.classList.toggle('is-exploded', value);
    }

    function scrollRange() {
      const top = section.getBoundingClientRect().top + window.scrollY;
      return { top, distance: Math.max(1, section.offsetHeight - window.innerHeight) };
    }

    /** A part was picked from the list or a hotspot. */
    function choose(index) {
      if (scrolly) {
        // Scroll to the stretch of the section that belongs to this part.
        const { top, distance } = scrollRange();
        const share = (1 - EXPLODE_PHASE) / heads.length;
        window.scrollTo({ top: top + distance * (EXPLODE_PHASE + share * (index + 0.5)), behavior: 'smooth' });
        return;
      }
      if (index === active) {
        if (!stackedQuery.matches) setActive(-1);
        return;
      }
      if (!exploded) setExploded(true);
      setActive(index);
    }

    heads.forEach((head, index) => head.addEventListener('click', () => choose(index)));

    function onScroll() {
      if (!scrolly) return;
      const { top, distance } = scrollRange();
      const progress = Math.min(1, Math.max(0, (window.scrollY - top) / distance));
      if (scene) scene.setExplode(Math.min(1, progress / EXPLODE_PHASE));
      const index =
        progress < EXPLODE_PHASE
          ? -1
          : Math.min(heads.length - 1, Math.floor(((progress - EXPLODE_PHASE) / (1 - EXPLODE_PHASE)) * heads.length));
      if (index !== active) setActive(index);
    }

    function applyMode() {
      const grouped = can3d && !section.classList.contains('is-fallback') && stackedQuery.matches;
      const destination = grouped ? presentation : panel;
      if (detailList.parentElement !== destination) {
        destination.append(detailList, actions);
      }
      detailList.setAttribute('aria-live', stackedQuery.matches ? 'polite' : 'off');
      detailList.setAttribute('aria-atomic', 'true');
      section.classList.toggle('is-scrolly', scrolly);
      section.classList.toggle('is-manual', grouped);
      toggleWrap.hidden = !grouped;
      if (grouped) {
        if (!manualInitialized) {
          exploded = true;
          manualInitialized = true;
          setActive(0);
        }
        setExploded(exploded, { immediate: !manualSceneInitialized });
        if (scene) manualSceneInitialized = true;
        if (exploded && active === -1) setActive(0);
      } else if (scrolly) {
        onScroll();
      } else {
        setExploded(false);
      }
    }

    function useFallback() {
      scene = null;
      scrolly = false;
      section.classList.remove('is-3d');
      section.classList.add('is-fallback');
      applyMode();
      if (active === -1) setActive(0);
    }

    applyMode();

    toggle.addEventListener('click', () => {
      setExploded(!exploded);
      if (active === -1) setActive(0);
    });

    if (!can3d) {
      useFallback();
      return;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    function syncMode() {
      const available = can3d && !section.classList.contains('is-fallback');
      scrolly = available && !reducedMotion && scrollyQuery.matches;
      applyMode();
    }
    window.addEventListener('resize', syncMode);
    scrollyQuery.addEventListener('change', syncMode);
    stackedQuery.addEventListener('change', syncMode);

    // Load the scene shortly before the section scrolls into view.
    const loader = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        loader.disconnect();
        import('./three/anatomy.js')
          .then(({ createAnatomy }) => {
            scene = createAnatomy(stage, {
              hotspots,
              reducedMotion,
              guard: mode3d !== 'force',
              onFail: useFallback,
            });
            section.classList.add('is-3d');
            scene.setActive(active);
            applyMode();
          })
          .catch(useFallback);
      },
      { rootMargin: '800px 0px' }
    );
    loader.observe(section);
  }

  renderCategories();
  renderFeatured();
  initFeaturedLayout();
  initHeroEntrance();
  initHero();
  initAnatomy();
})();
