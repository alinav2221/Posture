// Настройки: сигналы, подготовка, установка, хранилище, обновление.
import { h, icon, page, stepper, toggleRow, toast, fmtBytes } from '../ui.js';
import { settings, storageInfo, requestPersist } from '../store.js';
import * as audio from '../audio.js';
import { APP_VERSION } from '../version.js';
import { getInstallPrompt, checkForUpdate } from '../app.js';

export async function render() {
  const cfg = settings.get();

  /* ---------- установка ---------- */
  const installBox = h('div', { class: 'row' });
  function renderInstall() {
    installBox.innerHTML = '';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const prompt = getInstallPrompt();
    if (standalone) {
      installBox.append(h('div', { class: 'row__text' }, h('div', { class: 'row__title' }, 'Установлено на телефон'), h('div', { class: 'row__hint' }, 'Запускается с домашнего экрана, работает офлайн.')), icon('check'));
    } else if (prompt) {
      installBox.append(
        h('div', { class: 'row__text' }, h('div', { class: 'row__title' }, 'Установить на телефон'), h('div', { class: 'row__hint' }, 'Иконка на домашнем экране, без адресной строки.')),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: async () => { prompt.prompt(); const r = await prompt.userChoice; if (r && r.outcome === 'accepted') toast('Готово, ищи иконку на экране'); renderInstall(); } }, 'Установить'),
      );
    } else {
      installBox.append(h('div', { class: 'row__text' }, h('div', { class: 'row__title' }, 'Установить на телефон'), h('div', { class: 'row__hint' }, 'Chrome: меню ⋮ → «Добавить на главный экран» или «Установить приложение».')));
    }
  }
  renderInstall();
  document.addEventListener('installable', renderInstall);

  /* ---------- хранилище ---------- */
  const storageBox = h('div', { class: 'row' });
  async function renderStorage() {
    const si = await storageInfo();
    storageBox.innerHTML = '';
    if (!si) { storageBox.append(h('div', { class: 'row__text' }, h('div', { class: 'row__title' }, 'Хранилище'), h('div', { class: 'row__hint' }, 'Нет данных'))); return; }
    storageBox.append(
      h('div', { class: 'row__text' },
        h('div', { class: 'row__title' }, `Занято ${fmtBytes(si.usage)} из ${fmtBytes(si.quota)}`),
        h('div', { class: 'row__hint' }, si.persisted ? 'Хранилище защищено: браузер не удалит видео при нехватке места.' : 'Браузер может очистить данные при нехватке места.'),
      ),
      si.persisted ? icon('check') : h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { const ok = await requestPersist(); toast(ok ? 'Хранилище защищено' : 'Браузер не разрешил. Помогает установка приложения.'); renderStorage(); } }, 'Защитить'),
    );
  }
  renderStorage();

  const el = page({ title: 'Настройки', back: '#/' },
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Сигналы'),
      toggleRow({ label: 'Звук', hint: 'Смена этапа и отсчёт 3-2-1', checked: cfg.sound, onChange: (v) => settings.set({ sound: v }) }),
      toggleRow({ label: 'Вибрация', checked: cfg.vibrate, onChange: (v) => settings.set({ vibrate: v }) }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { audio.unlock(); audio.sounds.test(); } }, 'Проверить сигнал'),
    ),
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Тренировка'),
      stepper({ label: 'Подготовка перед стартом', value: cfg.prepare, min: 0, max: 60, step: 1, unit: 'с', onChange: (v) => settings.set({ prepare: v }) }),
      toggleRow({ label: 'Видео без звука', hint: 'Музыка из рилса не будет мешать сигналам. В тренировке можно включить.', checked: cfg.muteVideo, onChange: (v) => settings.set({ muteVideo: v }) }),
    ),
    h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, 'Приложение'),
      installBox,
      storageBox,
      h('div', { class: 'row' },
        h('div', { class: 'row__text' }, h('div', { class: 'row__title' }, `Версия ${APP_VERSION}`), h('div', { class: 'row__hint' }, 'Обновления подхватываются сами при подключении к интернету.')),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { toast('Проверяю…', { duration: 1500 }); const r = await checkForUpdate(); if (r === 'none') toast('Это последняя версия'); } }, 'Проверить'),
      ),
    ),
  );

  return { el, destroy: () => document.removeEventListener('installable', renderInstall) };
}
