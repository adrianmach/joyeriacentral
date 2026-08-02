window.JC = (function () {
  'use strict';

  const WHATSAPP_NUMBER = '59895135724';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  // Formato uruguayo: punto para miles, sin decimales si son .00 ($ 1.990, $ 1.990,50)
  function formatPrice(amount) {
    const num = Number(amount) || 0;
    const hasCents = Math.round(num * 100) % 100 !== 0;
    return '$ ' + num.toLocaleString('es-UY', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  function waLink(message) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function placeholderSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2 8 8h8l-4-6z"></path>
      <path d="M8 8 3 10l9 12 9-12-5-2"></path>
      <path d="M8 8h8"></path>
    </svg>`;
  }

  function whatsappIconSvg(color) {
    return `<svg viewBox="0 0 24 24" fill="${color || '#fff'}"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.87 9.87 0 0 0 12.04 2zm5.8 14.14c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.79-4.17-4.94-4.36-.15-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.58.81 2 .88 2.14.07.15.11.32.02.51-.09.19-.14.31-.27.48-.14.17-.29.37-.41.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.61-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.63-.14.26.09 1.66.78 1.94.92.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg>`;
  }

  async function apiFetch(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      let message = 'Error de red';
      try { message = (await res.json()).error || message; } catch (e) { /* ignore */ }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---------- Nav (fixed shadow + hamburger) ----------

  function initNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    function syncNavHeight() {
      document.documentElement.style.setProperty('--nav-h', navbar.offsetHeight + 'px');
    }
    syncNavHeight();
    window.addEventListener('resize', syncNavHeight, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncNavHeight).catch(() => {});
    }

    function handleScroll() {
      navbar.classList.toggle('scrolled', window.scrollY > 12);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobilePanel = document.getElementById('mobilePanel');
    if (!hamburgerBtn || !mobilePanel) return;

    hamburgerBtn.addEventListener('click', () => {
      const isOpen = mobilePanel.classList.toggle('open');
      hamburgerBtn.classList.toggle('active', isOpen);
      hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
    });

    mobilePanel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobilePanel.classList.remove('open');
        hamburgerBtn.classList.remove('active');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---------- Scroll reveal ----------

  let revealObserver = null;

  function initRevealObserver() {
    if (prefersReducedMotion || !('IntersectionObserver' in window)) return null;
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    return revealObserver;
  }

  function observeReveals(root) {
    const scope = root || document;
    const els = scope.querySelectorAll('.reveal-up:not(.revealed), .reveal-left:not(.revealed), .reveal-right:not(.revealed), .reveal-scale:not(.revealed), .fade-in:not(.visible)');
    if (prefersReducedMotion || !revealObserver) {
      els.forEach((el) => { el.classList.add('revealed'); el.classList.add('visible'); });
      return;
    }
    els.forEach((el) => revealObserver.observe(el));

    // Red de seguridad: si por throttling del navegador (pestaña en segundo
    // plano, bfcache, etc.) el observer nunca dispara, el contenido no debe
    // quedar invisible para siempre.
    els.forEach((el) => {
      setTimeout(() => {
        if (!el.classList.contains('revealed')) {
          el.classList.add('revealed');
          el.classList.add('visible');
          if (revealObserver) revealObserver.unobserve(el);
        }
      }, 2500);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initRevealObserver();
    observeReveals(document);
  });

  return {
    WHATSAPP_NUMBER,
    prefersReducedMotion,
    escapeHtml,
    formatPrice,
    waLink,
    placeholderSvg,
    whatsappIconSvg,
    apiFetch,
    initNav,
    initRevealObserver,
    observeReveals,
  };
})();
