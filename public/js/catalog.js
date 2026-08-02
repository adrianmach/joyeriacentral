(function () {
  'use strict';

  const { formatPrice, waLink, escapeHtml, whatsappIconSvg, placeholderSvg, apiFetch } = window.JC;
  const PAGE_SIZE = 24;

  const isCategoryPage = document.body.dataset.page === 'categoria';
  const fixedCategoryId = isCategoryPage ? new URLSearchParams(location.search).get('cat') : null;

  const state = {
    search: '',
    category: isCategoryPage ? fixedCategoryId : 'all',
    tag: 'all',
    sort: 'relevance',
    page: 1,
  };

  let allProducts = [];
  let allCategories = [];
  let searchDebounceTimer = null;

  // ---------- Data helpers ----------

  function categoryCount(catId) {
    if (catId === 'all') return allProducts.length;
    return allProducts.filter((p) => p.category === catId).length;
  }

  function scopedProducts() {
    return isCategoryPage ? allProducts.filter((p) => p.category === fixedCategoryId) : allProducts;
  }

  function tagCount(tag) {
    const pool = scopedProducts();
    if (tag === 'all') return pool.length;
    return pool.filter((p) => p.tags && p.tags.includes(tag)).length;
  }

  function getFiltered() {
    let list = allProducts.slice();

    if (state.category !== 'all') {
      list = list.filter((p) => p.category === state.category);
    }
    if (state.tag !== 'all') {
      list = list.filter((p) => p.tags && p.tags.includes(state.tag));
    }
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    switch (state.sort) {
      case 'price_asc': list.sort((a, b) => a.price - b.price); break;
      case 'price_desc': list.sort((a, b) => b.price - a.price); break;
      case 'name_asc': list.sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
      case 'newest': list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
      default: list.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    return list;
  }

  // ---------- Card rendering ----------

  function productCardHtml(product, index) {
    const imageHtml = product.images && product.images[0]
      ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : `<div class="placeholder-icon">${placeholderSvg()}</div>`;

    let badge = '';
    if (product.tags && product.tags.includes('oferta')) badge = '<span class="badge badge-oferta">Oferta</span>';
    else if (product.tags && product.tags.includes('nuevo')) badge = '<span class="badge badge-nuevo">Nuevo</span>';

    const hasDiscount = product.comparePrice && Number(product.comparePrice) > Number(product.price);
    const priceHtml = hasDiscount
      ? `<span class="price-old">${formatPrice(product.comparePrice)}</span><span class="price-current">${formatPrice(product.price)}</span>`
      : `<span class="price-current">${formatPrice(product.price)}</span>`;

    const oosHtml = !product.inStock ? '<span class="price-oos">Sin stock</span>' : '';
    const link = waLink(`Hola, quiero consultar por ${product.name}`);
    const delay = Math.min(index, 12) * 0.05;

    return `
      <article class="product-card" style="animation-delay:${delay}s">
        <a href="/producto.html?id=${encodeURIComponent(product.id)}" class="product-card-media">
          ${badge}${imageHtml}
          <button type="button" class="product-card-wa" aria-label="Consultar por WhatsApp" data-wa="${escapeHtml(link)}">${whatsappIconSvg()}</button>
        </a>
        <a href="/producto.html?id=${encodeURIComponent(product.id)}" class="product-card-body">
          <h3>${escapeHtml(product.name)}</h3>
          <div class="product-card-price">${priceHtml}</div>
          ${oosHtml}
        </a>
      </article>`;
  }

  // ---------- Render: pills ----------

  function renderPillsInto(container, items, activeId, onClick) {
    if (!container) return;
    container.innerHTML = items.map((item) => (
      `<button type="button" class="filter-pill${item.id === activeId ? ' active' : ''}" data-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`
    )).join('');
    container.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => onClick(btn.dataset.id));
    });
  }

  function renderCategoryPills() {
    if (isCategoryPage) return;
    const items = [{ id: 'all', label: `Todas (${categoryCount('all')})` }]
      .concat(allCategories.map((c) => ({ id: c.id, label: `${c.name} (${categoryCount(c.id)})` })));

    const onClick = (id) => {
      state.category = id;
      state.page = 1;
      renderAll();
    };
    renderPillsInto(document.getElementById('categoryPills'), items, state.category, onClick);
    renderPillsInto(document.getElementById('drawerCategoryPills'), items, state.category, onClick);
  }

  function renderTagPills() {
    const items = [
      { id: 'all', label: `Todos (${tagCount('all')})` },
      { id: 'nuevo', label: `Nuevos (${tagCount('nuevo')})` },
      { id: 'oferta', label: `En oferta (${tagCount('oferta')})` },
    ];
    const onClick = (id) => {
      state.tag = id;
      state.page = 1;
      renderAll();
    };
    renderPillsInto(document.getElementById('tagPills'), items, state.tag, onClick);
    renderPillsInto(document.getElementById('drawerTagPills'), items, state.tag, onClick);
  }

  // ---------- Render: sort ----------

  function syncSortSelects() {
    document.querySelectorAll('.sort-select').forEach((sel) => { sel.value = state.sort; });
  }

  function initSortSelects() {
    document.querySelectorAll('.sort-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        state.sort = sel.value;
        state.page = 1;
        syncSortSelects();
        renderAll();
      });
    });
  }

  // ---------- Render: grid + pagination + count ----------

  function renderGrid(list) {
    const grid = document.getElementById('productGrid');
    if (!list.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6"></circle><path d="m21 21-5-5M8 10h4"></path></svg>
          <h3>No encontramos productos con esos filtros</h3>
          <p>Probá con otra búsqueda o quitá algunos filtros.</p>
          <button type="button" class="btn btn-outline" id="clearFiltersBtn">Limpiar filtros</button>
        </div>`;
      const clearBtn = document.getElementById('clearFiltersBtn');
      if (clearBtn) clearBtn.addEventListener('click', clearFilters);
      return;
    }

    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);
    grid.innerHTML = pageItems.map(productCardHtml).join('');

    grid.querySelectorAll('.product-card-wa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(btn.dataset.wa, '_blank', 'noopener,noreferrer');
      });
    });
  }

  function renderPagination(total) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const wrap = document.getElementById('pagination');
    if (!wrap) return;

    if (pages <= 1) { wrap.innerHTML = ''; return; }

    function goTo(p) {
      state.page = Math.min(Math.max(1, p), pages);
      renderAll();
      const grid = document.getElementById('productGrid');
      if (grid) grid.scrollIntoView({ behavior: window.JC.prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }

    const items = [];
    items.push(`<button type="button" class="page-btn" data-p="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Página anterior">«</button>`);

    const windowSize = 1;
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - state.page) <= windowSize) {
        items.push(`<button type="button" class="page-btn${p === state.page ? ' active' : ''}" data-p="${p}">${p}</button>`);
      } else if (Math.abs(p - state.page) === windowSize + 1) {
        items.push('<span class="page-ellipsis">…</span>');
      }
    }
    items.push(`<button type="button" class="page-btn" data-p="${state.page + 1}" ${state.page === pages ? 'disabled' : ''} aria-label="Página siguiente">»</button>`);

    wrap.innerHTML = items.join('');
    wrap.querySelectorAll('.page-btn[data-p]:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => goTo(Number(btn.dataset.p)));
    });
  }

  function renderCount(total) {
    const el = document.getElementById('resultsCount');
    if (!el) return;
    el.textContent = `Mostrando ${total} de ${scopedProducts().length} productos`;
  }

  function renderCategoryBanner() {
    if (!isCategoryPage) return;
    const cat = allCategories.find((c) => c.id === fixedCategoryId);
    const nameEl = document.getElementById('categoryName');
    const breadcrumbEl = document.getElementById('breadcrumbCategoryName');
    const countEl = document.getElementById('categoryCount');
    if (!cat) {
      if (nameEl) nameEl.textContent = 'Categoría no encontrada';
      if (breadcrumbEl) breadcrumbEl.textContent = 'Categoría no encontrada';
      if (countEl) countEl.textContent = '';
      return;
    }
    if (nameEl) nameEl.textContent = cat.name;
    if (breadcrumbEl) breadcrumbEl.textContent = cat.name;
    if (countEl) countEl.textContent = `${categoryCount(cat.id)} producto${categoryCount(cat.id) === 1 ? '' : 's'}`;
    document.title = `Joyería Central — ${cat.name}`;
  }

  function renderOtherCategories() {
    if (!isCategoryPage) return;
    const wrap = document.getElementById('otherCategoriesGrid');
    if (!wrap) return;
    const others = allCategories.filter((c) => c.id !== fixedCategoryId && categoryCount(c.id) > 0);
    wrap.innerHTML = others.map((c) => `
      <a href="/categoria.html?cat=${encodeURIComponent(c.id)}" class="other-category-card">
        <h4>${escapeHtml(c.name)}</h4>
        <p>${categoryCount(c.id)} productos</p>
      </a>`).join('');
  }

  // ---------- Search ----------

  function renderSuggestions(query) {
    const box = document.getElementById('searchSuggestions');
    if (!box) return;
    if (!query.trim()) { box.classList.remove('open'); box.innerHTML = ''; return; }

    const q = query.trim().toLowerCase();
    let pool = allProducts;
    if (isCategoryPage) pool = pool.filter((p) => p.category === fixedCategoryId);
    const matches = pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5);

    if (!matches.length) {
      box.innerHTML = '<div class="search-suggestion">Sin resultados</div>';
      box.classList.add('open');
      return;
    }

    box.innerHTML = matches.map((p) => `
      <a href="/producto.html?id=${encodeURIComponent(p.id)}" class="search-suggestion">
        ${p.images && p.images[0] ? `<img src="${escapeHtml(p.images[0])}" alt="">` : ''}
        <span>${escapeHtml(p.name)}</span>
        <span class="suggestion-price">${formatPrice(p.price)}</span>
      </a>`).join('');
    box.classList.add('open');
  }

  function initSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    const suggestionsBox = document.getElementById('searchSuggestions');
    if (!input) return;

    input.addEventListener('input', () => {
      renderSuggestions(input.value);
      clearBtn.classList.toggle('visible', !!input.value);
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.search = input.value;
        state.page = 1;
        renderAll();
      }, 300);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        state.search = input.value;
        state.page = 1;
        suggestionsBox.classList.remove('open');
        renderAll();
      }
      if (e.key === 'Escape') suggestionsBox.classList.remove('open');
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      suggestionsBox.classList.remove('open');
      state.search = '';
      state.page = 1;
      renderAll();
      input.focus();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) suggestionsBox.classList.remove('open');
    });
  }

  function clearFilters() {
    state.search = '';
    state.tag = 'all';
    state.sort = 'relevance';
    if (!isCategoryPage) state.category = 'all';
    state.page = 1;
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.classList.remove('visible');
    syncSortSelects();
    renderAll();
  }

  // ---------- Drawer (mobile) ----------

  function initDrawer() {
    const toggleBtn = document.getElementById('filtersToggleBtn');
    const overlay = document.getElementById('filtersDrawerOverlay');
    const drawer = document.getElementById('filtersDrawer');
    const closeBtn = document.getElementById('filtersDrawerClose');
    const applyBtn = document.getElementById('filtersDrawerApply');
    if (!toggleBtn || !drawer) return;

    function open() { overlay.classList.add('open'); drawer.classList.add('open'); }
    function close() { overlay.classList.remove('open'); drawer.classList.remove('open'); }

    toggleBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
    applyBtn.addEventListener('click', close);
  }

  // ---------- Sticky shadow ----------

  function initSticky() {
    const toolbar = document.getElementById('catalogToolbar');
    if (!toolbar) return;
    function stickyOffset() {
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0;
      return navH + 1;
    }
    function onScroll() {
      const rect = toolbar.getBoundingClientRect();
      toolbar.classList.toggle('stuck', rect.top <= stickyOffset());
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Master render ----------

  function renderAll() {
    renderCategoryPills();
    renderTagPills();
    const filtered = getFiltered();
    renderCount(filtered.length);
    renderGrid(filtered);
    renderPagination(filtered.length);
  }

  async function init() {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '<p class="catalog-loading">Cargando productos...</p>';

    try {
      const [productsRes, categories] = await Promise.all([
        apiFetch('/api/products?perPage=10000'),
        apiFetch('/api/categories'),
      ]);
      allProducts = productsRes.products;
      allCategories = categories.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

      renderCategoryBanner();
      renderOtherCategories();
      initSearch();
      initSortSelects();
      initDrawer();
      initSticky();
      renderAll();
    } catch (err) {
      grid.innerHTML = '<p class="catalog-loading">No pudimos cargar el catálogo. Intentá nuevamente más tarde.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
