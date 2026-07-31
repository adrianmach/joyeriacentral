# Joyería Central — Website Rebuild (Full Spec)

## Objetivo

Reconstruir desde cero el sitio web de **Joyería Central** (actualmente en Wix). Eliminar la dependencia de Wix completamente: migrar productos, imágenes y datos a infraestructura propia.

**Resultado final**: sitio estático multi-página + Supabase (DB, storage, auth). Hosting gratis en Vercel/Netlify. Costo mensual: $0.

**URL actual (referencia)**: https://www.joyeriacentraluy.com/

---

## Stack Técnico

- **Frontend**: HTML5, CSS3, JavaScript vanilla (sin frameworks, sin server)
- **Backend**: Supabase (PostgreSQL + Storage + Auth) — free tier
- **Hosting**: Vercel o Netlify (gratis para sitios estáticos)
- **Sin servidor propio**: todo corre en el navegador + Supabase

### Por qué Supabase

- **Base de datos**: PostgreSQL gratuito (500MB, más que suficiente para 280 productos)
- **Storage**: almacenamiento de archivos gratuito (1GB, suficiente para imágenes de productos)
- **Auth**: autenticación integrada para el panel admin
- **API automática**: REST API generada a partir de las tablas, no hay que escribir backend
- **Persistente**: los datos no se pierden al redeplegar, no hay filesystem efímero

### Estructura del proyecto

```
joyeria-central/
├── index.html                     # LANDING PAGE (home)
├── catalogo.html                  # CATÁLOGO con filtros y búsqueda
├── categoria.html                 # Vista de UNA categoría (?cat=relojes)
├── producto.html                  # Detalle de UN producto (?id=uuid)
├── admin.html                     # Panel de administración
├── css/
│   ├── common.css                 # Variables, reset, nav, footer, WhatsApp float
│   ├── landing.css                # Estilos del landing
│   ├── catalog.css                # Estilos del catálogo y categorías
│   ├── product.css                # Estilos de la página de producto
│   └── admin.css                  # Estilos del panel admin
├── js/
│   ├── supabase-config.js         # Inicialización del cliente Supabase
│   ├── common.js                  # Nav, hamburger, scroll, WhatsApp float
│   ├── landing.js                 # Animaciones, carrusel, featured products
│   ├── catalog.js                 # Filtros, búsqueda, paginación
│   ├── product.js                 # Galería, producto individual
│   └── admin.js                   # CRUD admin completo
├── scripts/
│   └── migrate-wix-images.js      # Script Node.js para migrar imágenes de Wix a Supabase
├── data/
│   └── products.json              # 280 productos migrados (para carga inicial a Supabase)
└── SPEC-FULL.md
```

---

## PARTE 1: Setup de Supabase

### 1.1 Crear proyecto en Supabase

1. Ir a https://supabase.com → crear cuenta → crear proyecto
2. Guardar la **URL** y la **anon key** (se usan en el frontend)
3. Guardar la **service_role key** (solo para el script de migración, NUNCA en frontend)

### 1.2 Esquema de base de datos (SQL para ejecutar en Supabase SQL Editor)

```sql
-- Categorías
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Productos
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_price NUMERIC(12,2),
  currency TEXT DEFAULT 'UYU',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  in_stock BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_featured ON products(featured) WHERE featured = true;
CREATE INDEX idx_products_tags ON products USING GIN(tags);

-- Full text search en español
ALTER TABLE products ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(description, ''))) STORED;
CREATE INDEX idx_products_fts ON products USING GIN(fts);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

-- RLS (Row Level Security)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Políticas: lectura pública, escritura solo autenticado
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Auth insert products" ON products FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update products" ON products FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete products" ON products FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Public read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Auth insert categories" ON categories FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update categories" ON categories FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete categories" ON categories FOR DELETE USING (auth.role() = 'authenticated');
```

### 1.3 Storage bucket para imágenes

```sql
-- Crear bucket para imágenes de productos
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Políticas de storage: lectura pública, escritura autenticada
CREATE POLICY "Public read images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Auth upload images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY "Auth delete images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
```

### 1.4 Crear usuario admin

En Supabase Dashboard → Authentication → Users → "Add user":
- Email: el email del dueño (addacippo@gmail.com)
- Password: una contraseña segura que el dueño elija
- Marcar "Auto Confirm User"

