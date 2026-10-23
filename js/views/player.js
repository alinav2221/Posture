// Экран тренировки: видео-фрагмент на весь экран + таймер поверх.
import { h, icon, fmtClock, fmtTime, fmtMinutes, countOf, plural, confirmSheet } from '../ui.js';
import { exercises, workouts, videos, videoURL, settings } from '../store.js';
import { buildPlan, planDuration, stepExerciseIndex, Runner } from '../timer.js';
import * as audio from '../audio.js';
import * as wake from '../wakelock.js';

const PHASE_LABEL = {
  prepare: 'Приготовься',
  work: 'Работа',
  rest: 'Отдых',
  set: 'Подход',
  between: 'Отдых',
  done: 'Готово',
};
const REPS = ['повторение', 'повторения', 'повторений'];

export async function render({ path, id }) {
  const single = path.startsWith('play/e/');
  let workout;
  if (single) {
    const ex = await exercises.get(id);
    if (!ex) throw new Error('Упражнение не найдено');
    workout = { id: null, name: ex.name || 'Упражнение', items: [ex.id], restBetween: 0 };
  } else {
    workout = await workouts.get(id);
    if (!workout) throw new Error('Тренировка не найдена');
  }

  const [exList, vidList] = await Promise.all([exercises.all(), videos.all()]);
  const exById = Object.fromEntries(exList.map((e) => [e.id, e]));
  const vidById = Object.fromEntries(vidList.map((v) => [v.id, v]));
  const cfg = settings.get();
  const { steps, items } = buildPlan(workout, exById, { prepare: cfg.prepare });
  if (!items.length) throw new Error('В тренировке нет упражнений');
  const runner = new Runner(steps);

  /* ---------- DOM ---------- */
  const videoEl = h('video', { class: 'player__video', playsinline: true, muted: true, loop: true, preload: 'auto' });
  videoEl.muted = cfg.muteVideo !== false;
  const phaseEl = h('div', { class: 'player__phase' });
  const roundEl = h('div', { class: 'player__round' });
  const clockEl = h('div', { class: 'player__clock' });
  const capEl = h('div', { class: 'player__cap' });
  const nameEl = h('div', { class: 'player__name' });
  const nextEl = h('div', { class: 'player__next' });
  const barEl = h('i');
  const posEl = h('div', { class: 'player__pos' });
  const mainBtn = h('button', { class: 'pbtn pbtn--main', type: 'button', onclick: onMain });
  const muteBtn = h('button', { class: 'pbtn pbtn--icon', type: 'button', 'aria-label': 'Звук видео', onclick: toggleMute });
  const fsBtn = h('button', { class: 'pbtn pbtn--icon', type: 'button', 'aria-label': 'На весь экран', onclick: toggleFullscreen });
  setMuteIcon();
  setFsIcon();

  const root = h('div', { class: 'player', dataset: { phase: 'idle' } },
    videoEl,
    h('div', { class: 'player__novideo' }, icon('dumbbell', 72)),
    h('div', { class: 'player__shade' }),
    h('header', { class: 'player__top' },
      h('button', { class: 'pbtn pbtn--icon', type: 'button', 'aria-label': 'Выйти', onclick: exit }, icon('close')),
      posEl,
      h('div', { class: 'player__top-right' }, fsBtn, muteBtn),
    ),
    h('div', { class: 'player__bottom' },
      h('div', { class: 'player__body' },
        h('div', { class: 'player__phase-row' }, phaseEl, roundEl),
        clockEl,
        capEl,
        nameEl,
        nextEl,
        h('div', { class: 'player__bar' }, barEl),
      ),
      h('footer', { class: 'player__controls' },
        h('button', { class: 'pbtn pbtn--icon pbtn--side', type: 'button', 'aria-label': 'Назад', onclick: () => apply(runner.back()) }, icon('prev', 28)),
        mainBtn,
        h('button', { class: 'pbtn pbtn--icon pbtn--side', type: 'button', 'aria-label': 'Пропустить', onclick: () => apply(runner.skip()) }, icon('next', 28)),
      ),
    ),
  );

  const startOverlay = h('div', { class: 'player__start' },
    h('div', { class: 'player__start-top' },
      h('a', { class: 'pbtn pbtn--icon', href: '#/', 'aria-label': 'Назад' }, icon('close')),
    ),
    h('div', { class: 'player__start-body' },
      h('div', { class: 'kicker' }, single ? 'Упражнение' : 'Тренировка'),
      h('h1', { class: 'player__start-title' }, workout.name || 'Без названия'),
      h('p', { class: 'player__start-meta' },
        `${countOf(items.length, ['упражнение', 'упражнения', 'упражнений'])} · ${fmtMinutes(planDuration(steps))}`),
      h('ol', { class: 'player__start-list' }, items.map((ex) => h('li', null, ex.name || 'Без названия'))),
    ),
    h('div', { class: 'player__start-foot' },
      h('button', { class: 'btn btn--primary btn--xl', type: 'button', onclick: start }, icon('play', 26), 'Старт'),
    ),
  );
  root.append(startOverlay);

  /* ---------- видео ---------- */
  let currentVideoId = null;
  let range = { start: 0, end: Infinity };
  let videoReady = false;

  function showVideoFor(ex) {
    const v = ex && ex.videoId ? vidById[ex.videoId] : null;
    if (!v) {
      if (currentVideoId) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        currentVideoId = null;
      }
      root.classList.add('player--novideo');
      return;
    }
    root.classList.remove('player--novideo');
    range = { start: ex.start || 0, end: ex.end != null ? ex.end : (v.duration || Infinity) };
    if (currentVideoId !== v.id) {
      currentVideoId = v.id;
      videoReady = false;
      videoEl.src = videoURL(v);
      videoEl.load();
    } else {
      seekStart();
    }
  }
  function seekStart() {
    try { videoEl.currentTime = range.start; } catch { /* ignore */ }
    playVideo();
  }
  function playVideo() {
    if (runner.started && !runner.paused && !runner.finished) videoEl.play().catch(() => {});
  }
  videoEl.addEventListener('loadedmetadata', () => { videoReady = true; seekStart(); });
  function syncLoop() {
    if (!videoReady || videoEl.paused) return;
    const t = videoEl.currentTime;
    if (t >= range.end - 0.05 || t < range.start - 0.5) {
      try { videoEl.currentTime = range.start; } catch { /* ignore */ }
    }
  }

  /* ---------- отрисовка ---------- */
  let lastClock = '';

  function renderStep(step) {
    const exIdx = stepExerciseIndex(step);
    const ex = items[exIdx];
    const nextStep = runner.steps[runner.index + 1];
    root.dataset.phase = step.kind;
    phaseEl.textContent = PHASE_LABEL[step.kind] || '';

    if (step.kind === 'work' || step.kind === 'rest') roundEl.textContent = `${step.round} / ${step.rounds}`;
    else if (step.kind === 'set') roundEl.textContent = `${step.round} / ${step.rounds}`;
    else roundEl.textContent = '';

    nameEl.textContent = ex ? (ex.name || 'Без названия') : '';
    posEl.textContent = `${exIdx + 1} / ${items.length}`;

    let hint = '';
    if (step.kind === 'between' || step.kind === 'prepare') {
      hint = '';
    } else if (nextStep && nextStep.kind === 'done') {
      hint = 'это последний';
    } else if (nextStep) {
      const nEx = items[stepExerciseIndex(nextStep)];
      if (nEx && nEx !== ex) hint = `дальше: ${nEx.name || 'Без названия'}`;
      else if (nextStep.kind === 'rest') hint = `дальше: отдых ${nextStep.seconds} с`;
      else if (nextStep.kind === 'work') hint = `дальше: круг ${nextStep.round}`;
      else if (nextStep.kind === 'set') hint = `дальше: подход ${nextStep.round}`;
    }
    nextEl.textContent = hint;

    mainBtn.innerHTML = '';
    if (step.kind === 'set') {
      clockEl.textContent = String(step.reps);
      capEl.textContent = plural(step.reps, REPS);
      mainBtn.classList.add('pbtn--done');
      mainBtn.append(icon('check', 28), h('span', null, 'Готово'));
      mainBtn.setAttribute('aria-label', 'Подход выполнен');
    } else {
      capEl.textContent = '';
      mainBtn.classList.remove('pbtn--done');
      setMainIcon();
    }
    showVideoFor(ex);
    lastClock = '';
  }

  function setMainIcon() {
    if (runner.step && runner.step.kind === 'set') return;
    mainBtn.innerHTML = '';
    mainBtn.append(icon(runner.paused ? 'play' : 'pause', 36));
    mainBtn.setAttribute('aria-label', runner.paused ? 'Продолжить' : 'Пауза');
  }
  function setMuteIcon() {
    muteBtn.innerHTML = '';
    muteBtn.append(icon(videoEl.muted ? 'mute' : 'sound'));
  }
  function setFsIcon() {
    fsBtn.innerHTML = '';
    fsBtn.append(icon(document.fullscreenElement ? 'shrink' : 'expand'));
  }

  function renderState() {
    const s = runner.state();
    if (s.step.kind === 'set') {
      const c = fmtTime(s.elapsed / 1000);
      if (c !== lastClock) {
        capEl.textContent = `${plural(s.step.reps, REPS)} · ${c}`;
        lastClock = c;
      }
      barEl.style.width = '100%';
    } else if (s.step.kind !== 'done') {
      const c = fmtClock(s.secondsLeft);
      if (c !== lastClock) {
        clockEl.textContent = c;
        lastClock = c;
      }
      barEl.style.width = `${((1 - s.progress) * 100).toFixed(2)}%`;
    }
    root.classList.toggle('is-paused', s.paused);
  }

  function apply(events) {
    for (const e of events) {
      if (e.type === 'step') {
        renderStep(e.step);
        if (e.step.kind === 'work' || e.step.kind === 'set') audio.sounds.work();
        else if (e.step.kind === 'rest' || e.step.kind === 'between') audio.sounds.rest();
      } else if (e.type === 'countdown') {
        audio.sounds.tick();
      } else if (e.type === 'finish') {
        finish();
      }
    }
  }

  /* ---------- управление ---------- */
  let raf = 0;
  function frame() {
    apply(runner.tick());
    if (runner.finished) return;
    renderState();
    syncLoop();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    audio.unlock();
    wake.acquire();
    startOverlay.remove();
    apply(runner.start());
    playVideo();
    raf = requestAnimationFrame(frame);
  }

  function onMain() {
    if (!runner.started || runner.finished) return;
    if (runner.step.kind === 'set') {
      apply(runner.complete());
      return;
    }
    if (runner.paused) {
      runner.resume();
      playVideo();
    } else {
      runner.pause();
      videoEl.pause();
    }
    setMainIcon();
    renderState();
  }

  function toggleMute() {
    videoEl.muted = !videoEl.muted;
    setMuteIcon();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* не поддерживается */ }
  }

  function finish() {
    cancelAnimationFrame(raf);
    raf = 0;
    videoEl.pause();
    wake.release();
    audio.sounds.finish();
    if (workout.id) workouts.markDone(workout.id);
    const total = fmtTime(runner.totalElapsedMs() / 1000);
    root.dataset.phase = 'done';
    root.append(h('div', { class: 'player__done' },
      h('div', { class: 'player__done-body' },
        h('div', { class: 'kicker' }, 'Готово'),
        h('h1', { class: 'player__done-title' }, 'Ты молодец!'),
        h('p', { class: 'player__done-meta' }, `${workout.name || 'Тренировка'} · ${total}`),
      ),
      h('div', { class: 'player__start-foot' },
        h('a', { class: 'btn btn--primary btn--xl', href: '#/' }, 'На главную'),
      ),
    ));
  }

  async function exit() {
    if (runner.started && !runner.finished) {
      const wasPaused = runner.paused;
      if (!wasPaused) { runner.pause(); videoEl.pause(); setMainIcon(); }
      const ok = await confirmSheet({ title: 'Прервать тренировку?', ok: 'Прервать', cancel: 'Продолжить' });
      if (!ok) {
        if (!wasPaused) { runner.resume(); playVideo(); setMainIcon(); }
        return;
      }
    }
    location.hash = '#/';
  }

  const onVisible = () => { if (document.visibilityState === 'visible') playVideo(); };
  const onKey = (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); onMain(); }
    else if (e.key === 'ArrowRight') apply(runner.skip());
    else if (e.key === 'ArrowLeft') apply(runner.back());
  };
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', setFsIcon);

  function destroy() {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', setFsIcon);
    wake.release();
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  return { el: root, destroy, fullscreen: true };
}
