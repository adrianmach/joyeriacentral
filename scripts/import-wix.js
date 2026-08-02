const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');

const CATEGORIES = [
  { id: 'relojes', name: 'Relojes', order: 1 },
  { id: 'joyas-plata-oro', name: 'Joyas de plata y oro', order: 2 },
  { id: 'joyas-acero', name: 'Joyas de acero', order: 3 },
  { id: 'enchapados', name: 'Enchapados', order: 4 },
  { id: 'biyuterie', name: 'Biyuterie', order: 5 },
  { id: 'plata', name: 'Plata', order: 6 },
  { id: 'oro-9k', name: 'Oro 9k', order: 7 },
  { id: 'oro-10k', name: 'Oro 10k', order: 8 },
  { id: 'oro-18k', name: 'Oro 18k', order: 9 },
  { id: 'lapiceras', name: 'Lapiceras', order: 10 },
  { id: 'otros-productos', name: 'Otros productos', order: 11 },
];

// Wix category label -> our category id (section 4.3 of SPEC-FULL.md)
const CATEGORY_MAP = {
  'relojes': 'relojes',
  'joyas de acero': 'joyas-acero',
  'joyas de plata y oro': 'joyas-plata-oro',
  'otros productos': 'otros-productos',
  'biyuterie': 'biyuterie',
  'enchapados': 'enchapados',
  'lapiceras': 'lapiceras',
  'plata': 'plata',
  'oro 10k': 'oro-10k',
  'oro 9k': 'oro-9k',
  'oro 18k': 'oro-18k',
};

const COLUMN_ALIASES = {
  name: ['Name', 'name', 'Product Name', 'Título', 'Titulo'],
  description: ['Description', 'description', 'Descripción', 'Descripcion'],
  price: ['Price', 'price', 'Precio'],
  comparePrice: ['Compare At Price', 'Compare at Price', 'compareAtPrice', 'Precio anterior'],
  category: ['Product Type', 'Collection', 'collection', 'productType', 'Categoría', 'Categoria'],
  imageSrc: ['Image Src', 'imageSrc', 'Product Image Url', 'productImageUrl', 'Imagen'],
  status: ['Status', 'status', 'Visible', 'visible'],
  tags: ['Tags', 'tags'],
};

const IMAGE_EXT_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function parseArgs(argv) {
  const args = { downloadImages: false, csv: null };
  for (const raw of argv.slice(2)) {
    if (raw === '--download-images') {
      args.downloadImages = true;
    } else if (raw.startsWith('--csv=')) {
      args.csv = raw.slice('--csv='.length);
    }
  }
  return args;
}

