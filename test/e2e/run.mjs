// Сквозной прогон в headless Chrome: видео → упражнение → тренировка → плеер → офлайн.
// Запуск: npm run e2e   (нужны Chrome и ffmpeg в системе; puppeteer-core ставится через npm i)
// Переменные: CHROME_PATH — путь к chrome.exe, E2E_PORT — порт локального сервера.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = path.join(ROOT, 'test', 'e2e', 'shots');
const PORT = Number(process.env.E2E_PORT) || 8765;
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// Профиль Chrome кладём по короткому пути: длинный путь на Windows ломает Cache Storage (лимит 260 символов).
const PROFILE = path.join(os.tmpdir(), 'tk', Date.now().toString(36));
const VIDEO = path.join(os.tmpdir(), 'tk', 'test-reel.mp4');

fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });
if (!fs.existsSync(VIDEO)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30:duration=20', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', VIDEO]);
}

/* ---------- статический сервер ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: PROFILE,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:') && !r.failure()?.errorText.includes('INTERNET_DISCONNECTED')) errors.push(`[requestfailed] ${r.url()} ${r.failure() && r.failure().errorText}`); });

const shot = async (name) => { await sleep(250); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const go = async (hash) => { await page.goto(BASE + hash, { waitUntil: 'networkidle0' }); await sleep(300); };
const check = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) failed = true; };
const clickText = async (selector, text) => {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, selector, text);
  if (!ok) throw new Error(`Не найден элемент ${selector} с текстом «${text}»`);
  await sleep(300);
};
const waitText = (text, timeout = 8000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

try {
  console.log('1. Видео');
  await go('#/');
  await shot('01-home-empty');
  await go('#/videos');
  const input = await page.$('input[type=file]');
  await input.uploadFile(VIDEO);
  await waitText('Видео добавлено');
  await page.waitForSelector('.vrow');
  await sleep(400);
  await shot('02-videos');
  check(/0:20/.test(await page.evaluate(() => document.querySelector('.vrow__meta').textContent)), 'длительность видео определена');

  console.log('2. Упражнение с фрагментом видео');
  await clickText('.vrow__actions a', 'Упражнение');
  await page.waitForFunction(() => { const v = document.querySelector('.marker__video'); return v && v.readyState >= 1 && v.duration > 0; }, { timeout: 10000 });
  await sleep(300);
  const setRange = async (t) => {
    await page.evaluate((val) => {
      const r = document.querySelector('.marker__range');
      r.value = val;
      r.dispatchEvent(new Event('input', { bubbles: true }));
      r.dispatchEvent(new Event('change', { bubbles: true }));
    }, t);
    await sleep(400);
  };
  await setRange(3);
  await clickText('.btn--mark', 'Начало здесь');
  await setRange(8.5);
  await clickText('.btn--mark', 'Конец здесь');
  await page.type('.input--lg', 'Присед с паузой');
  await shot('03-exercise-edit');
  const marks = await page.evaluate(() => [...document.querySelectorAll('.mark__val b')].map((b) => b.textContent));
  check(marks[0] === '0:03.0' && marks[1] === '0:08.5', `метки фрагмента ${marks.join(' – ')}`);
  await clickText('.form-foot .btn--primary', 'Сохранить');
  await waitText('Присед с паузой');

  console.log('3. Упражнение без видео, подходы');
  await go('#/exercise/new');
  await page.type('.input--lg', 'Выпады назад');
  await clickText('.seg__btn', 'Подходы');
  await clickText('.form-foot .btn--primary', 'Сохранить');
  await waitText('Выпады назад');
  await shot('04-exercises');

  console.log('4. Тренировка');
  await go('#/workout/new');
  await page.type('.input--lg', 'Ноги и ягодицы');
  await clickText('.section .btn--ghost', 'Добавить упражнения');
  await page.waitForSelector('.sheet.is-in .vpick__item');
  await sleep(300);
  await page.evaluate(() => document.querySelectorAll('.sheet .vpick__item input').forEach((cb) => cb.click()));
  await shot('05-workout-pick');
  await clickText('.sheet__actions .btn--primary', 'Добавить');
  await sleep(400);
  await page.evaluate(() => { const rows = document.querySelectorAll('.wrow'); if (rows[1]) rows[1].querySelector('[aria-label="Выше"]').click(); });
  await sleep(300);
  const order = await page.evaluate(() => [...document.querySelectorAll('.wrow__name')].map((e) => e.textContent));
  check(order[0] === 'Присед с паузой', `порядок: ${order.join(' → ')}`);
  await shot('06-workout-edit');
  await clickText('.form-foot .btn--primary', 'Сохранить');
  await waitText('Ноги и ягодицы');
  await shot('07-home');

  console.log('5. Плеер');
  await page.click('.wcard__start');
  await page.waitForSelector('.player__start');
  await shot('08-player-start');
  await page.evaluate(() => { window.__offset = 0; const real = Date.now; Date.now = () => real() + window.__offset; });
  await clickText('.player__start .btn--primary', 'Старт');
  await sleep(800);
  const state = () => page.evaluate(() => {
    const p = document.querySelector('.player');
    const v = document.querySelector('.player__video');
    return { phase: p.dataset.phase, clock: document.querySelector('.player__clock').textContent, name: document.querySelector('.player__name').textContent, videoTime: Number(v.currentTime.toFixed(2)), done: !!document.querySelector('.player__done') };
  });
  const seen = [];
  let pauseOk = null;
  for (let i = 0; i < 40; i++) {
    const s = await state();
    if (s.done) break;
    if (!seen.includes(s.phase)) { seen.push(s.phase); await shot(`09-player-${s.phase}`); }
    if (s.phase === 'work' && pauseOk == null) {
      await page.click('.pbtn--main');
      await sleep(400);
      const before = (await state()).clock;
      await page.evaluate(() => { window.__offset += 5000; });
      await sleep(400);
      pauseOk = (await state()).clock === before;
      await shot('10-player-paused');
      await page.click('.pbtn--main');
      await sleep(300);
    }
    if (s.phase === 'set') {
      await page.click('.pbtn--main');
    } else {
      const left = await page.evaluate(() => { const t = document.querySelector('.player__clock').textContent; const [m, sec] = t.includes(':') ? t.split(':').map(Number) : [0, Number(t)]; return m * 60 + sec; });
      await page.evaluate((ms) => { window.__offset += ms; }, left * 1000 + 300);
    }
    await sleep(450);
  }
  await sleep(400);
  await shot('11-player-done');
  check(seen.join(',') === 'prepare,work,rest,between,set', `фазы: ${seen.join(' → ')}`);
  check(pauseOk === true, 'пауза замораживает таймер');
  check(await page.evaluate(() => document.body.innerText.includes('Ты молодец')), 'экран «Готово»');
  await clickText('.player__done a', 'На главную');
  await sleep(400);
  check(await page.evaluate(() => document.body.innerText.includes('была: сегодня')), 'отмечена дата последней тренировки');

  console.log('6. Фрагмент крутится по кругу');
  await go('#/exercises');
  await page.evaluate(() => { const row = [...document.querySelectorAll('.erow')].find((r) => r.textContent.includes('Присед')); row.querySelector('.erow__play').click(); });
  await page.waitForSelector('.player__start');
  await clickText('.player__start .btn--primary', 'Старт');
  await page.waitForFunction(() => document.querySelector('.player').dataset.phase === 'work', { timeout: 10000 });
  const times = [];
  for (let i = 0; i < 14; i++) { times.push(await page.evaluate(() => Number(document.querySelector('.player__video').currentTime.toFixed(1)))); await sleep(500); }
  check(times.every((t) => t >= 2.9 && t <= 8.6) && times.some((t, i) => i > 0 && t < times[i - 1]), `видео в пределах 3.0–8.5 и перематывается: ${times.join(' ')}`);
  await shot('12-single-work');

  console.log('7. Настройки и офлайн');
  await go('#/settings');
  await shot('13-settings');
  await go('#/');
  const swOk = await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 10000 }).then(() => true).catch(() => false);
  check(swOk, 'service worker активен');
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(600);
  check(await page.evaluate(() => !!document.querySelector('.wcard') && document.body.innerText.includes('Ноги и ягодицы')), 'главная открывается офлайн');
  await page.goto(BASE + '#/exercises', { waitUntil: 'networkidle0' }).catch(() => {});
  await sleep(400);
  check((await page.evaluate(() => document.querySelectorAll('.erow').length)) === 2, 'упражнения открываются офлайн');
  await shot('14-offline');
  await page.setOfflineMode(false);
} catch (e) {
  failed = true;
  console.error('FAIL:', e.message);
  await shot('99-fail');
} finally {
  console.log(`\nОшибки консоли/сети: ${errors.length}`);
  for (const e of errors) console.log('  ' + e);
  if (errors.length) failed = true;
  await browser.close();
  server.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log(failed ? '\nE2E: есть проблемы' : '\nE2E: всё прошло');
  process.exit(failed ? 1 : 0);
}