### 1.5 Cliente Supabase en el frontend (supabase-config.js)

```js
// Usar el CDN de Supabase (no necesita npm)
// En cada HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

---

## PARTE 2: Migración de datos e imágenes de Wix

### 2.1 Script de migración (scripts/migrate-wix-images.js)

Script Node.js que se ejecuta UNA VEZ antes de cancelar Wix. Hace lo siguiente:

1. **Lee** `data/products.json` (los 280 productos ya parseados)
2. **Para cada producto con imágenes de Wix** (URLs que contienen `static.wixstatic.com`):
   a. Descarga la imagen a una carpeta temporal
   b. La sube a Supabase Storage bucket `product-images`
   c. Obtiene la URL pública de Supabase
   d. Reemplaza la URL de Wix por la de Supabase
3. **Inserta las categorías** en la tabla `categories`
4. **Inserta los productos** (con URLs de imágenes ya actualizadas) en la tabla `products`
5. Imprime un reporte: cuántos productos, imágenes migradas, errores

```bash
# Uso:
npm install @supabase/supabase-js node-fetch

# Variables de entorno necesarias:
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_KEY="eyJ..."  # service_role key (NO la anon key)

node scripts/migrate-wix-images.js
```

**IMPORTANTE**: ejecutar este script ANTES de cancelar Wix. Las imágenes deben seguir accesibles para descargarlas.

### 2.2 Qué hace el script paso a paso

```
1. Leer data/products.json
2. Insertar 12 categorías en Supabase
3. Para cada producto (280):
   a. Por cada imagen del producto:
      - GET https://static.wixstatic.com/media/xxx.jpg
      - POST a Supabase Storage → bucket product-images/[product-slug]/img-001.jpg
      - Obtener URL pública: https://xxx.supabase.co/storage/v1/object/public/product-images/...
   b. INSERT producto en tabla products con las nuevas URLs
