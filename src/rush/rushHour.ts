import { ITEMS, SERIES } from '../core/logic';
import {
  RUSH_HOUR_DURATION, RUSH_HOUR_BOSS_AT, RUSH_HOUR_STRIKES, QUEUE_CAP, TOOL_MAX, SERIES_IDS, RUSH_ITEM,
  visibleClues, applyTool, toolThreshold, deliveryMs, scoreFor, gradeFor, candidates, itemSoundsOf,
  shiftParcel, shiftBoss, shiftOffer, rushShare,
} from '../core/rushHour';
import type { RushFinishResult, TrayClue, TrayLevels, TrayParcel, TrayToolId } from '../core/rushHour';
import type { RushResult, Sound } from '../core/types';
import { CONTENT, UI } from '../i18n/strings';
import { vibrate } from '../ui/haptics';
import { rushText } from './strings';

type Phase = 'intro' | 'play' | 'reveal' | 'tool' | 'pause' | 'end';

export interface RushShift { day: string; n: number; prize: string; prizeOwned: boolean; official: boolean; result: RushResult | null }

export interface RushHourOptions {
  lang: string;
  baseUrl: string;
  onExit: () => void;
  today: () => RushShift;
  begin: (day: string) => boolean;
  finish: (day: string, official: boolean, result: RushResult) => RushFinishResult;
}

