// Preview-only listening room for the board. It plays the same synthesized sounds as the game, so no one has to
// unpack parcels to hear every cue. Production builds send visitors back to the game.
import './styles.css';
import './fonts';
import { UI } from './i18n/strings';
import { startMusic } from './ui/music';
import { createMaster, duckMusic, GAME_SFX, ITEM_SOUNDS, MUSIC_LEVEL, playSfx, playTag, setMasterMuted } from './ui/sfx';
import type { GameSfx, ItemSound } from './ui/sfx';

const preview = import.meta.env.DEV || import.meta.env.VITE_DEVTOOLS === '1';
if (!preview) window.location.replace('./');

type Lang = 'zh' | 'en';
type Copy = {
  title: string; kicker: string; intro: string; back: string; language: string;
  music: string; musicNote: string; musicOn: string; musicOff: string; mute: string; unmute: string; muted: string;
  items: string; itemsNote: string; events: string; eventsNote: string;
  switchTitle: string; switchGame: string; switchHost: string; switchAutoplay: string;
  event: Record<GameSfx, [string, string]>;
};

const COPY: Record<Lang, Copy> = {
  zh: {
    title: 'Parcelwood 声音试听',
    kicker: 'M3 音效和音乐 · 董事会试听版',
    intro: '这里听到的和游戏里完全一样：所有声音都由浏览器现场合成，没有音频文件，也没有第三方素材。先点一下页面开始，再逐个点下面的按钮。',
    back: '打开游戏', language: 'English',
    music: '背景音乐 · Parcel Street Loop',
    musicNote: '66 BPM，29.09 秒无缝循环；四小节 Cmaj7 → Am7 → Fmaj7 → Gsus4；音量 13%，2.4 kHz 低通。音效响起时自动让位（ducking）。',
    musicOn: '播放音乐', musicOff: '暂停音乐', mute: '全部静音', unmute: '恢复声音', muted: '已静音',
    items: '物品声音（8 种）',
    itemsNote: '摇一摇、称重、拾取或猜中时按物品类型播放。每件物品固定一种声音，玩家可以用声音辨认内容。',
    events: '操作声音（10 种）',
    eventsNote: '短事件音。全部经过 6.5 kHz 低通和压缩器，响度接近，不会突然刺耳。',
    switchTitle: '开关在哪里',
    switchGame: '游戏内：小站页右上角、金币栏右侧、语言按钮左边的扬声器图标。点一下静音，再点一下恢复。设置会保存在存档里，刷新后仍然有效。',
    switchHost: 'CrazyGames：宿主设置里的“静音音频 / muteAudio”优先于游戏内按钮；被宿主静音时，游戏内按钮会变灰。Discord 和网页版用同一个游戏内开关。',
    switchAutoplay: '自动播放：页面加载时没有声音。第一次点击或按键之后才创建 AudioContext 并开始音乐，这是 iOS 的要求。切到后台会暂停；回到页面后点一下或按一下键继续，不会补播后台期间的音符。',
    event: {
      tape: ['划开胶带', '短促的高频撕裂声，0.35 秒。'],
      scrape: ['刮擦胶带', '拖动时反复响的细小摩擦声，50 毫秒。'],
      flap: ['打开箱盖', '纸板展开的低频“噗”，0.15 秒。'],
      scale: ['称重', '两声木琴般的轻点，间隔 0.5 秒。'],
      tap: ['按钮 / 轻提示', '最常用的短点，60 毫秒，音量很低。'],
      coin: ['金币 / 碎片入账', '两枚硬币，方波，0.28 秒。'],
      common: ['普通物品揭晓', '单音上行，0.4 秒。'],
      rare: ['稀有物品揭晓', '三音上行，0.6 秒。'],
      epic: ['史诗物品揭晓', '四音叠和弦，加高音尾，1.3 秒。'],
      secret: ['隐藏物品揭晓', '七音琶音，加和弦尾，2 秒。'],
    },
  },
  en: {
    title: 'Parcelwood sound check',
    kicker: 'M3 audio · board listening build',
    intro: 'This is exactly what the game plays: every sound is synthesized in the browser, with no audio files and no third-party samples. Tap once to start, then try each button below.',
    back: 'Open the game', language: '中文',
    music: 'Background music · Parcel Street Loop',
    musicNote: '66 BPM, a seamless 29.09 s loop; four bars Cmaj7 → Am7 → Fmaj7 → Gsus4; 13% volume through a 2.4 kHz low-pass. It ducks under short sounds.',
    musicOn: 'Play music', musicOff: 'Pause music', mute: 'Mute all', unmute: 'Sound on', muted: 'Muted',
    items: 'Item sounds (8)',
    itemsNote: 'Played when an item is shaken, weighed, picked up or revealed. Each item keeps one sound, so players can recognise what is inside by ear.',
    events: 'Action sounds (10)',
    eventsNote: 'Short event cues. All pass through the 6.5 kHz low-pass and compressor, so their levels stay close and nothing jumps out.',
    switchTitle: 'Where the switch is',
    switchGame: 'In the game: the speaker icon at the top right of the station, right of the coins and left of the language button. Tap once to mute, again to restore. The setting is saved and survives a refresh.',
    switchHost: 'CrazyGames: the host’s muteAudio setting wins over the in-game button; the button greys out while the host is muted. Discord and the web build use the same in-game switch.',
    switchAutoplay: 'Autoplay: nothing plays on load. The AudioContext and the music start only after the first tap or key press, as iOS requires. Going to the background pauses it; the next tap or key press resumes, without replaying the missed notes.',
    event: {
      tape: ['Cut the tape', 'A short high tear, 0.35 s.'],
      scrape: ['Swipe the tape', 'A tiny repeated friction tick, 50 ms.'],
      flap: ['Open the lid', 'A low cardboard “puff”, 0.15 s.'],
      scale: ['Weigh', 'Two small wooden taps, 0.5 s apart.'],
      tap: ['Button / light hint', 'The everyday short click, 60 ms, very quiet.'],
      coin: ['Coins / shards paid', 'Two coins, square wave, 0.28 s.'],
      common: ['Common reveal', 'One rising note, 0.4 s.'],
      rare: ['Rare reveal', 'Three rising notes, 0.6 s.'],
      epic: ['Epic reveal', 'A four-note chord with a high tail, 1.3 s.'],
      secret: ['Secret reveal', 'A seven-note arpeggio with a chord tail, 2 s.'],
    },
  },
};

