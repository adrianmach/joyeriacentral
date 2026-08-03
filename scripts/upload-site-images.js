// Optimiza y sube las imágenes editoriales del sitio (hero, secciones alternadas,
// Nosotros, Trayectoria) a Supabase Storage, bajo product-images/site/.
// Uso: node scripts/upload-site-images.js <carpeta-con-jpgs>

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'product-images';
const MAX_WIDTH = 1920;
const QUALITY = 85;

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('Uso: node scripts/upload-site-images.js <carpeta-con-jpgs>');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const files = fs.readdirSync(srcDir).filter((f) => /\.jpe?g$/i.test(f));
  if (!files.length) {
    console.error('No se encontraron .jpg en ' + srcDir);
    process.exit(1);
  }

  const urls = {};

  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    const inputPath = path.join(srcDir, file);

    const image = await Jimp.read(inputPath);
    if (image.bitmap.width > MAX_WIDTH) {
      image.resize({ w: MAX_WIDTH });
    }
    const buffer = await image.getBuffer('image/jpeg', { quality: QUALITY });

    const storagePath = `site/${name}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.error(`  ! ${name} falló: ${error.message}`);
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    urls[name] = data.publicUrl;
    console.log(`  ${name}: ${(buffer.length / 1024).toFixed(0)}kb -> ${data.publicUrl}`);
  }

  fs.writeFileSync(
    path.join(srcDir, 'uploaded-urls.json'),
    JSON.stringify(urls, null, 2)
  );
  console.log('\nListo. URLs guardadas en uploaded-urls.json');
}

main().catch((err) => {
  console.error('Falló la subida:', err);
  process.exit(1);
});
