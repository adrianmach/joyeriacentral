require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { Jimp } = require('jimp');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const DEFAULT_ADMIN_KEY = 'joyeria2025';
const BUCKET = 'product-images';

const PUBLIC_DIR = path.join(__dirname, 'public');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ---------- Mapping helpers (DB snake_case <-> API camelCase) ----------

function productToApi(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: Number(row.price),
    comparePrice: row.compare_price === null || row.compare_price === undefined ? null : Number(row.compare_price),
    currency: row.currency,
    category: row.category,
    tags: row.tags || [],
    images: row.images || [],
    inStock: row.in_stock,
    featured: row.featured,
    order: row.order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function categoryToApi(row) {
  return { id: row.id, name: row.name, order: row.order };
}

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(base, existingSlugs) {
  let slug = base || 'producto';
  let i = 2;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

function escapeLike(value) {
  return String(value).replace(/[%_]/g, (m) => `\\${m}`);
}

// ---------- Auth middleware ----------

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  const validKeys = new Set([process.env.ADMIN_KEY, DEFAULT_ADMIN_KEY].filter(Boolean));
  if (!key || !validKeys.has(key)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

app.get('/api/admin/verify', adminAuth, (req, res) => {
  res.json({ ok: true });
});

// ---------- Products API ----------

function applyProductFilters(query, req) {
  const { category, search, tag, inStock, featured } = req.query;
  if (category) query = query.eq('category', category);
  if (search) query = query.ilike('name', `%${escapeLike(search)}%`);
  if (tag) query = query.contains('tags', [tag]);
  if (inStock === 'true') query = query.eq('in_stock', true);
  if (featured === 'true') query = query.eq('featured', true);
  return query;
}

function applyProductSort(query, sort) {
  switch (sort) {
    case 'price_asc': return query.order('price', { ascending: true });
    case 'price_desc': return query.order('price', { ascending: false });
    case 'name_asc': return query.order('name', { ascending: true });
    case 'newest': return query.order('created_at', { ascending: false });
    default: return query.order('order', { ascending: true });
  }
}

app.get('/api/products', async (req, res) => {
  try {
    let countQuery = supabase.from('products').select('id', { count: 'exact', head: true });
    countQuery = applyProductFilters(countQuery, req);
    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    const total = count || 0;
    const perPage = Math.max(1, Number(req.query.perPage) || 24);
    const pages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(1, Number(req.query.page) || 1), pages);
    const start = (page - 1) * perPage;

    let dataQuery = supabase.from('products').select('*');
    dataQuery = applyProductFilters(dataQuery, req);
    dataQuery = applyProductSort(dataQuery, req.query.sort);
    dataQuery = dataQuery.range(start, start + perPage - 1);

    const { data, error } = await dataQuery;
    if (error) throw error;

    res.json({ products: (data || []).map(productToApi), total, page, pages, perPage });
  } catch (err) {
    res.status(500).json({ error: 'Error al leer productos' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Error al leer el producto' });
  if (!data) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(productToApi(data));
});

app.post('/api/products', adminAuth, async (req, res) => {
  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }
  if (body.price === undefined || body.price === null || isNaN(Number(body.price))) {
    return res.status(400).json({ error: 'El precio es requerido' });
  }
  if (!body.category || typeof body.category !== 'string') {
    return res.status(400).json({ error: 'La categoría es requerida' });
  }

  try {
    const { data: category } = await supabase.from('categories').select('id').eq('id', body.category).maybeSingle();
    if (!category) return res.status(400).json({ error: 'Categoría inexistente' });

    const { data: slugRows } = await supabase.from('products').select('slug');
    const existingSlugs = (slugRows || []).map((r) => r.slug);
    const slug = uniqueSlug(slugify(body.name), existingSlugs);

    const { data: catProducts } = await supabase.from('products').select('order').eq('category', body.category);
    const maxOrder = (catProducts || []).reduce((max, p) => Math.max(max, p.order || 0), 0);

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      slug,
      description: body.description || '',
      price: Number(body.price),
      compare_price: body.comparePrice === undefined || body.comparePrice === null || body.comparePrice === ''
        ? null
        : Number(body.comparePrice),
      currency: 'UYU',
      category: body.category,
      tags: Array.isArray(body.tags) ? body.tags : [],
      images: Array.isArray(body.images) ? body.images : [],
      in_stock: body.inStock !== undefined ? Boolean(body.inStock) : true,
      featured: Boolean(body.featured),
      order: body.order !== undefined ? Number(body.order) : maxOrder + 1,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase.from('products').insert(row).select().single();
    if (error) throw error;
    res.status(201).json(productToApi(data));
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

app.put('/api/products/:id', adminAuth, async (req, res) => {
  const { data: existingRow, error: fetchErr } = await supabase.from('products').select('*').eq('id', req.params.id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: 'Error al leer el producto' });
  if (!existingRow) return res.status(404).json({ error: 'Producto no encontrado' });

  const body = req.body || {};

  if (body.category && body.category !== existingRow.category) {
    const { data: category } = await supabase.from('categories').select('id').eq('id', body.category).maybeSingle();
    if (!category) return res.status(400).json({ error: 'Categoría inexistente' });
  }

  try {
    const patch = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      patch.name = name;
      if (name !== existingRow.name) {
        const { data: slugRows } = await supabase.from('products').select('slug').neq('id', existingRow.id);
        const existingSlugs = (slugRows || []).map((r) => r.slug);
        patch.slug = uniqueSlug(slugify(name), existingSlugs);
      }
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.price !== undefined) patch.price = Number(body.price);
    if (body.comparePrice !== undefined) {
      patch.compare_price = body.comparePrice === null || body.comparePrice === '' ? null : Number(body.comparePrice);
    }
    if (body.category !== undefined) patch.category = body.category;
    if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.images !== undefined) patch.images = Array.isArray(body.images) ? body.images : [];
    if (body.inStock !== undefined) patch.in_stock = Boolean(body.inStock);
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    if (body.order !== undefined) patch.order = Number(body.order);

    const { data, error } = await supabase.from('products').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(productToApi(data));
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

app.delete('/api/products/:id', adminAuth, async (req, res) => {
  const { data, error } = await supabase.from('products').delete().eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Error al eliminar el producto' });
  if (!data) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(productToApi(data));
});

app.post('/api/products/reorder', adminAuth, async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Se requiere un array de IDs' });

  try {
    await Promise.all(ids.map((id, index) => supabase.from('products').update({ order: index + 1 }).eq('id', id)));
    const { data } = await supabase.from('products').select('*').order('order', { ascending: true });
    res.json((data || []).map(productToApi));
  } catch (err) {
    res.status(500).json({ error: 'Error al reordenar' });
  }
});

// ---------- Bulk actions ----------

app.post('/api/products/bulk', adminAuth, async (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Se requiere un array de IDs' });

  try {
    const now = new Date().toISOString();

    if (action === 'delete') {
      const { error } = await supabase.from('products').delete().in('id', ids);
      if (error) throw error;
    } else if (action === 'setCategory') {
      const { data: category } = await supabase.from('categories').select('id').eq('id', value).maybeSingle();
      if (!category) return res.status(400).json({ error: 'Categoría inexistente' });
      const { error } = await supabase.from('products').update({ category: value, updated_at: now }).in('id', ids);
      if (error) throw error;
    } else if (action === 'markOffer') {
      const { data: rows } = await supabase.from('products').select('id, tags').in('id', ids);
      await Promise.all((rows || [])
        .filter((p) => !(p.tags || []).includes('oferta'))
        .map((p) => supabase.from('products').update({ tags: [...(p.tags || []), 'oferta'], updated_at: now }).eq('id', p.id)));
    } else if (action === 'markOutOfStock') {
      const { error } = await supabase.from('products').update({ in_stock: false, updated_at: now }).in('id', ids);
      if (error) throw error;
    } else {
      return res.status(400).json({ error: 'Acción inválida' });
    }

    const { data } = await supabase.from('products').select('*').order('order', { ascending: true });
    res.json((data || []).map(productToApi));
  } catch (err) {
    res.status(500).json({ error: 'Error al aplicar la acción' });
  }
});

// ---------- Categories API ----------

app.get('/api/categories', async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').order('order', { ascending: true });
  if (error) return res.status(500).json({ error: 'Error al leer categorías' });
  res.json((data || []).map(categoryToApi));
});

app.post('/api/categories', adminAuth, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });

  try {
    const { data: existing } = await supabase.from('categories').select('id, order');
    const existingIds = (existing || []).map((c) => c.id);
    const id = uniqueSlug(slugify(name), existingIds);
    const maxOrder = (existing || []).reduce((max, c) => Math.max(max, c.order || 0), 0);

    const row = { id, name: String(name).trim(), order: maxOrder + 1 };
    const { data, error } = await supabase.from('categories').insert(row).select().single();
    if (error) throw error;
    res.status(201).json(categoryToApi(data));
  } catch (err) {
    res.status(500).json({ error: 'Error al crear la categoría' });
  }
});

app.put('/api/categories/reorder', adminAuth, async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Se requiere un array de IDs' });

  try {
    await Promise.all(ids.map((id, index) => supabase.from('categories').update({ order: index + 1 }).eq('id', id)));
    const { data } = await supabase.from('categories').select('*').order('order', { ascending: true });
    res.json((data || []).map(categoryToApi));
  } catch (err) {
    res.status(500).json({ error: 'Error al reordenar categorías' });
  }
});

app.put('/api/categories/:id', adminAuth, async (req, res) => {
  const { name } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = String(name).trim();

  const { data, error } = await supabase.from('categories').update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Error al actualizar la categoría' });
  if (!data) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json(categoryToApi(data));
});

app.delete('/api/categories/:id', adminAuth, async (req, res) => {
  const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category', req.params.id);
  if (count > 0) return res.status(400).json({ error: 'No se puede eliminar: hay productos en esta categoría' });

  const { data, error } = await supabase.from('categories').delete().eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Error al eliminar la categoría' });
  if (!data) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json(categoryToApi(data));
});

// ---------- Upload API (Supabase Storage) ----------

const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      return cb(new Error('Formato no permitido. Solo JPG, PNG o WEBP.'));
    }
    cb(null, true);
  },
});

app.post('/api/upload', adminAuth, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    const ext = ALLOWED_MIME[req.file.mimetype];
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const storagePath = `uploads/${filename}`;

    try {
      let buffer = req.file.buffer;
      let contentType = req.file.mimetype;

      if (ext === 'jpg' || ext === 'png') {
        const image = await Jimp.read(req.file.buffer);
        if (image.bitmap.width > 1200) {
          image.resize({ w: 1200 });
        }
        buffer = await image.getBuffer(ext === 'jpg' ? 'image/jpeg' : 'image/png');
      }

      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      res.status(201).json({ url: data.publicUrl });
    } catch (e) {
      res.status(500).json({ error: 'Error al procesar la imagen' });
    }
  });
});

app.delete('/api/upload/:filename', adminAuth, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const { error } = await supabase.storage.from(BUCKET).remove([`uploads/${filename}`]);
  if (error) return res.status(500).json({ error: 'Error al eliminar el archivo' });
  res.json({ ok: true });
});

// ---------- Fallback ----------

app.use((req, res) => {
  res.status(404).json({ error: 'No encontrado' });
});

app.listen(PORT, () => {
  console.log(`Joyería Central corriendo en http://localhost:${PORT}`);
});
