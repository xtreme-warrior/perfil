import { detectLang, applyLang, getLang, t } from './i18n.js';
import { initCursor } from './cursor.js';
import { createNetwork } from './network.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const html = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

applyLang(detectLang());
$('[data-year]').textContent = new Date().getFullYear();
$$('.cefr').forEach((el) => {
  el.innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < +el.dataset.level ? 'on' : ''}"></i>`).join('');
});

/* Scroll suave */
let lenis = null;
if (!calm) {
  lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* Navegación */
const nav = $('[data-nav]');
const burger = $('[data-burger]');

function closeMenu() {
  nav.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
  lenis?.start();
}

burger.addEventListener('click', () => {
  const open = nav.classList.toggle('is-open');
  burger.setAttribute('aria-expanded', String(open));
  if (open) lenis?.stop();
  else lenis?.start();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('is-open')) {
    closeMenu();
    burger.focus();
  }
});

$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(target, { duration: 1.5 });
    else target.scrollIntoView();
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

/* Grafo de habilidades */
const graph = $('[data-graph]');
const groups = $$('.graph__group', graph);
const edgesSvg = $('.graph__edges', graph);
const buttons = groups.map((g) => $('.graph__node', g));

function selectGroup(index) {
  groups.forEach((g, i) => {
    const on = i === index;
    g.classList.toggle('is-active', on);
    buttons[i].classList.toggle('is-active', on);
    buttons[i].setAttribute('aria-pressed', String(on));
    edgesSvg.children[i]?.classList.toggle('is-on', on);
  });
}

function setupGraph(radial) {
  graph.classList.toggle('graph--radial', radial);
  edgesSvg.innerHTML = '';
  if (!radial) {
    buttons.forEach((b) => { b.disabled = true; b.removeAttribute('aria-pressed'); });
    return;
  }
  buttons.forEach((b, i) => {
    const a = ((i + 0.5) / groups.length) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + Math.cos(a) * 30;
    const y = 50 + Math.sin(a) * 42;
    b.style.setProperty('--x', `${x}%`);
    b.style.setProperty('--y', `${y}%`);
    b.classList.toggle('is-left', Math.cos(a) < 0);
    b.disabled = false;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 50);
    line.setAttribute('y1', 50);
    line.setAttribute('x2', x);
    line.setAttribute('y2', y);
    edgesSvg.append(line);
  });
  selectGroup(0);
}

buttons.forEach((b, i) => {
  ['pointerenter', 'focus', 'click'].forEach((type) => {
    b.addEventListener(type, () => {
      if (graph.classList.contains('graph--radial')) selectGroup(i);
    });
  });
});

/* Correo, QR e idioma */
$('[data-copy]').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const status = $('[data-copy-status]');
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = t('contact.copied');
    status.textContent = t('contact.copiedStatus');
    setTimeout(() => { button.textContent = t('contact.copy'); }, 2000);
  } catch (err) {
    status.textContent = t('contact.copyFailed');
    button.textContent = t('contact.copyFailed');
  }
});

const qr = $('[data-qr]');
$('[data-qr-open]').addEventListener('click', () => { lenis?.stop(); qr.showModal(); });
$('[data-qr-close]').addEventListener('click', () => qr.close());
qr.addEventListener('click', (e) => { if (e.target === qr) qr.close(); });
qr.addEventListener('close', () => lenis?.start());

/* Divide un párrafo en palabras para iluminarlo con el scroll */
function splitWords(el) {
  const text = el.textContent.trim();
  const words = text.split(/\s+/).map((w) => `<span style="display:inline-block">${w}</span>`).join(' ');
  el.innerHTML = `<span class="sr">${text}</span><span aria-hidden="true">${words}</span>`;
  return $$('[aria-hidden] span', el);
}

let network = null;
const mm = gsap.matchMedia();

