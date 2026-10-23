// Движок тренировки. Чистая логика без DOM — покрыта тестами в test/timer.test.js.
//
// Шаг (step):
//   { kind: 'prepare' | 'work' | 'rest' | 'set' | 'between' | 'done',
//     seconds: число | null (null = без таймера, ждём «Готово»),
//     exIndex: индекс упражнения в items, round, rounds, reps, nextIndex }

export const DEFAULT_PREPARE = 5;

export function buildPlan(workout, exById, { prepare = DEFAULT_PREPARE } = {}) {
  const items = (workout.items || []).map((id) => exById[id]).filter(Boolean);
  const steps = [];
  const restBetween = Number(workout.restBetween) || 0;

  items.forEach((ex, exIndex) => {
    const last = exIndex === items.length - 1;
    if (exIndex === 0 && prepare > 0) {
      steps.push({ kind: 'prepare', seconds: prepare, exIndex: 0 });
    }
    if (ex.mode === 'sets') {
      const sets = Math.max(1, Number(ex.sets && ex.sets.sets) || 1);
      const reps = Math.max(1, Number(ex.sets && ex.sets.reps) || 1);
      const rest = Math.max(0, Number(ex.sets && ex.sets.rest) || 0);
      for (let s = 1; s <= sets; s++) {
        steps.push({ kind: 'set', seconds: null, exIndex, round: s, rounds: sets, reps });
        if (s < sets && rest > 0) steps.push({ kind: 'rest', seconds: rest, exIndex, round: s, rounds: sets });
      }
    } else {
      const rounds = Math.max(1, Number(ex.interval && ex.interval.rounds) || 1);
      const work = Math.max(1, Number(ex.interval && ex.interval.work) || 1);
      const rest = Math.max(0, Number(ex.interval && ex.interval.rest) || 0);
      for (let r = 1; r <= rounds; r++) {
        steps.push({ kind: 'work', seconds: work, exIndex, round: r, rounds });
        if (r < rounds && rest > 0) steps.push({ kind: 'rest', seconds: rest, exIndex, round: r, rounds });
      }
    }
    if (!last && restBetween > 0) {
      steps.push({ kind: 'between', seconds: restBetween, exIndex, nextIndex: exIndex + 1 });
    }
  });

  steps.push({ kind: 'done', seconds: null, exIndex: Math.max(0, items.length - 1) });
  return { steps, items };
}

// Оценка длительности в секундах. Подход без таймера считаем за setEstimate секунд.
export function planDuration(steps, { setEstimate = 30 } = {}) {
  let total = 0;
  for (const s of steps) {
    if (s.seconds != null) total += s.seconds;
    else if (s.kind === 'set') total += setEstimate;
  }
  return total;
}

export function exerciseDuration(ex, opts) {
  const { steps } = buildPlan({ items: [ex.id], restBetween: 0 }, { [ex.id]: ex }, { prepare: 0 });
  return planDuration(steps, opts);
}

// Индекс упражнения, которое нужно показывать на этом шаге (в паузе между упражнениями — следующее).
export function stepExerciseIndex(step) {
  return step.kind === 'between' ? step.nextIndex : step.exIndex;
}

export class Runner {
  constructor(steps, now = () => Date.now()) {
    this.steps = steps;
    this.now = now;
    this.index = 0;
    this.stepStart = null;
    this.pausedAt = null;
    this.pausedAcc = 0;
    this.started = false;
    this.finished = false;
    this.startedAt = null;
    this.finishedAt = null;
    this._lastCountdown = null;
  }

  get step() { return this.steps[this.index]; }
  get paused() { return this.pausedAt != null; }

  start() {
    const t = this.now();
    this.started = true;
    this.startedAt = t;
    this.stepStart = t;
    return this._enter(0);
  }

  pause() {
    if (this.started && !this.finished && this.pausedAt == null) this.pausedAt = this.now();
  }

  resume() {
    if (this.pausedAt != null) {
      const d = this.now() - this.pausedAt;
      this.stepStart += d;
      this.pausedAcc += d;
      this.pausedAt = null;
    }
  }

  elapsedMs() {
    if (this.stepStart == null) return 0;
    const end = this.pausedAt != null ? this.pausedAt : this.now();
    return Math.max(0, end - this.stepStart);
  }

  totalElapsedMs() {
    if (this.startedAt == null) return 0;
    const end = this.finishedAt != null ? this.finishedAt : (this.pausedAt != null ? this.pausedAt : this.now());
    return Math.max(0, end - this.startedAt - this.pausedAcc);
  }

  _enter(index) {
    this.index = Math.max(0, Math.min(index, this.steps.length - 1));
    this._lastCountdown = null;
    const events = [{ type: 'step', index: this.index, step: this.step }];
    if (this.step.kind === 'done' && !this.finished) {
      this.finished = true;
      this.finishedAt = this.pausedAt != null ? this.pausedAt : this.now();
      events.push({ type: 'finish' });
    }
    return events;
  }

  goTo(index) {
    if (!this.started || this.finished) return [];
    // При паузе отсчёт нового шага начнётся с момента паузы (elapsed = 0).
    this.stepStart = this.pausedAt != null ? this.pausedAt : this.now();
    return this._enter(index);
  }

  skip() { return this.goTo(this.index + 1); }

  // Если прошло больше 3 секунд — перезапустить шаг, иначе — на предыдущий.
  back() {
    if (this.elapsedMs() > 3000 || this.index === 0) return this.goTo(this.index);
    return this.goTo(this.index - 1);
  }

  // «Готово» для шага без таймера.
  complete() { return this.goTo(this.index + 1); }

  tick() {
    if (!this.started || this.finished || this.paused) return [];
    const events = [];
    let guard = 0;
    while (guard++ < 10000) {
      const step = this.step;
      if (step.seconds == null) break;
      const total = step.seconds * 1000;
      const remaining = total - this.elapsedMs();
      if (remaining <= 0) {
        // Переходим дальше, перенося «перебор» времени на следующий шаг.
        this.stepStart += total;
        events.push(...this._enter(this.index + 1));
        if (this.finished) break;
        continue;
      }
      const secLeft = Math.ceil(remaining / 1000);
      if (total >= 4000 && secLeft <= 3 && secLeft >= 1 && this._lastCountdown !== secLeft) {
        this._lastCountdown = secLeft;
        events.push({ type: 'countdown', n: secLeft });
      }
      break;
    }
    return events;
  }

  state() {
    const step = this.step;
    const elapsed = this.elapsedMs();
    const total = step.seconds != null ? step.seconds * 1000 : null;
    const remaining = total != null ? Math.max(0, total - elapsed) : null;
    return {
      index: this.index,
      count: this.steps.length,
      step,
      next: this.steps[this.index + 1] || null,
      elapsed,
      total,
      remaining,
      secondsLeft: remaining != null ? Math.ceil(remaining / 1000) : null,
      progress: total ? Math.min(1, elapsed / total) : 0,
      paused: this.paused,
      finished: this.finished,
    };
  }
}
