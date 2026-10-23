// Редактор тренировки: название, порядок упражнений, отдых между ними.
import { h, icon, page, stepper, sheet, confirmSheet, toast, thumb, exerciseSummary, countOf, fmtMinutes } from '../ui.js';
import { workouts, exercises, videos, newWorkout } from '../store.js';
import { buildPlan, planDuration } from '../timer.js';

export async function render({ id }) {
  const isNew = id == null;
  const w = isNew ? newWorkout() : await workouts.get(id);
  if (!w) throw new Error('Тренировка не найдена');

  const [exList, vidList] = await Promise.all([exercises.all(), videos.all()]);
  const exById = Object.fromEntries(exList.map((e) => [e.id, e]));
  const vidById = Object.fromEntries(vidList.map((v) => [v.id, v]));
  w.items = (w.items || []).filter((eid) => exById[eid]);

  const nameInput = h('input', {
    class: 'input input--lg', type: 'text', placeholder: 'Например, ноги и ягодицы', value: w.name, maxlength: 60, autocomplete: 'off',
  });
  const list = h('div', { class: 'wlist' });
  const summary = h('p', { class: 'muted' });

  function renderList() {
    list.innerHTML = '';
    if (!w.items.length) {
      list.append(h('p', { class: 'muted' }, 'Пока пусто. Добавь упражнения из библиотеки.'));
    }
    w.items.forEach((eid, i) => {
      const ex = exById[eid];
      const v = ex.videoId ? vidById[ex.videoId] : null;
      list.append(h('div', { class: 'wrow' },
        h('span', { class: 'wrow__num' }, i + 1),
        thumb(v, 'thumb--sm'),
        h('div', { class: 'wrow__body' },
          h('div', { class: 'wrow__name' }, ex.name || 'Без названия'),
          h('div', { class: 'wrow__meta' }, exerciseSummary(ex)),
        ),
        h('div', { class: 'wrow__ctl' },
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => move(i, -1) }, icon('up', 20)),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Ниже', disabled: i === w.items.length - 1, onclick: () => move(i, 1) }, icon('down', 20)),
          h('button', { class: 'iconbtn iconbtn--danger', type: 'button', 'aria-label': 'Убрать', onclick: () => { w.items.splice(i, 1); renderList(); } }, icon('close', 20)),
        ),
      ));
    });
    const { steps } = buildPlan(w, exById, { prepare: 0 });
    summary.textContent = w.items.length
      ? `${countOf(w.items.length, ['упражнение', 'упражнения', 'упражнений'])} · ${fmtMinutes(planDuration(steps))}`
      : '';
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= w.items.length) return;
    [w.items[i], w.items[j]] = [w.items[j], w.items[i]];
    renderList();
  }

  function addSheet() {
    if (!exList.length) {
      sheet({
        title: 'Нет упражнений',
        body: h('p', { class: 'sheet__text' }, 'Сначала создай упражнение в библиотеке, потом добавь его в тренировку.'),
        actions: [
          { label: 'Позже', cls: 'btn--ghost' },
          { label: 'Создать упражнение', cls: 'btn--primary', onClick: () => { location.hash = '#/exercise/new'; } },
        ],
      });
      return;
    }
    const picked = new Set();
    const countBtnLabel = () => (picked.size ? `Добавить (${picked.size})` : 'Добавить');
    let addBtn = null;
    const rows = exList.map((ex) => {
      const cb = h('input', { type: 'checkbox', class: 'visually-hidden' });
      const row = h('label', { class: 'vpick__item vpick__item--check' },
        cb,
        thumb(ex.videoId ? vidById[ex.videoId] : null, 'thumb--sm'),
        h('span', { class: 'vpick__name' }, ex.name || 'Без названия'),
        h('span', { class: 'vpick__meta' }, exerciseSummary(ex)),
        h('span', { class: 'vpick__check' }, icon('check', 18)),
      );
      cb.addEventListener('change', () => {
        if (cb.checked) picked.add(ex.id); else picked.delete(ex.id);
        row.classList.toggle('is-on', cb.checked);
        if (addBtn) addBtn.textContent = countBtnLabel();
      });
      return row;
    });
    const s = sheet({
      title: 'Добавить упражнения',
      cls: 'sheet--tall',
      body: h('div', { class: 'vpick' }, rows),
      actions: [
        { label: 'Отмена', cls: 'btn--ghost' },
        { label: 'Добавить', cls: 'btn--primary', onClick: () => { w.items.push(...picked); renderList(); } },
      ],
    });
    addBtn = s.el.querySelector('.sheet__actions .btn--primary');
  }

  async function save() {
    w.name = nameInput.value.trim() || 'Без названия';
    if (!w.items.length) {
      toast('Добавь хотя бы одно упражнение');
      return;
    }
    await workouts.save(w);
    toast('Сохранено');
    location.hash = '#/';
  }

  async function remove() {
    const ok = await confirmSheet({ title: `Удалить «${w.name || 'тренировку'}»?`, text: 'Упражнения останутся в библиотеке.' });
    if (!ok) return;
    await workouts.remove(w.id);
    location.hash = '#/';
  }

  renderList();

  const el = page({
    title: isNew ? 'Новая тренировка' : 'Тренировка',
    back: '#/',
    right: h('button', { class: 'topbar__btn topbar__btn--text', type: 'button', onclick: save }, 'Готово'),
    cls: 'page--form',
  },
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Название'),
      nameInput,
    ),
    h('section', { class: 'section' },
      h('div', { class: 'section__head' }, h('h2', { class: 'section__title' }, 'Упражнения'), summary),
      list,
      h('button', { class: 'btn btn--ghost btn--block', type: 'button', onclick: addSheet }, icon('plus'), 'Добавить упражнения'),
    ),
    h('section', { class: 'section' },
      stepper({ label: 'Отдых между упражнениями', value: w.restBetween, min: 0, max: 300, step: 5, unit: 'с', onChange: (v) => { w.restBetween = v; renderList(); } }),
    ),
    h('div', { class: 'form-foot' },
      h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', onclick: save }, icon('check'), 'Сохранить'),
      isNew ? null : h('a', { class: 'btn btn--ghost btn--block', href: `#/play/w/${w.id}` }, icon('play'), 'Начать тренировку'),
      isNew ? null : h('button', { class: 'btn btn--ghost btn--block btn--danger-text', type: 'button', onclick: remove }, icon('trash', 18), 'Удалить тренировку'),
    ),
  );

  return { el };
}
