// Full-page notices for the Discord build, shown instead of the game when it cannot start properly.
type Kind = 'outside' | 'setup' | 'error';

const TEXT: Record<'en' | 'zh' | 'es', Record<Kind, [string, string]>> = {
  en: {
    outside: ['Play Parcelwood in Discord', 'This page is the Discord version. Start Parcelwood from the Activities menu in a Discord voice channel or chat.'],
    setup: ['Parcelwood is not set up yet', 'This Discord build is missing its settings. Please try again later.'],
    error: ['Parcelwood could not start', 'Something went wrong while connecting to Discord. Close the activity and open it again.'],
  },
  zh: {
    outside: ['请在 Discord 里玩包裹镇', '这是 Discord 版页面。请在 Discord 语音频道或聊天的「活动」菜单里打开包裹镇。'],
    setup: ['包裹镇还没设置好', '这个 Discord 版缺少设置，请稍后再试。'],
    error: ['包裹镇没能启动', '连接 Discord 时出了问题。请关掉活动再重新打开。'],
  },
  es: {
    outside: ['Juega a Parcelwood en Discord', 'Esta página es la versión de Discord. Abre Parcelwood desde el menú de Actividades en un canal de voz o chat de Discord.'],
    setup: ['Parcelwood aún no está configurado', 'A esta versión de Discord le faltan ajustes. Inténtalo más tarde.'],
    error: ['Parcelwood no pudo iniciarse', 'Algo falló al conectar con Discord. Cierra la actividad y vuelve a abrirla.'],
  },
};

export function noticeLang(langs: readonly string[]): 'en' | 'zh' | 'es' {
  for (const l of langs) { const p = String(l).toLowerCase().slice(0, 2); if (p === 'en' || p === 'zh' || p === 'es') return p; }
  return 'en';
}

export function startScreen(kind: Kind, langs: readonly string[] = navigator.languages || [navigator.language]): void {
  const [title, body] = TEXT[noticeLang(langs)][kind];
  const app = document.getElementById('app');
  if (!app) return;
  const nav = document.getElementById('nav-in');
  if (nav) nav.textContent = '';
  const section = document.createElement('section');
  section.className = 'panel';
  section.id = 'discord-notice';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = body; p.style.margin = '0';
  section.append(h, p);
  app.replaceChildren(section);
}
