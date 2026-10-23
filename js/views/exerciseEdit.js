// Редактор упражнения: выбор видео, разметка фрагмента «начало / конец», настройки таймера.
import { h, icon, page, stepper, segmented, sheet, confirmSheet, toast, fmtTimeFine, fmtTime, thumb } from '../ui.js';
import { exercises, videos, newExercise, videoURL, requestPersist } from '../store.js';

const round1 = (x) => Math.round(x * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export async function render({ id, query = {} }) {
  const isNew = id == null;
  const ex = isNew ? newExercise({ videoId: query.video || null }) : await exercises.get(id);
  if (!ex) throw new Error('Упражнение не найдено');
  ex.interval = { work: 40, rest: 15, rounds: 3, ...(ex.interval || {}) };
  ex.sets = { sets: 3, reps: 12, rest: 60, ...(ex.sets || {}) };

  let vids = await videos.all();
  let video = ex.videoId ? vids.find((v) => v.id === ex.videoId) : null;
  if (ex.videoId && !video) ex.videoId = null;

  let dirty = false;
  const touch = () => { dirty = true; };

  /* ---------- видео и разметка ---------- */
  const marker = createMarker(ex, touch);
  const videoBox = h('section', { class: 'section' });

  function renderVideoBox() {
    videoBox.innerHTML = '';
    videoBox.append(h('h2', { class: 'section__title' }, 'Видео'));
    if (video) {
      marker.load(video);
      videoBox.append(
        marker.el,
        h('div', { class: 'row-actions' },
          h('span', { class: 'muted ellipsis' }, video.name),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: pickVideo }, 'Сменить'),
        ),
      );
    } else {
      videoBox.append(
        h('button', { class: 'pick', type: 'button', onclick: pickVideo },
          icon('video', 32),
          h('span', { class: 'pick__title' }, 'Выбрать видео'),
          h('span', { class: 'pick__hint' }, 'Рилс из галереи или уже сохранённое. Можно и без видео.'),
        ),
      );
    }
  }

  function selectVideo(v) {
    video = v;
    ex.videoId = v.id;
    ex.start = 0;
    ex.end = null;
    touch();
    renderVideoBox();
  }

  function pickVideo() {
    const fileInput = h('input', { type: 'file', accept: 'video/*', class: 'visually-hidden' });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      s.close();
      const t = toast('Сохраняю видео…', { duration: 0 });
      try {
        const v = await videos.add(f);
        requestPersist();
        vids = await videos.all();
        selectVideo(v);
      } catch (e) {
        console.error(e);
        toast('Не удалось сохранить видео');
      } finally {
        t.remove();
      }
    });
    const s = sheet({
      title: 'Выбрать видео',
      body: h('div', null,
        h('label', { class: 'btn btn--primary btn--block' }, icon('download'), 'Загрузить с телефона', fileInput),
        vids.length
          ? h('div', { class: 'vpick' }, vids.map((v) => h('button', {
            class: `vpick__item ${video && v.id === video.id ? 'is-on' : ''}`, type: 'button',
            onclick: () => { s.close(); selectVideo(v); },
          }, thumb(v, 'thumb--sm'), h('span', { class: 'vpick__name' }, v.name), h('span', { class: 'vpick__meta' }, fmtTime(v.duration)))))
          : h('p', { class: 'muted' }, 'Сохранённых видео пока нет.'),
      ),
    });
  }

  renderVideoBox();

  /* ---------- название ---------- */
  const nameInput = h('input', {
    class: 'input input--lg', type: 'text', placeholder: 'Например, выпады назад', value: ex.name,
    maxlength: 60, autocomplete: 'off', oninput: touch,
  });

  /* ---------- таймер ---------- */
  const modeBox = h('div', { class: 'stack' });
  function renderMode() {
    modeBox.innerHTML = '';
    if (ex.mode === 'sets') {
      modeBox.append(
        stepper({ label: 'Подходы', value: ex.sets.sets, min: 1, max: 20, onChange: (v) => { ex.sets.sets = v; touch(); } }),
        stepper({ label: 'Повторения', hint: 'в одном подходе', value: ex.sets.reps, min: 1, max: 200, onChange: (v) => { ex.sets.reps = v; touch(); } }),
        stepper({ label: 'Отдых между подходами', value: ex.sets.rest, min: 0, max: 600, step: 5, unit: 'с', onChange: (v) => { ex.sets.rest = v; touch(); } }),
        h('p', { class: 'muted' }, 'Во время подхода таймер не идёт: сделала повторения — нажала «Готово», дальше отдых по таймеру.'),
      );
    } else {
      modeBox.append(
        stepper({ label: 'Работа', value: ex.interval.work, min: 5, max: 600, step: 5, unit: 'с', onChange: (v) => { ex.interval.work = v; touch(); } }),
        stepper({ label: 'Отдых', value: ex.interval.rest, min: 0, max: 600, step: 5, unit: 'с', onChange: (v) => { ex.interval.rest = v; touch(); } }),
        stepper({ label: 'Круги', value: ex.interval.rounds, min: 1, max: 30, onChange: (v) => { ex.interval.rounds = v; touch(); } }),
      );
    }
  }
  renderMode();

  const noteInput = h('textarea', { class: 'input', rows: 2, placeholder: 'Заметка: техника, вес, на что обратить внимание', oninput: touch }, ex.note || '');

  /* ---------- сохранение ---------- */
  async function save() {
    ex.name = nameInput.value.trim() || 'Без названия';
    ex.note = noteInput.value.trim();
    if (ex.videoId && ex.end != null && ex.end <= ex.start + 0.3) {
      toast('Конец фрагмента должен быть позже начала');
      return;
    }
    await exercises.save(ex);
    dirty = false;
    toast('Сохранено');
    location.hash = '#/exercises';
  }

  async function remove() {
    const ok = await confirmSheet({ title: `Удалить «${ex.name || 'упражнение'}»?`, text: 'Оно пропадёт из всех тренировок. Видео останется.' });
    if (!ok) return;
    await exercises.remove(ex.id);
    dirty = false;
    location.hash = '#/exercises';
  }

  const el = page({
    title: isNew ? 'Новое упражнение' : 'Упражнение',
    back: '#/exercises',
    right: h('button', { class: 'topbar__btn topbar__btn--text', type: 'button', onclick: save }, 'Готово'),
    cls: 'page--form',
  },
    videoBox,
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Название'),
      nameInput,
    ),
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Таймер'),
      segmented({
        options: [{ value: 'interval', label: 'По времени' }, { value: 'sets', label: 'Подходы' }],
        value: ex.mode,
        onChange: (v) => { ex.mode = v; touch(); renderMode(); },
      }),
      modeBox,
    ),
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Заметка'),
      noteInput,
    ),
    h('div', { class: 'form-foot' },
      h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', onclick: save }, icon('check'), 'Сохранить'),
      isNew ? null : h('button', { class: 'btn btn--ghost btn--block btn--danger-text', type: 'button', onclick: remove }, icon('trash', 18), 'Удалить упражнение'),
    ),
  );

  return { el, destroy: () => marker.destroy() };
}

