/* Interacciones del sitio. Sin dependencias. */
(() => {
  'use strict';
  const SITE = window.SITE || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Analítica (solo si hay un proveedor configurado) ---------- */
  function track(event, params = {}) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event, ...params });
      if (typeof window.gtag === 'function') window.gtag('event', event, params);
      if (typeof window.plausible === 'function') window.plausible(event, { props: params });
    } catch (_) { /* la analítica nunca debe romper la página */ }
  }

  /* ---------- Aviso no intrusivo ---------- */
  const toast = $('.toast');
  let toastTimer;
  function showToast(title, detail) {
    if (!toast) return;
    toast.replaceChildren();
    const p = document.createElement('p');
    p.textContent = title;
    toast.append(p);
    if (detail) { const pre = document.createElement('pre'); pre.textContent = detail; toast.append(pre); }
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
  }

  /* ---------- WhatsApp ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-wa]');
    if (!a) return;
    const ctx = a.getAttribute('data-wa');
    // Clic en WhatsApp ≠ venta: solo mide la intención de contacto.
    track('whatsapp_click', { context: ctx });
    if (!SITE.numberConfigured) {
      e.preventDefault();
      showToast('Vista previa: falta configurar el número de WhatsApp. Este es el mensaje que se enviaría:', a.getAttribute('data-wa-text') || '');
    }
  });

  /* ---------- Clics en productos ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (a) track(a.getAttribute('data-track'), { product: a.getAttribute('data-product') });
  });
  const viewed = $('[data-view-product]');
  if (viewed) track('view_product', { product: viewed.getAttribute('data-view-product') });

  /* ---------- Barra de pedido en la ficha (móvil) ---------- */
  const buybar = $('.buybar');
  const cta = $('.product__cta');
  if (buybar && cta) {
    // Aparece solo cuando el botón principal ya quedó arriba, fuera de la vista.
    // (Un listener de scroll en lugar de IntersectionObserver: los saltos rápidos no se pierden.)
    let ticking = false;
    const update = () => { ticking = false; buybar.hidden = cta.getBoundingClientRect().bottom > 0; };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- Menú móvil ---------- */
  const toggle = $('.nav__toggle');
  const menu = $('#menu');
  if (toggle && menu) {
    const set = (open) => { toggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('is-open', open); };
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); } });
  }

  /* ---------- Filtros del catálogo ---------- */
  const chips = $$('.chip[data-filter]');
  if (chips.length) {
    const state = { cat: '', occ: '' };
    const cards = $$('.catalog .card');
    const sections = $$('[data-cat-section]');
    const count = $('[data-count]');
    const empty = $('.empty');

    function apply() {
      let n = 0;
      cards.forEach((c) => {
        const ok = (!state.cat || c.dataset.category === state.cat) && (!state.occ || c.dataset.occasions.split(' ').includes(state.occ));
        c.hidden = !ok;
        if (ok) n++;
      });
      sections.forEach((s) => { s.hidden = !$$('.card', s).some((c) => !c.hidden); });
      chips.forEach((b) => b.setAttribute('aria-pressed', String(state[b.dataset.filter] === b.dataset.value)));
      if (count) count.textContent = n;
      if (empty) empty.hidden = n > 0;
    }
    chips.forEach((b) => b.addEventListener('click', () => {
      state[b.dataset.filter] = b.dataset.value;
      apply();
      track('catalog_filter', { [b.dataset.filter]: b.dataset.value || 'todo' });
    }));
    const reset = $('[data-reset]');
    if (reset) reset.addEventListener('click', () => { state.cat = ''; state.occ = ''; apply(); });

    // Enlaces profundos: catalogo.html#pasteles o #cumpleanos
    function fromHash() {
      const h = decodeURIComponent(location.hash.slice(1));
      if (!h) return;
      const chip = chips.find((b) => b.dataset.value === h);
      if (chip) { state.cat = ''; state.occ = ''; state[chip.dataset.filter] = h; apply(); }
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  /* ---------- Formulario de pedido especial ---------- */
  const form = $('#pedido');
  if (form) {
    const today = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateInput = $('#f-fecha');
    dateInput.min = iso(today);
    const clean = (v, max) => String(v || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    let started = false;
    form.addEventListener('input', () => { if (!started) { started = true; track('custom_order_start'); } }, { once: false });

    const rules = {
      ocasion: (v) => (v ? '' : 'Elige la ocasión.'),
      producto: (v) => (v ? '' : 'Elige qué te gustaría.'),
      personas: (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 500 ? '' : 'Escribe un número entre 1 y 500.'; },
      fecha: (v) => (!v ? 'Elige una fecha.' : v < iso(today) ? 'La fecha no puede ser anterior a hoy.' : ''),
    };

    function validate() {
      let first = null;
      Object.entries(rules).forEach(([name, rule]) => {
        const el = form.elements[name];
        const msg = rule(el.value.trim());
        const err = $(`#e-${name}`);
        el.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (msg) el.setAttribute('aria-describedby', `e-${name}`); else el.removeAttribute('aria-describedby');
        if (err) err.textContent = msg;
        if (msg && !first) first = el;
      });
      return first;
    }

    const fmtDate = (v) => {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = validate();
      if (bad) { bad.focus(); return; }
      const f = form.elements;
      const lines = [
        'Hola, me gustaría solicitar un pedido especial:',
        `• Ocasión: ${clean(f.ocasion.value, 60)}`,
        `• Producto: ${clean(f.producto.value, 60)}`,
        `• Personas aprox.: ${Number(f.personas.value)}`,
        `• Fecha deseada: ${fmtDate(f.fecha.value)}`,
      ];
      const sabor = clean(f.sabor.value, 120);
      const com = clean(f.comentarios.value, 400);
      if (sabor) lines.push(`• Sabores: ${sabor}`);
      if (com) lines.push(`• Comentarios: ${com}`);
      if (f.refs.checked) lines.push('Tengo fotos de referencia que puedo enviarles por aquí.');
      lines.push('¿Me podrían confirmar disponibilidad y cotización? Gracias.');
      const text = lines.join('\n');

      const result = $('.form__result');
      const open = $('.form__open');
      $('.form__preview').textContent = text;
      open.setAttribute('data-wa-text', text);
      open.href = SITE.waBase ? `${SITE.waBase}?text=${encodeURIComponent(text)}` : './#contacto';
      result.hidden = false;
      track('custom_order_submit', { ocasion: f.ocasion.value, producto: f.producto.value });
      if (SITE.numberConfigured) open.click();
      else result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
})();