4. Resumen: "Migrados: 280 productos, 414 imágenes. Errores: 0"
```

### 2.3 Flujo completo de migración

```
1. Crear proyecto en Supabase
2. Ejecutar el SQL del esquema (sección 1.2 y 1.3)
3. Crear usuario admin (sección 1.4)
4. Ejecutar script de migración (MIENTRAS WIX SIGUE ACTIVO)
5. Verificar en Supabase que los datos e imágenes están OK
6. Deployar el sitio nuevo
7. Apuntar el dominio joyeriacentraluy.com al nuevo hosting
8. Recién ahí cancelar Wix
```

---

## PARTE 3: Diseño Visual Global

**Referencia visual**: https://lafontaine.com.uy/ — estilo luxury dark, elegante, editorial. Adaptar ese nivel de calidad visual al contexto de Joyería Central.

### Paleta de colores — TEMA OSCURO LUXURY
```css
:root {
  /* Fondos */
  --bg: #0A0A0A;                    /* negro principal */
  --bg-elevated: #111111;           /* cards, secciones alternadas */
  --bg-surface: #1A1A1A;            /* nav, inputs, modales */
  --bg-contrast: #F5F0E8;           /* secciones de contraste claro (pocas) */

  /* Dorados */
  --gold: #C9A84C;                  /* dorado principal */
  --gold-light: #D4B85A;            /* hover dorado */
  --gold-muted: #8B7635;            /* dorado apagado para bordes */
  --gold-bg: rgba(201, 168, 76, 0.08); /* fondo dorado sutil */

  /* Textos */
  --text: #F5F0E8;                  /* texto principal (crema claro) */
  --text-secondary: #A09882;        /* texto secundario (beige apagado) */
  --text-dark: #1A1A1A;             /* texto sobre fondos claros */

  /* Utilidades */
  --border: rgba(201, 168, 76, 0.15); /* bordes sutiles dorados */
  --divider: rgba(255, 255, 255, 0.08);
  --overlay: rgba(0, 0, 0, 0.6);   /* overlay sobre imágenes */
  --whatsapp: #25D366;
  --whatsapp-hover: #1EBE57;
  --danger: #DC3545;
  --success: #28A745;
}
```

### Tipografía
- **Display/títulos**: `Playfair Display` (Google Fonts, serif, 400-700) — elegante, editorial, sensación luxury. Usar en mayúsculas con letter-spacing amplio (0.1-0.2em) para headings de sección, y en caso normal para títulos de productos
- **Body**: `Lato` (Google Fonts, sans-serif, 300-400) — limpia, legible sobre fondos oscuros, sensación premium
- **Escala**: h1 clamp(2.5rem, 6vw, 4.5rem), h2 clamp(1.8rem, 4vw, 3rem), body 1rem
- Headings de sección SIEMPRE en uppercase + letter-spacing 0.15em
- Line-height generoso: 1.8 para body, 1.2 para headings

### Estilo general
- **Fondo oscuro** en todo el sitio, NO claro
- **Espaciado muy generoso**: secciones con 100-120px de padding vertical (80px mobile)
- **Decoradores dorados**: líneas finas doradas como separadores entre secciones (un `<hr>` estilizado o un SVG decorativo tipo filigrana/ornamento)
- **Imágenes**: siempre con un tratamiento — leve overlay oscuro, o bordes sutiles, nunca raw
- **Hover effects**: transiciones lentas y elegantes (0.5-0.6s ease), nada brusco
- **Bordes**: si se usan, siempre dorados sutiles (1px solid var(--border))
- **Sin border-radius en imágenes de producto** — bordes rectos, sensación editorial
- **Sombras**: no usar box-shadow visibles; usar overlays y bordes para profundidad

### Componentes reutilizables (common.css)

**Nav (inspirada en La Fontaine)**:
- Fija, fondo `--bg-surface` con transparencia + backdrop-blur
- Logo centrado o a la izquierda: "JOYERÍA CENTRAL" en tipografía serif, uppercase, letter-spacing amplio, color `--gold`
- Links en `--text`, uppercase, font-size pequeño (0.8rem), letter-spacing 0.1em
- Hover de links: color `--gold` con transición suave
- CTA: "Consultanos" → botón con borde dorado (outline style)
- Mobile: hamburguesa que abre menú fullscreen oscuro con links centrados
- Al scroll: fondo se vuelve más opaco + línea dorada inferior sutil

**Footer (estilo La Fontaine)**:
- Fondo `--bg-surface`
- Contenido centrado
- Logo o nombre de la joyería arriba
- Info de contacto (dirección, teléfonos, horarios) en texto secundario
- Links a redes sociales como iconos con hover dorado
- Línea dorada fina arriba del footer
- Copyright abajo en texto pequeño

**WhatsApp float**: botón circular fijo bottom-right, verde, con sombra sutil

**Product card (estilo La Fontaine)**:
- Fondo `--bg-elevated` o transparente
- Imagen del producto, aspecto cuadrado (1:1), sin border-radius
- **Hover en imagen**: segunda imagen del producto aparece (crossfade) — si solo tiene 1 imagen, zoom sutil
- Nombre del producto debajo: serif, tamaño medio
- Precio: dorado, debajo del nombre
- Sin botones visibles en la card — el click va al detalle
- Separación generosa entre cards

**Sección alternada imagen+texto (componente key del landing)**:
- Full-width, 2 columnas (50/50)
- Una columna es imagen a sangre (edge to edge, sin padding)
- La otra es texto con padding generoso, centrado vertical
- Título serif uppercase + texto body + botón CTA con borde dorado
- Alternar: imagen izquierda/texto derecha, luego al revés
- Separador decorativo dorado entre cada sección

**Botones**:
- `.btn-gold`: borde dorado 1px, texto dorado, fondo transparente, padding generoso. Hover: fondo dorado, texto negro
- `.btn-gold-solid`: fondo dorado, texto negro. Hover: fondo gold-light
- `.btn-whatsapp`: fondo verde WhatsApp, texto blanco
- Todos sin border-radius (rectos, estilo editorial) o con radius mínimo (2px)
- Uppercase, letter-spacing 0.1em, font-size 0.85rem

### Nav — Links de navegación
- INICIO (index.html)
- CATÁLOGO (catalogo.html)
- SERVICIOS (#servicios en index.html)
- NOSOTROS (#nosotros en index.html)
- CONTACTO (#contacto en index.html)
- CTA: "CONSULTANOS" → WhatsApp

---

## PARTE 4: LANDING PAGE (index.html)

Estilo visual inspirado en lafontaine.com.uy: hero con slideshow a pantalla completa, secciones alternadas de imagen+texto, decoradores dorados entre secciones, ritmo editorial. TODO sobre fondo oscuro.

### 4.1 Hero — Slideshow fullscreen (100vh)

**Carrusel de imágenes a pantalla completa**, como La Fontaine:
- 2-3 slides, cada uno con:
  - Imagen de fondo (full cover, tomada de productos destacados en Supabase)
  - Overlay oscuro semi-transparente (rgba(0,0,0,0.45))
  - Contenido centrado:
    - Título grande serif uppercase con letter-spacing: **"JOYERÍA CENTRAL"** (slide 1) / **"JOYAS, RELOJES Y REPARACIONES"** (slide 2)
    - Subtítulo: "Elegancia que perdura en el tiempo" / "Más de una década cuidando lo que más valorás"
    - 2-3 botones CTA en fila: "Ver catálogo" | "Consultar por WhatsApp" (estilo borde dorado)
- **Auto-play** cada 6 segundos
- **Transición**: crossfade suave (1s ease)
- **Indicadores**: dots o líneas finas en la parte inferior
- **Scroll indicator**: línea vertical animada o flecha sutil en el borde inferior
- En mobile: misma estructura, imágenes con object-position center

### 4.2 Texto de marca (sección corta)

- Fondo `--bg`
- **Decorador dorado** arriba (línea o filigrana SVG)
- Texto centrado, serif, uppercase, letter-spacing amplio:
  - "MÁS DE 280 PIEZAS EN NUESTRO CATÁLOGO"
- Subtexto en font body: "Cada pieza seleccionada con el cuidado y la calidad que nos define. Joyas de plata 925 y oro, relojes, acero y más."
- **Decorador dorado** abajo

### 4.3 Productos destacados (carrusel estilo La Fontaine)

- Fondo `--bg-elevated`
- Título centrado: "DESTACADOS" (uppercase, serif, letter-spacing)
- **Carrusel horizontal** de product cards:
  - 4 en desktop, 2 en tablet, 1 en mobile
  - Prev/next con flechas elegantes (líneas finas, no bloques)
  - **Hover en imagen**: segunda imagen crossfade (si tiene), o zoom sutil
  - Nombre + precio debajo de la imagen
  - Sin "añadir al carrito" — click va al detalle
- Botón debajo del carrusel: "VER COLECCIÓN COMPLETA" → catalogo.html
- Carga desde Supabase: productos con `featured=true` o tag `oferta`

### 4.4 Sección alternada — Servicios: Reparaciones (imagen izq + texto der)

Componente de **2 columnas full-width**:
- **Izquierda**: imagen a sangre (placeholder o imagen real del taller/local), sin padding, sin border-radius
- **Derecha**: fondo `--bg`, padding generoso (80px), centrado vertical
  - Título: "REPARAMOS RELOJES Y JOYAS" (serif, uppercase, gold)
  - Texto: "Automáticos, a pila, de múltiples marcas. Algunas reparaciones se hacen en el acto. Soldaduras de plata y de oro con terminación profesional."
  - Botón: "CONSULTAR" → WhatsApp
- **Decorador dorado** entre esta sección y la siguiente

### 4.5 Sección alternada — Confección a medida (texto izq + imagen der)

- **Izquierda**: fondo `--bg`, texto:
  - Título: "DISEÑOS PERSONALIZADOS" (serif, uppercase, gold)
  - Texto: "Joyas personalizadas, mates y bombillas hechos a tu gusto. Creamos piezas únicas que te representan."
  - Botón: "HACER PEDIDO" → WhatsApp
- **Derecha**: imagen a sangre (placeholder)
- **Decorador dorado** entre secciones

### 4.6 Nosotros (sección centrada)

- Fondo `--bg-elevated`
- **Decorador dorado** arriba
- Título centrado: "NUESTRA HISTORIA" (serif, uppercase)
- Texto centrado, max-width 700px:
  - "En Joyería Central nos dedicamos a ofrecer joyas elegantes y modernas que realzan tu belleza y estilo. Ubicados en Avenida Artigas 572, Las Piedras, somos un referente local en joyería, relojería y reparaciones."
  - "Nuestra misión es brindarte una experiencia de compra excepcional, donde la calidad y la atención al detalle son lo primero."
- **Stats con counter animation** en fila centrada, separadas por líneas doradas verticales:
  - 10+ → AÑOS DE EXPERIENCIA
  - 1000+ → CLIENTES SATISFECHOS
  - 100% → ATENCIÓN PERSONALIZADA
- Los números en tipografía serif grande dorada, las etiquetas en body small uppercase
- **Decorador dorado** abajo

### 4.7 Promo / CTA

- Full-width, fondo con imagen (producto destacado) + overlay oscuro fuerte
- Título serif grande centrado: "DESCUENTO EXCLUSIVO EN PIEZAS SELECCIONADAS"
- Subtexto: "Aprovechá nuestra promoción en joyas únicas."
- Botón: "CONSULTAR OFERTA" → WhatsApp (estilo borde dorado)

### 4.8 Contacto

- Fondo `--bg`
- Título centrado: "VISITANOS" (serif, uppercase, gold)
- Subtítulo: "AVENIDA ARTIGAS 572, LAS PIEDRAS"
- Texto: "Estamos para asesorarte, orientarte y servirte."
- **2 columnas**:
  - Izquierda: formulario de contacto simple (nombre, teléfono, email, mensaje) con inputs estilizados sobre fondo oscuro (bordes dorados finos, texto claro). Botón "ENVIAR" estilo gold
  - Derecha: info de contacto (dirección, teléfonos, email, horarios) + mapa Google embed
- Los inputs tienen fondo `--bg-surface`, borde inferior dorado, sin borde completo, placeholder en text-secondary

### 4.9 Footer

- Línea dorada fina como separador
- Fondo `--bg-surface`
- Nombre "JOYERÍA CENTRAL" en serif dorado centrado
- Datos de contacto centrados en texto secundario
- Horarios
- Iconos de redes sociales (Instagram, Facebook) con hover dorado
- Copyright: "© 2025 Joyería Central. Todos los derechos reservados."

---

## PARTE 5: CATÁLOGO (catalogo.html)

Todo sobre fondo oscuro, coherente con el landing.

### 5.1 Header
- Fondo `--bg`
- Breadcrumb en `--text-secondary`, links con hover `--gold`: INICIO > CATÁLOGO
- Título centrado: "NUESTRO CATÁLOGO" (serif, uppercase, gold, letter-spacing)
- Decorador dorado debajo

### 5.2 Barra de búsqueda y filtros (sticky debajo del nav)

Fondo `--bg-surface` con borde inferior `--border`. Se vuelve sticky al scrollear.

- **Buscador**: input con fondo `--bg-elevated`, borde inferior dorado, icono lupa dorado, texto claro. Placeholder "Buscar por nombre..." en `--text-secondary`. Debounce 300ms, sugerencias dropdown (fondo `--bg-surface`), botón X para limpiar
- **Pills de categoría**: fondo transparente + borde dorado sutil inactivo. Activo: fondo `--gold`, texto `--bg`. "TODAS" + cada categoría con contador "(58)". Scroll horizontal, uppercase, font-size pequeño
- **Filtro tags**: pills: "TODOS" / "NUEVOS" / "EN OFERTA"
- **Ordenar**: select con fondo `--bg-elevated`, borde dorado → Relevancia, Precio ↑, Precio ↓, Nombre A-Z, Más recientes
- **Contador**: "Mostrando 58 de 280 productos" en `--text-secondary`
- **Mobile**: buscador visible + botón "FILTROS" (borde dorado) que abre drawer lateral fondo `--bg-surface` con todas las opciones

### 5.3 Grid de productos
- 4 col desktop / 3 tablet / 2 mobile
- Fondo `--bg`
- Product card estilo La Fontaine:
  - Imagen cuadrada (1:1), sin border-radius, object-fit cover
  - Placeholder SVG si no tiene imagen (fondo `--bg-elevated` con icono dorado)
  - **Hover en imagen**: segunda imagen crossfade si tiene 2+, sino zoom sutil (scale 1.03)
  - Badge tag si tiene: "NUEVO" (fondo dorado, texto negro) / "OFERTA" (fondo `--gold-muted`)
  - Nombre del producto: serif, tamaño medio, color `--text`, 2 líneas max ellipsis
  - Precio: `--gold`, debajo del nombre. Formato `$ 1.990`
  - Si tiene comparePrice: tachado en `--text-secondary` + nuevo en `--gold`
  - Click en toda la card → producto.html?id=uuid
  - Botón WhatsApp pequeño (icono) en hover, esquina inferior de la imagen

### 5.4 Paginación
- 24 por página
- Botones numéricos: « 1 2 3 ... 12 » — estilo borde dorado, activo fondo dorado
- Scroll suave al top al cambiar página

### 5.5 Estado vacío
- Centrado, fondo `--bg`
- Icono lupa dorado
- "No encontramos productos con esos filtros" en `--text-secondary`
- Botón "LIMPIAR FILTROS" estilo borde dorado

### 5.6 Queries a Supabase

```js
// Buscar productos de una categoría, ordenados por precio
const { data, count } = await supabase
  .from('products')
  .select('*', { count: 'exact' })
  .eq('category_id', 'relojes')
  .order('price', { ascending: true })
  .range(0, 23);

