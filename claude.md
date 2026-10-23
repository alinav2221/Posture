# claude.md — Posture

Инструкции и контекст для Claude по этому проекту. Общие правила — в `../CLAUDE.md` и глобальном `~/.claude/CLAUDE.md` (отвечать по-русски, сначала обсуждать, деплой только по явному разрешению).

## Что это

Офлайн-PWA «Posture» (бывшая «Тренька»; внутренние имена базы `trenka` и ключа настроек `trenka.settings` оставлены, чтобы не терять данные): личное приложение для телефона (Android, Chrome). Пользователь сохраняет рилсы из Instagram в галерею, загружает их в приложение, отмечает в одном видео несколько кусков «начало/конец» (каждый кусок — упражнение), задаёт таймер и собирает тренировки. В плеере кусок видео крутится по кругу на весь экран, поверх — крупный таймер со звуком и вибрацией. Продуктовый контекст — в `vision.md`, состояние работ — в `handoff.md`, подключения — в `connectionguide.md`.

## Стек и ограничения

- **Без сборки.** Чистые HTML + CSS + ES-модули. Никаких бандлеров, фреймворков, TypeScript. Деплой = выложить файлы как есть.
- **Все пути относительные** (`./js/...`), потому что на GitHub Pages приложение живёт в подпапке `/<repo>/`. Роутинг — по `location.hash` (`#/exercises`), серверная маршрутизация не нужна.
- **Шрифты локальные** (`fonts/*.woff2`, Unbounded + Onest, подмножества cyrillic/latin с Google Fonts, лицензия OFL). Внешних запросов в рантайме нет — иначе офлайн сломается.
- **Хранение:** IndexedDB (`js/db.js`), база `trenka`, хранилища `videos`, `exercises`, `workouts`. Видео лежат как Blob/File прямо в IndexedDB. Настройки — в `localStorage` (`trenka.settings`).
- **Offline:** `sw.js` прекэширует оболочку (список `ASSETS`). **При любом изменении файлов приложения повышай `CACHE` в `sw.js` и `APP_VERSION` в `js/version.js`** — иначе телефоны останутся на старой версии. Новые файлы добавляй в `ASSETS`.
- Целевой браузер — Chrome на Android (актуальный). Используются `color-mix()`, `100dvh`, Wake Lock API, `navigator.vibrate`, Web Audio. Полифилов нет.
- Оптional chaining и прочий современный JS — ок. Но внутри heredoc в Bash-инструменте на этой машине команды длиннее ~8 КБ обрезаются (лимит командной строки Windows) — большие файлы писать через Write.

## Структура

```
index.html              оболочка, подключает css/app.css и js/app.js
manifest.webmanifest    PWA-манифест (start_url ./, иконки из icons/)
sw.js                   service worker: прекэш + cache-first, обновление через SKIP_WAITING
css/app.css             все стили (тёмная тема, токены в :root)
js/app.js               роутер по hash, нижняя навигация, регистрация SW, beforeinstallprompt
js/version.js           APP_VERSION (показывается в настройках)
js/db.js                обёртка над IndexedDB
js/store.js             данные: videos / exercises / workouts / settings, object URL кэш, probeVideo (длительность + превью)
js/timer.js             чистый движок: buildPlan(тренировка → шаги), Runner (отсчёт по Date.now, пауза, skip/back)
js/audio.js             сигналы через Web Audio + вибрация
js/wakelock.js          не гасить экран
js/ui.js                h() для DOM, иконки, форматирование, toast, sheet, stepper, segmented, page()
js/views/home.js        главная: тренировки + подсказка «с чего начать»
js/views/exercises.js   библиотека упражнений
js/views/exerciseEdit.js редактор: выбор видео, разметчик фрагмента, таймер
js/views/workoutEdit.js редактор тренировки: порядок, отдых между
js/views/videos.js      библиотека видео (загрузка, переименование, удаление, место)
js/views/player.js      экран тренировки
js/views/settings.js    звук/вибрация/подготовка, установка, хранилище, версия
icons/                  icon.svg (исходник), PNG 192/512 и maskable (отрендерены headless Chrome)
test/timer.test.js      unit-тесты движка (node --test)
test/e2e/run.mjs        сквозной прогон в headless Chrome (puppeteer-core), скриншоты в test/e2e/shots/
```

## Модель данных

```js
Video    { id, name, type, size, duration, thumb: Blob|null, blob: File, createdAt }
Exercise { id, name, videoId|null, start: сек, end: сек|null (null = до конца), mode: 'interval'|'sets',
           interval: { work, rest, rounds }, sets: { sets, reps, rest }, note, createdAt, updatedAt }
Workout  { id, name, items: [exerciseId...], restBetween: сек, lastDoneAt, createdAt, updatedAt }
```

План тренировки (`buildPlan`) → массив шагов `{ kind: prepare|work|rest|set|between|done, seconds|null, exIndex, round, rounds, reps, nextIndex }`. Шаг `set` без таймера — ждёт кнопку «Готово». Хвостовой отдых после последнего круга/подхода не добавляется; между упражнениями — `between` (отдых из тренировки).

## Соглашения

- Весь UI на русском, обращение к пользователю на «ты», как в приложении.
- Компоненты строятся через `h(tag, attrs, ...children)` из `js/ui.js`; никакого innerHTML с пользовательскими данными.
- Вью экспортирует `async render(params) → { el, destroy?, fullscreen? }`. `destroy` обязателен, если вью вешает глобальные слушатели или держит видео.
- Цвет фазы в плеере задаётся через `data-phase` на `.player` и CSS-переменную `--phase` (work/set — лайм, rest/between — голубой, prepare — янтарь).
- Единицы в UI: секунды пишем «40 с», длительности «≈ 6 мин».

## Команды

```bash
npm test                       # unit-тесты движка таймера
npm run e2e                    # сквозной тест в headless Chrome (нужны Chrome и ffmpeg). Порт: E2E_PORT=8766
py -m http.server 8765 --bind 127.0.0.1   # локально посмотреть: http://127.0.0.1:8765/
```

Для телефона приложение нужно открывать по HTTPS (PWA, wake lock, установка) — см. `connectionguide.md`.

## Грабли

- **Headless Chrome на Windows:** профиль (`--user-data-dir`) должен лежать по короткому пути (например `%TEMP%\tk\<id>`), иначе Cache Storage падает с «Entry already exists» и service worker не устанавливается. Это не баг приложения.
- При первой установке SW `clients.claim()` даёт `controllerchange`; перезагрузку страницы делаем только когда сами запросили обновление (`updateRequested` в `app.js`).
- В тестовом видео `testsrc` внизу кадра есть тёмная полоса — на скриншотах плеера это не градиент, а само видео.
- `ffmpeg` и Chrome доступны на машине разработки: ими рендерятся иконки и тестовое видео.
