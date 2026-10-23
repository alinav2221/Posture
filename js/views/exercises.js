// Библиотека упражнений.
import { h, icon, page, emptyState, thumb, exerciseSummary } from '../ui.js';
import { exercises, videos } from '../store.js';

export async function render() {
  const [exList, vidList] = await Promise.all([exercises.all(), videos.all()]);
  const vidById = Object.fromEntries(vidList.map((v) => [v.id, v]));

  const body = exList.length
    ? h('div', { class: 'elist' }, exList.map((ex) => {
      const v = ex.videoId ? vidById[ex.videoId] : null;
      return h('article', { class: 'erow' },
        h('a', { class: 'erow__main', href: `#/exercise/${ex.id}` },
          thumb(v, 'thumb--md'),
          h('div', { class: 'erow__body' },
            h('h3', { class: 'erow__name' }, ex.name || 'Без названия'),
            h('p', { class: 'erow__meta' }, exerciseSummary(ex)),
            ex.note ? h('p', { class: 'erow__note' }, ex.note) : null,
          ),
        ),
        h('a', { class: 'erow__play', href: `#/play/e/${ex.id}`, 'aria-label': 'Запустить упражнение' }, icon('play', 22)),
      );
    }))
    : emptyState({
      icon: 'dumbbell',
      title: 'Упражнений пока нет',
      text: 'Создай упражнение: выбери видео, отметь нужный кусок и задай таймер.',
      action: h('a', { class: 'btn btn--primary', href: '#/exercise/new' }, icon('plus'), 'Создать упражнение'),
    });

  const el = page({ title: 'Упражнения' },
    body,
    exList.length ? h('a', { class: 'fab', href: '#/exercise/new' }, icon('plus'), 'Упражнение') : null,
  );
  return { el };
}
