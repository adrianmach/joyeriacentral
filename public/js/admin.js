(function () {
  'use strict';

  const TAG_LABELS = { nuevo: 'Nuevo', oferta: 'Oferta', destacado: 'Destacado' };

  let adminKey = sessionStorage.getItem('adminKey') || '';
  let categories = [];
  let products = [];
  let selectedIds = new Set();
  let editingProductId = null; // null => creating
  let formImages = []; // { type: 'existing'|'new', url?, file?, previewUrl? }
  let currentView = 'products';

  // ---------- Helpers ----------

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatPrice(amount) {
    const num = Number(amount) || 0;
    const hasCents = Math.round(num * 100) % 100 !== 0;
    return '$ ' + num.toLocaleString('es-UY', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  function placeholderSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2 8 8h8l-4-6z"></path><path d="M8 8 3 10l9 12 9-12-5-2"></path><path d="M8 8h8"></path>
    </svg>`;
  }

  function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ` toast-${type}` : '');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  async function apiFetch(url, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    if (options.auth !== false) headers['X-Admin-Key'] = adminKey;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      throw new Error((data && data.error) || `Error ${res.status}`);
    }
    return data;
  }

  function setBtnLoading(btn, loading, label) {
    if (loading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${label || 'Guardando...'}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
  }

  // ---------- Auth / login ----------

  async function tryAutoLogin() {
    if (!adminKey) return showLogin();
    try {
      await apiFetch('/api/admin/verify');
      showDashboard();
    } catch (e) {
      sessionStorage.removeItem('adminKey');
      adminKey = '';
      showLogin();
    }
  }

  function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
  }

  function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');
    loadAll();
  }

  function initLogin() {
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const password = document.getElementById('loginPassword').value;
      const btn = document.getElementById('loginSubmitBtn');
      setBtnLoading(btn, true, 'Ingresando...');
      const candidateKey = password;
      try {
        const headers = { 'X-Admin-Key': candidateKey };
        const res = await fetch('/api/admin/verify', { headers });
        if (!res.ok) throw new Error('Contraseña incorrecta');
        adminKey = candidateKey;
        sessionStorage.setItem('adminKey', adminKey);
        form.reset();
        showDashboard();
      } catch (err) {
        errorEl.textContent = 'Contraseña incorrecta. Intentá nuevamente.';
      } finally {
        setBtnLoading(btn, false);
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      sessionStorage.removeItem('adminKey');
      adminKey = '';
      showLogin();
    });
  }

  // ---------- Data loading ----------

  async function loadAll() {
    try {
      const [productsData, categoriesData] = await Promise.all([
        apiFetch('/api/products?perPage=10000', { auth: false }),
        apiFetch('/api/categories', { auth: false }),
      ]);
      products = productsData.products;
      categories = categoriesData.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      populateCategorySelects();
      renderStats();
      renderProductTable();
      renderCategoryList();
    } catch (err) {
      showToast('No se pudieron cargar los datos: ' + err.message, 'error');
    }
  }

  function populateCategorySelects() {
    const options = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    const filterSelect = document.getElementById('categoryFilterSelect');
    const prevFilter = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todas las categorías</option>' + options;
    filterSelect.value = prevFilter;

    document.getElementById('prodCategory').innerHTML = options;

    const bulkSelect = document.getElementById('bulkCategorySelect');
    bulkSelect.innerHTML = '<option value="">Cambiar categoría...</option>' + options;
  }

  // ---------- Stats ----------

  function renderStats() {
    document.getElementById('statTotal').textContent = products.length;
    document.getElementById('statOffer').textContent = products.filter((p) => p.tags && p.tags.includes('oferta')).length;
    document.getElementById('statOutOfStock').textContent = products.filter((p) => !p.inStock).length;
    document.getElementById('statCategories').textContent = categories.length;
  }

  // ---------- Product table ----------

  function categoryName(id) {
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.name : id;
  }

  function getFilteredProducts() {
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const catFilter = document.getElementById('categoryFilterSelect').value;
    return products.filter((p) => {
      if (catFilter && p.category !== catFilter) return false;
      if (search && !p.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function renderProductTable() {
    const tbody = document.getElementById('productTableBody');
    const list = getFilteredProducts();

    if (!list.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No se encontraron productos.</td></tr>';
      updateBulkBar();
      return;
    }

    tbody.innerHTML = list.map((p) => {
      const thumb = p.images && p.images[0]
        ? `<img src="${escapeHtml(p.images[0])}" alt="">`
        : placeholderSvg();

      const tagsHtml = (p.tags || []).map((t) => (
        `<span class="tag-badge tag-${t}">${escapeHtml(TAG_LABELS[t] || t)}</span>`
      )).join('');

      const checked = selectedIds.has(p.id) ? 'checked' : '';

      return `
        <tr data-id="${p.id}">
          <td data-label=""><input type="checkbox" class="row-checkbox" data-id="${p.id}" ${checked} aria-label="Seleccionar ${escapeHtml(p.name)}"></td>
          <td class="prod-name-td" data-label="Producto">
            <div class="prod-name-cell">
              <div class="thumb">${thumb}</div>
              <span>${escapeHtml(p.name)}</span>
            </div>
          </td>
          <td data-label="Categoría">${escapeHtml(categoryName(p.category))}</td>
          <td data-label="Precio">${formatPrice(p.price)}</td>
          <td data-label="Tags">${tagsHtml || '—'}</td>
          <td data-label="Stock"><span class="stock-dot ${p.inStock ? '' : 'out'}">${p.inStock ? 'En stock' : 'Sin stock'}</span></td>
          <td data-label="Acciones">
            <div class="row-actions">
              <button class="btn btn-outline btn-sm edit-btn" data-id="${p.id}">Editar</button>
              <button class="btn btn-danger btn-sm delete-btn" data-id="${p.id}">Eliminar</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.row-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.dataset.id);
        else selectedIds.delete(cb.dataset.id);
        updateBulkBar();
      });
    });

    tbody.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openProductModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });

    updateBulkBar();
  }

  function updateBulkBar() {
    const bar = document.getElementById('bulkBar');
    const visibleIds = new Set(getFilteredProducts().map((p) => p.id));
    for (const id of Array.from(selectedIds)) {
      if (!visibleIds.has(id)) selectedIds.delete(id);
    }
    if (selectedIds.size === 0) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
      document.getElementById('bulkCount').textContent = `${selectedIds.size} seleccionado${selectedIds.size === 1 ? '' : 's'}`;
    }
    const selectAll = document.getElementById('selectAllCheckbox');
    const list = getFilteredProducts();
    selectAll.checked = list.length > 0 && list.every((p) => selectedIds.has(p.id));
  }

  async function deleteProduct(id) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      selectedIds.delete(id);
      showToast('Producto eliminado', 'success');
      await loadAll();
    } catch (err) {
      showToast('Error al eliminar: ' + err.message, 'error');
    }
  }

  async function runBulkAction(action, value) {
    if (!selectedIds.size) return;
    const ids = Array.from(selectedIds);
    try {
      await apiFetch('/api/products/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, action, value }),
      });
      selectedIds.clear();
      showToast('Acción aplicada correctamente', 'success');
      await loadAll();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  // ---------- Categories view ----------

  function renderCategoryList() {
    const container = document.getElementById('categoryList');
    if (!categories.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);">No hay categorías todavía.</p>';
      return;
    }
    container.innerHTML = categories.map((c, idx) => {
      const count = products.filter((p) => p.category === c.id).length;
      return `
        <div class="category-row" data-id="${c.id}">
          <span class="cat-name">${escapeHtml(c.name)}</span>
          <span class="cat-count">${count} producto${count === 1 ? '' : 's'}</span>
          <div class="cat-actions">
            <button class="btn btn-outline btn-icon" data-action="up" data-id="${c.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
            <button class="btn btn-outline btn-icon" data-action="down" data-id="${c.id}" ${idx === categories.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
            <button class="btn btn-outline btn-sm" data-action="rename" data-id="${c.id}">Renombrar</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">Eliminar</button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleCategoryAction(btn.dataset.action, btn.dataset.id));
    });
  }

  async function handleCategoryAction(action, id) {
    const category = categories.find((c) => c.id === id);
    if (!category) return;

    if (action === 'rename') {
      const name = prompt('Nuevo nombre para la categoría:', category.name);
      if (!name || !name.trim() || name.trim() === category.name) return;
      try {
        await apiFetch(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) });
        showToast('Categoría actualizada', 'success');
        await loadAll();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
      return;
    }

    if (action === 'delete') {
      const count = products.filter((p) => p.category === id).length;
      if (count > 0) {
        showToast('No se puede eliminar: hay productos en esta categoría', 'error');
        return;
      }
      if (!confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
      try {
        await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
        showToast('Categoría eliminada', 'success');
        await loadAll();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
      return;
    }

    if (action === 'up' || action === 'down') {
      const idx = categories.findIndex((c) => c.id === id);
      const swapWith = action === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= categories.length) return;
      const reordered = categories.slice();
      [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
      try {
        await apiFetch('/api/categories/reorder', {
          method: 'PUT',
          body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
        });
        await loadAll();
      } catch (err) {
        showToast('Error al reordenar: ' + err.message, 'error');
      }
    }
  }

  function initCategoriesForm() {
    document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('newCategoryName');
      const name = input.value.trim();
      if (!name) return;
      try {
        await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
        input.value = '';
        showToast('Categoría agregada', 'success');
        await loadAll();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ---------- View tabs ----------

  function initViewTabs() {
    document.getElementById('tabProducts').addEventListener('click', () => switchView('products'));
    document.getElementById('tabCategories').addEventListener('click', () => switchView('categories'));
  }

  function switchView(view) {
    currentView = view;
    document.getElementById('viewProducts').classList.toggle('hidden', view !== 'products');
    document.getElementById('viewCategories').classList.toggle('hidden', view !== 'categories');
    document.getElementById('tabProducts').classList.toggle('active', view === 'products');
    document.getElementById('tabCategories').classList.toggle('active', view === 'categories');
  }

  // ---------- Toolbar / bulk bar wiring ----------

  function initToolbar() {
    document.getElementById('searchInput').addEventListener('input', renderProductTable);
    document.getElementById('categoryFilterSelect').addEventListener('change', renderProductTable);

    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
      const list = getFilteredProducts();
      if (e.target.checked) list.forEach((p) => selectedIds.add(p.id));
      else list.forEach((p) => selectedIds.delete(p.id));
      renderProductTable();
    });

    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));

    document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
      if (!confirm(`¿Eliminar ${selectedIds.size} producto(s) seleccionados?`)) return;
      runBulkAction('delete');
    });
    document.getElementById('bulkOfferBtn').addEventListener('click', () => runBulkAction('markOffer'));
    document.getElementById('bulkOutOfStockBtn').addEventListener('click', () => runBulkAction('markOutOfStock'));
    document.getElementById('bulkCategorySelect').addEventListener('change', (e) => {
      const value = e.target.value;
      if (!value) return;
      runBulkAction('setCategory', value);
      e.target.value = '';
    });
  }

  // ---------- Product modal ----------

  function resetProductForm() {
    document.getElementById('productForm').reset();
    document.getElementById('prodInStock').checked = true;
    formImages = [];
    renderImageUploader();
  }

  function openProductModal(id) {
    editingProductId = id;
    resetProductForm();
    document.getElementById('productModalTitle').textContent = id ? 'Editar producto' : 'Agregar producto';

    if (id) {
      const product = products.find((p) => p.id === id);
      if (!product) return;
      document.getElementById('prodName').value = product.name;
      document.getElementById('prodDescription').value = product.description || '';
      document.getElementById('prodPrice').value = product.price;
      document.getElementById('prodComparePrice').value = product.comparePrice != null ? product.comparePrice : '';
      document.getElementById('prodCategory').value = product.category;
      document.getElementById('tagNuevo').checked = (product.tags || []).includes('nuevo');
      document.getElementById('tagOferta').checked = (product.tags || []).includes('oferta');
      document.getElementById('tagDestacado').checked = (product.tags || []).includes('destacado');
      document.getElementById('prodInStock').checked = !!product.inStock;
      formImages = (product.images || []).map((url) => ({ type: 'existing', url }));
      renderImageUploader();
    } else if (categories.length) {
      document.getElementById('prodCategory').value = categories[0].id;
    }

    document.getElementById('productModalOverlay').classList.remove('hidden');
  }

  function closeProductModal() {
    document.getElementById('productModalOverlay').classList.add('hidden');
    editingProductId = null;
    formImages.forEach((img) => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
    formImages = [];
  }

  function renderImageUploader() {
    const container = document.getElementById('imageUploader');
    const thumbs = formImages.map((img, idx) => {
      const src = img.type === 'existing' ? img.url : img.previewUrl;
      return `
        <div class="image-thumb${idx === 0 ? ' is-main' : ''}" data-idx="${idx}">
          <img src="${escapeHtml(src)}" alt="Imagen ${idx + 1}">
          <button type="button" class="image-remove" data-idx="${idx}" aria-label="Quitar imagen">&times;</button>
          <div class="image-move">
            <button type="button" data-move="left" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} aria-label="Mover a la izquierda">◀</button>
            <button type="button" data-move="right" data-idx="${idx}" ${idx === formImages.length - 1 ? 'disabled' : ''} aria-label="Mover a la derecha">▶</button>
          </div>
        </div>`;
    }).join('');

    const addBtn = formImages.length < 5
      ? `<button type="button" class="image-add-btn" id="imageAddBtn">+<span>Agregar</span></button>`
      : '';

    container.innerHTML = thumbs + addBtn;

    const addBtnEl = document.getElementById('imageAddBtn');
    if (addBtnEl) {
      addBtnEl.addEventListener('click', () => document.getElementById('imageFileInput').click());
    }

    container.querySelectorAll('.image-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const [removed] = formImages.splice(idx, 1);
        if (removed && removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        renderImageUploader();
      });
    });

    container.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const dir = btn.dataset.move === 'left' ? -1 : 1;
        const target = idx + dir;
        if (target < 0 || target >= formImages.length) return;
        [formImages[idx], formImages[target]] = [formImages[target], formImages[idx]];
        renderImageUploader();
      });
    });
  }

  function addImageFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const remaining = 5 - formImages.length;
    if (remaining <= 0) {
      showToast('Ya alcanzaste el máximo de 5 imágenes', 'error');
      return;
    }
    files.slice(0, remaining).forEach((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        showToast(`${file.name}: formato no permitido`, 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast(`${file.name}: supera los 5MB`, 'error');
        return;
      }
      formImages.push({ type: 'new', file, previewUrl: URL.createObjectURL(file) });
    });
    if (files.length > remaining) {
      showToast(`Solo se agregaron ${remaining} imagen(es): máximo 5 en total`, 'error');
    }
    renderImageUploader();
  }

  function initImageInput() {
    document.getElementById('imageFileInput').addEventListener('change', (e) => {
      addImageFiles(e.target.files);
      e.target.value = '';
    });

    const dropzone = document.getElementById('imageUploader');
    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-active');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (evt === 'dragleave' && e.target !== dropzone) return;
        dropzone.classList.remove('drag-active');
      });
    });
    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addImageFiles(files);
    });
  }

  async function uploadNewImages() {
    const finalUrls = [];
    for (const img of formImages) {
      if (img.type === 'existing') {
        finalUrls.push(img.url);
      } else {
        const formData = new FormData();
        formData.append('image', img.file);
        const result = await apiFetch('/api/upload', { method: 'POST', body: formData });
        finalUrls.push(result.url);
      }
    }
    return finalUrls;
  }

  function initProductModal() {
    document.getElementById('productModalClose').addEventListener('click', closeProductModal);
    document.getElementById('productCancelBtn').addEventListener('click', closeProductModal);
    document.getElementById('productModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'productModalOverlay') closeProductModal();
    });

    document.getElementById('productForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('productSaveBtn');
      setBtnLoading(saveBtn, true, 'Guardando...');

      try {
        const images = await uploadNewImages();

        const tags = [];
        if (document.getElementById('tagNuevo').checked) tags.push('nuevo');
        if (document.getElementById('tagOferta').checked) tags.push('oferta');
        if (document.getElementById('tagDestacado').checked) tags.push('destacado');

        const comparePriceRaw = document.getElementById('prodComparePrice').value;

        const payload = {
          name: document.getElementById('prodName').value.trim(),
          description: document.getElementById('prodDescription').value,
          price: Number(document.getElementById('prodPrice').value),
          comparePrice: comparePriceRaw === '' ? null : Number(comparePriceRaw),
          category: document.getElementById('prodCategory').value,
          tags,
          inStock: document.getElementById('prodInStock').checked,
          images,
        };

        if (editingProductId) {
          await apiFetch(`/api/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Producto actualizado', 'success');
        } else {
          await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Producto creado', 'success');
        }

        closeProductModal();
        await loadAll();
      } catch (err) {
        showToast('Error al guardar: ' + err.message, 'error');
      } finally {
        setBtnLoading(saveBtn, false);
      }
    });
  }

  // ---------- Init ----------

  document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initViewTabs();
    initToolbar();
    initCategoriesForm();
    initProductModal();
    initImageInput();
    tryAutoLogin();
  });
})();