function pickColumn(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return String(row[alias]).trim();
    }
  }
  return '';
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsePrice(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
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
  while (existingSlugs.has(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  existingSlugs.add(slug);
  return slug;
}

function mapCategory(rawLabel) {
  if (!rawLabel) return 'otros-productos';
  const key = rawLabel.trim().toLowerCase();
  return CATEGORY_MAP[key] || 'otros-productos';
}

function isInStock(rawStatus) {
  if (!rawStatus) return true;
  const normalized = rawStatus.trim().toLowerCase();
  if (['active', 'true', '1', 'visible', 'yes', 'si', 'sí'].includes(normalized)) return true;
  if (['inactive', 'false', '0', 'hidden', 'no', 'draft'].includes(normalized)) return false;
  return true;
}

function parseTags(rawTags) {
  if (!rawTags) return [];
  return rawTags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

async function downloadImage(url, index) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    const ext = IMAGE_EXT_BY_CONTENT_TYPE[contentType.split(';')[0].trim()]
      || (url.match(/\.(jpe?g|png|webp)(\?|$)/i) || [])[1]?.toLowerCase().replace('jpeg', 'jpg')
      || 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = `wix-${Date.now()}-${index}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    return `/uploads/products/${filename}`;
  } catch (err) {
    console.warn(`  ⚠ No se pudo descargar la imagen (${url}): ${err.message}`);
    return url; // fall back to the original remote URL
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.csv) {
    console.error('Uso: node scripts/import-wix.js --csv=export-wix.csv [--download-images]');
    process.exit(1);
  }

  const csvPath = path.isAbsolute(args.csv) ? args.csv : path.join(process.cwd(), args.csv);
  if (!fs.existsSync(csvPath)) {
    console.error(`No se encontró el archivo CSV: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });

  console.log(`Leyendo ${rows.length} filas de ${path.basename(csvPath)}...`);

  if (args.downloadImages) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const existingSlugs = new Set();
  const categoryOrderCounters = {};
  const products = [];
  const categoryFallbackCount = {};
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = pickColumn(row, COLUMN_ALIASES.name);
    const price = parsePrice(pickColumn(row, COLUMN_ALIASES.price));

    if (!name || price === null) {
      skipped++;
      continue;
    }

    const rawCategory = pickColumn(row, COLUMN_ALIASES.category);
    const category = mapCategory(rawCategory);
    if (category === 'otros-productos' && rawCategory && !CATEGORY_MAP[rawCategory.trim().toLowerCase()]) {
      categoryFallbackCount[rawCategory] = (categoryFallbackCount[rawCategory] || 0) + 1;
    }

    const comparePriceRaw = pickColumn(row, COLUMN_ALIASES.comparePrice);
    const comparePrice = comparePriceRaw ? parsePrice(comparePriceRaw) : null;

    const imageSrc = pickColumn(row, COLUMN_ALIASES.imageSrc);
    let images = [];
    if (imageSrc) {
      if (args.downloadImages) {
        process.stdout.write(`  [${i + 1}/${rows.length}] Descargando imagen de "${name}"...\r`);
        const localUrl = await downloadImage(imageSrc, i);
        images = [localUrl];
      } else {
        images = [imageSrc];
      }
    }

    categoryOrderCounters[category] = (categoryOrderCounters[category] || 0) + 1;

    const now = new Date().toISOString();
    const slug = uniqueSlug(slugify(name), existingSlugs);

    products.push({
      id: crypto.randomUUID(),
      name,
      slug,
      description: stripHtml(pickColumn(row, COLUMN_ALIASES.description)),
      price,
      comparePrice: comparePrice != null && comparePrice > 0 ? comparePrice : null,
      currency: 'UYU',
      category,
      tags: parseTags(pickColumn(row, COLUMN_ALIASES.tags)),
      images,
      inStock: isInStock(pickColumn(row, COLUMN_ALIASES.status)),
      featured: false,
      order: categoryOrderCounters[category],
      createdAt: now,
      updatedAt: now,
    });
  }

  if (args.downloadImages) process.stdout.write('\n');

  if (fs.existsSync(DATA_FILE)) {
    const backupPath = DATA_FILE.replace(/\.json$/, `.backup.${Date.now()}.json`);
    fs.copyFileSync(DATA_FILE, backupPath);
    console.log(`Se guardó una copia de seguridad del products.json anterior en ${path.basename(backupPath)}`);
  }

  const db = { categories: CATEGORIES, products };
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

  console.log(`\nImportación completa:`);
  console.log(`  ${products.length} producto(s) importado(s)`);
  console.log(`  ${skipped} fila(s) omitida(s) (sin nombre o precio válido)`);
  const unmapped = Object.entries(categoryFallbackCount);
  if (unmapped.length) {
    console.log(`  Categorías sin mapeo directo (asignadas a "Otros productos"):`);
    unmapped.forEach(([label, count]) => console.log(`    - "${label}": ${count} producto(s)`));
  }
  console.log(`\nEscrito en ${path.relative(process.cwd(), DATA_FILE)}`);
}

main().catch((err) => {
  console.error('Error durante la importación:', err);
  process.exit(1);
});
