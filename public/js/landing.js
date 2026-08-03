(function () {
  'use strict';

  const { formatPrice, waLink, escapeHtml, whatsappIconSvg, apiFetch, prefersReducedMotion, observeReveals } = window.JC;

  // ---------- Hero word reveal ----------

  function initHeroReveal() {
    const el = document.getElementById('heroTitle');
    if (!el) return;

    const parts = [
      { text: 'Elegancia', em: false },
      { text: 'que', em: false },
      { text: 'perdura', em: true },
      { text: 'en', em: false },
      { text: 'el', em: false },
      { text: 'tiempo', em: false },
    ];

    el.innerHTML = parts.map((part, i) => {
      const delay = 0.3 + i * 0.1;
      const inner = part.em ? `<em>${part.text}</em>` : part.text;
      return `<span class="word" style="animation-delay:${delay}s">${inner}</span>`;
    }).join(' ');
  }

  // ---------- Hero slideshow ----------

  function initHeroSlideshow() {
    const slides = document.querySelectorAll('#heroSlideshow .hero-slide');
    if (slides.length < 2 || prefersReducedMotion) return;

    let index = 0;
    setInterval(() => {
      slides[index].classList.remove('active');
      index = (index + 1) % slides.length;
      slides[index].classList.add('active');
    }, 6000);
  }

  // ---------- Categorías destacadas ----------

  function categoryCardHtml(cat, count, image, index) {
    const imageHtml = image
      ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">`
      : '';
    return `
      <a href="/categoria.html?cat=${encodeURIComponent(cat.id)}" class="category-card reveal-scale stagger-${Math.min(index + 1, 6)}">
        ${imageHtml}
        <div class="category-overlay"></div>
        <div class="category-card-content">
          <h3>${escapeHtml(cat.name)}</h3>
          <p>${count} producto${count === 1 ? '' : 's'}</p>
        </div>
      </a>`;
  }

  async function initCategories() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    try {
      const [productsRes, categories] = await Promise.all([
        apiFetch('/api/products?perPage=10000'),
        apiFetch('/api/categories'),
      ]);
      const products = productsRes.products;

      const withCounts = categories.map((cat) => {
        const catProducts = products.filter((p) => p.category === cat.id);
        const withImage = catProducts.find((p) => p.images && p.images[0]);
        return {
          cat,
          count: catProducts.length,
          image: withImage ? withImage.images[0] : null,
        };
      }).filter((c) => c.count > 0);

      withCounts.sort((a, b) => b.count - a.count);
      const top = withCounts.slice(0, 5);

      grid.innerHTML = top.map((c, i) => categoryCardHtml(c.cat, c.count, c.image, i)).join('');
      observeReveals(grid);
    } catch (err) {
      grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-secondary);">No pudimos cargar las categorías.</p>';
    }
  }

  // ---------- Carrusel de destacados ----------

  function featuredCardHtml(product) {
    const imageHtml = product.images && product.images[0]
      ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : `<div class="placeholder-icon">${window.JC.placeholderSvg()}</div>`;

    let badge = '';
    if (product.tags && product.tags.includes('oferta')) badge = '<span class="badge badge-oferta">Oferta</span>';
    else if (product.tags && product.tags.includes('nuevo')) badge = '<span class="badge badge-nuevo">Nuevo</span>';

    const hasDiscount = product.comparePrice && Number(product.comparePrice) > Number(product.price);
    const priceHtml = hasDiscount
      ? `<span class="price-old">${formatPrice(product.comparePrice)}</span><span class="price-current">${formatPrice(product.price)}</span>`
      : `<span class="price-current">${formatPrice(product.price)}</span>`;

    const link = waLink(`Hola, quiero consultar por ${product.name}`);

    return `
      <article class="product-card">
        <a href="/producto.html?id=${encodeURIComponent(product.id)}" class="product-card-media">
          ${badge}${imageHtml}
          <button type="button" class="product-card-wa" aria-label="Consultar por WhatsApp" data-wa="${escapeHtml(link)}">${whatsappIconSvg()}</button>
        </a>
        <a href="/producto.html?id=${encodeURIComponent(product.id)}" class="product-card-body">
          <h3>${escapeHtml(product.name)}</h3>
          <div class="product-card-price">${priceHtml}</div>
        </a>
      </article>`;
  }

  function initCarousel(products) {
    const track = document.getElementById('carouselTrack');
    const dotsWrap = document.getElementById('carouselDots');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    if (!track) return;

    if (!products.length) {
      track.innerHTML = '<p style="padding:40px; color:var(--text-secondary);">Todavía no hay productos destacados.</p>';
      dotsWrap.style.display = 'none';
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      return;
    }

    track.innerHTML = products.map(featuredCardHtml).join('');
    track.querySelectorAll('.product-card-wa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(btn.dataset.wa, '_blank', 'noopener,noreferrer');
      });
    });

    function getPerView() {
      if (window.innerWidth <= 560) return 1;
      if (window.innerWidth <= 900) return 2;
      return 4;
    }

    let index = 0;
    let perView = getPerView();
    let maxIndex = Math.max(0, products.length - perView);
    let autoplayTimer = null;

    function renderDots() {
      const dotCount = maxIndex + 1;
      dotsWrap.innerHTML = '';
      for (let i = 0; i < dotCount; i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot' + (i === index ? ' active' : '');
        dot.setAttribute('aria-label', `Ir al grupo ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsWrap.appendChild(dot);
      }
    }

    function updateFocus() {
      const cards = Array.from(track.children).filter((el) => el.classList.contains('product-card'));
      const mid = (perView - 1) / 2;
      cards.forEach((card, i) => {
        const dist = Math.abs((i - index) - mid);
        const isFocus = dist < 1;
        card.classList.toggle('carousel-card-focus', isFocus);
        card.classList.toggle('carousel-card-side', !isFocus);
      });
    }

    function update() {
      const cardWidth = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width : 0;
      const gap = 24;
      track.style.transform = `translateX(-${index * (cardWidth + gap)}px)`;
      dotsWrap.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === index));
      updateFocus();
    }

    function goTo(i) {
      index = Math.max(0, Math.min(i, maxIndex));
      update();
    }

    function next() { goTo(index >= maxIndex ? 0 : index + 1); }
    function prev() { goTo(index <= 0 ? maxIndex : index - 1); }

    prevBtn.addEventListener('click', () => { prev(); restartAutoplay(); });
    nextBtn.addEventListener('click', () => { next(); restartAutoplay(); });

    function startAutoplay() {
      if (prefersReducedMotion || maxIndex === 0) return;
      autoplayTimer = setInterval(next, 5000);
    }
    function stopAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    function restartAutoplay() { stopAutoplay(); startAutoplay(); }

    const carousel = document.getElementById('featuredCarousel');
    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);

    // Touch swipe
    let touchStartX = 0;
    carousel.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      stopAutoplay();
    }, { passive: true });
    carousel.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx > 40) prev();
      else if (dx < -40) next();
      startAutoplay();
    }, { passive: true });

    window.addEventListener('resize', () => {
      perView = getPerView();
      maxIndex = Math.max(0, products.length - perView);
      index = Math.min(index, maxIndex);
      renderDots();
      update();
    });

    renderDots();
    update();
    startAutoplay();
  }

  async function initFeatured() {
    try {
      let data = await apiFetch('/api/products?featured=true&perPage=12');
      if (!data.products.length) {
        data = await apiFetch('/api/products?tag=oferta&perPage=12');
      }
      if (!data.products.length) {
        data = await apiFetch('/api/products?sort=newest&perPage=8');
      }
      initCarousel(data.products);
    } catch (err) {
      const track = document.getElementById('carouselTrack');
      if (track) track.innerHTML = '<p style="padding:40px; color:var(--text-secondary);">No pudimos cargar los destacados.</p>';
    }
  }

  // ---------- Parallax (secciones alternadas: trayectoria + nosotros) ----------

  function initParallax() {
    if (prefersReducedMotion) return;

    const pairs = [
      { layer: document.getElementById('parallaxLayerBanner'), section: document.querySelector('.brand-banner') },
      { layer: document.getElementById('parallaxLayerAbout'), section: document.querySelector('.about-image') },
    ].filter((p) => p.layer && p.section);
    if (!pairs.length) return;

    const mobileQuery = window.matchMedia('(max-width: 768px)');
    let ticking = false;

    function update() {
      ticking = false;
      const vh = window.innerHeight;

      if (mobileQuery.matches) {
        pairs.forEach(({ layer }) => { layer.style.transform = ''; });
        return;
      }

      pairs.forEach(({ layer, section }) => {
        const rect = section.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;
        const progress = (vh - rect.top) / (vh + rect.height);
        const offset = (progress - 0.5) * 60; // capped at ±30px
        layer.style.transform = `translateY(${offset}px)`;
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  // ---------- Counter animation ----------

  function initCounters() {
    const stats = document.querySelectorAll('[data-count-to]');
    if (!stats.length) return;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      stats.forEach((el) => {
        el.textContent = el.dataset.countTo + (el.dataset.countSuffix || '');
      });
      return;
    }

    const started = new WeakSet();

    function runCount(el) {
      if (started.has(el)) return;
      started.add(el);
      observer.unobserve(el);
      const target = Number(el.dataset.countTo);
      const suffix = el.dataset.countSuffix || '';
      const duration = 2000;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.classList.add('count-flash');
        }
      }
      requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) runCount(entry.target);
      });
    }, { threshold: 0.4 });

    stats.forEach((el) => {
      observer.observe(el);
      // Red de seguridad: si el observer nunca dispara (pestaña en segundo
      // plano, etc.), igual mostramos el valor final en vez de dejarlo en 0.
      setTimeout(() => runCount(el), 2500);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeroReveal();
    initHeroSlideshow();
    initCategories();
    initFeatured();
    initParallax();
    initCounters();
  });
})();
