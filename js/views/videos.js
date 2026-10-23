// Библиотека видео (рилсов), сохранённых в телефоне.
import { h, icon, page, emptyState, thumb, fmtTime, fmtBytes, toast, confirmSheet, sheet } from '../ui.js';
import { videos, storageInfo, requestPersist } from '../store.js';

export async function render() {
  const list = h('div', { class: 'vlist' });
  const info = h('p', { class: 'storage' });
  const fileInput = h('input', { type: 'file', accept: 'video/*', class: 'visually-hidden', onchange: onFile });

  async function refresh() {
    const vids = await videos.all();
    list.innerHTML = '';
    if (!vids.length) {
      list.append(emptyState({
        icon: 'video',
        title: 'Видео пока нет',
        text: 'Сохрани рилс из инсты в галерею телефона, потом добавь его сюда. Из одного видео можно сделать несколько упражнений.',
      }));
    } else {
      for (const v of vids) list.append(row(v));
    }
    const si = await storageInfo();
    info.textContent = si
      ? `Занято ${fmtBytes(si.usage)} из ${fmtBytes(si.quota)}${si.persisted ? ' · хранилище защищено' : ''}`
      : '';
  }

  function row(v) {
    return h('article', { class: 'vrow' },
      thumb(v, 'thumb--lg'),
      h('div', { class: 'vrow__body' },
        h('button', { class: 'vrow__name', type: 'button', onclick: () => rename(v) }, v.name, icon('edit', 16)),
        h('p', { class: 'vrow__meta' }, `${fmtTime(v.duration)} · ${fmtBytes(v.size)}`),
        h('div', { class: 'vrow__actions' },
          h('a', { class: 'btn btn--sm btn--primary', href: `#/exercise/new?video=${v.id}` }, icon('plus', 18), 'Упражнение'),
          h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': 'Удалить видео', onclick: () => remove(v) }, icon('trash', 18)),
        ),
      ),
    );
  }

  function rename(v) {
    const input = h('input', { class: 'input', type: 'text', value: v.name, maxlength: 60 });
    sheet({
      title: 'Название видео',
      body: input,
      actions: [
        { label: 'Отмена', cls: 'btn--ghost' },
        { label: 'Сохранить', cls: 'btn--primary', onClick: async () => { await videos.rename(v.id, input.value.trim() || v.name); refresh(); } },
      ],
    });
    setTimeout(() => input.focus(), 50);
  }

  async function remove(v) {
    const ok = await confirmSheet({ title: `Удалить «${v.name}»?`, text: 'Упражнения, привязанные к этому видео, останутся без видео.' });
    if (!ok) return;
    await videos.remove(v.id);
    refresh();
  }

  async function onFile() {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    fileInput.value = '';
    const t = toast('Сохраняю видео…', { duration: 0 });
    try {
      await videos.add(f);
      await requestPersist();
      toast('Видео добавлено');
      await refresh();
    } catch (e) {
      console.error(e);
      toast('Не удалось сохранить видео');
    } finally {
      t.remove();
    }
  }

  await refresh();

  const el = page({ title: 'Видео' },
    h('label', { class: 'btn btn--primary btn--block btn--lg' }, icon('download'), 'Добавить видео с телефона', fileInput),
    h('p', { class: 'muted hint' }, 'Поддерживаются mp4 и другие форматы, которые открывает телефон. Файл хранится только на этом устройстве.'),
    list,
    info,
  );
  return { el };
}
