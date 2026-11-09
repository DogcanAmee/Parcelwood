// Starts the web game in one tab at a time (ship plan W1). A second tab shows "open in another tab" with a
// "Play here" button; pressing it moves the game over, and the first tab stops and stops saving.
import { UI } from '../i18n/strings';
import type { Platform } from '../platform/types';
import { claimTab, lockedPlatform, type LockManagerLike } from '../platform/tabLock';

type Lang = 'en' | 'zh' | 'es';

export const TAB_TEXT: Record<Lang, { busyTitle: string; busyBody: string; movedTitle: string; movedBody: string; here: string }> = {
  en: {
    busyTitle: 'Already open in another tab',
    busyBody: 'The game is running in another tab or window. Only one can save at a time, so your progress stays safe.',
    movedTitle: 'Moved to another tab',
    movedBody: 'You opened the game somewhere else. This tab has stopped and no longer saves.',
    here: 'Play here',
  },
  zh: {
    busyTitle: '已在另一个标签页打开',
    busyBody: '游戏正在另一个标签页或窗口里运行。同一时间只有一个能存档，这样你的进度不会被覆盖。',
    movedTitle: '已转到另一个标签页',
    movedBody: '你在别处打开了游戏。这个标签页已经停下，不再存档。',
    here: '在这里玩',
  },
  es: {
    busyTitle: 'Ya está abierto en otra pestaña',
    busyBody: 'El juego está abierto en otra pestaña o ventana. Solo una puede guardar a la vez, así tu progreso está a salvo.',
    movedTitle: 'Se abrió en otra pestaña',
    movedBody: 'Abriste el juego en otro sitio. Esta pestaña se detuvo y ya no guarda.',
    here: 'Jugar aquí',
  },
};

function pickLang(platform: Platform): Lang {
  const ok = (l: string | null | undefined): l is Lang => l === 'en' || l === 'zh' || l === 'es';
  const saved = platform.loadLang();
  if (ok(saved)) return saved;
  for (const l of platform.preferredLanguages()) { const base = l.slice(0, 2).toLowerCase(); if (ok(base)) return base; }
  return 'en';
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function tabScreen(platform: Platform, kind: 'busy' | 'moved', onHere: () => void): void {
  const lang = pickLang(platform), tx = TAB_TEXT[lang];
  const title = String((UI as Record<string, Record<string, unknown>>)[lang]?.title ?? '');
  for (const id of ['nav-in', 'sheet-root', 'modal-root']) { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '<header class="top"><div class="brand"><h1>' + esc(title) + '</h1></div></header>' +
    '<section class="panel" id="tab-' + kind + '"><div class="big" aria-hidden="true" style="font-size:56px;text-align:center">📮</div>' +
    '<h2>' + esc(kind === 'busy' ? tx.busyTitle : tx.movedTitle) + '</h2><p style="margin:0">' + esc(kind === 'busy' ? tx.busyBody : tx.movedBody) + '</p>' +
    '<button class="btn" id="tab-here">' + esc(tx.here) + '</button></section>';
  const btn = document.getElementById('tab-here') as HTMLButtonElement;
  btn.addEventListener('click', () => { btn.disabled = true; onHere(); }, { once: true });
  btn.focus();
}

/** Runs `start` while this tab holds the save lock. Returns a function that stops the game and lets the lock go. */
export function startSingleTab(platform: Platform, locks: LockManagerLike | undefined, start: (p: Platform) => () => void): () => void {
  let stop: (() => void) | null = null;
  let release: () => void = () => {};
  let ended = false;
  const lost = () => {
    if (stop) { stop(); stop = null; }
    if (!ended) tabScreen(platform, 'moved', () => begin(true));
  };
  const begin = (steal: boolean) => claimTab(locks, { steal, onLost: lost }).then(({ claim, lock }) => {
    if (ended) { lock.release(); return; }
    if (claim === 'busy') { tabScreen(platform, 'busy', () => begin(true)); return; }
    release = () => lock.release();
    stop = start(lockedPlatform(platform, lock));
  });
  void begin(false);
  return () => { ended = true; if (stop) { stop(); stop = null; } release(); };
}