// Búsqueda full-text en español
const { data } = await supabase
  .from('products')
  .select('*')
  .textSearch('fts', 'anillo oro', { type: 'websearch' });
```

---

## PARTE 6: CATEGORÍA (categoria.html?cat=xxx)

- Fondo `--bg` en todo
- Breadcrumb: INICIO > CATÁLOGO > [CATEGORÍA]
- **Banner de categoría**: fondo `--bg-elevated`, nombre de categoría centrado en serif uppercase gold, cantidad de productos debajo en text-secondary, decoradores dorados arriba y abajo
- Mismos filtros y grid que catálogo MENOS el filtro de categoría
- Misma paginación
- Al final: "OTRAS CATEGORÍAS" — cards horizontales scrolleables, cada una con imagen de fondo + nombre en overlay, hover zoom

---

## PARTE 7: DETALLE DE PRODUCTO (producto.html?id=xxx)

Fondo `--bg` en todo.

- Breadcrumb: INICIO > CATÁLOGO > [CATEGORÍA] > [PRODUCTO]
- **2 columnas** (desktop, 55/45):
  - **Izquierda — Galería**:
    - Imagen principal grande, sin border-radius
    - Si tiene múltiples: thumbnails debajo (borde dorado en la activa), click cambia la principal con crossfade
    - Click en imagen principal: lightbox fullscreen (fondo negro 95% opacity, imagen centrada, botón X dorado para cerrar, flechas doradas si hay varias)
    - Mobile: carrusel horizontal con swipe + dots indicadores
  - **Derecha — Info**:
    - Nombre: h1, serif, tamaño grande, color `--text`
    - Tags como badges (fondo dorado, texto negro)
    - Precio grande en `--gold` (serif, bold)
    - Si tiene comparePrice: precio viejo tachado en `--text-secondary`
    - Descripción en `--text-secondary`, line-height generoso
    - **Botón WhatsApp grande**: fondo verde, "CONSULTAR POR WHATSAPP" → wa.me con "Hola, quiero consultar por [nombre], lo vi en su web"
    - **Compartir**: botón pequeño borde dorado, icono de link, copia URL al clipboard + feedback "¡Link copiado!"
- **Decorador dorado** separador
- **Productos relacionados**: "TAMBIÉN TE PUEDE INTERESAR" (serif, uppercase, centrado)
  - Grid de 4 products de la misma categoría, mismas cards que el catálogo
- Animaciones: imagen fade-in-left, texto fade-in-right

---

## PARTE 8: ADMIN (admin.html)

### 8.1 Auth con Supabase

```js
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'addacippo@gmail.com',
  password: '...'
});

