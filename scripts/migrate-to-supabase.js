// Migra data/products.json (280 productos, categorías, imágenes de Wix) a Supabase.
// Requiere que scripts/schema.sql ya haya sido ejecutado en el proyecto.
// Uso: npm run migrate-supabase

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'product-images';
const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const PROGRESS_FILE = path.join(__dirname, '.migration-progress.json');
const CONCURRENCY = 4;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { images: {} }; // productId -> [newUrls]
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function extFromUrl(url, contentType) {
  const match = url.match(/\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i);
  if (match) return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  if (contentType && contentType.includes('png')) return 'png';
  if (contentType && contentType.includes('webp')) return 'webp';
  return 'jpg';
}

async function uploadImage(product, imageUrl, index) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${imageUrl}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = extFromUrl(imageUrl, contentType);
  const storagePath = `${product.category}/${product.slug}-${index + 1}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function migrateProductImages(product, progress) {
  if (progress.images[product.id]) return progress.images[product.id];
  if (!product.images || !product.images.length) return [];

  const uploaded = [];
  for (let i = 0; i < product.images.length; i++) {
    try {
      const url = await uploadImage(product, product.images[i], i);
      uploaded.push(url);
    } catch (err) {
      console.warn(`  ! Imagen ${i + 1} de "${product.name}" falló: ${err.message}`);
    }
  }
  progress.images[product.id] = uploaded;
  saveProgress(progress);
  return uploaded;
}

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (createErr) throw createErr;
    console.log(`Bucket "${BUCKET}" creado.`);
  } else {
    console.log(`Bucket "${BUCKET}" ya existe.`);
  }
}

async function migrateCategories(categories) {
  const rows = categories.map((c) => ({ id: c.id, name: c.name, order: c.order }));
  const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log(`${rows.length} categorías migradas.`);
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

async function migrateProducts(products, progress) {
  let done = 0;
  let failed = 0;
  const usedSlugs = new Set();

  function reserveSlug(product) {
    const base = product.slug || slugify(product.name) || 'producto';
    let slug = base;
    let i = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${i}`;
      i++;
    }
    usedSlugs.add(slug);
    return slug;
  }

  async function worker(queue) {
    while (queue.length) {
      const product = queue.shift();
      const slug = reserveSlug(product);
      try {
        const images = await migrateProductImages(product, progress);
        const row = {
          id: product.id,
          name: product.name,
          slug,
          description: product.description || '',
          price: product.price,
          compare_price: product.comparePrice,
          currency: product.currency || 'UYU',
          category: product.category,
          tags: product.tags || [],
          images,
          in_stock: product.inStock !== false,
          featured: !!product.featured,
          order: product.order || 0,
          created_at: product.createdAt,
          updated_at: product.updatedAt,
        };
        const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
        if (error) throw error;
        done++;
        if (done % 20 === 0) console.log(`  ${done}/${products.length} productos migrados...`);
      } catch (err) {
        failed++;
        console.error(`  ! Producto "${product.name}" falló: ${err.message}`);
      }
    }
  }

  const queue = products.slice();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log(`Productos: ${done} migrados, ${failed} con error.`);
}

async function main() {
  console.log('Leyendo data/products.json...');
  const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`${db.categories.length} categorías, ${db.products.length} productos.`);

  await ensureBucket();
  await migrateCategories(db.categories);

  const progress = loadProgress();
  console.log('Migrando productos e imágenes (esto puede tardar unos minutos)...');
  await migrateProducts(db.products, progress);

  console.log('Listo.');
}

main().catch((err) => {
  console.error('Migración abortada:', err);
  process.exit(1);
});