const params = new URLSearchParams(window.location.search);
let lang: Lang = params.get('lang') === 'en' ? 'en' : params.get('lang') === 'zh' ? 'zh' : (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en');

let ac: AudioContext | null = null;
let bus: AudioNode | null = null;
let musicGain: GainNode | null = null;
let musicStop: (() => void) | null = null;
let musicWanted = true;
let muted = false;
let started = false;
let hiddenTab = false;

function resetBus(): void {
  if (!bus) return;
  try { (bus as GainNode).gain.value = 0; } catch { /* ignore */ }
  try { bus.disconnect(); } catch { /* ignore */ }
  bus = null;
  musicGain = null;
}

function ensureAudio(): AudioContext | null {
  try {
    if (ac && ac.state === 'closed') { resetBus(); ac = null; }
    if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state !== 'running' && ac.state !== 'closed') void ac.resume();
    if (!bus) bus = createMaster(ac);
    if (!musicGain) {
      musicGain = ac.createGain();
      musicGain.gain.value = MUSIC_LEVEL;
      musicGain.connect(bus);
    }
  } catch {
    ac = null;
  }
  return ac;
}

function startLoop(): void {
  const ctx = ensureAudio();
  if (!ctx || !musicGain || musicStop) return;
  musicStop = startMusic(ctx, musicGain, () => muted || !musicWanted);
}

function stopLoop(): void {
  if (!musicStop) return;
  musicStop();
  musicStop = null;
}

function setMusicLevel(): void {
  if (!ac || !musicGain) return;
  const level = muted || !musicWanted ? 0 : MUSIC_LEVEL;
  try { musicGain.gain.setTargetAtTime(level, ac.currentTime, 0.08); } catch { /* keep the current level */ }
}

function silenceAll(): void {
  stopLoop();
  if (ac && bus) setMasterMuted(ac, bus, true);
  try { if (ac && ac.state === 'running') void ac.suspend(); } catch { /* ignore */ }
}

function kick(): void {
  started = true;
  ensureAudio();
  if (musicWanted && !muted) startLoop();
  setMusicLevel();
  paintState();
}

// Coming back from the background or the lock screen: resume and rebuild the bus, but only inside a real gesture.
function wake(): void {
  if (muted || hiddenTab) return;
  if (ac && ac.state !== 'running' && ac.state !== 'closed') { resetBus(); void ac.resume(); }
  if (!started) return;
  ensureAudio();
  if (musicWanted && !musicStop) startLoop();
  setMusicLevel();
  paintState();
}

