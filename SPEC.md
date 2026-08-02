# Joyería Central — Website Rebuild Spec

## Objetivo

Crear desde cero el sitio web de **Joyería Central**, una joyería ubicada en Las Piedras, Uruguay. El sitio reemplaza uno viejo hecho en Wix. Debe ser estático (HTML/CSS/JS puro), moderno, limpio (fondo claro), responsive, y orientado a que el cliente consulte por WhatsApp.

**URL actual para referencia**: https://www.joyeriacentraluy.com/

---

## Stack Técnico

- HTML5, CSS3, JavaScript vanilla (sin frameworks)
- Un solo archivo `index.html` con todo (CSS en `<style>`, JS en `<script>`)
- Google Fonts para tipografía
- No usar librerías externas (no Bootstrap, no Tailwind, no jQuery)
- Imágenes con placeholders estilizados (iconos SVG inline) ya que no tenemos fotos reales aún

---

## Diseño Visual

### Paleta de colores
- Background principal: `#FAFAF8` (off-white cálido)
- Cards/superficies: `#FFFFFF`
- Texto principal: `#1A1A1A`
- Texto secundario: `#6B6B6B`
- Acento (dorado oscuro, joyería): `#B8860B`
- Acento suave: `#D4A841`
- Background acento: `#F7F2E7`
- Bordes/divisores: `#E8E4DC`
- WhatsApp verde: `#25D366`

### Tipografía
- Display/títulos: `Cormorant Garamond` (serif, elegante, peso 600-700)
- Body/texto: `Inter` (sans-serif, limpio, peso 300-500)
- Escala clara: h1 ~clamp(2.5rem, 6vw, 4.2rem), h2 ~clamp(1.8rem, 4vw, 2.6rem), body 1rem
- Letter-spacing negativo en títulos (-0.02em)

### Estilo general
- Border-radius: 8-12px en cards y botones
- Sombras sutiles solo en hover
- Espaciado generoso entre secciones (80px padding)
- Animaciones sutiles al scroll (fade-in + translateY con IntersectionObserver)
- Nav con backdrop-filter blur al hacer scroll
- Botón flotante de WhatsApp en esquina inferior derecha

---

## Estructura del sitio (secciones en orden)

### 1. Navegación (fija, top)
- Logo texto: "Joyería **Central**" (Central en color acento)
- Links: Catálogo | Servicios | Nosotros | Contacto
- CTA button: "Consultanos" → abre WhatsApp
- Mobile: menú hamburguesa que abre un dropdown
- Al hacer scroll: agregar sombra sutil

### 2. Hero
- Eyebrow: "Las Piedras, Uruguay"
- Título: "Elegancia que *perdura* en el tiempo" (la palabra en itálica va en color acento)
- Subtítulo: "Joyas de plata 925 y oro, relojes y reparaciones con la dedicación artesanal de más de una década cuidando lo que más valorás."
- Botones: "Ver catálogo" (acento) + "WhatsApp" (verde con icono)
- Background: gradiente suave de accent-bg a bg

### 3. Catálogo (4 cards en grid)
- Label: "Catálogo"
- Título: "Nuestros productos"
- Subtítulo: "Cada pieza seleccionada con el cuidado y la calidad que nos define."

Cards (cada una con placeholder de imagen, título, descripción, link a WhatsApp):

**Relojes**
- Descripción: "Diseño, precisión y estilo atemporal. Piezas pensadas para acompañarte cada día con elegancia."
- WhatsApp msg: "Hola, quiero consultar por relojes"

**Joyas de Plata y Oro**
- Descripción: "Elegancia y calidad en cada pieza. Diseños atemporales para realzar tu estilo en cualquier ocasión."
- WhatsApp msg: "Hola, quiero consultar por joyas de plata y oro"

**Joyas de Acero**
- Descripción: "Resistentes, modernas y pensadas para el uso diario. Diseño contemporáneo que no pierde brillo."
- WhatsApp msg: "Hola, quiero consultar por joyas de acero"

**Otros Productos**
- Descripción: "Mates, bombillas personalizadas y accesorios que complementan nuestras colecciones."
- WhatsApp msg: "Hola, quiero consultar por otros productos"

Cada card tiene un link "Consultar por WhatsApp →"

### 4. Servicios (fondo accent-bg)
- Label: "Servicios"
- Título: "Lo que hacemos por vos"
- Subtítulo: "Reparaciones y trabajos artesanales con la confianza de siempre."

Grid de 4 items con icono SVG, título y descripción:

1. **Reparación de Relojes**: "Automáticos, a pila, de múltiples marcas. Algunas reparaciones se hacen en el acto."
2. **Soldaduras**: "Soldaduras de plata y de oro con terminación profesional."
3. **Colocación de Pilas**: "Cambio de pilas rápido para que tu reloj no se detenga."
4. **Confección a Medida**: "Joyas personalizadas, mates y bombillas hechos a tu gusto."

