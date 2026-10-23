// Точка входа: роутер по hash, нижняя навигация, service worker, установка.
import { h, icon, toast } from './ui.js';
import * as home from './views/home.js';
import * as workoutEdit from './views/workoutEdit.js';
import * as exercisesView from './views/exercises.js';
import * as exerciseEdit from './views/exerciseEdit.js';
import * as videosView from './views/videos.js';
import * as player from './views/player.js';
import * as settingsView from './views/settings.js';

const routes = [
  ['', home.render, 'home'],
  ['workout/new', workoutEdit.render, 'home'],
  ['workout/:id', workoutEdit.render, 'home'],
  ['exercises', exercisesView.render, 'exercises'],
  ['exercise/new', exerciseEdit.render, 'exercises'],
  ['exercise/:id', exerciseEdit.render, 'exercises'],
  ['videos', videosView.render, 'videos'],
  ['play/w/:id', player.render, null],
  ['play/e/:id', player.render, null],
  ['settings', settingsView.render, null],
];

function match(hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const segs = path.split('/').filter(Boolean);
  for (const [pattern, render, tab] of routes) {
    const parts = pattern.split('/').filter(Boolean);
    if (parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (parts[i] !== segs[i]) { ok = false; break; }
    }
    if (!ok) continue;
    params.query = Object.fromEntries(new URLSearchParams(qs || ''));
    params.path = path;
    return { render, params, tab };
  }
  return { render: home.render, params: { query: {}, path: '' }, tab: 'home' };
}

let current = null;
let navToken = 0;

async function navigate() {
  const token = ++navToken;
  const { render, params, tab } = match(location.hash);
  if (current && current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
  current = null;
  const app = document.getElementById('app');
  let view;
  try {
    view = await render(params);
  } catch (e) {
    console.error(e);
    view = {
      el: h('div', { class: 'page' }, h('div', { class: 'page__body' },
        h('div', { class: 'empty' }, h('h2', { class: 'empty__title' }, 'Что-то пошло не так'), h('p', { class: 'empty__text' }, e.message || String(e)),
          h('a', { class: 'btn btn--primary', href: '#/' }, 'На главную')))),
    };
  }
  if (token !== navToken) { if (view.destroy) view.destroy(); return; }
  current = view;
  app.innerHTML = '';
  app.append(view.el);
  document.body.classList.toggle('is-fullscreen', !!view.fullscreen);
  renderNav(tab);
  window.scrollTo(0, 0);
}

function renderNav(active) {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  nav.hidden = active == null;
  const tabs = [
    ['home', '#/', 'list', 'Тренировки'],
    ['exercises', '#/exercises', 'dumbbell', 'Упражнения'],
    ['videos', '#/videos', 'video', 'Видео'],
  ];
  for (const [key, href, ic, label] of tabs) {
    nav.append(h('a', { class: `nav__item ${key === active ? 'is-on' : ''}`, href, 'aria-current': key === active ? 'page' : null }, icon(ic), h('span', null, label)));
  }
}

window.addEventListener('hashchange', navigate);
navigate();

/* ---------- установка (beforeinstallprompt) ---------- */
let installPrompt = null;
export const getInstallPrompt = () => installPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  document.dispatchEvent(new CustomEvent('installable'));
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  document.dispatchEvent(new CustomEvent('installable'));
});

/* ---------- service worker и обновления ---------- */
let swReg = null;
let updateRequested = false;

function offerUpdate(worker) {
  const show = () => toast('Есть обновление приложения', {
    action: 'Обновить', duration: 0,
    onAction: () => { updateRequested = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
  });
  // Не дёргаем во время тренировки — покажем, когда вернёмся на главную.
  if (location.hash.startsWith('#/play')) {
    const once = () => { if (!location.hash.startsWith('#/play')) { window.removeEventListener('hashchange', once); show(); } };
    window.addEventListener('hashchange', once);
  } else {
    show();
  }
}

async function registerSW() {
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    if (swReg.waiting && navigator.serviceWorker.controller) offerUpdate(swReg.waiting);
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
      });
    });
  } catch (e) {
    console.warn('SW не зарегистрирован', e);
  }
}

if ('serviceWorker' in navigator) {
  // Регистрируем после полной загрузки страницы, чтобы не мешать первому рендеру.
  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW);
  // Перезагружаем страницу только после того, как сами попросили обновиться:
  // при первой установке clients.claim() тоже даёт controllerchange, и тогда перезагрузка не нужна.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    if (!location.hash.startsWith('#/play')) location.reload();
  });
}

export async function checkForUpdate() {
  if (!swReg) return 'none';
  try {
    await swReg.update();
    return swReg.waiting || swReg.installing ? 'found' : 'none';
  } catch {
    return 'none';
  }
}
