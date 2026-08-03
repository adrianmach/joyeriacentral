(function () {
  'use strict';

  const { formatPrice, waLink, escapeHtml, placeholderSvg, apiFetch, observeReveals } = window.JC;

  const productId = new URLSearchParams(location.search).get('id');
  let currentImages = [];
  let currentIndex = 0;

  function setMainImage(index) {
    currentIndex = index;
    const main = document.getElementById('galleryMain');
    const url = currentImages[index];
    main.innerHTML = url
      ? `<img src="${escapeHtml(url)}" alt="" id="galleryMainImg">`
      : `<div class="placeholder-icon">${placeholderSvg()}</div>`;
    document.querySelectorAll('.gallery-thumb').forEach((t, i) => t.classList.toggle('active', i === index));
  }

  function renderGallery(images) {
    currentImages = images && images.length ? images : [];
    const thumbsWrap = document.getElementById('galleryThumbs');

    if (currentImages.length > 1) {
      thumbsWrap.innerHTML = currentImages.map((img, i) => (
        `<button type="button" class="gallery-thumb reveal-scale stagger-${Math.min(i + 1, 6)}" data-i="${i}"><img src="${escapeHtml(img)}" alt=""></button>`
      )).join('');
      thumbsWrap.querySelectorAll('.gallery-thumb').forEach((btn) => {
        btn.addEventListener('click', () => setMainImage(Number(btn.dataset.i)));
      });
      observeReveals(thumbsWrap);
    } else {
      thumbsWrap.innerHTML = '';
    }

    setMainImage(0);

    document.getElementById('galleryMain').addEventListener('click', () => {
      if (!currentImages.length) return;
      openLightbox();
    });
  }

  function openLightbox() {
    const overlay = document.getElementById('lightboxOverlay');
    overlay.innerHTML = `
      <button type="button" class="lightbox-close" id="lightboxClose" aria-label="Cerrar">&times;</button>
      <img src="${escapeHtml(currentImages[currentIndex])}" alt="">`;
    overlay.classList.add('open');
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
  }

  function closeLightbox() {
    document.getElementById('lightboxOverlay').classList.remove('open');
  }

  function renderInfo(product, categoryName) {
    document.getElementById('breadcrumbCategory').textContent = categoryName || '';
    document.getElementById('breadcrumbCategory').href = `/categoria.html?cat=${encodeURIComponent(product.category)}`;
    document.getElementById('breadcrumbProduct').textContent = product.name;

    document.title = `Joyería Central — ${product.name}`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', product.description ? product.description.slice(0, 150) : product.name);

    document.getElementById('productName').textContent = product.name;

    const tagLabels = { nuevo: 'Nuevo', oferta: 'Oferta', destacado: 'Destacado' };
    const tagsWrap = document.getElementById('productTags');
    tagsWrap.innerHTML = (product.tags || []).map((t) => (
      `<span class="badge badge-${t}">${tagLabels[t] || escapeHtml(t)}</span>`
    )).join('');

    const hasDiscount = product.comparePrice && Number(product.comparePrice) > Number(product.price);
    document.getElementById('productPrice').innerHTML = hasDiscount
      ? `<span class="price-old">${formatPrice(product.comparePrice)}</span><span class="price-current">${formatPrice(product.price)}</span>`
      : `<span class="price-current">${formatPrice(product.price)}</span>`;

    document.getElementById('productOosNote').style.display = product.inStock ? 'none' : 'block';

    document.getElementById('productDescription').textContent = product.description || 'Consultanos por más detalles de esta pieza.';

    const waBtn = document.getElementById('productWaBtn');
    waBtn.href = waLink(`Hola, quiero consultar por ${product.name}, lo vi en su web`);

    const shareBtn = document.getElementById('shareBtn');
    shareBtn.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        }
        shareBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = '✓ Link copiado';
        shareBtn.appendChild(span);
        setTimeout(() => {
          shareBtn.innerHTML = `${shareIconSvg()}<span>Copiar link</span>`;
        }, 2000);
      } catch (e) { /* clipboard unavailable, no-op */ }
    });
  }

  function shareIconSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.2 10.7 15.8 6.3M8.2 13.3l7.6 4.4"></path></svg>`;
  }

  function relatedCardHtml(product) {
    const imageHtml = product.images && product.images[0]
      ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : `<div class="placeholder-icon">${placeholderSvg()}</div>`;
    const hasDiscount = product.comparePrice && Number(product.comparePrice) > Number(product.price);
    const priceHtml = hasDiscount
      ? `<span class="price-old">${formatPrice(product.comparePrice)}</span><span class="price-current">${formatPrice(product.price)}</span>`
      : `<span class="price-current">${formatPrice(product.price)}</span>`;

    return `
      <article class="product-card">
        <a href="/producto.html?id=${encodeURIComponent(product.id)}" class="product-card-media">
          ${imageHtml}
        </a>
        <a href="/producto.html?id=${encodeURIComponent(product.id)}" class="product-card-body">
          <h3>${escapeHtml(product.name)}</h3>
          <div class="product-card-price">${priceHtml}</div>
        </a>
      </article>`;
  }

  async function renderRelated(product) {
    try {
      const data = await apiFetch(`/api/products?category=${encodeURIComponent(product.category)}&perPage=8`);
      const related = data.products.filter((p) => p.id !== product.id).slice(0, 4);
      const wrap = document.getElementById('relatedGrid');
      const section = document.getElementById('relatedSection');
      if (!related.length) { section.style.display = 'none'; return; }
      wrap.innerHTML = related.map(relatedCardHtml).join('');
    } catch (e) {
      document.getElementById('relatedSection').style.display = 'none';
    }
  }

  function showError() {
    document.querySelector('.product-detail .container').innerHTML = `
      <div class="empty-state" style="padding:60px 0;">
        <h3>Producto no encontrado</h3>
        <p>Puede que el link esté roto o el producto ya no esté disponible.</p>
        <a href="/catalogo.html" class="btn btn-accent">Volver al catálogo</a>
      </div>`;
    document.getElementById('relatedSection').style.display = 'none';
  }

  async function init() {
    if (!productId) { showError(); return; }
    try {
      const [product, categories] = await Promise.all([
        apiFetch(`/api/products/${encodeURIComponent(productId)}`),
        apiFetch('/api/categories'),
      ]);
      const category = categories.find((c) => c.id === product.category);
      renderGallery(product.images);
      renderInfo(product, category ? category.name : '');
      observeReveals(document);
      renderRelated(product);
    } catch (err) {
      showError();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