### 5. Nosotros
- Label: "Nosotros"
- Título: "Nuestra historia"
- Layout: grid 2 columnas (imagen placeholder + texto)
- Texto párrafo 1: "En Joyería Central nos dedicamos a ofrecer joyas elegantes y modernas que realzan tu belleza y estilo. Ubicados en Avenida Artigas 572, Las Piedras, somos un referente local en joyería, relojería y reparaciones."
- Texto párrafo 2: "Nuestra misión es brindarte una experiencia de compra excepcional, donde la calidad y la atención al detalle son lo primero. Cada pieza que ofrecemos es seleccionada con cuidado, y cada reparación es tratada con dedicación artesanal."
- Stats row debajo del texto (separada con borde top): 10+ Años de experiencia | 1000+ Clientes satisfechos | 100% Atención personalizada

### 6. Promo/Oferta (fondo oscuro #1A1A1A, texto blanco)
- Label: "Oferta Especial"
- Título: "Descuento exclusivo en piezas seleccionadas"
- Texto: "Aprovechá nuestra promoción en joyas únicas. Encontrá el complemento perfecto para tu estilo a precios increíbles."
- CTA: "Consultar oferta" → WhatsApp con msg "Hola, quiero consultar por la oferta especial"

### 7. Contacto
- Label: "Contacto"
- Título: "Visitanos o escribinos"
- Subtítulo: "Estamos para ayudarte. Consultá sin compromiso por cualquiera de nuestros canales."
- Layout: grid 2 columnas (info de contacto + mapa embed)

Info de contacto (cada item con icono en cuadrado accent-bg):
- **Dirección**: Avenida Artigas 572 esq. Leandro Gómez, Las Piedras, Canelones, Uruguay
- **Teléfonos**: 095 135 724 (link tel:) y 2363 9360 (link tel:)
- **Email**: addacippo@gmail.com (link mailto:)
- **Horarios**: Lunes a Viernes: 10:00 a 18:00 / Sábados: 10:00 a 14:00
- Botón "Escribinos por WhatsApp" (verde)

Mapa: iframe de Google Maps embed con la dirección (usar coordenadas aproximadas de Las Piedras: -34.7275, -56.2196)

### 8. Footer
- Copyright: "© 2025 Joyería Central. Todos los derechos reservados."
- Links sociales: Instagram (https://www.instagram.com/central_de_reparacioness/) y Facebook
- Iconos en cuadrados con hover dorado

### 9. Botón flotante WhatsApp
- Fijo en esquina inferior derecha (bottom: 24px, right: 24px)
- Circular, verde WhatsApp, con sombra
- Icono WhatsApp SVG blanco
- Link: wa.me/59895135724 con msg "Hola, quiero hacer una consulta"
- Hover: scale(1.1) + sombra más intensa

---

## Datos de contacto del negocio

- **Nombre**: Joyería Central
- **Dirección**: Avenida Artigas 572 esq. Leandro Gómez, Las Piedras, Canelones, Uruguay
- **Teléfono celular**: 095 135 724
- **Teléfono fijo**: 2363 9360
- **WhatsApp**: +598 95 135 724 → usar wa.me/59895135724
- **Email**: addacippo@gmail.com
- **Instagram**: @central_de_reparacioness → https://www.instagram.com/central_de_reparacioness/
- **Horarios**: Lunes a Viernes 10:00-18:00, Sábados 10:00-14:00

---

## Requisitos técnicos

### Responsive
- Desktop: max-width 1200px, grids de 4 y 2 columnas
- Tablet (~768px): grids pasan a 2 columnas, about y contacto a 1 columna
- Mobile (~480px): todo a 1 columna, nav con hamburguesa

### Performance
- Sin imágenes externas pesadas (los placeholders son SVG inline)
- Google Fonts con preconnect
- Lazy loading en iframe del mapa
- CSS y JS inline en el HTML (un solo archivo, sin requests extra)

### Accesibilidad
- aria-labels en botones de icono (hamburguesa, redes sociales, WhatsApp flotante)
- Links con texto descriptivo
- Contraste suficiente en todos los textos
- `prefers-reduced-motion`: desactivar animaciones y transiciones

### SEO básico
- Title tag descriptivo
- Meta description
- Open Graph tags (og:title, og:description, og:type, og:url)
- HTML semántico (nav, section, footer, h1-h4)
- Una sola etiqueta h1

---

## Criterios de aceptación (checklist)

- [ ] Archivo único `index.html` funcional, se abre en el navegador sin errores
- [ ] Todas las 8 secciones presentes y en el orden correcto
- [ ] Nav fija con backdrop-blur, hamburguesa funcional en mobile
- [ ] Hero con título, subtítulo y 2 botones (catálogo + WhatsApp)
- [ ] 4 cards de catálogo con link a WhatsApp cada una (mensajes pre-armados distintos)
- [ ] 4 items de servicios con iconos SVG
- [ ] Sección Nosotros con layout 2 columnas y stats
- [ ] Sección promo con fondo oscuro
- [ ] Sección contacto con datos completos y mapa
- [ ] Footer con copyright y links a redes
- [ ] Botón flotante de WhatsApp siempre visible
- [ ] Responsive: funciona correctamente en 1200px, 768px y 480px
- [ ] Todos los links de WhatsApp apuntan a wa.me/59895135724 con texto pre-armado
- [ ] Animaciones de scroll (IntersectionObserver)
- [ ] `prefers-reduced-motion` respetado
- [ ] Colores exactos según la paleta definida
- [ ] Tipografías Cormorant Garamond + Inter cargadas desde Google Fonts
- [ ] Sin errores en la consola del navegador
- [ ] HTML válido y semántico
