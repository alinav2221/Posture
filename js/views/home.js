// Главная: список тренировок + подсказка для первого запуска.
import { h, icon, page, countOf, fmtMinutes, fmtAgo } from '../ui.js';
import { workouts, exercises, videos } from '../store.js';
import { buildPlan, planDuration } from '../timer.js';

export async function render() {
  const [ws, exs, vids] = await Promise.all([workouts.all(), exercises.all(), videos.all()]);
  const exById = Object.fromEntries(exs.map((e) => [e.id, e]));

  const body = ws.length
    ? h('div', { class: 'cards' }, ws.map((w) => card(w, exById)))
    : guide({ hasVideo: vids.length > 0, hasEx: exs.length > 0 });

  const el = page({
    title: 'Тренька',
    cls: 'page--home',
    right: h('a', { class: 'topbar__btn', href: '#/settings', 'aria-label': 'Настройки' }, icon('gear')),
  },
    h('p', { class: 'home__tagline' }, 'Видео и таймер на одном экране. Без интернета.'),
    body,
    ws.length ? h('a', { class: 'fab', href: '#/workout/new' }, icon('plus'), 'Тренировка') : null,
  );
  return { el };
}

function card(w, exById) {
  const items = (w.items || []).filter((id) => exById[id]);
  const { steps } = buildPlan(w, exById, { prepare: 0 });
  const ago = fmtAgo(w.lastDoneAt);
  return h('article', { class: 'wcard' },
    h('a', { class: 'wcard__main', href: `#/workout/${w.id}` },
      h('h3', { class: 'wcard__name' }, w.name || 'Без названия'),
      h('p', { class: 'wcard__meta' },
        `${countOf(items.length, ['упражнение', 'упражнения', 'упражнений'])} · ${fmtMinutes(planDuration(steps))}`),
      h('p', { class: 'wcard__list' }, items.map((id) => exById[id].name || 'Без названия').join(' · ')),
      ago ? h('p', { class: 'wcard__last' }, `была: ${ago}`) : null,
    ),
    h('a', { class: 'wcard__start', href: `#/play/w/${w.id}`, 'aria-label': 'Начать тренировку' }, icon('play', 30)),
  );
}

function guide({ hasVideo, hasEx }) {
  const step = (n, done, title, text, href, cta) => h('a', { class: `guide__step ${done ? 'is-done' : ''}`, href },
    h('span', { class: 'guide__num' }, done ? icon('check', 18) : n),
    h('span', { class: 'guide__body' },
      h('span', { class: 'guide__title' }, title),
      h('span', { class: 'guide__text' }, text),
    ),
    h('span', { class: 'guide__cta' }, done ? '' : cta, icon('forward', 18)),
  );
  return h('div', { class: 'guide' },
    h('div', { class: 'kicker' }, 'С чего начать'),
    step(1, hasVideo, 'Добавь видео', 'Сохрани рилс в галерею и загрузи сюда.', '#/videos', 'Видео'),
    step(2, hasEx, 'Создай упражнение', 'Отметь кусок видео и задай таймер.', '#/exercise/new', 'Создать'),
    step(3, false, 'Собери тренировку', 'Несколько упражнений по порядку и отдых между ними.', '#/workout/new', 'Собрать'),
  );
}
