// DOM-хелперы, иконки, форматирование, тосты, шторки, степперы.
import { thumbURL } from './store.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'ref' && typeof v === 'function') v(el);
      else if (typeof v === 'boolean') { if (v) el.setAttribute(k, ''); }
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/* ---------- иконки (stroke 2, round) ---------- */
const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  prev: '<path d="M18 5v14L8 12z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>',
  next: '<path d="M6 5v14l10-7z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M16 9l5 6M21 9l-5 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  dumbbell: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  download: '<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>',
  expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  shrink: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/>',
  flag: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  marker: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
};

export function icon(name, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

/* ---------- форматирование ---------- */
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
// Для разметки видео: 0:12.3
export function fmtTimeFine(sec) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
// Крупные цифры: меньше минуты — просто секунды.
export function fmtClock(sec) {
  return sec >= 60 ? fmtTime(sec) : String(Math.max(0, sec));
}
export function fmtMinutes(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec} с`;
  const m = Math.round(sec / 60);
  return `≈ ${m} мин`;
}
export function fmtBytes(b) {
  if (!b) return '0 МБ';
  const mb = b / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} ГБ` : `${mb.toFixed(mb < 10 ? 1 : 0)} МБ`;
}
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
export const countOf = (n, forms) => `${n} ${plural(n, forms)}`;

export function exerciseSummary(ex) {
  if (ex.mode === 'sets') {
    const { sets, reps, rest } = ex.sets;
    return `${sets} × ${reps} повт · отдых ${rest} с`;
  }
  const { work, rest, rounds } = ex.interval;
  return `${rounds} × ${work} с · отдых ${rest} с`;
}

export function fmtAgo(ts) {
  if (!ts) return null;
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return 'сегодня';
  if (d === 1) return 'вчера';
  return `${countOf(d, ['день', 'дня', 'дней'])} назад`;
}

/* ---------- тосты ---------- */
export function toast(msg, { action, onAction, duration = 3200 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', { class: 'toast__text' }, msg),
    action ? h('button', { class: 'toast__btn', type: 'button', onclick: () => { el.remove(); if (onAction) onAction(); } }, action) : null,
  );
  box.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  if (duration) {
    setTimeout(() => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 320);
    }, duration);
  }
  return el;
}

/* ---------- шторка снизу ---------- */
export function sheet({ title, body, actions = [], onClose, cls = '' }) {
  const wrap = h('div', { class: `sheet ${cls}` });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('is-in');
    setTimeout(() => wrap.remove(), 260);
    if (onClose) onClose();
  };
  const panel = h('div', { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet__grip' }),
    title ? h('h2', { class: 'sheet__title' }, title) : null,
    h('div', { class: 'sheet__body' }, body),
    actions.length ? h('div', { class: 'sheet__actions' }, actions.map((a) =>
      h('button', {
        class: `btn ${a.cls || ''}`, type: 'button',
        onclick: async () => { const r = a.onClick ? await a.onClick() : undefined; if (r !== false) close(); },
      }, a.label),
    )) : null,
  );
  wrap.append(h('div', { class: 'sheet__back', onclick: close }), panel);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
  return { el: wrap, close };
}

export function confirmSheet({ title, text, ok = 'Удалить', cancel = 'Отмена', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    sheet({
      title,
      body: text ? h('p', { class: 'sheet__text' }, text) : null,
      actions: [
        { label: cancel, cls: 'btn--ghost', onClick: () => { answered = true; resolve(false); } },
        { label: ok, cls: danger ? 'btn--danger' : 'btn--primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/* ---------- степпер ---------- */
export function stepper({ label, hint, value, min = 0, max = 999, step = 1, unit = '', onChange }) {
  const input = h('input', { class: 'stepper__input', type: 'number', inputmode: 'numeric', min, max, step, value, 'aria-label': label });
  const clamp = (v) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  const set = (v) => {
    v = clamp(Number.isFinite(v) ? v : min);
    input.value = v;
    onChange(v);
  };
  input.addEventListener('change', () => set(Number(input.value)));
  input.addEventListener('focus', () => input.select());
  return h('div', { class: 'stepper' },
    h('div', { class: 'stepper__label' }, label, hint ? h('small', null, hint) : null),
    h('div', { class: 'stepper__ctl' },
      h('button', { class: 'stepper__btn', type: 'button', 'aria-label': 'Меньше', onclick: () => set(Number(input.value) - step) }, '−'),
      h('label', { class: 'stepper__val' }, input, unit ? h('span', { class: 'stepper__unit' }, unit) : null),
      h('button', { class: 'stepper__btn', type: 'button', 'aria-label': 'Больше', onclick: () => set(Number(input.value) + step) }, '+'),
    ),
  );
}

/* ---------- сегменты ---------- */
export function segmented({ options, value, onChange }) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  const render = () => {
    el.innerHTML = '';
    for (const o of options) {
      el.append(h('button', {
        class: `seg__btn ${o.value === value ? 'is-on' : ''}`, type: 'button', role: 'tab',
        'aria-selected': o.value === value ? 'true' : 'false',
        onclick: () => { value = o.value; render(); onChange(value); },
      }, o.label));
    }
  };
  render();
  return el;
}

/* ---------- переключатель ---------- */
export function toggleRow({ label, hint, checked, onChange }) {
  const input = h('input', { type: 'checkbox', class: 'switch__input', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'row row--toggle' },
    h('div', { class: 'row__text' }, h('div', { class: 'row__title' }, label), hint ? h('div', { class: 'row__hint' }, hint) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch__knob' })),
  );
}

/* ---------- страница с шапкой ---------- */
export function page({ title, back, right, cls = '' }, ...children) {
  return h('div', { class: `page ${cls}` },
    h('header', { class: 'topbar' },
      back ? h('a', { class: 'topbar__btn', href: back, 'aria-label': 'Назад' }, icon('back')) : h('span', { class: 'topbar__spacer' }),
      h('h1', { class: 'topbar__title' }, title),
      right || h('span', { class: 'topbar__spacer' }),
    ),
    h('div', { class: 'page__body' }, children),
  );
}

export function emptyState({ icon: ic, title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(ic, 40)),
    h('h2', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    action || null,
  );
}

export function thumb(video, cls = '') {
  const url = video && video.thumb ? thumbURL(video) : null;
  const el = h('div', { class: `thumb ${cls}` }, url ? h('img', { src: url, alt: '' }) : icon(video ? 'video' : 'dumbbell', 22));
  return el;
}