// Check session
const { data: { session } } = await supabase.auth.getSession();
if (!session) { /* mostrar login */ }

// Logout
await supabase.auth.signOut();
```

Login: email + password. Supabase maneja la sesión automáticamente.

### 8.2 Dashboard

**Nota**: el admin NO necesita el tema oscuro luxury. Puede ser tema claro funcional (fondo blanco, texto oscuro) para que sea cómodo de usar. Usar las mismas fuentes (Playfair + Lato) y el dorado como acento para mantener coherencia.

- Header: título + cerrar sesión + "Ver sitio →"
- Stats: total productos, en oferta, sin stock, categorías
- Tabs: Productos | Categorías

### 8.3 Tab Productos
- Botón "Agregar producto" + buscador + filtro categoría + filtro tags
- Tabla: checkbox, thumbnail, nombre, categoría, precio, tags, stock, acciones (editar/eliminar)
- Acciones masivas: eliminar, cambiar categoría, marcar oferta/sin stock

### 8.4 Formulario producto (modal)
- Nombre (requerido), descripción, precio (requerido), precio anterior, categoría (select), tags (checkboxes: Nuevo/Oferta/Destacado), en stock (toggle)
- **Imágenes**: file input múltiple, drag & drop, preview, máx 5
  - Al subir: `supabase.storage.from('product-images').upload(path, file)`
  - URL pública: `supabase.storage.from('product-images').getPublicUrl(path)`
  - Eliminar: `supabase.storage.from('product-images').remove([path])`

### 8.5 Tab Categorías
- Lista con nombre, cantidad productos, orden
- Crear, editar, reordenar, eliminar (solo si vacía)

### 8.6 UX
- Loading spinners, toast notifications, confirmación antes de eliminar, responsive

---

## PARTE 9: Animaciones (detalle técnico)

Todo CSS + IntersectionObserver. Sin librerías.

### Scroll reveal
```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
```

Clases: `.reveal-up`, `.reveal-left`, `.reveal-right`, `.reveal-scale`, `.stagger-N` (delay N*100ms)

### Efectos
- Hero text: cada `<span>` con @keyframes secuencial
- Counter: números 0 → valor en ~2s
- Parallax: `translateY(calc(var(--scroll) * 0.1))`
- Icon draw: `stroke-dasharray` + `stroke-dashoffset` animados
- Image reveal: `clip-path: inset(0 100% 0 0)` → `inset(0)`
- Card hover: `translateY(-4px) + box-shadow`

### prefers-reduced-motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## PARTE 10: Datos del negocio

- **Nombre**: Joyería Central
- **Dirección**: Avenida Artigas 572 esq. Leandro Gómez, Las Piedras, Canelones, Uruguay
- **Celular**: 095 135 724
- **Fijo**: 2363 9360
- **WhatsApp**: wa.me/59895135724
- **Email**: addacippo@gmail.com
- **Instagram**: https://www.instagram.com/central_de_reparacioness/
- **Horarios**: Lun-Vie 10:00-18:00, Sáb 10:00-14:00

---

## PARTE 11: Requisitos técnicos

### Responsive
- Desktop: > 1024px (container 1200px)
- Tablet: 768-1024px
- Mobile: < 768px

### Performance
- Google Fonts con preconnect
- Imágenes con loading="lazy"
- Supabase JS desde CDN
- CSS/JS divididos por página

### SEO
- Title dinámico por página
- Meta description, Open Graph
- HTML semántico, un solo h1 por página

### Accesibilidad
- aria-labels, contraste, focus visible, prefers-reduced-motion

---

## PARTE 12: Criterios de aceptación

### Supabase setup
- [ ] Tablas categories y products creadas con el esquema SQL
- [ ] RLS habilitado con políticas de lectura pública y escritura autenticada
- [ ] Storage bucket product-images creado y público
- [ ] Usuario admin creado

### Migración de Wix
- [ ] Script migrate-wix-images.js descarga todas las imágenes de static.wixstatic.com
- [ ] Las sube a Supabase Storage bucket product-images
- [ ] Inserta las 12 categorías en la tabla categories
- [ ] Inserta los 280 productos con URLs de Supabase (no de Wix) en la tabla products
- [ ] Reporte final muestra éxito/errores
- [ ] Verificar en Supabase Dashboard que datos e imágenes están correctos

### Landing page (index.html)
- [ ] Hero 100vh con text reveal animado palabra por palabra
- [ ] Scroll indicator con bounce
- [ ] Grid editorial de categorías con imágenes de Supabase y hover zoom
- [ ] Carrusel de destacados con prev/next/dots/swipe/autoplay
- [ ] Banner marca con parallax sutil
- [ ] Servicios con iconos SVG animados (stroke draw)
- [ ] Nosotros con clip-path reveal y counter animation
- [ ] Promo con fondo oscuro y gradiente dorado
- [ ] Contacto con mapa
- [ ] Todas las animaciones scroll reveal funcionan
- [ ] prefers-reduced-motion respetado

### Catálogo (catalogo.html)
- [ ] Búsqueda en tiempo real con debounce funciona contra Supabase
- [ ] Pills de categoría con contador funcionan
- [ ] Filtro por tags funciona
- [ ] Ordenar por precio/nombre/relevancia funciona
- [ ] Grid 4/3/2 columnas responsive
- [ ] Product cards con imagen de Supabase, nombre, precio, tags, hover
- [ ] Paginación funciona
- [ ] Estado vacío con "Limpiar filtros"
- [ ] Mobile: drawer de filtros

### Categoría (categoria.html)
- [ ] Carga con ?cat=relojes
- [ ] Banner con nombre y cantidad
- [ ] Filtros y grid funcionan
- [ ] "Otras categorías" al final

### Producto (producto.html)
- [ ] Carga con ?id=uuid
- [ ] Galería con thumbnails y lightbox
- [ ] Info completa con precio formateado
- [ ] Botón WhatsApp con nombre del producto
- [ ] Productos relacionados

### Admin (admin.html)
- [ ] Login con email/password via Supabase Auth funciona
- [ ] Dashboard con stats en tiempo real
- [ ] CRUD productos completo (create/read/update/delete)
- [ ] Upload imágenes a Supabase Storage con preview y drag & drop
- [ ] Gestión de categorías (CRUD + reordenar)
- [ ] Búsqueda y filtros en listado
- [ ] Acciones masivas
- [ ] Responsive

### Cross-cutting
- [ ] Nav consistente con links a todas las páginas
- [ ] Footer consistente
- [ ] WhatsApp float en todas las páginas públicas
- [ ] Responsive en todos los breakpoints
- [ ] Sin errores en consola
- [ ] Precios formato uruguayo ($ 1.990)
- [ ] Tema oscuro luxury en todas las páginas públicas (fondo negro, dorado, serif uppercase)
- [ ] Decoradores dorados entre secciones del landing
- [ ] Product cards con hover crossfade de imagen
- [ ] Tipografías Playfair Display + Lato
- [ ] Imágenes cargando desde Supabase Storage (NO de Wix)

---

## PARTE 13: Deployment y DNS

### Deploy en Vercel (recomendado)
```bash
# Instalar Vercel CLI
npm i -g vercel