function hitTag(tag: ItemSound): void {
  if (muted) { muted = false; setMusicLevel(); }
  const ctx = ensureAudio();
  if (!ctx || !bus) return;
  if (!started) kick();
  duckMusic(ctx, musicGain);
  playTag(ctx, bus, tag);
  paintState();
}

function hitSfx(name: GameSfx): void {
  if (muted) { muted = false; setMusicLevel(); }
  const ctx = ensureAudio();
  if (!ctx || !bus) return;
  if (!started) kick();
  duckMusic(ctx, musicGain);
  playSfx(ctx, bus, name);
  paintState();
}

function paintState(): void {
  const c = COPY[lang];
  const mute = document.getElementById('audio-mute');
  if (mute) mute.textContent = muted ? c.unmute : c.mute;
  const music = document.getElementById('audio-music');
  if (music) music.textContent = musicWanted ? c.musicOff : c.musicOn;
  const status = document.getElementById('audio-status');
  if (status) status.textContent = muted ? c.muted : '';
}

function soundButton(id: string, label: string, note: string, kind: 'tag' | 'sfx'): string {
  return '<button class="audio-sound" data-' + kind + '="' + id + '"><b>' + label + '</b><span>' + note + '</span></button>';
}

function render(): void {
  const c = COPY[lang];
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  const root = document.getElementById('audio-lab');
  if (!root) return;
  const items = ITEM_SOUNDS.map(tag => soundButton(tag, UI[lang].sndShort[tag], UI[lang].snd[tag], 'tag')).join('');
  const events = GAME_SFX.map(name => soundButton(name, c.event[name][0], c.event[name][1], 'sfx')).join('');
  root.innerHTML =
    '<header class="audio-head"><div><p class="audio-kicker">' + c.kicker + '</p><h1>' + c.title + '</h1></div>' +
      '<div class="audio-actions"><button class="link-btn" data-lang="' + (lang === 'zh' ? 'en' : 'zh') + '">' + c.language + '</button>' +
      '<a class="link-btn" href="./">' + c.back + '</a></div></header>' +
    '<p class="audio-intro">' + c.intro + '</p>' +
    '<section class="panel audio-music"><div class="audio-row"><div><h2>' + c.music + '</h2><p class="small muted">' + c.musicNote + '</p></div>' +
      '<div class="audio-actions"><button class="btn" id="audio-music">' + (musicWanted ? c.musicOff : c.musicOn) + '</button>' +
      '<button class="btn ghost" id="audio-mute">' + (muted ? c.unmute : c.mute) + '</button>' +
      '<span class="small muted" id="audio-status" aria-live="polite">' + (muted ? c.muted : '') + '</span></div></div></section>' +
    '<section class="panel"><div class="audio-row"><h2>' + c.items + '</h2></div><p class="small muted">' + c.itemsNote + '</p><div class="audio-grid">' + items + '</div></section>' +
    '<section class="panel"><div class="audio-row"><h2>' + c.events + '</h2></div><p class="small muted">' + c.eventsNote + '</p><div class="audio-grid">' + events + '</div></section>' +
    '<section class="panel audio-switch"><h2>' + c.switchTitle + '</h2><ul><li>' + c.switchGame + '</li><li>' + c.switchHost + '</li><li>' + c.switchAutoplay + '</li></ul></section>';
  paintState();
}

document.addEventListener('pointerdown', () => { if (!started) kick(); else wake(); }, { capture: true });
document.addEventListener('keydown', (e) => {
  if (!started && (e.key === 'Enter' || e.key === ' ')) kick(); else wake();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenTab = true; silenceAll(); }
  else hiddenTab = false; // still suspended until the next gesture
});

document.getElementById('audio-lab')?.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('button, a');
  if (!el) return;
  const tag = (el as HTMLElement).dataset.tag as ItemSound | undefined;
  const sfx = (el as HTMLElement).dataset.sfx as GameSfx | undefined;
  const nextLang = (el as HTMLElement).dataset.lang as Lang | undefined;
  if (tag) { hitTag(tag); return; }
  if (sfx) { hitSfx(sfx); return; }
  if (nextLang) { lang = nextLang; render(); return; }
  if (el.id === 'audio-mute') {
    muted = !muted;
    if (muted) silenceAll();
    else {
      resetBus();
      ensureAudio();
      musicWanted = true;
      startLoop();
      setMusicLevel();
    }
    paintState();
    return;
  }
  if (el.id === 'audio-music') {
    musicWanted = !musicWanted;
    if (musicWanted && !muted) startLoop(); else stopLoop();
    setMusicLevel();
    render();
  }
});

render();
