import { en, esExtra } from './content.en.js';

const KEY = 'fv-lang';
const es = { ...esExtra };
const textNodes = [...document.querySelectorAll('[data-i18n]')];
const attrNodes = [...document.querySelectorAll('[data-i18n-attr]')].map((el) => ({
  el,
  pairs: el.dataset.i18nAttr.split(';').map((pair) => pair.split(':')),
}));

/* El español vive en el HTML: se captura antes de cualquier manipulación */
textNodes.forEach((el) => {
  es[el.dataset.i18n] = el.textContent;
});
attrNodes.forEach(({ el, pairs }) => {
  pairs.forEach(([attr, key]) => {
    es[key] = el.getAttribute(attr);
  });
});

let current = 'es';

export function detectLang() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'es' || asked === 'en') return asked;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch (e) { /* almacenamiento bloqueado */ }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function t(key) {
  return (current === 'en' ? en : es)[key] ?? es[key] ?? key;
}

export function getLang() {
  return current;
}

export function applyLang(lang, persist = false) {
  current = lang;
  document.documentElement.lang = lang;
  textNodes.forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  attrNodes.forEach(({ el, pairs }) => {
    pairs.forEach(([attr, key]) => el.setAttribute(attr, t(key)));
  });
  if (persist) {
    try { localStorage.setItem(KEY, lang); } catch (e) { /* almacenamiento bloqueado */ }
  }
}