# Desde la carpeta del proyecto
vercel

# Apuntar dominio: en el panel de Vercel, agregar joyeriacentraluy.com
# Cambiar los DNS del dominio para que apunten a Vercel
```

### O en Netlify
```bash
# Drag & drop la carpeta en netlify.com
# O usar Netlify CLI: netlify deploy --prod
```

### Pasos para el dominio
1. Deployar el sitio nuevo en Vercel/Netlify
2. En el registrar del dominio (donde se compró joyeriacentraluy.com): cambiar los nameservers o agregar un CNAME
3. Verificar que el sitio nuevo carga en el dominio
4. Cancelar Wix

---

## Notas para Claude Code

1. **Referencia visual obligatoria**: https://lafontaine.com.uy/ — estudiar el estilo: fondo negro, dorado, secciones alternadas imagen+texto, hero slideshow, product cards con hover crossfade, decoradores dorados, tipografía serif uppercase con letter-spacing amplio
2. **Orden**: setup Supabase SQL → script migración → common CSS/JS → landing → catálogo → categoría → producto → admin
3. **NO crear servidor Express** — todo es estático + Supabase desde el navegador
4. Los 280 productos están en `data/products.json` — el script de migración los lee y los sube a Supabase
5. Las imágenes de Wix (static.wixstatic.com) se descargan y re-suben a Supabase Storage
6. Supabase JS desde CDN: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
7. `supabase-config.js` tiene URL y anon key — NUNCA la service_role key en frontend
8. Textos en español (Uruguay), voseo rioplatense
9. Precios: punto para miles, sin decimales: `$ 1.990`
10. Cada página es un HTML separado (no SPA), comparten common.css y common.js
11. Carrusel y animaciones en vanilla JS, sin librerías
12. **Tema oscuro** en todas las páginas públicas. Admin puede ser tema claro funcional
13. **Tipografías**: Playfair Display (serif, títulos) + Lato (sans, body). NO Cormorant ni Inter
14. **Headings**: siempre uppercase + letter-spacing 0.15em en títulos de sección
15. **Imágenes de producto sin border-radius** — bordes rectos, estilo editorial
16. Loop: implementar → revisar checklist → corregir → repetir