/* ---------- разметчик фрагмента ---------- */
function createMarker(ex, onChange) {
  const videoEl = h('video', { class: 'marker__video', playsinline: true, muted: true, loop: true, preload: 'metadata' });
  videoEl.muted = true;
  const range = h('input', { type: 'range', class: 'marker__range', min: 0, max: 100, step: 0.1, value: 0, 'aria-label': 'Позиция в видео' });
  const timeEl = h('div', { class: 'marker__time' });
  const startVal = h('b');
  const endVal = h('b');
  const trackFill = h('i');
  const playBtn = h('span', { class: 'marker__play' }, icon('play', 30));
  const loopBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('clock', 18), 'Прокрутить кусок');

  let duration = 0;
  let previewLoop = false;
  let raf = 0;
  let scrubbing = false;

  const start = () => ex.start || 0;
  const end = () => (ex.end != null ? ex.end : duration);

  function updateLabels() {
    startVal.textContent = fmtTimeFine(start());
    endVal.textContent = ex.end != null ? fmtTimeFine(ex.end) : (duration ? fmtTimeFine(duration) : '—');
    if (duration) {
      trackFill.style.left = `${(start() / duration) * 100}%`;
      trackFill.style.width = `${Math.max(0, ((end() - start()) / duration) * 100)}%`;
    }
  }
  function updateTime() {
    timeEl.textContent = `${fmtTimeFine(videoEl.currentTime)} / ${fmtTimeFine(duration)}`;
    if (!scrubbing) range.value = videoEl.currentTime;
  }
  function seek(t) {
    if (!duration) return;
    try { videoEl.currentTime = clamp(t, 0, Math.max(0, duration - 0.05)); } catch { /* ignore */ }
    updateTime();
  }
  function tick() {
    cancelAnimationFrame(raf);
    if (videoEl.paused) return;
    if (previewLoop && videoEl.currentTime >= end() - 0.05) {
      try { videoEl.currentTime = start(); } catch { /* ignore */ }
    }
    updateTime();
    raf = requestAnimationFrame(tick);
  }

  videoEl.addEventListener('loadedmetadata', () => {
    duration = isFinite(videoEl.duration) ? videoEl.duration : 0;
    range.max = duration.toFixed(1);
    updateLabels();
    seek(start());
  });
  videoEl.addEventListener('timeupdate', updateTime);
  videoEl.addEventListener('play', () => { playBtn.innerHTML = ''; playBtn.append(icon('pause', 30)); el.classList.add('is-playing'); tick(); });
  videoEl.addEventListener('pause', () => { playBtn.innerHTML = ''; playBtn.append(icon('play', 30)); el.classList.remove('is-playing'); cancelAnimationFrame(raf); });

  range.addEventListener('pointerdown', () => { scrubbing = true; videoEl.pause(); });
  range.addEventListener('input', () => seek(Number(range.value)));
  range.addEventListener('change', () => { scrubbing = false; seek(Number(range.value)); });

  const togglePlay = () => { if (videoEl.paused) videoEl.play().catch(() => {}); else videoEl.pause(); };
  loopBtn.addEventListener('click', () => {
    previewLoop = !previewLoop;
    loopBtn.classList.toggle('is-on', previewLoop);
    if (previewLoop) { seek(start()); videoEl.play().catch(() => {}); }
  });

  const setStart = () => {
    ex.start = round1(videoEl.currentTime);
    if (ex.end != null && ex.end <= ex.start + 0.3) ex.end = null;
    updateLabels();
    onChange();
    flash(startBtn);
  };
  const setEnd = () => {
    const t = round1(videoEl.currentTime);
    if (t <= start() + 0.3) { toast('Конец должен быть позже начала'); return; }
    ex.end = t >= duration - 0.05 ? null : t;
    updateLabels();
    onChange();
    flash(endBtn);
  };
  const nudge = (which, d) => {
    if (!duration) return;
    if (which === 'start') {
      ex.start = round1(clamp(start() + d, 0, Math.max(0, end() - 0.3)));
      seek(ex.start);
    } else {
      let e = round1(clamp(end() + d, start() + 0.3, duration));
      ex.end = e >= duration - 0.05 ? null : e;
      seek(ex.end != null ? ex.end : duration - 0.1);
    }
    updateLabels();
    onChange();
  };
  const flash = (btn) => { btn.classList.add('is-flash'); setTimeout(() => btn.classList.remove('is-flash'), 350); };
  const nudgeBtn = (which, d) => h('button', { class: 'nudge', type: 'button', 'aria-label': `${d < 0 ? 'Раньше' : 'Позже'} на полсекунды`, onclick: () => nudge(which, d) }, d < 0 ? '−0.5' : '+0.5');

  const startBtn = h('button', { class: 'btn btn--mark', type: 'button', onclick: setStart }, icon('flag', 18), 'Начало здесь');
  const endBtn = h('button', { class: 'btn btn--mark', type: 'button', onclick: setEnd }, 'Конец здесь', icon('flag', 18));

  const el = h('div', { class: 'marker' },
    h('div', { class: 'marker__screen', onclick: togglePlay }, videoEl, playBtn),
    h('div', { class: 'marker__scrub' },
      timeEl,
      range,
      h('div', { class: 'marker__track' }, trackFill),
    ),
    h('p', { class: 'marker__help' }, 'Промотай к нужному упражнению и отметь начало и конец. Во время тренировки будет крутиться только этот кусок.'),
    h('div', { class: 'marker__marks' },
      h('div', { class: 'mark' }, startBtn, h('div', { class: 'mark__val' }, startVal, h('span', { class: 'mark__nudge' }, nudgeBtn('start', -0.5), nudgeBtn('start', 0.5)))),
      h('div', { class: 'mark' }, endBtn, h('div', { class: 'mark__val' }, endVal, h('span', { class: 'mark__nudge' }, nudgeBtn('end', -0.5), nudgeBtn('end', 0.5)))),
    ),
    h('div', { class: 'marker__tools' }, loopBtn),
  );

  return {
    el,
    load(video) {
      previewLoop = false;
      loopBtn.classList.remove('is-on');
      duration = 0;
      videoEl.src = videoURL(video);
      videoEl.load();
      updateLabels();
    },
    destroy() {
      cancelAnimationFrame(raf);
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    },
  };
}
