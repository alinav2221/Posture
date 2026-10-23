// Запуск: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, planDuration, Runner, stepExerciseIndex } from '../js/timer.js';

const exInterval = { id: 'a', name: 'Присед', mode: 'interval', interval: { work: 40, rest: 15, rounds: 3 } };
const exSets = { id: 'b', name: 'Выпады', mode: 'sets', sets: { sets: 2, reps: 12, rest: 60 } };
const exById = { a: exInterval, b: exSets };

function fakeClock(start = 0) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  now.set = (ms) => { t = ms; };
  return now;
}

test('buildPlan: интервалы, подходы, отдых между, без хвостового отдыха', () => {
  const { steps, items } = buildPlan({ items: ['a', 'b'], restBetween: 20 }, exById, { prepare: 5 });
  assert.equal(items.length, 2);
  const kinds = steps.map((s) => s.kind);
  assert.deepEqual(kinds, [
    'prepare',
    'work', 'rest', 'work', 'rest', 'work',
    'between',
    'set', 'rest', 'set',
    'done',
  ]);
  assert.equal(steps[1].seconds, 40);
  assert.equal(steps[2].seconds, 15);
  assert.equal(steps[6].seconds, 20);
  assert.equal(steps[6].nextIndex, 1);
  assert.equal(stepExerciseIndex(steps[6]), 1);
  assert.equal(steps[7].seconds, null);
  assert.equal(steps[7].reps, 12);
  assert.equal(steps[8].seconds, 60);
});

test('buildPlan: пропускает неизвестные id и prepare=0', () => {
  const { steps, items } = buildPlan({ items: ['zzz', 'a'], restBetween: 0 }, exById, { prepare: 0 });
  assert.equal(items.length, 1);
  assert.equal(steps[0].kind, 'work');
  assert.equal(steps.at(-1).kind, 'done');
});

test('planDuration: сумма секунд + оценка подходов', () => {
  const { steps } = buildPlan({ items: ['a', 'b'], restBetween: 20 }, exById, { prepare: 5 });
  // 5 + 40*3 + 15*2 + 20 + 30*2 + 60 = 295
  assert.equal(planDuration(steps), 295);
});

test('Runner: отсчёт, переходы и обратный отсчёт 3-2-1', () => {
  const now = fakeClock(1000);
  const { steps } = buildPlan({ items: ['a'], restBetween: 0 }, exById, { prepare: 5 });
  const r = new Runner(steps, now);
  let ev = r.start();
  assert.equal(ev[0].type, 'step');
  assert.equal(r.step.kind, 'prepare');
  assert.equal(r.state().secondsLeft, 5);

  now.advance(1500);
  assert.equal(r.state().secondsLeft, 4);
  assert.deepEqual(r.tick(), []);

  now.advance(600); // 2.1s прошло, осталось 2.9 -> countdown 3
  ev = r.tick();
  assert.deepEqual(ev, [{ type: 'countdown', n: 3 }]);
  assert.deepEqual(r.tick(), []); // повторно не шлёт

  now.advance(1000); // осталось 1.9 -> countdown 2
  assert.deepEqual(r.tick(), [{ type: 'countdown', n: 2 }]);
  now.advance(1000); // 0.9 -> countdown 1
  assert.deepEqual(r.tick(), [{ type: 'countdown', n: 1 }]);

  now.advance(1000); // 5.1s -> переход на work, перебор 100мс
  ev = r.tick();
  assert.equal(ev[0].type, 'step');
  assert.equal(ev[0].step.kind, 'work');
  assert.equal(r.state().elapsed, 100);
});

test('Runner: перебор времени проматывает несколько шагов', () => {
  const now = fakeClock(0);
  const { steps } = buildPlan({ items: ['a'], restBetween: 0 }, exById, { prepare: 0 });
  const r = new Runner(steps, now);
  r.start();
  now.advance(40000 + 15000 + 10000); // work(40) + rest(15) + 10с во втором work
  const ev = r.tick();
  const kinds = ev.filter((e) => e.type === 'step').map((e) => e.step.kind);
  assert.deepEqual(kinds, ['rest', 'work']);
  assert.equal(r.step.round, 2);
  assert.equal(r.state().elapsed, 10000);
});

test('Runner: пауза замораживает время, resume продолжает', () => {
  const now = fakeClock(0);
  const { steps } = buildPlan({ items: ['a'], restBetween: 0 }, exById, { prepare: 0 });
  const r = new Runner(steps, now);
  r.start();
  now.advance(10000);
  r.pause();
  now.advance(30000);
  assert.equal(r.state().elapsed, 10000);
  assert.equal(r.paused, true);
  assert.deepEqual(r.tick(), []);
  r.resume();
  now.advance(5000);
  assert.equal(r.state().elapsed, 15000);
  assert.equal(r.totalElapsedMs(), 15000);
});

test('Runner: подход без таймера ждёт complete()', () => {
  const now = fakeClock(0);
  const { steps } = buildPlan({ items: ['b'], restBetween: 0 }, exById, { prepare: 0 });
  const r = new Runner(steps, now);
  r.start();
  assert.equal(r.step.kind, 'set');
  now.advance(120000);
  assert.deepEqual(r.tick(), []);
  assert.equal(r.state().secondsLeft, null);
  const ev = r.complete();
  assert.equal(ev[0].step.kind, 'rest');
  assert.equal(r.state().elapsed, 0);
});

test('Runner: skip, back и финиш', () => {
  const now = fakeClock(0);
  const { steps } = buildPlan({ items: ['a'], restBetween: 0 }, exById, { prepare: 0 });
  const r = new Runner(steps, now);
  r.start();
  now.advance(1000);
  r.skip();
  assert.equal(r.step.kind, 'rest');
  now.advance(1000);
  r.back(); // прошло <3с -> на предыдущий
  assert.equal(r.step.kind, 'work');
  assert.equal(r.step.round, 1);
  now.advance(5000);
  r.back(); // прошло >3с -> перезапуск того же шага
  assert.equal(r.step.kind, 'work');
  assert.equal(r.state().elapsed, 0);

  let finished = false;
  for (let i = 0; i < 20 && !r.finished; i++) {
    const ev = r.skip();
    if (ev.some((e) => e.type === 'finish')) finished = true;
  }
  assert.equal(finished, true);
  assert.equal(r.step.kind, 'done');
  assert.deepEqual(r.skip(), []);
  assert.deepEqual(r.tick(), []);
});

test('Runner: истечение последнего шага даёт finish', () => {
  const now = fakeClock(0);
  const ex = { id: 'c', mode: 'interval', interval: { work: 10, rest: 0, rounds: 1 } };
  const { steps } = buildPlan({ items: ['c'], restBetween: 0 }, { c: ex }, { prepare: 0 });
  const r = new Runner(steps, now);
  r.start();
  now.advance(10000);
  const ev = r.tick();
  assert.deepEqual(ev.map((e) => e.type), ['step', 'finish']);
  assert.equal(r.finished, true);
  assert.equal(r.totalElapsedMs(), 10000);
});