function setupScroll() {
  /* El tramo fijado va primero: los demás triggers deben contar su espacio */
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    const section = $('.flow');
    const steps = $$('.step', section);
    const nodes = $$('.flow__rail span', section);
    section.classList.add('is-pinned');
    gsap.set(steps.slice(1), { autoAlpha: 0, y: 60 });
    nodes[0].classList.add('is-on');

    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut', duration: 0.5 },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${innerHeight * 3.2}`,
        pin: true,
        scrub: 0.5,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate(self) {
          const active = Math.round(self.progress * (steps.length - 1));
          nodes.forEach((n, i) => n.classList.toggle('is-on', i <= active));
        },
      },
    });
    steps.slice(1).forEach((step, i) => {
      const at = i + 0.4;
      tl.to(steps[i], { autoAlpha: 0, y: -60 }, at);
      tl.to(step, { autoAlpha: 1, y: 0 }, at + 0.15);
    });
    tl.to({}, { duration: 0.4 }, steps.length - 1);
    gsap.fromTo('.flow__rail i', { scaleX: 0 }, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${innerHeight * 3.2}`, scrub: 0.5 },
    });

    return () => {
      section.classList.remove('is-pinned');
      gsap.set(steps, { clearProps: 'all' });
    };
  });

  mm.add('(min-width: 900px)', () => {
    setupGraph(true);
    return () => setupGraph(false);
  });
  mm.add('(max-width: 899px)', () => setupGraph(false));

  /* Navegación activa e intensidad de la red por sección */
  const links = $$('.nav__links a');
  const rail = $$('.rail a');
  $$('main > section').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle(self) {
        if (!self.isActive) return;
        const hash = `#${section.id}`;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === hash));
        rail.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === hash));
        network?.setDim(+section.dataset.net);
      },
    });
  });

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const lead = $('[data-words]');
    const words = splitWords(lead);
    gsap.fromTo(words, { opacity: 0.16 }, {
      opacity: 1,
      stagger: 0.05,
      ease: 'none',
      scrollTrigger: { trigger: lead, start: 'top 78%', end: 'bottom 45%', scrub: 0.5 },
    });

    $$('[data-count]').forEach((el) => {
      const end = +el.dataset.count;
      const state = { v: 0 };
      gsap.to(state, {
        v: end,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onStart() { el.textContent = '0'; },
        onUpdate() { el.textContent = Math.round(state.v); },
      });
    });

    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        clipPath: 'inset(0 0 100% 0)',
        y: 50,
        duration: 1.1,
        ease: 'expo.out',
        clearProps: 'clipPath,transform',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    gsap.from('.tile', {
      y: 80,
      opacity: 0,
      rotationX: -16,
      transformOrigin: '50% 100%',
      duration: 1.1,
      ease: 'expo.out',
      stagger: { amount: 0.5, from: 'start' },
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger: '.tiles', start: 'top 80%', once: true },
    });

    $$('[data-depth]').forEach((el) => {
      gsap.fromTo(el, { y: -el.dataset.depth }, {
        y: +el.dataset.depth,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    gsap.fromTo('.trace i', { scaleY: 0 }, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.jobs', start: 'top 62%', end: 'bottom 62%', scrub: 0.4 },
    });

    $$('.job').forEach((job) => {
      ScrollTrigger.create({ trigger: job, start: 'top 62%', end: 'max', toggleClass: 'is-lit' });
    });

    /* Las animaciones de los módulos también corren en pantallas táctiles */
    if (!matchMedia('(hover: hover)').matches) {
      $$('.tile').forEach((tile) => {
        ScrollTrigger.create({ trigger: tile, start: 'top 75%', end: 'bottom 25%', toggleClass: 'is-near' });
      });
    }
  });

  ScrollTrigger.refresh();
}

/* Cambio de idioma: al ser texto distinto, se reconstruye la coreografía */
let scrollReady = false;
ScrollTrigger.addEventListener('refresh', () => network?.measure());

/* El hero cambia de composición a 900 px: se recompone al cruzar ese ancho */
matchMedia('(min-width: 900px)').addEventListener('change', () => location.reload());

$('[data-lang]').addEventListener('click', () => {
  const next = getLang() === 'es' ? 'en' : 'es';
  const swap = () => {
    const y = scrollY;
    if (scrollReady) {
      mm.revert();
      ScrollTrigger.getAll().forEach((st) => st.kill());
    }
    applyLang(next, true);
    if (scrollReady) {
      setupScroll();
      window.scrollTo(0, y);
      network?.layout();
    }
    if (calm) network?.renderStatic();
  };
  if (calm) {
    swap();
    return;
  }
  gsap.timeline()
    .to('main', { opacity: 0, duration: 0.2, ease: 'power1.in' })
    .add(swap)
    .to('main', { opacity: 1, duration: 0.35, ease: 'power1.out', clearProps: 'opacity' });
});

/* Secuencia de carga */
function runBoot() {
  if (!html.classList.contains('booting')) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: resolve })
      .from('[data-boot]', { opacity: 0, x: -10, duration: 0.25, stagger: 0.22 })
      .to('.boot__bar i', { scaleX: 1, duration: 0.75, ease: 'power2.inOut' }, 0)
      .to({}, { duration: 0.1 });
  });
}

function revealHero(hasNet) {
  html.classList.add('intro-done');
  html.classList.remove('booting');
  if (calm) return;
  const name = $('[data-name]');
  const rest = $$('[data-intro]');
  const tl = gsap.timeline();
  if (hasNet) {
    gsap.set(name, { opacity: 0 });
    gsap.set(rest, { opacity: 0, y: 26 });
    tl.to(network.intro, { v: 1, duration: 1.7, ease: 'power2.inOut' }, 0)
      .to(name, { opacity: 1, duration: 0.7, ease: 'power1.inOut' }, 1.15)
      .to(rest, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09, clearProps: 'transform' }, 1.25);
  } else {
    tl.from([name, ...rest], { opacity: 0, y: 26, duration: 0.9, ease: 'expo.out', stagger: 0.08, clearProps: 'transform' });
  }
}

async function start() {
  setupScroll();
  scrollReady = true;
  const small = innerWidth < 900;
  const canvas = $('#net');
  const anchor = $('[data-anchor]');
  const orbit = small ? null : {
    layer: $('[data-orbit]'),
    core: $('[data-core]'),
    items: $$('[data-node]'),
    anchor,
  };

  const netPromise = (async () => {
    await document.fonts.ready;
    if (orbit) html.classList.add('orbit');
    const created = await createNetwork({ canvas, calm, orbit });
    if (!created) html.classList.remove('orbit');
    return created;
  })().catch(() => {
    html.classList.remove('orbit');
    return null;
  });

  const timeout = new Promise((r) => { setTimeout(() => r(null), 2600); });
  const [, net] = await Promise.all([runBoot(), Promise.race([netPromise, timeout])]);
  network = net;

  if (network) {
    ScrollTrigger.refresh();
    network.measure();
    if (calm) {
      network.intro.v = 1;
      network.setDim(1);
      network.renderStatic();
      window.addEventListener('scroll', () => network.renderStatic(), { passive: true });
    } else {
      network.start();
    }
    initCursor((x, y) => network.setPointer(x, y));
  } else {
    /* La red llegó tarde o no hay WebGL: fondo CSS y texto normal */
    html.classList.remove('orbit');
    initCursor();
  }
  revealHero(!!network);
}

start();