const TOOL_ICON: Record<TrayToolId, string> = {
  scissors: '✂️', xray: '🩻', scale: '⚖️', ear: '👂', tea: '☕', rush: '💨', helper: '🧓', star: '⭐',
};
const SOUND_ICON: Record<Sound, string> = {
  rustle: '📄', thud: '🪨', slosh: '💧', clack: '🎲', clank: '⚙️', jingle: '🔑', chime: '🎐', squeak: '🐭',
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fmt = (s: number) => { const v = Math.max(0, Math.ceil(s)); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
const starsOf = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** Mounts the Rush Hour overlay. Returns a dispose function. */
export function startRushHour(opts: RushHourOptions): () => void {
  const T = rushText(opts.lang);
  const root = document.createElement('div');
  root.className = 'rh';
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', T.title);
  root.innerHTML =
    '<div class="rh-scene">' +
      '<header class="rh-top"><button class="rh-icon" data-rh="exit" aria-label="' + esc(T.exit) + '">←</button>' +
        '<div class="rh-brand"><span class="rh-kicker" id="rh-kicker">' + esc(T.kicker) + '</span><h1>' + esc(T.title) + '</h1></div>' +
        '<button class="rh-icon" data-rh="pause" aria-label="' + esc(T.pause) + '">⏸</button></header>' +
      '<div class="rh-stats"><span class="rh-stat"><b id="rh-score">0</b><small>' + esc(T.score) + '</small></span>' +
        '<span class="rh-stat"><b id="rh-combo">0</b><small>' + esc(T.combo) + '</small></span>' +
        '<span class="rh-stat rh-clock"><b id="rh-clock">' + fmt(RUSH_HOUR_DURATION) + '</b><small>' + esc(T.time) + '</small></span>' +
        '<span class="rh-hearts" id="rh-hearts" aria-label="' + esc(T.hearts) + '"></span></div>' +
      '<section class="rh-belt" aria-label="' + esc(T.title) + '"><div class="rh-belt-track" id="rh-belt"></div><div class="rh-belt-bar"><i id="rh-belt-bar"></i></div></section>' +
      '<main class="rh-counter"><div class="rh-counter-top"><span class="rh-counter-label" id="rh-mode"></span><span class="rh-counter-sub" id="rh-belt-count"></span></div>' +
        '<div class="rh-stage" id="rh-stage"></div><div class="rh-clues" id="rh-clues"></div></main>' +
      '<section class="rh-pick" id="rh-pick"></section>' +
      '<div class="rh-banner" id="rh-banner" hidden></div>' +
      '<div class="rh-feedback" id="rh-feedback" aria-live="polite"></div>' +
    '</div>' +
    '<div class="rh-panel-wrap" id="rh-panel"></div>';
  document.body.appendChild(root);
  document.body.classList.add('rush-active');

  const q = <E extends HTMLElement>(s: string) => root.querySelector(s) as E;
  const stage = q<HTMLDivElement>('#rh-stage');
  const clues = q<HTMLDivElement>('#rh-clues');
  const pick = q<HTMLDivElement>('#rh-pick');
  const belt = q<HTMLDivElement>('#rh-belt');
  const panelWrap = q<HTMLDivElement>('#rh-panel');
  const strings = (UI as Record<string, any>)[opts.lang] || UI.en;
  const content = (CONTENT as Record<string, any>)[opts.lang];

  let shift: RushShift = opts.today();
  let official = false;
  let phase: Phase = 'intro';
  let active: TrayParcel | null = null;
  let queue: TrayParcel[] = [];
  let selected: string | null = null;
  let peeled = 0;
  let levels: TrayLevels = {};
  let combo = 0, bestCombo = 0, correct = 0, opened = 0, score = 0, strikes = 0;
  let elapsed = 0, deliverIn = 0, deliverTotal = 1;
  let bossSpawned = false, bossOpened = false;
  let toolProgress = 0, toolPicks = 0;
  let offer: TrayToolId[] = [];
  let offerAt = 0;
  let parcelIndex = 0;
  let marks: string[] = [];
  let shareText = '';
  let timer = 0, lastTick = 0;
  let revealTimer = 0, feedbackTimer = 0, bannerTimer = 0, autoCutTimer = 0;
  let swipeStart: number | null = null;
  let swipeUsed = false;
  let disposed = false;

  // ---------- i18n helpers ----------
  function ui(key: string): string {
    const s = strings[key] != null ? strings[key] : UI.en[key];
    return s == null ? key : String(s);
  }
  function seriesName(id: string): string {
    const c = content?.series?.[id];
    return c ? c[0] : SERIES[id].name;
  }
  function itemCopy(id: string): [string, string] {
    const c = content?.items?.[id];
    return c ? [c[0], c[1]] : [ITEMS[id].name, ITEMS[id].note];
  }
  function keepsakeCopy(id: string): [string, string] {
    const c = content?.rushItems?.[id];
    return c ? [c[0], c[1]] : [RUSH_ITEM[id].name, RUSH_ITEM[id].note];
  }
  function soundShort(s: Sound): string {
    const m = strings.sndShort || UI.en.sndShort;
    return String(m[s] || s);
  }
  function soundLong(s: Sound): string {
    const m = strings.snd || UI.en.snd;
    return String(m[s] || s);
  }
  function fill(s: string, vars: Record<string, string | number>): string {
    return s.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? String(vars[k]) : m);
  }

  function buzz(pattern: number | number[]) {
    vibrate(pattern);
  }

  function panel(html: string) {
    panelWrap.innerHTML = html ? '<div class="rh-panel-back"><div class="rh-panel" role="dialog" aria-modal="true">' + html + '</div></div>' : '';
    const first = panelWrap.querySelector('button');
    if (first) (first as HTMLButtonElement).focus();
  }

  function feedback(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
    const f = q<HTMLDivElement>('#rh-feedback');
    f.textContent = text;
    f.className = 'rh-feedback show ' + kind;
    clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => { f.className = 'rh-feedback'; }, 1300);
  }

  function banner(text: string) {
    const b = q<HTMLDivElement>('#rh-banner');
    b.textContent = text;
    b.hidden = false;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => { b.hidden = true; b.classList.remove('show'); }, 2600);
  }

  // ---------- rendering ----------
  function hearts(): string {
    const left = Math.max(0, RUSH_HOUR_STRIKES - strikes);
    return Array.from({ length: RUSH_HOUR_STRIKES }, (_, i) => '<span class="rh-heart ' + (i < left ? 'on' : 'off') + '">♥</span>').join('');
  }

  function updateStats() {
    q('#rh-score').textContent = String(score);
    q('#rh-combo').textContent = String(combo);
    q('#rh-clock').textContent = fmt(RUSH_HOUR_DURATION - elapsed);
    q('#rh-hearts').innerHTML = hearts();
  }

  function renderBelt() {
    q('#rh-belt-count').textContent = queue.length ? queue.length + ' / ' + QUEUE_CAP : '';
    belt.innerHTML = queue.length
      ? queue.map(p => '<span class="rh-mini-box' + (p.kind === 'boss' ? ' boss' : '') + '" aria-hidden="true"><i></i>' + (p.kind === 'boss' ? '!' : '?') + '</span>').join('')
      : '<span class="rh-belt-empty">' + esc(T.waiting) + '</span>';
  }

  const smudgeText = (p: TrayParcel) => p.smudge.join(' · ');

  function clueChip(c: TrayClue, p: TrayParcel): string {
    if (c === 'sticker') {
      return '<span class="rh-clue"><span class="rh-dot" style="background:' + esc(SERIES[p.series].color) + '"></span>' + esc(ui('kSticker')) + ' · ' + esc(seriesName(p.series)) + '</span>';
    }
    if (c === 'postmark') return '<span class="rh-clue">📮 ' + esc(fill(T.postmark, { p: p.postmark })) + '</span>';
    if (c === 'smudge') return '<span class="rh-clue rh-clue-smudge">📮 ' + esc(fill(T.smudge, { l: smudgeText(p) })) + '</span>';
    if (c === 'sound') return '<span class="rh-clue">' + SOUND_ICON[p.sound] + ' ' + esc(soundLong(p.sound)) + '</span>';
    return '<span class="rh-clue">⚖️ ' + esc(ui('kWeight')) + ' · ' + esc(p.weight + ' oz') + '</span>';
  }

  function renderCounter() {
    if (!active) {
      stage.innerHTML = '<div class="rh-wait">' + esc(T.waiting) + '</div>';
      clues.innerHTML = '';
      return;
    }
    const p = active;
    const shown = visibleClues(p, levels, peeled);
    const boss = p.kind === 'boss';
    const canCut = boss ? peeled < p.layers || !!selected : !!selected;
    const action = boss && peeled < p.layers ? T.peel : selected ? T.cut : T.pickHint;
    const stamp = shown.includes('postmark')
      ? '<span class="rh-postmark">' + esc(p.postmark) + '</span>'
      : shown.includes('smudge') ? '<span class="rh-postmark smudged">' + esc(p.smudge.join('…')) + '</span>' : '';
    stage.innerHTML =
      '<button class="rh-box' + (boss ? ' boss' : '') + (selected ? ' ready' : '') + '" data-rh="cut" aria-label="' + esc(action) + '">' +
        '<span class="rh-box-side"></span><span class="rh-box-tape"></span>' +
        (shown.includes('sticker') ? '<span class="rh-sticker" style="background:' + esc(SERIES[p.series].color) + '"></span>' : '') +
        stamp +
        '<span class="rh-box-label">' + (boss ? esc(T.boss) : '#' + p.id) + '</span>' +
        (boss ? '<span class="rh-layer">' + esc(fill(T.layer, { n: Math.min(peeled + 1, p.layers), max: p.layers })) + '</span>' : '') +
        '<span class="rh-box-action">' + esc(action) + '</span>' +
        '<span class="rh-box-swipe">' + esc(T.swipe) + '</span>' +
      '</button>';
    if (canCut) stage.querySelector('.rh-box')?.classList.add('can-cut');
    clues.innerHTML = '<div class="rh-clue-title">' + esc(T.clues) + '</div>' +
      (shown.length ? shown.map(c => clueChip(c, p)).join('') : '<div class="rh-clue-empty">' + esc(T.noClues) + '</div>');
  }

  function renderPick() {
    if (!active) { pick.innerHTML = ''; return; }
    const shown = visibleClues(active, levels, peeled);
    const fits = (levels.helper || 0) > 0 ? candidates(active, shown) : null;
    const crates = SERIES_IDS.map(id => {
      const sounds = itemSoundsOf(id);
      return '<button class="rh-crate' + (selected === id ? ' on' : '') + (fits && fits.includes(id) ? ' suggest' : '') + '" data-series="' + esc(id) + '" style="--c:' + esc(SERIES[id].color) + '" aria-pressed="' + (selected === id) + '">' +
        '<span class="rh-crate-lid"></span><b>' + esc(seriesName(id)) + '</b><small class="rh-crate-stamp">' + esc(SERIES[id].postmark) + '</small>' +
        '<span class="rh-crate-sounds" title="' + esc(sounds.map(soundShort).join(' · ')) + '">' + sounds.map(s => SOUND_ICON[s]).join('') + '</span>' +
        (fits && fits.includes(id) ? '<span class="rh-crate-hint">👀</span>' : '') +
      '</button>';
    }).join('');
    const canReturn = active.kind !== 'boss';
    pick.innerHTML = '<p class="rh-pick-hint">' + esc(selected ? T.ready : T.pickHint) + '</p><div class="rh-crates">' + crates + '</div>' +
      (canReturn ? '<button class="rh-return' + (fits && !fits.length ? ' suggest' : '') + '" data-rh="return">↩ ' + esc(T.sendBack) + ' <kbd>4</kbd></button>' : '');
  }

  function renderAll() {
    updateStats();
    renderBelt();
    renderCounter();
    renderPick();
  }

  // ---------- flow ----------
  function reset() {
    active = null; queue = []; selected = null; peeled = 0; levels = {};
    combo = 0; bestCombo = 0; correct = 0; opened = 0; score = 0; strikes = 0;
    elapsed = 0; bossSpawned = false; bossOpened = false; toolProgress = 0; toolPicks = 0; offer = [];
    parcelIndex = 0; marks = []; shareText = '';
    deliverTotal = deliveryMs(0, levels) / 1000; deliverIn = 3.2;
    swipeStart = null; swipeUsed = false;
    clearTimeout(revealTimer); clearTimeout(autoCutTimer); clearTimeout(feedbackTimer); clearTimeout(bannerTimer);
    q<HTMLDivElement>('#rh-feedback').className = 'rh-feedback';
    q<HTMLDivElement>('#rh-banner').hidden = true;
    q<HTMLDivElement>('#rh-banner').classList.remove('show');
    panel('');
  }

  const nextFromBelt = () => shiftParcel(shift.day, parcelIndex++);

  function startRun() {
    shift = opts.today();
    reset();
    official = opts.begin(shift.day);
    q('#rh-mode').textContent = fill(T.shiftNo, { n: shift.n }) + ' · ' + (official ? T.officialTag : T.practiceTag);
    phase = 'play';
    for (let i = 0; i < 2; i++) queue.push(nextFromBelt());
    active = queue.shift() || null;
    renderAll();
    lastTick = performance.now();
    if (!timer) timer = window.setInterval(tick, 100);
  }

  function deliver() {
    if (queue.length >= QUEUE_CAP) {
      const fell = queue.findIndex(p => p.kind !== 'boss');
      queue.splice(fell < 0 ? 0 : fell, 1);
      strikes++;
      marks.push('⬛');
      feedback('−1 ♥', 'bad');
      buzz(40);
      if (strikes >= RUSH_HOUR_STRIKES) { end(false); return; }
    }
    const p = nextFromBelt();
    if (!active) { active = p; selected = null; peeled = 0; } else queue.push(p);
    deliverTotal = deliveryMs(elapsed, levels) / 1000;
    deliverIn = deliverTotal;
    renderAll();
  }

  function nextParcel() {
    active = queue.length ? queue.shift()! : null;
    selected = null; peeled = 0;
    phase = 'play';
    renderAll();
    lastTick = performance.now();
  }

  function tick() {
    if (disposed || phase !== 'play') { lastTick = performance.now(); return; }
    const now = performance.now();
    const dt = Math.min(0.3, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    elapsed += dt;
    if (!bossSpawned && elapsed >= RUSH_HOUR_BOSS_AT) {
      bossSpawned = true;
      const boss = shiftBoss(shift.day);
      if (!active) { active = boss; selected = null; peeled = 0; } else queue.unshift(boss);
      banner(T.bossIncoming);
      buzz([30, 40, 30]);
      renderAll();
    }
    deliverIn -= dt;
    if (deliverIn <= 0) { deliver(); if (phase !== 'play') return; }
    if (strikes >= RUSH_HOUR_STRIKES) { end(false); return; }
    if (elapsed >= RUSH_HOUR_DURATION) { end(false); return; }
    updateStats();
    const bar = q<HTMLElement>('#rh-belt-bar');
    bar.style.width = Math.min(100, Math.max(0, (1 - deliverIn / deliverTotal) * 100)) + '%';
  }

  function selectSeries(id: string) {
    if (phase !== 'play' || !active) return;
    selected = id;
    renderCounter();
    renderPick();
    buzz(8);
    clearTimeout(autoCutTimer);
    if (active.kind !== 'boss' && (levels.scissors || 0) > 0) {
      autoCutTimer = window.setTimeout(() => {
        if (phase === 'play' && active && selected === id) cut();
      }, 320);
    }
  }

  function cut() {
    if (phase !== 'play' || !active) return;
    if (active.kind === 'boss' && peeled < active.layers) {
      peeled++;
      feedback(fill(T.layer, { n: peeled, max: active.layers }), 'info');
      buzz(12);
      renderCounter();
      renderPick();
      return;
    }
    if (!selected) { feedback(T.pickHint, 'info'); return; }
    resolve(active.kind !== 'decoy' && selected === active.series, 'cut');
  }

  function sendBack() {
    if (phase !== 'play' || !active || active.kind === 'boss') return;
    resolve(active.kind === 'decoy', 'return');
  }

  function resolve(right: boolean, how: 'cut' | 'return') {
    const p = active!;
    const gained = scoreFor(p, right, right ? combo + 1 : 1, levels);
    score += gained;
    opened++;
    if (right) {
      correct++;
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      toolProgress++;
    } else {
      combo = 0;
    }
    marks.push(!right ? '🟥' : p.kind === 'boss' ? '🎁' : p.kind === 'decoy' ? '🟨' : '🟩');
    if (p.kind === 'boss') bossOpened = true;
    phase = 'reveal';
    selected = null; peeled = 0;
    clearTimeout(autoCutTimer);
    updateStats();
    let msg: string;
    if (p.kind === 'decoy') msg = right ? fill(T.caught, { n: gained }) : fill(T.decoyMissed, { p: p.postmark });
    else if (how === 'return') msg = fill(T.notDecoy, { s: seriesName(p.series) });
    else msg = right ? fill(T.correct, { n: gained }) : fill(T.wrong, { s: seriesName(p.series) });
    renderReveal(p, right, gained, msg);
    feedback(msg, right ? 'good' : 'bad');
    buzz(right ? [20, 30, 20] : 35);
    clearTimeout(revealTimer);
    revealTimer = window.setTimeout(() => {
      if (bossOpened) { end(true); return; }
      if (strikes >= RUSH_HOUR_STRIKES) { end(false); return; }
      if (elapsed >= RUSH_HOUR_DURATION) { end(false); return; }
      if (toolProgress >= toolThreshold(toolPicks)) {
        toolProgress -= toolThreshold(toolPicks);
        offer = shiftOffer(shift.day, toolPicks, levels);
        toolPicks++;
        if (offer.length) { phase = 'tool'; renderToolPanel(); return; }
      }
      nextParcel();
    }, p.kind === 'boss' ? 2200 : 1500);
  }

  function renderReveal(p: TrayParcel, right: boolean, gained: number, msg: string) {
    let body: string;
    if (p.kind === 'decoy') {
      body = '<div class="rh-reveal-art"><span class="rh-emoji">↩️</span></div>' +
        '<h2>' + esc(T.decoyTitle) + '</h2><p class="rh-note">' + esc(fill(T.decoyNote, { p: p.postmark })) + '</p>';
    } else if (p.kind === 'boss' && p.prize) {
      const [name, note] = keepsakeCopy(p.prize);
      body = '<div class="rh-reveal-art rh-keepsake"><span class="rh-emoji">' + esc(RUSH_ITEM[p.prize].e) + '</span></div>' +
        '<span class="rh-rarity r-secret">' + esc(T.keepsake) + '</span>' +
        '<h2>' + esc(name) + '</h2><p class="rh-note">“' + esc(note) + '”</p>';
    } else {
      const item = ITEMS[p.item];
      const [name, note] = itemCopy(p.item);
      const art = item.img
        ? '<img src="' + esc(opts.baseUrl + item.img) + '" alt="" width="400" height="400" decoding="async">'
        : '<span class="rh-emoji">' + esc(item.e) + '</span>';
      body = '<div class="rh-reveal-art">' + art + '</div>' +
        '<span class="rh-rarity r-' + p.rarity + '">' + esc(ui(p.rarity)) + '</span>' +
        '<h2>' + esc(name) + '</h2><p class="rh-note">“' + esc(note) + '”</p>' +
        '<p class="rh-learn">' + SOUND_ICON[item.snd] + ' ' + esc(fill(T.learn, { s: soundShort(item.snd), a: item.w[0], b: item.w[1] })) + '</p>';
    }
    const tag = p.kind === 'decoy' ? p.postmark : seriesName(p.series);
    stage.innerHTML = '<div class="rh-reveal ' + (right ? 'right' : 'wrong') + (p.kind === 'boss' ? ' boss' : '') + '">' + body +
      (gained ? '<div class="rh-gain">+' + gained + ' <small>' + esc(T.score) + '</small></div>' : '') +
      '<div class="rh-right">' + (right ? '✓ ' : '✕ ') + esc(tag) + '</div></div>';
    clues.innerHTML = '<div class="rh-clue-title">' + esc(T.clues) + '</div>' +
      visibleClues(p, levels, p.layers).map(c => clueChip(c, p)).join('');
    pick.innerHTML = '<p class="rh-pick-hint">' + esc(msg) + '</p>';
  }

  function takeTool(id: TrayToolId) {
    if (phase !== 'tool' || !offer.includes(id) || performance.now() - offerAt < 600) return;
    levels = applyTool(levels, id);
    phase = 'play';
    panel('');
    nextParcel();
    feedback(TOOL_ICON[id] + ' ' + fill(T.toolLevel, { n: levels[id] || 1 }), 'good');
  }

  function pause() {
    if (phase !== 'play') return;
    phase = 'pause';
    renderPausePanel();
  }

  function resume() {
    if (phase !== 'pause') return;
    phase = 'play';
    panel('');
    lastTick = performance.now();
  }

  function end(win: boolean) {
    if (phase === 'end') return;
    phase = 'end';
    clearTimeout(revealTimer);
    clearTimeout(autoCutTimer);
    const accuracy = opened ? correct / opened : 0;
    const grade = gradeFor(win, accuracy, strikes);
    const result: RushResult = { score, grade, opened, correct, win };
    const reward = opts.finish(shift.day, official, result);
    shareText = rushShare(T.shareTitle, shift.n, result, marks);
    renderEnd(result, accuracy, reward);
  }

  // ---------- panels ----------
  function prizeCard(): string {
    const it = RUSH_ITEM[shift.prize];
    const [name] = keepsakeCopy(shift.prize);
    return '<div class="rh-prize' + (shift.prizeOwned ? ' owned' : '') + '"><span class="rh-prize-e">' + esc(it.e) + '</span><span><small>' + esc(T.prizeLine) + '</small><b>' + esc(name) + '</b>' +
      '<em>' + esc(shift.prizeOwned ? T.prizeOwned : T.prizeNew) + '</em></span></div>';
  }

  function introPanel() {
    shift = opts.today();
    const mode = shift.official
      ? T.officialNote
      : fill(T.practiceNote, { stars: starsOf(shift.result ? shift.result.grade : 0), score: shift.result ? shift.result.score : 0 });
    panel('<p class="rh-panel-kicker">' + esc(fill(T.shiftNo, { n: shift.n })) + ' · ' + esc(shift.official ? T.officialTag : T.practiceTag) + '</p><h2>' + esc(T.title) + '</h2>' +
      prizeCard() +
      '<ol class="rh-steps">' + T.steps.map((s, i) => '<li><b>' + (i + 1) + '</b><span>' + esc(s) + '</span></li>').join('') + '</ol>' +
      '<p class="rh-small">' + esc(T.pressure) + '</p>' +
      '<p class="rh-small rh-proto">' + esc(mode) + '</p>' +
      '<div class="rh-panel-actions"><button class="btn" data-rh="start">' + esc(T.start) + '</button><button class="btn ghost" data-rh="exit">' + esc(T.back) + '</button></div>');
  }

  function renderPausePanel() {
    panel('<h2>' + esc(T.paused) + '</h2><div class="rh-panel-actions"><button class="btn" data-rh="resume">' + esc(T.resume) + '</button><button class="btn ghost" data-rh="exit">' + esc(T.back) + '</button></div>');
  }

  function renderToolPanel() {
    offerAt = performance.now();
    const cards = offer.map(id => {
      const lv = levels[id] || 0;
      const next = lv + 1;
      return '<button class="rh-tool" data-tool="' + id + '"><span class="rh-tool-icon">' + TOOL_ICON[id] + '</span>' +
        '<b>' + esc(T.tools[id][0]) + '</b><span class="rh-tool-lv">' + (lv >= TOOL_MAX ? esc(T.toolMax) : esc(fill(T.toolLevel, { n: next }))) + '</span>' +
        '<span class="rh-tool-desc">' + esc(T.tools[id][1]) + '</span><span class="rh-tool-take">' + esc(T.toolTake) + '</span></button>';
    }).join('');
    panel('<p class="rh-panel-kicker">' + esc(T.kicker) + '</p><h2>' + esc(T.toolTitle) + '</h2><p class="rh-small">' + esc(T.toolHint) + '</p><div class="rh-tools">' + cards + '</div>');
  }

  function renderEnd(result: RushResult, accuracy: number, reward: RushFinishResult) {
    const win = result.win;
    const title = win ? T.win : (strikes >= RUSH_HOUR_STRIKES ? T.lose : T.timeUp);
    const note = win ? T.winNote : (strikes >= RUSH_HOUR_STRIKES ? T.loseNote : T.timeUpNote);
    const stars = starsOf(result.grade);
    const build = (Object.keys(levels) as TrayToolId[]).filter(id => levels[id]).map(id =>
      '<span class="rh-chip">' + TOOL_ICON[id] + ' ' + esc(T.tools[id][0]) + ' ' + (levels[id] === TOOL_MAX ? esc(T.toolMax) : esc(fill(T.toolLevel, { n: levels[id] || 1 }))) + '</span>').join('') || '—';
    const rewards: string[] = [];
    if (reward.prize) rewards.push('<span class="rh-reward prize">' + esc(fill(T.rewardPrize, { e: RUSH_ITEM[reward.prize].e, name: keepsakeCopy(reward.prize)[0] })) + '</span>');
    if (official) rewards.push('<span class="rh-reward">💠 ' + esc(fill(T.rewardShards, { n: reward.shards })) + '</span>');
    else if (reward.coins > 0) rewards.push('<span class="rh-reward">🪙 ' + esc(fill(T.rewardPracticeCoins, { n: reward.coins })) + '</span>');
    else rewards.push('<span class="rh-reward muted">' + esc(T.rewardPracticeNone) + '</span>');
    panel('<p class="rh-panel-kicker">' + esc(fill(T.shiftNo, { n: shift.n })) + ' · ' + esc(official ? T.officialTag : T.practiceTag) + '</p><h2>' + (win ? '🏆 ' : '📦 ') + esc(title) + '</h2>' +
      '<div class="rh-grade" aria-label="' + esc(stars) + '">' + stars + '</div><p>' + esc(note) + '</p>' +
      '<div class="rh-rewards">' + rewards.join('') + '</div>' +
      '<div class="rh-marks" aria-hidden="true">' + esc(marks.slice(0, 16).join('')) + '</div>' +
      '<div class="rh-end-stats"><span><b>' + opened + '</b>' + esc(T.opened) + '</span><span><b>' + correct + '</b>' + esc(T.correctCount) + '</span>' +
        '<span><b>' + bestCombo + '</b>' + esc(T.bestCombo) + '</span><span><b>' + Math.round(accuracy * 100) + '%</b>' + esc(T.accuracy) + '</span>' +
        '<span><b>' + result.score + '</b>' + esc(T.score) + '</span></div>' +
      '<p class="rh-small">' + esc(T.build) + '</p><div class="rh-build">' + build + '</div>' +
      '<div class="rh-panel-actions"><button class="btn" data-rh="share">' + esc(T.share) + '</button><button class="btn ghost" data-rh="replay">' + esc(T.replay) + '</button><button class="btn ghost" data-rh="exit">' + esc(T.back) + '</button></div>' +
      '<textarea class="rh-share-text" readonly rows="3" hidden>' + esc(shareText) + '</textarea>');
  }

  function share() {
    const box = panelWrap.querySelector('.rh-share-text') as HTMLTextAreaElement | null;
    const fallback = () => { if (box) { box.hidden = false; box.select(); } };
    try {
      navigator.clipboard.writeText(shareText).then(() => feedback(T.copied, 'good'), fallback);
    } catch { fallback(); }
  }

  // ---------- input ----------
  const offs: Array<() => void> = [];
  const on = (el: EventTarget, type: string, fn: EventListener, opt?: AddEventListenerOptions) => {
    el.addEventListener(type, fn, opt); offs.push(() => el.removeEventListener(type, fn, opt));
  };

  on(root, 'click', (event => {
    const e = event as MouseEvent;
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.series) { selectSeries(b.dataset.series); return; }
    if (b.dataset.tool) { takeTool(b.dataset.tool as TrayToolId); return; }
    const act = b.dataset.rh;
    if (act === 'cut') {
      if (swipeUsed) { swipeUsed = false; return; }
      cut(); return;
    }
    if (act === 'return') { sendBack(); return; }
    if (act === 'start' || act === 'replay') { startRun(); return; }
    if (act === 'share') { share(); return; }
    if (act === 'resume') { resume(); return; }
    if (act === 'pause') { pause(); return; }
    if (act === 'exit') { opts.onExit(); return; }
  }) as EventListener);

  on(document, 'keydown', (event => {
    const e = event as KeyboardEvent;
    const code = e.code;
    // CrazyGames: Esc belongs to the browser (it leaves fullscreen), so it must not pause. P and the on-screen
    // pause button stay. Letter and digit shortcuts use e.code, so they also work on AZERTY keyboards.
    if (phase === 'intro') { if (code === 'Enter' || code === 'Space') { e.preventDefault(); startRun(); } return; }
    if (code === 'KeyP') { e.preventDefault(); e.stopPropagation(); if (phase === 'play') pause(); else if (phase === 'pause') resume(); return; }
    const digit = /^Digit([1-4])$/.exec(code);
    if (digit) {
      const n = Number(digit[1]);
      if (phase === 'tool' && n <= 3) { const id = offer[n - 1]; if (id) { e.preventDefault(); takeTool(id); } return; }
      if (phase === 'play' && n <= 3) { const id = SERIES_IDS[n - 1]; if (id) { e.preventDefault(); selectSeries(id); } return; }
      if (phase === 'play' && n === 4) { e.preventDefault(); sendBack(); return; }
    }
    if (phase === 'play' && code === 'Backspace') { e.preventDefault(); sendBack(); return; }
    if (phase === 'play' && (code === 'Enter' || code === 'Space')) { e.preventDefault(); cut(); }
  }) as EventListener, { capture: true });

  on(stage, 'pointerdown', (event => {
    const e = event as PointerEvent;
    if (!(e.target as HTMLElement).closest('[data-rh="cut"]')) return;
    swipeStart = e.clientX;
  }) as EventListener);
  on(stage, 'pointerup', (event => {
    const e = event as PointerEvent;
    if (swipeStart != null && Math.abs(e.clientX - swipeStart) > 36 && phase === 'play') {
      swipeUsed = true;
      cut();
      window.setTimeout(() => { swipeUsed = false; }, 50);
    }
    swipeStart = null;
  }) as EventListener);
  on(stage, 'pointercancel', (() => { swipeStart = null; }) as EventListener);
  on(document, 'visibilitychange', (() => { if (document.hidden) pause(); }) as EventListener);
  on(window, 'blur', (() => { pause(); }) as EventListener);

  // ---------- boot ----------
  reset();
  phase = 'intro';
  q('#rh-mode').textContent = fill(T.shiftNo, { n: shift.n });
  introPanel();

  const debug = import.meta.env.DEV ? {
    skipTo(seconds: number) { elapsed = seconds; },
    give(id: TrayToolId, n = 1) { for (let i = 0; i < n; i++) levels = applyTool(levels, id); renderAll(); },
    state() {
      return {
        phase, elapsed, score, combo, strikes, opened, correct, official, queue: queue.length, bossSpawned, bossOpened, marks: marks.join(''),
        active: active ? { kind: active.kind, series: active.series, clues: visibleClues(active, levels, peeled), fits: candidates(active, visibleClues(active, levels, peeled)) } : null,
        levels: { ...levels },
      };
    },
  } : null;
  const dbg = window as unknown as { __parcelRush?: unknown };
  if (debug) dbg.__parcelRush = debug;

  return () => {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    clearTimeout(revealTimer); clearTimeout(feedbackTimer); clearTimeout(bannerTimer); clearTimeout(autoCutTimer);
    offs.forEach(f => f());
    if (debug) delete dbg.__parcelRush;
    root.remove();
    document.body.classList.remove('rush-active');
  };
}
