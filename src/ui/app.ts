// @ts-nocheck
// Screens, sheets and sound. Ported from the prototype's UI script with three changes:
//   1. save/load and language preference go through the Platform interface,
//   2. the developer panel (unlock all, demo luck, reset) only renders in dev builds,
//   3. the artifact hot-reload hooks are gone,
//   4. age screen, account page and cloud save sync (see the "account" section),
//   5. the Town page: daily mystery parcel, resident requests and neighbor stories,
//   6. ad-supported hosts (platform.ads, e.g. CrazyGames): free rewards for an ad or coins instead of the shop, break ads (see "ads").
// Type checking is off for this file for now; core/ is fully typed. Tightening this file is a later step.
import { CONFIG } from '../core/config';
import { RARITIES, RANK, SERIES, ITEMS, newState, rarityWeights, rollParcel, makeParcel, deliver, seriesProgress,
  recycleExtras, extrasValue, exchangeItem, binCount, mysteryEvery, openResidents, townLevel, localDay } from '../core/logic';
import { hasFeature, levelProgress, unlocksAt, claimLevelUp, syncUnlocks, eventToday, perkOn, townDeliver, townOpen, deliverTo,
  townDailyGuess, giftedToday, giveGift, xrayPrice, payXray, PERK_RESIDENTS, MAX_LEVEL } from '../core/town';
import { LANGS, UI, CONTENT } from '../i18n/strings';
import type { Platform } from '../platform/types';
import { cleanShareUrl } from '../platform/url';
import { FIRST_GOAL_IDS, HINT_IDS } from '../core/types';
import type { Backend } from '../auth';
import { checkAge, yearOptions, UNDER_AGE_POLICY } from '../core/age';
import { planMerge, keepOne } from '../core/merge';
import { sanitizeState } from '../core/sanitize';
import { spares, talesUnlocked } from '../core/requests';
import { refreshBoard, boardNote, claimTask, claimable, taskDone, fulfillWish, addWishes } from '../core/board';
import { refreshQuests, upgradeQuests, questNote, claimQuest, questDone, questClaimable, QUEST_ICON } from '../core/quests';
import { canCheckIn, checkIn } from '../core/checkin';
import { streakBonus } from '../core/streak';
import { reactionFor } from '../core/reactions';
import { DECOR, decorPrice, decorOpen, decorOwned, buyDecor, toggleDecor, shownDecor } from '../core/decor';
import { dailyPool, dailyStatus, dailyShare } from '../core/daily';
import { BUILDINGS, STREET_STEPS, STREET_COINS, streetProgress, buildingSteps, buildingDone, buildingOpen, claimStreet } from '../core/street';
import { storyById, refreshStory, addPages, chaptersOpen, unread, pagesToNext, markRead } from '../core/story';
import { weekOf } from '../core/story';
import { earnCarry, carrySent, carryReceived, carryThanks, guildNext, guildClaim, carryCode, parseCarry } from '../core/social';
import { noteVisit, noteOpen, noteDaily, noteShare, metricsSummary } from '../core/metrics';
import { RUSH_ITEMS, rushToday, rushBegin, rushFinish, rushPracticeLeft } from '../core/rushHour';
import { weekTheme } from '../core/run';
import { weekStart, weekLoad, weekAct, weekFinish, weekAbandon, weekBuy, weekSeed, weekEventStatus } from '../core/week';
import { weekShareText, weekText } from '../week/strings';
import { AD_REWARDS, AD_RULES, rewardedStatus, recordRewarded, rewardRoom, grantReward, buyWithCoins, midgameDue, sanitizeLedger } from '../core/ads';
import { installIcons } from './icons';
import { vibrate } from './haptics';
import { startMusic } from './music';
import { createMaster, duckMusic as duckMusicBus, MUSIC_LEVEL, playSfx as playSfxBus, playTag as playTagBus, setMasterMuted } from './sfx';

/** Starts the game in the page. Returns a function that removes its listeners and timers (used by tests). */
export function startApp(platform: Platform, devTools: boolean, backend?: Backend): () => void {
  const offs = [];
  const icons = installIcons(document.body);
  offs.push(() => icons.disconnect());
  // iOS only allows audio after a user gesture. The first tap or key marks the moment; music starts then, never on load.
  // Window capture phase: this runs before any element's own handler, so a first Enter/Space on the tape (whose
  // keydown handler plays the tape sound) is not silent. Removal must use the same capture flag.
  const firstGesture = () => { wakeAudio(); };
  window.addEventListener('pointerdown', firstGesture, { once: true, capture: true });
  window.addEventListener('keydown', firstGesture, { once: true, capture: true });
  offs.push(() => {
    window.removeEventListener('pointerdown', firstGesture, true);
    window.removeEventListener('keydown', firstGesture, true);
    if (musicStop) { musicStop(); musicStop = null; }
  });
  // Bad art in a deploy still leaves a working card: a neighbour portrait falls back to the drawn face icon,
  // an event banner drops back to the plain icon row, and a guide picture falls back to its emoji.
  const artFallback = (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    // Already on the fallback: stop here, or a missing face.svg would retry forever.
    if (t.classList.contains('face')) { if (t.classList.contains('fallback')) return; t.src = 'icons/face.svg'; t.classList.add('fallback'); return; }
    if (t.classList.contains('ev-banner')) {
      const card = t.closest('.event-card, .week-card');
      if (card) card.classList.remove('has-banner');
      t.remove();
      return;
    }
    if (t.classList.contains('coach-guide')) {
      const span = document.createElement('span');
      span.className = 'coach-ico'; span.setAttribute('aria-hidden', 'true');
      span.textContent = t.getAttribute('data-ico') || '👆';
      t.replaceWith(span);
    }
  };
  window.addEventListener('error', artFallback, true);
  offs.push(() => window.removeEventListener('error', artFallback, true));
  const timer = { iv: null, ad: null };
  function on(type, fn) { document.addEventListener(type, fn); offs.push(() => document.removeEventListener(type, fn)); }
  const rng = Math.random;
  let state, view = 'station', albumTab = null, sheet = null, lang = 'en';
  let shownView = null, enterTimer = null;
  // First-run coaching happens in the game itself (no popup): one short, icon-led tip at a time.
  // coachStep: parcel > clue > series > open > tape > reveal. veteran is decided once from the loaded
  // save, so opening the first parcel does not unlock every system before the first reveal.
  let coachStep = null, coachActive = false, coachTimer = null, veteran = false;
  // M1 onboarding: one-time feature tips, and the three short goals after the first parcel.
  let hintActive = null, hintHold = false;
  // CrazyGames ships a fixed stage: each page keeps one small panel set on screen and puts the rest behind tabs,
  // so no page scrolls at the platform's 800x450 to 1920x1080 windows. Other builds keep the full scrolling page.
  const cgStage = platform.features.stageLayout;
  const stageTab: Record<string, string> = { station: 'today', town: 'board', shop: 'rewards' };
  const wallet = { coins: null, shards: null };
  let rushOff = null, rushLoading = false;
  // Rush Hour runs on every build (web, Discord, CrazyGames) from town Lv2.
  const rushOn = () => !!state && hasFeature(state, 'rush');
  // Station Week (the roguelite shift mode) opens at Lv4 on every build; dev builds always show it for playtests.
  let weekOff = null, weekLoading = false;
  const weekOn = () => platform.features.week && !!state && (townLevel(state) >= CONFIG.weekLevel || devTools);
  const RUSH_NEW = 'parcelwood.rushNew';
  // Ads can sit beside a paid shop (phone app) or replace it (CrazyGames). The feature decides the shop shape.
  const ads = platform.ads || null, host = platform.host || null;
  const adsOn = !!ads, adMode = platform.features.shop === 'rewards-only';
  const AD_LEDGER = 'parcelwood.adLedger';
  // M1: "remove ads" is simulated by a developer switch. M2 replaces this with the server entitlement.
  const NOADS = 'parcelwood.noads';
  // A guest's gem ticket (0004): minted before switching accounts, redeemed once the full account is in.
  const GUEST_TICKET = 'parcelwood.guestTicket';
  let adPlaying = false, adBusy = false, opensSinceBreak = 0;
  let newFinds = 0; // album badge: new items found since the album was last opened (this session only, never saved)
  const sessionStart = Date.now();
  // Station Week asks the platform clock first. The web build anchors it to the host's HTTP date, so changing the
  // phone clock does not open the weekend early; without a host clock it falls back to the device.
  const nowMs = () => (platform.time ? platform.time.now() : Date.now());

  // Storage and language preference go through the platform layer (web: browser storage; phone: later).
  function load() { return sanitizeState(platform.loadState()); } // a malformed device save starts a new game
  // save() is for player progress: it marks the save as changed and uploads it. Automatic saves (start, deliveries) use saveQuiet().
  function save() { platform.saveState(state); markDirty(); schedulePush(); }
  function saveQuiet() { platform.saveState(state); }
  function pickLang() {
    const s = platform.loadLang(); if (s && Object.prototype.hasOwnProperty.call(UI, s)) return s;
    for (const l of platform.preferredLanguages()) { const p = String(l).toLowerCase().slice(0, 2); if (Object.prototype.hasOwnProperty.call(UI, p)) return p; }
    return 'en';
  }
  function setLang(l) { if (!Object.prototype.hasOwnProperty.call(UI, l)) return; lang = l; platform.saveLang(l); document.documentElement.lang = l === 'zh' ? 'zh-Hans' : l; }

  // ---------- i18n ----------
  function t(key, vars) {
    let s = (UI[lang] && UI[lang][key] != null) ? UI[lang][key] : UI.en[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }
  const wfill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  const stars = n => '★'.repeat(Math.max(0, n)) + '☆'.repeat(Math.max(0, 3 - n));
  const C = () => CONTENT[lang];
  const sName = s => C() ? C().series[s.id][0] : s.name;
  const sPost = s => C() ? C().series[s.id][1] : s.postmark;
  const sShop = s => C() ? C().series[s.id][2] : s.shop;
  const iName = it => C() ? C().items[it.id][0] : it.name;
  const iNote = it => C() ? C().items[it.id][1] : it.note;
  // A decoration's picture and name: an album display model uses the item's, a station piece uses its own.
  const decorName = d => d.item && ITEMS[d.item] ? iName(ITEMS[d.item]) : ((t('decorNames') || {})[d.id] || d.id);
  const decorImg = d => d.img || (d.item && ITEMS[d.item] ? ITEMS[d.item].img : '');
  const rName = r => C() ? C().residents[r.id][0] : r.name;
  const rStory = r => C() ? C().residents[r.id][1] : r.story;
  const rTale = (r, i) => C() ? C().residents[r.id][2][i] : r.tales[i];
  const RL = r => t(r);

  // ---------- audio ----------
  // Everything runs through one warm master bus: a gentle low-pass keeps the harsh top end out, and a compressor
  // evens the clicks against the deeper thuds so no single sound jumps out. The music loop is synthesized (0 KB).
  // Mobile autoplay: the first gesture creates the AudioContext. A hidden tab suspends it; the next user gesture
  // resumes it. iOS can also report 'interrupted' (a call or the lock screen), so the resume check covers every
  // state that is neither running nor closed.
  let ac = null, bus = null, musicGain = null, musicStop = null, gestureSeen = false, hiddenTab = false;
  const canHear = () => !!state && !state.muted && !adPlaying && !hiddenTab && !(host && host.muted());
  // A context that was suspended freezes its already-scheduled notes. Drop the old bus before resuming, so returning
  // from the background or from mute never plays a burst of catch-up notes.
  function resetMaster() {
    if (!bus) return;
    try { bus.gain.value = 0; } catch (e) { /* ignore */ }
    try { bus.disconnect(); } catch (e) { /* ignore */ }
    bus = null; musicGain = null;
  }
  function audio() {
    if (!canHear()) return null; // no game yet on the age screen; silent during ads, while hidden, and when muted
    // Browsers only allow an AudioContext to start after a user gesture. Creating one earlier logs an
    // "AudioContext was not allowed to start" warning and leaves it suspended, so wait for the first tap/key.
    if (!gestureSeen) return null;
    try {
      if (ac && ac.state === 'closed') { resetMaster(); ac = null; }
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state !== 'running' && ac.state !== 'closed') { resetMaster(); ac.resume(); }
    } catch (e) { ac = null; }
    return ac;
  }
  function master(ctx) {
    if (bus) return bus;
    bus = createMaster(ctx);
    return bus;
  }
  function duckMusic() { duckMusicBus(ac, musicGain); }
  // Stop the scheduler and fade the whole bus to zero, then suspend. Already-scheduled notes stop at once because the
  // master gain reaches 0 in 35 ms, so the mute button does not wait for a 6.8 s chord to ring out.
  function silenceAudio() {
    if (musicStop) { musicStop(); musicStop = null; }
    if (ac && bus) setMasterMuted(ac, bus, true);
    try { if (ac && ac.state === 'running') ac.suspend(); } catch (e) { /* ignore */ }
  }
  function startMusicLoop() {
    if (musicStop) return;
    const ctx = audio(); if (!ctx) return;
    if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = MUSIC_LEVEL; musicGain.connect(master(ctx)); }
    musicStop = startMusic(ctx, musicGain, () => !canHear());
  }
  function tryMusic() { if (gestureSeen) startMusicLoop(); }
  // Resume inside a real gesture (pointerup / touchend / keydown), as iOS requires. A hidden tab stays quiet until
  // then; turning the page visible does not start audio by itself.
  function wakeAudio() {
    gestureSeen = true;
    if (!canHear()) return;
    const stale = !ac || ac.state !== 'running';
    audio();
    if (stale) tryMusic();
  }
  on('pointerup', wakeAudio);
  on('touchend', wakeAudio);
  on('keydown', wakeAudio);
  on('visibilitychange', () => {
    if (document.hidden) { hiddenTab = true; silenceAudio(); }
    else hiddenTab = false; // still suspended: the next gesture wakes it
  });
  function playTag(tag) {
    const ctx = audio(); if (!ctx) return;
    duckMusic();
    playTagBus(ctx, master(ctx), tag);
  }
  function sfx(name) {
    const ctx = audio(); if (!ctx) return;
    duckMusic();
    playSfxBus(ctx, master(ctx), name);
  }
  function prefersReducedMotion() {
    try { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function buzz(p) { if (prefersReducedMotion()) return; vibrate(p); }

  // ---------- helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RICON = { common: '●', rare: '◆', epic: '★', secret: '✦' };
  const GLOWCLS = { 'moon-pudding': 'glow-moon', 'gold-top': 'glow-gold', 'rain-city': 'glow-rain', 'golden-pumpkin': 'glow-gold', 'paper-crane': 'glow-crane' };
  // Item art: the painted WebP when there is one, the emoji otherwise. glow=false for silhouettes (missing cards, X-ray).
  function art(it, glow) {
    if (!it.img) return it.e;
    return '<img class="itm' + (glow && GLOWCLS[it.id] ? ' ' + GLOWCLS[it.id] : '') + '" src="' + it.img + '" width="400" height="400" loading="lazy" decoding="async" alt="" draggable="false">';
  }
  const COLORWORD = { snacks: 'cOrange', toys: 'cTeal', souvenirs: 'cPink', garden: 'cGreen', market: 'cPurple' };
  const pct = x => (Math.round(x * 1000) / 10) + '%';
  // Town pages use ounces only, so clues read in the same unit as item ranges ("16–20 oz").
  const oz = n => (Number.isInteger(n) ? n : n.toFixed(1)) + ' oz';
  function fmtWeight(oz) { if (oz < 16) return oz.toFixed(1) + ' oz'; const lb = Math.floor(oz / 16); return lb + ' lb ' + (oz - lb * 16).toFixed(1) + ' oz'; }
  function rbadge(r) { return '<span class="rbadge rb-' + r + '"><span aria-hidden="true">' + RICON[r] + '</span>' + esc(RL(r)) + '</span>'; }
  function toast(msg) {
    const root = $('#toast-root'); root.innerHTML = '<div class="toast">' + esc(msg) + '</div>';
    clearTimeout(toast.tm); toast.tm = setTimeout(() => { root.innerHTML = ''; }, 2200);
  }
  function clock(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  const resById = id => CONFIG.residents.find(r => r.id === id);
  function dur(ms) { const m = Math.max(0, Math.ceil(ms / 60000)); return t('dur', { h: Math.floor(m / 60), m: m % 60 }); }
  function untilTomorrow() { const n = new Date(); return dur(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n); }
  function nextMysteryIn() {
    if (binCount(state) >= CONFIG.mysteryMax) return null;
    return dur(state.lastMystery + mysteryEvery(state) - Date.now());
  }

  // ---------- first-run coach and progressive first screen ----------
  // An existing save keeps every system on screen. Only a genuinely new save hides the extra systems
  // until the first reveal (or Lv2), so nobody who already has progress loses features.
  function hasPlayed(s) {
    if (!s) return false;
    return !!(s.introSeen || s.guideSeen || s.stats.opened > 0 || Object.keys(s.owned || {}).length ||
      (s.town && (s.town.level > 1 || s.town.rep > 0)) ||
      (s.checkin && s.checkin.stamps > 0) || (s.board && s.board.stamps > 0) ||
      (s.quests && (s.quests.list || []).some(q => q.claimed || q.got > 0)) ||
      (s.streak && s.streak.n > 0) || (s.daily && (s.daily.guesses || []).length > 0));
  }
  function systemsOn() { return veteran || !state || state.stats.opened > 0 || townLevel(state) >= 2; }
  // Mr. Dube, the retired postman, is the guide. He points at each step and cheers on the reveal.
  const COACH = {
    parcel: { sel: '[data-guide="parcel"]', pose: 'point', icon: '👆', text: 'coachParcel', hint: 'coachHintParcel' },
    clue: { sel: '.tools button:not([disabled])', pose: 'point', icon: '🔊', text: 'coachClue', hint: 'coachHintClue' },
    series: { sel: '.pick.crates [data-gs]', pose: 'point', icon: '🎯', text: 'coachSeries', hint: 'coachHintSeries' },
    open: { sel: '#go-open', pose: 'point', icon: '✂️', text: 'coachOpen', hint: 'coachHintOpen' },
    tape: { sel: '#tape', pose: 'point', icon: '➡️', text: 'coachTape', hint: 'coachHintTape' },
    reveal: { sel: '#next-parcel', pose: 'cheer', icon: '🎉', text: 'coachReveal', hint: '' },
  };
  function guideImg(pose, icon) {
    return '<img class="coach-guide" src="ui/guide-' + esc(pose) + '.webp" width="256" height="256" alt="" aria-hidden="true" data-ico="' + esc(icon) + '" draggable="false">';
  }
  function clearCoachTargets(target) {
    document.querySelectorAll('.coach-target').forEach(el => { if (el !== target) el.classList.remove('coach-target'); });
  }
  // Short screens: the target can sit below the fold inside the scrolling sheet. Bring it into view first,
  // otherwise the bubble points at something nobody can see.
  function scrollTargetIntoView(target) {
    const vh = window.innerHeight || 600, margin = 12;
    let el = target.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      if (scrolls) {
        const tr = target.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (tr.top < er.top + margin || tr.bottom > er.bottom - margin) {
          const delta = (tr.top + tr.bottom) / 2 - (er.top + er.bottom) / 2;
          const max = el.scrollHeight - el.clientHeight;
          el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + delta));
        }
        return;
      }
      el = el.parentElement;
    }
    const r = target.getBoundingClientRect();
    if (r.top < margin || r.bottom > vh - margin) {
      const delta = (r.top + r.bottom) / 2 - vh / 2;
      if (window.scrollY + delta >= 0) window.scrollBy(0, delta);
    }
  }
  function placeBubble(bubble, target) {
    // The delayed re-placements below can fire after the player moved on. A detached target measures as all
    // zeros, which would scroll the page half a screen up, so skip anything no longer on the page.
    if (!bubble || !target || !bubble.isConnected || !target.isConnected) return;
    scrollTargetIntoView(target);
    const vw = window.innerWidth || 800, vh = window.innerHeight || 600, margin = 8;
    const bw = Math.min(290, Math.max(180, vw - 24));
    bubble.style.width = bw + 'px';
    bubble.style.top = '0px';
    // Measure the real bubble after it is in the DOM. The guide picture can make it taller or shorter than the
    // old emoji row, so a fixed 96 px guess would sometimes cover the target.
    const bh = bubble.offsetHeight || 96;
    const r = target.getBoundingClientRect();
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(margin, Math.min(vw - bw - margin, left));
    let top = r.bottom + 12;
    // No room below? Put it above the target. If neither side fits (a very short screen), keep it on screen.
    if (top + bh > vh - margin) {
      const above = r.top - bh - 12;
      top = above >= margin ? above : Math.max(margin, Math.min(vh - bh - margin, top));
    }
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }
  /** Places the bubble now, then again after the guide picture and the web font settle. Without the second pass
   *  a late font swap moves the target and the bubble can end up over it. */
  function placeBubbleSoon(bubble, target) {
    const place = () => placeBubble(bubble, target);
    place();
    const img = bubble && bubble.querySelector('img.coach-guide');
    if (img && !img.complete) img.addEventListener('load', place, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place).catch(() => {});
    // Lazy shelf art and late font swaps move the target by a few dozen pixels after the first paint.
    [150, 400, 900].forEach(ms => setTimeout(place, ms));
  }
  function renderCoach() {
    let root = document.getElementById('coach-root');
    if (!root) { root = document.createElement('div'); root.id = 'coach-root'; document.body.appendChild(root); }
    const target = coachActive && coachStep && COACH[coachStep] ? document.querySelector(COACH[coachStep].sel) : null;
    clearCoachTargets(target);
    if (!coachActive || !coachStep || !COACH[coachStep] || !target) {
      root.innerHTML = ''; document.body.classList.remove('coach-on'); return;
    }
    document.body.classList.add('coach-on');
    target.classList.add('coach-target');
    const spec = COACH[coachStep];
    root.innerHTML = '<button class="coach-skip" id="coach-skip" type="button">' + esc(t('coachSkip')) + '</button>' +
      '<div class="coach-bubble" role="status" aria-live="polite">' + guideImg(spec.pose, spec.icon) +
      '<span class="coach-text">' + esc(t(spec.text)) + '</span>' +
      (spec.hint ? '<span class="coach-kb" aria-hidden="true">' + esc(t(spec.hint)) + '</span>' : '') + '</div>';
    placeBubbleSoon(root.querySelector('.coach-bubble'), target);
  }
  function advanceCoach(step) { if (!coachActive) return; coachStep = step; renderCoach(); }
  function hideHelpDot() { const dot = $('#help .help-dot'); if (dot) dot.remove(); }
  function endCoach() {
    clearTimeout(coachTimer); coachTimer = null;
    coachActive = false; coachStep = null;
    if (state && !state.guideSeen) { state.guideSeen = true; saveQuiet(); }
    hideHelpDot(); renderCoach(); autoHint();
  }

  // One-time feature tips. They reuse the coach bubble, appear one at a time, and never sit on top of a sheet,
  // a level-up popup or an ad. The id is stored in the save, so a tip never fires twice.
  const HINTS = {
    town: { sels: ['#board', '[data-stagetab="town:board"]', '#daily'], icon: '📌', text: 'hintTown' },
    album: { sels: ['.sbook', '.marks'], icon: '📒', text: 'hintAlbum' },
    shop: { sels: ['#decor-shop', '[data-stagetab="shop:decor"]'], icon: '🎨', text: 'hintShop' },
    daily: { sels: ['#today', '[data-stagetab="station:today"]'], icon: '🗓️', text: 'hintDaily' },
    rush: { sels: ['[data-view="rush"]'], icon: '📦', text: 'hintRush' },
    week: { sels: ['[data-stagetab="station:week"]', '.week-card', '#week-open'], icon: '🗓️', text: 'hintWeek' },
  };
  function hintTarget(id) {
    const spec = HINTS[id]; if (!spec) return null;
    for (const sel of spec.sels) { const el = document.querySelector(sel); if (el) return el; }
    return null;
  }
  function hintDone(id) { return !!state && state.hintsSeen.includes(id); }
  function hintForView() {
    if (!state || !state.guideSeen) return null;
    if (veteran && !state.firstGoals.started) return null; // an old save gets no pile of new tips
    if (view === 'town') return !hintDone('town') && hintTarget('town') ? 'town' : null;
    if (view === 'album') return !hintDone('album') && hintTarget('album') ? 'album' : null;
    if (view === 'shop') return !hintDone('shop') && hintTarget('shop') ? 'shop' : null;
    if (view !== 'station' || !systemsOn()) return null;
    for (const id of ['daily', 'rush', 'week']) {
      if (id === 'rush' && !rushOn()) continue;
      if (id === 'week' && !(weekOn() && townLevel(state) >= CONFIG.weekLevel)) continue;
      if (!hintDone(id) && hintTarget(id)) return id;
    }
    return null;
  }
  function hintsSafe() {
    return !!state && !coachActive && !sheet && !hintHold && !adPlaying && !adBusy && !$('#modal-root').innerHTML;
  }
  function clearHintTargets() {
    document.querySelectorAll('.hint-target').forEach(el => el.classList.remove('hint-target'));
  }
  function renderHint() {
    let root = document.getElementById('hint-root');
    if (!root) { root = document.createElement('div'); root.id = 'hint-root'; document.body.appendChild(root); }
    const target = hintActive ? hintTarget(hintActive) : null;
    if (!target) hintActive = null;
    clearHintTargets();
    if (!hintActive || !target || !hintsSafe()) { root.innerHTML = ''; document.body.classList.remove('hint-on'); return; }
    document.body.classList.add('hint-on');
    target.classList.add('hint-target');
    const spec = HINTS[hintActive];
    root.innerHTML = '<button class="coach-skip hint-skip" id="hint-skip" type="button">' + esc(t('hintGotIt')) + '</button>' +
      '<div class="coach-bubble" role="status" aria-live="polite">' + guideImg('point', spec.icon) +
      '<span class="coach-text">' + esc(t(spec.text)) + '</span></div>';
    placeBubbleSoon(root.querySelector('.coach-bubble'), target);
  }
  function showHint(id, replay) {
    if (!HINTS[id] || !state) return false;
    if (!replay && hintDone(id)) return false;
    if (!hintTarget(id) || !hintsSafe()) return false;
    hintActive = id;
    if (!hintDone(id)) { state.hintsSeen.push(id); saveQuiet(); }
    renderHint();
    return true;
  }
  function autoHint() {
    if (!hintsSafe()) { renderHint(); return; }
    if (hintActive) { renderHint(); if (hintActive) return; }
    const id = hintForView();
    if (id) showHint(id, false);
  }
  function closeHint() {
    hintActive = null; renderHint(); autoHint();
  }
  // "?" replays the current page's tip. Town, the album and the shop get their page tip; the station keeps the
  // parcel walkthrough from TAO-25.
  function startCoach() {
    if (!state) return;
    clearTimeout(coachTimer); coachTimer = null;
    if (!state.guideSeen) { state.guideSeen = true; saveQuiet(); }
    hideHelpDot();
    hintActive = null; renderHint();
    $('#modal-root').innerHTML = '';
    const pageHint = view === 'town' ? 'town' : view === 'album' ? 'album' : view === 'shop' ? 'shop' : null;
    if (pageHint && showHint(pageHint, true)) return;
    if (sheet) {
      coachActive = true;
      coachStep = sheet.stage === 'cut' ? 'tape' : 'clue';
      renderCoach(); return;
    }
    coachActive = true; coachStep = 'parcel'; view = 'station'; render();
    renderCoach();
  }

  function firstGoalsOn() {
    const g = state && state.firstGoals;
    return !!g && g.started && !g.off && FIRST_GOAL_IDS.some(id => !g.done.includes(id));
  }
  function syncFirstGoals() {
    const g = state && state.firstGoals;
    if (!g || !g.started) return;
    let changed = false;
    const add = id => { if (!g.done.includes(id)) { g.done.push(id); changed = true; } };
    if (state.stats.seriesRight > 0) add('series');
    if (state.stats.returned > 0) add('return');
    if (view === 'town') add('town');
    if (changed) saveQuiet();
  }
  function firstGoalsPanel() {
    if (!firstGoalsOn()) return '';
    const next = FIRST_GOAL_IDS.find(id => !state.firstGoals.done.includes(id));
    if (!next) return '';
    const text = { series: t('goalSeries'), return: t('goalReturn'), town: t('goalTown') }[next];
    const icon = { series: '🎯', return: '💌', town: '🏘️' }[next];
    const n = FIRST_GOAL_IDS.indexOf(next) + 1;
    return '<section class="panel next-goals" id="next-goals"><span class="ng-ic" aria-hidden="true">' + icon + '</span>' +
      '<div class="ng-body"><span class="ng-kicker">' + esc(t('goalTitle')) + '</span><b>' + esc(text) + '</b></div>' +
      '<span class="ng-count num" aria-hidden="true">' + esc(t('goalProgress', { a: n, b: FIRST_GOAL_IDS.length })) + '</span>' +
      '<button class="icon-btn ng-off" id="goals-off" aria-label="' + esc(t('goalClose')) + '" title="' + esc(t('goalClose')) + '">✕</button></section>';
  }

  function firstGoalPanel() {
    return '<section class="panel first-goal" id="first-goal"><span class="fg-ic" aria-hidden="true">📦</span>' +
      '<div class="fg-body"><b>' + esc(t('firstGoal')) + '</b><span class="small muted">' + esc(t('firstGoalHint')) + '</span></div>' +
      '<span class="fg-count num" aria-hidden="true">0/1</span></section>';
  }

  function garble(n) {
    n = n.split(/[,，]/)[0].split(' ').slice(0, 2).join(' ');
    const g = n.replace(/[aeiouáéíóú]/gi, '?');
    return g !== n ? g : n.split('').map((c, i) => (i % 2 ? '?' : c)).join('');
  }
  function miniBox(p) {
    const s = SERIES[p.series];
    return '<div class="box"><div class="tapeV"></div><div class="label"><i></i><i></i><i></i></div>' +
      (p.kind === 'mystery' ? '<div class="q' + (p.urgent ? ' urgent' : '') + '">' + (p.urgent ? '!' : '?') + '</div>' : (p.sticker ? '<div class="sticker" style="background:' + s.color + '"></div>' : '')) + '</div>';
  }
  function bigBox(p, opts) {
    opts = opts || {};
    const s = SERIES[p.series];
    const res = p.kind === 'mystery' ? CONFIG.residents.find(r => r.id === p.resident) : null;
    const pm = p.used.look ? '<div class="postmark' + (p.postmarkClear ? '' : ' smudge') + '">' + (p.postmarkClear ? esc(sPost(s)) + '<br>' + t('pmPost') : t('pmSmudge')) + '</div>' : '';
    const ins = p.used.look && p.insured ? '<div class="insured">' + t('care') + '</div>' : '';
    const label = p.urgent
      ? '<span class="to">' + esc(t('to')) + ' ' + esc(rName(res)) + '</span><span class="urgent-tag">' + esc(t('urgentLabel', { time: clock(p.urgent) })) + '</span>'
      : p.anon ? '<span class="to">' + esc(t('to')) + ' ???</span><span>' + esc(t('anonLabel')) + '</span>'
      : p.kind === 'mystery'
      ? '<span class="to">' + esc(t('to')) + ' ' + esc(garble(rName(res))) + '</span><span>' + esc(t('addrUnclear')) + '</span>'
      : '<span class="to">' + esc(t('to')) + ' ' + esc(t('homeAddr1')) + '</span><span>' + esc(t('homeAddr2')) + '</span>';
    return '<div class="bigbox" id="bigbox"><div class="glow" id="glow"></div><div class="floor" aria-hidden="true"></div>' +
      '<div class="flaps" aria-hidden="true"><i class="flap fl"></i><i class="flap fr"></i><i class="beam"></i></div><div class="box"><div class="tapeV"></div>' +
      '<div class="label">' + label + '</div>' +
      (p.kind === 'mystery' ? '<div class="q' + (p.urgent ? ' urgent' : '') + '">' + (p.urgent ? '!' : '?') + '</div>' : (p.sticker ? '<div class="sticker" style="background:' + s.color + '"></div>' : '')) +
      pm + ins + clueStickers(p) + (opts.tape ? '<div class="tapeH" id="tape" role="button" tabindex="0" aria-label="' + esc(t('cutAria')) + '"><div class="cut" id="cut"></div></div>' : '') + '</div></div>';
  }

  // Clues found with the tools are stuck on the box itself: a sound sticker, a weight slip, an X-ray film.
  function clueStickers(p) {
    const it = ITEMS[p.item];
    return (p.used.shake ? '<span class="stk snd" aria-hidden="true">🔊 ' + esc(t('sndShort')[it.snd]) + '</span>' : '') +
      (p.used.weigh ? '<span class="stk wt mono num" aria-hidden="true">' + fmtWeight(p.weight) + '</span>' : '') +
      (p.used.xray ? '<span class="stk xfilm" aria-hidden="true">' + (it.img ? '<img src="' + it.img + '" alt="">' : '<span>' + it.e + '</span>') + '</span>' : '');
  }

  // ---------- views ----------
  const silent = () => !!state.muted || !!(host && host.muted()); // the game's own switch, or the host site's mute
  // HUD: currencies as chunky pills, then round icon buttons (account, help, sound, language). No words on screen;
  // every control keeps its name for screen readers. The language select sits invisibly over the globe icon.
  const LCODE = { en: 'EN', zh: '中', es: 'ES' };
  function pills(cls) {
    const chip = (kind, icon, name, info, n) => '<button type="button" class="chip ' + kind + '" data-money="' + kind + '" data-hud="' + (kind === 'coin' ? 'coins' : kind === 'shard' ? 'shards' : 'gems') + '" title="' + esc(t(name)) + '" aria-label="' + esc(t(name) + ': ' + t(info)) + '"><span class="i" aria-hidden="true">' + icon + '</span><span class="sr">' + esc(t(name)) + '</span><span class="num">' + Number(n) + '</span></button>';
    return '<div class="wallet' + (cls ? ' ' + cls : '') + '">' + chip('coin', '🪙', 'coins', 'coinInfo', state.coins) +
      chip('shard', '✨', 'shards', 'shardInfo', state.shards) +
      (adMode ? '' : chip('gem', '💎', 'gems', 'gemInfo', state.gems)) + '</div>';
  }
  function moneyModal(kind) {
    const name = kind === 'coin' ? 'coins' : kind === 'shard' ? 'shards' : 'gems';
    const info = kind === 'coin' ? 'coinInfo' : kind === 'shard' ? 'shardInfo' : 'gemInfo';
    helpModal([['h', t(name)], ['p', t(info)]]);
  }
  function header() {
    const opts = LANGS.map(l => '<option value="' + l.id + '"' + (l.id === lang ? ' selected' : '') + '>' + l.label + '</option>').join('');
    return '<header class="top"><div class="brand"><h1 class="sr">' + esc(t('title')) + '</h1></div>' + pills() + '<div class="hud-btns">' +
      (accountsOn() ? '<button class="icon-btn" id="account" aria-label="' + esc(t('account')) + '"' + (view === 'account' ? ' aria-current="page"' : '') + '>👤</button>' : '') +
      '<button class="icon-btn help-btn" id="help" aria-label="' + esc(t('howTo')) + '" title="' + esc(t('howTo')) + '">?' + (state && !state.guideSeen ? '<span class="help-dot" aria-hidden="true"></span>' : '') + '</button>' +
      '<button class="icon-btn" id="mute"' + (host && host.muted() ? ' disabled' : '') + ' aria-label="' + esc(silent() ? t('soundOn') : t('soundOff')) + '">' + (silent() ? '🔇' : '🔊') + '</button>' +
      '<label class="lang icon-btn"><span class="sr">' + esc(t('language')) + '</span><span aria-hidden="true">🌐</span><span class="lcode" aria-hidden="true">' + esc(LCODE[lang] || lang) + '</span><select id="lang">' + opts + '</select></label></div></header>';
  }

  // Tab strip for the CrazyGames stage. Buttons are only rendered on that build; the web and Discord pages keep
  // their full two-column layout. Labels reuse existing translated UI strings.
  function stageBar(page, tabs) {
    if (!cgStage) return '';
    const cur = stageTab[page];
    return '<div class="stage-tabs" role="tablist">' + tabs.map(([id, label]) =>
      '<button role="tab" data-stagetab="' + page + ':' + id + '" aria-selected="' + (cur === id) + '">' + esc(label) + '</button>').join('') + '</div>';
  }
  function stagePage(html) { return '<div class="stage-page">' + html + '</div>'; }
  // Two columns in landscape (CrazyGames, Discord, desktop browsers): main panels left, side panels right.
  // In portrait the wrappers are display:contents, so the page is the same single column as before.
  function cols(main, side) {
    return side ? '<div class="cols"><div class="col-main">' + main + '</div><div class="col-side">' + side + '</div></div>' : '<div class="cols solo"><div class="col-main">' + main + '</div></div>';
  }

  const bare = x => String(x).replace(/\s*[←⏭]\s*/g, ' ').trim(); // labels without the arrow glyphs, for aria-label
  // Series marks drawn from the series' first sticker, so the street and the album bookmarks match the item art.
  const SICON = new Proxy({}, { get: (_, id) => SERIES[id] && SERIES[id].items[0].img ? '<img class="sicon" src="' + esc(SERIES[id].items[0].img) + '" alt="" draggable="false">' : '' });
  const HAND = '<svg class="hand" viewBox="0 0 44 50" aria-hidden="true"><path d="M15 3c2.5 0 4 1.8 4 4v13l1-.2c2.4 0 4 1.3 4.4 3 .8-.6 1.8-1 3-1 2.3 0 3.8 1.4 4.2 3.2.7-.4 1.5-.6 2.4-.6 2.6 0 4 2 4 4.4V37c0 5.5-4.5 10-10 10h-6c-3.2 0-6-1.5-7.9-4L5 32.5c-1.3-1.7-1-4.1.7-5.4 1.6-1.2 3.8-1.1 5.2.3l.1.1V7c0-2.2 1.6-4 4-4z" fill="#fffaf0" stroke="#3b2a1a" stroke-width="3" stroke-linejoin="round"/></svg>';
  const PLAY = '<svg class="play-ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#c8402f" stroke="#3b2a1a" stroke-width="2"/><path d="M8 6.2l5.6 3.8L8 13.8z" fill="#fffaf0"/></svg>';
  // Counter tools drawn as objects. Fixed colours: they are props in the scene, the same in light and dark.
  const TOOLART = {
    shake: '<svg viewBox="0 0 80 70" aria-hidden="true"><path d="M20 22c6-8 34-8 40 0" fill="none" stroke="#fffaf0" stroke-width="4" stroke-linecap="round" opacity=".9"/><rect x="18" y="26" width="44" height="34" rx="5" fill="#d8ab70" stroke="#3b2a1a" stroke-width="4"/><rect x="36" y="26" width="8" height="34" fill="#ecd9a7"/><path d="M8 30l-6 4 6 4M72 30l6 4-6 4" fill="none" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    weigh: '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="6" y="6" width="88" height="10" rx="5" fill="#d9dde2" stroke="#3b2a1a" stroke-width="4"/><path d="M14 22h72l6 52H8z" fill="#e9eef3" stroke="#3b2a1a" stroke-width="4"/><path d="M50 64L36 44" stroke="#c8402f" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="64" r="5" fill="#3b2a1a"/></svg>',
    look: '<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="#d8f0ff" fill-opacity=".8" stroke="#3b2a1a" stroke-width="6"/><path d="M48 48l24 24" stroke="#7d5a34" stroke-width="12" stroke-linecap="round"/><path d="M22 24a12 12 0 0 1 10-6" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
    xray: '<svg viewBox="0 0 80 70" aria-hidden="true"><rect x="4" y="6" width="72" height="54" rx="8" fill="#5a6b7d" stroke="#3b2a1a" stroke-width="4"/><rect x="14" y="14" width="52" height="32" rx="4" fill="#10234a"/><path d="M22 30h36M40 18v24" stroke="#4f86ff" stroke-width="3" opacity=".7"/><circle cx="66" cy="54" r="3" fill="#c8402f"/></svg>',
  };
  const MAILBOX = '<svg viewBox="0 0 60 80" width="34" height="44" aria-hidden="true"><rect x="26" y="40" width="8" height="38" fill="#7d5a34"/><path d="M6 20a20 20 0 0 1 40 0v24H6z" fill="#c8402f" stroke="#3b2a1a" stroke-width="4"/><rect x="14" y="24" width="24" height="5" rx="2" fill="#3b2a1a"/><rect x="46" y="10" width="4" height="18" fill="#3b2a1a"/><rect x="46" y="10" width="12" height="8" fill="#ffd66e" stroke="#3b2a1a" stroke-width="2"/></svg>';
  const TRUCK = '<svg viewBox="0 0 64 36" width="64" height="36" aria-hidden="true"><rect x="2" y="4" width="38" height="22" rx="3" fill="#2456c4" stroke="#173a8a" stroke-width="2.5"/><path d="M40 10h12l8 9v7H40z" fill="#c8402f" stroke="#7a1f14" stroke-width="2.5"/><rect x="44" y="13" width="7" height="6" fill="#bfe3f7"/><rect x="9" y="10" width="20" height="6" rx="2" fill="#fffaf0"/><circle cx="14" cy="28" r="5" fill="#3b2a1a"/><circle cx="50" cy="28" r="5" fill="#3b2a1a"/></svg>';
  // Empty-shelf prompt: with no normal parcels left, Rush Hour is the next thing to do.
  function rushPrompt() {
    if (!rushOn()) return '<div class="rush-prompt locked"><span class="small muted" aria-hidden="true">📦 ' + esc(t('rushLocked', { rep: state.town.rep, need: CONFIG.townLevels[CONFIG.townFeatures.rush - 1] })) + '</span></div>';
    const today = rushToday(state, Date.now());
    const note = today.official ? t('rushOfficialShort') : (rushPracticeLeft(state, today.day) > 0 ? t('rushPracticeLeft', { n: rushPracticeLeft(state, today.day) }) : t('rushPracticeNone'));
    return '<div class="rush-prompt"><button class="btn" data-view="rush"><span aria-hidden="true">📦 </span>' + esc(t('rushPlayBtn')) + '</button>' +
      '<span class="small muted">' + esc(note) + '</span></div>';
  }
  function stationView() {
    const normal = state.parcels.filter(p => p.kind === 'normal');
    const myst = state.parcels.filter(p => p.kind === 'mystery');
    const P = CONFIG.pity;
    let shelf = '';
    let si = 0;
    const now = Date.now();
    // First-run finger points at an ordinary parcel (a new save always starts with a misdelivered one in front).
    // While coaching (including a replay from ?), the guide target is always the first ordinary parcel.
    const coachId = coachActive ? (normal[0] || myst[0] || {}).id : null;
    const hintId = state.introSeen ? coachId : (normal[0] || myst[0] || {}).id;
    // While the first-run coach is on, ordinary parcels come first: the guide parcel is never the Lost? one.
    const order = (coachActive || !systemsOn())
      ? normal.concat(myst.filter(p => p.urgent), myst.filter(p => !p.urgent))
      : myst.filter(p => p.urgent).concat(myst.filter(p => !p.urgent), normal);
    order.forEach(p => {
      const first = p.id === hintId, guide = p.id === coachId;
      const lbl = (p.urgent ? t('ariaUrgent', { name: rName(resById(p.resident)) }) : p.anon ? t('ariaAnon') : p.kind === 'mystery' ? t('ariaMystery') : (p.sticker ? t('ariaSticker', { s: sName(SERIES[p.series]) }) : t('ariaParcel'))) + (p.rolled ? ' · ' + t('checked') : '');
      // Short tags only: a countdown on urgent parcels, a word on lost or unnamed ones.
      const flag = p.urgent ? '<span class="flag urgent" aria-hidden="true">⏱ ' + esc(p.urgent >= now ? dur(p.urgent - now) : t('urgentLate')) + '</span>'
        : p.anon ? '<span class="flag" aria-hidden="true">' + esc(t('anonFlag')) + '</span>' : p.kind === 'mystery' ? '<span class="flag" aria-hidden="true">' + esc(t('lostFlag')) + '</span>' : '';
      const tilt = ((p.id * 37) % 7) - 3; // a slightly uneven shelf, stable per parcel
      shelf += '<button class="slot' + (p.urgent ? ' urgent' : '') + (p.kind === 'mystery' ? ' myst' : '') + (first ? ' hint' : '') + '" style="--i:' + (si++) + ';--tilt:' + tilt + 'deg"' + (guide ? ' data-guide="parcel"' : '') + ' data-parcel="' + Number(p.id) + '" aria-label="' + esc(lbl) + '"><div class="mini">' + miniBox(p) + '</div>' +
        flag + (p.rolled && !p.urgent ? '<span class="seen" aria-hidden="true">🔍</span>' : '') + (first ? '<span class="finger" aria-hidden="true">' + HAND + '</span>' : '') + '</button>';
    });
    for (let i = normal.length; i < CONFIG.shelfSize; i++) shelf += '<div class="slot empty" style="--i:' + (si++) + '" aria-hidden="true"></div>';
    const nm = nextMysteryIn();
    let street = '';
    CONFIG.series.forEach(s => {
      const open = state.completed.includes(s.id), unl = state.unlocked.includes(s.id), pr = seriesProgress(state, s.id);
      const st = open ? t('shopOpen') : unl ? t('shopCollect', { a: pr.have, b: pr.total }) : t('locked');
      street += '<div class="shop' + (open ? ' open' : unl ? '' : ' lock') + '" role="img" aria-label="' + esc(sShop(s) + ': ' + st) + '">' +
        '<div class="awn" style="' + (unl ? 'background:repeating-linear-gradient(90deg,' + s.color + ' 0 10px, var(--paper) 10px 20px)' : '') + '"></div>' +
        '<span class="sn" aria-hidden="true">' + (unl ? (SICON[s.id] || '') + ' ' : '') + esc(sShop(s)) + '</span>' +
        (open ? '<span class="ss" aria-hidden="true">🎉</span>' : unl ? '<span class="bar" aria-hidden="true"><i style="width:' + (pr.have / pr.total * 100) + '%;background:' + s.color + '"></i></span><span class="ss num" aria-hidden="true">' + pr.have + '/' + pr.total + '</span>' : '<span class="ss" aria-hidden="true">🔒</span>') +
        '<span class="door" aria-hidden="true"></span></div>';
    });
    // Tao's storefront scene on top; the words that used to sit under it are for screen readers only.
    // Bought decorations are display models at fixed spots on the front (src/core/decor.ts).
    const deco = shownDecor(state);
    const decoImg = d => '<img class="deco deco-' + d.slot + '" src="' + esc(decorImg(d)) + '" width="400" height="400" loading="lazy" decoding="async" alt="" draggable="false">';
    const decoAt = slot => deco.filter(d => d.slot === slot).map(decoImg).join('');
    const facade = '<div class="facade" aria-hidden="true"><div class="sky">' + decoAt('sky') + '<i class="sun"></i><i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i><i class="hill h1"></i><i class="hill h2"></i></div>' +
      '<div class="roof"></div>' + decoAt('hill-l') + decoAt('hill-r') +
      '<div class="deco-sign">' + decoAt('sign-top') + '</div><div class="deco-wall">' + decoAt('wall-r') + '</div>' +
      '<div class="sign"><span>' + esc(t('title')) + '</span></div><div class="deco-awn">' + decoAt('awn-l') + decoAt('awn-r') + '</div><div class="awning"></div><i class="lamp ll"></i><i class="lamp lr"></i>' +
      '<div class="deco-front">' + decoAt('front-1') + decoAt('front-2') + decoAt('front-2b') + decoAt('front-3') + decoAt('front-3b') + decoAt('front-4') + decoAt('front-5') + '</div></div>';
    const decoAria = deco.length ? '<p class="sr">' + esc(t('decorAria', { x: deco.map(decorName).join(', ') })) + '</p>' : '';
    const facadeWrap = '<div class="facade-wrap">' + facade + decoAria +
      '<button class="icon-btn with-label decor-open" id="decor-open" aria-label="' + esc(t('decorBtn')) + '" title="' + esc(t('decorBtn')) + '">🎨<span class="btn-word" aria-hidden="true">' + esc(t('tabDecor')) + '</span></button></div>';
    const meter = (left, every, cls, icon, label, short) => '<div class="meter" role="img" aria-label="' + esc(left + ' ' + label) + '"><span class="gemi ' + cls + '" aria-hidden="true">' + icon + '</span><span class="plabel" aria-hidden="true">' + esc(t(short, { n: left })) + '</span><span class="bar" aria-hidden="true"><i style="width:' + Math.round((every - left) / every * 100) + '%"></i></span><b class="num" aria-hidden="true">' + left + '</b></div>';
    const full = systemsOn();
    const counterPanel = '<section class="panel counter">' + facadeWrap +
      (state.introSeen ? '' : '<h2 class="sr">' + esc(t('introTitle')) + '</h2><p class="sr">' + esc(t('introBody')) + '</p>') +
      '<div class="panel-head"><h2 class="sr">' + esc(t('shelfTitle')) + '</h2><span class="clk num" role="img" aria-label="' + esc(t('shelfCount', { n: normal.length, max: CONFIG.shelfSize, t: untilTomorrow() })) + '"><span aria-hidden="true">📦 ' + normal.length + '/' + CONFIG.shelfSize + ' · ⏱ ' + esc(untilTomorrow()) + '</span></span>' +
      (full && state.streak.n >= 1 ? '<span class="streak-chip num" role="img" aria-label="' + esc(t('streakShelfAria', { n: state.streak.n })) + '"><span aria-hidden="true">🎯 ' + state.streak.n + '</span></span>' : '') + '</div>' +
      '<div class="shelf">' + shelf + '</div>' + (normal.length ? '' : '<p class="sr">' + esc(t('shelfEmpty', { t: untilTomorrow() })) + '</p>' + rushPrompt()) +
      (full ? '<div class="myst-timer" role="img" aria-label="' + esc((nm ? t('nextMystery', { t: nm }) : t('mysteryFull')) + ' ' + t('mysteryNote')) + '"><span class="mq" aria-hidden="true">?</span><span class="num" aria-hidden="true">' + (nm ? '⏱ ' + esc(nm) : '✓') + '</span></div>' : '') +
      (full && adsOn && rewardRoom(state, 'parcels') > 0 ? '<div class="ad-station"><b class="small">' + esc(t('adStationTitle')) + '</b>' + rewardRow('parcels') + '</div>' : '') + '</section>';
    const pityPanel = '<section class="panel pity-panel"><h3 class="sr">' + esc(t('guarantees')) + '</h3><div class="pity">' +
      meter(P.rareEvery - state.pity.sinceRare, P.rareEvery, 'c-rare', '◆', t('pityRare'), 'pityRareShort') + meter(P.epicEvery - state.pity.sinceEpic, P.epicEvery, 'c-epic', '★', t('pityEpic'), 'pityEpicShort') + '</div>' +
      '<button class="icon-btn info" id="open-odds" aria-label="' + esc(t('seeOdds')) + '">ⓘ</button></section>';
    const streetScene = '<section class="street-panel"><h3 class="sr">' + esc(t('street')) + '</h3><div class="street">' + street + '</div></section>';
    const goals = firstGoalsPanel();
    if (!full) return header() + cols(goals + counterPanel + firstGoalPanel(), '');
    if (cgStage) {
      const tabs = [['today', t('tabToday')], ['street', t('tabStreet')], ['odds', t('tabOdds')], ['town', t('tabTown')]];
      if (weekOn()) tabs.push(['week', weekText(lang).title]);
      if (weekOn() && stageTab.station === 'week') return header() + stageBar('station', tabs) + cols(weekCard(true), '');
      const side = stageTab.station === 'street' ? streetScene : stageTab.station === 'odds' ? pityPanel : stageTab.station === 'town' ? townStrip() : todayPanel();
      return header() + stageBar('station', tabs) + cols(goals + counterPanel, side);
    }
    return header() + cols(goals + counterPanel + todayPanel(), weekCard() + pityPanel + streetScene + townStrip());
  }

  // Album: a sticker book. Coloured bookmarks pick the series; found items are tilted stickers (tap one for its
  // details), missing ones are silhouettes with a shard price tag that trades for them. The rules sit behind ⓘ.
  function albumView() {
    if (rushOn() && albumTab === 'rush') return rushAlbumView();
    if (!albumTab || !state.unlocked.includes(albumTab)) albumTab = state.unlocked[0];
    const s = SERIES[albumTab], pr = seriesProgress(state, s.id), done = state.completed.includes(s.id);
    const marks = CONFIG.series.map(x => {
      const unl = state.unlocked.includes(x.id), p2 = seriesProgress(state, x.id);
      return '<button role="tab" class="bmark" data-tab="' + esc(x.id) + '" aria-selected="' + (x.id === albumTab) + '"' + (unl ? '' : ' disabled') + ' style="--c:' + x.color + '"' +
        ' aria-label="' + esc(sName(x) + (unl ? ' ' + p2.have + '/' + p2.total : ' · ' + t('locked'))) + '"><span aria-hidden="true">' + (unl ? (SICON[x.id] || '📦') + ' <span class="num">' + p2.have + '/' + p2.total + '</span>' : '🔒') + '</span></button>';
    }).join('') + (rushOn() ? '<button role="tab" class="bmark" data-tab="rush" aria-selected="false" style="--c:#8a5a2b" aria-label="' + esc(t('rushAlbum') + ' ' + state.rush.owned.length + '/' + RUSH_ITEMS.length) + '"><span aria-hidden="true">✦ <span class="num">' + state.rush.owned.length + '/' + RUSH_ITEMS.length + '</span></span></button>' : '');
    const stickers = s.items.map((it, k) => {
      const c = state.owned[it.id] || 0, cost = CONFIG.exchange[it.r];
      const gem = '<span class="rk c-' + it.r + '" aria-hidden="true">' + RICON[it.r] + '</span>';
      if (c) return '<button class="stk-slot have" data-item="' + esc(it.id) + '" style="--tilt:' + (((k * 53) % 9) - 4) + 'deg" aria-label="' + esc(t('itemDetails', { x: iName(it) }) + ' · ' + RL(it.r) + (c > 1 ? ' · ×' + c : '')) + '">' +
        gem + (c > 1 ? '<span class="cnt num" aria-hidden="true">×' + c + '</span>' : '') + '<span class="e" aria-hidden="true">' + art(it, true) + '</span></button>';
      const tag = cost == null ? '<span class="ptag only" role="img" aria-label="' + esc(t('onlyParcels')) + '"><span aria-hidden="true">📦</span></span>'
        : '<button class="ptag" data-ex="' + esc(it.id) + '"' + (state.shards < cost ? ' disabled' : '') + ' aria-label="' + esc(RL(it.r) + ' · ' + t('trade', { n: cost })) + '"><span aria-hidden="true">✨' + cost + '</span></button>';
      return '<div class="stk-slot miss" role="group" aria-label="' + esc(t('missingAria') + ' · ' + RL(it.r)) + '">' + gem + '<span class="e" aria-hidden="true">' + art(it, false) + '</span>' + tag + '</div>';
    }).join('');
    const ev = extrasValue(state, s.id), left = CONFIG.pity.secretHard - (state.pity.secret[s.id] || 0);
    const goal = done ? t('seriesDone', { shop: sShop(s) }) : t('collectAll', { n: pr.total, shop: sShop(s) });
    return header() + cols('<section class="scene book" style="--c:' + s.color + '"><h2 class="sr">' + esc(t('navAlbum')) + '</h2>' +
      '<div class="marks" role="tablist" aria-label="' + esc(t('navAlbum')) + '">' + marks + '</div>' +
      '<div class="page"><div class="page-head"><h3>' + esc(sName(s)) + '</h3>' + (state.streak.best > 0 ? '<span class="small muted num best-streak" aria-label="' + esc(t('bestStreak', { n: state.streak.best })) + '">🎯 ' + esc(t('bestStreak', { n: state.streak.best })) + '</span>' : '') + '<button class="icon-btn info" id="album-help" aria-label="' + esc(t('howTo')) + '">ⓘ</button></div>' +
      '<div class="goal" role="img" aria-label="' + esc(goal + ' ' + pr.have + '/' + pr.total) + '"><span class="mshop' + (done ? ' open' : '') + '" aria-hidden="true"><span class="awn"></span><span class="door"></span></span>' +
        '<span class="bar" aria-hidden="true"><i style="width:' + Math.round(pr.have / pr.total * 100) + '%"></i></span><b class="num" aria-hidden="true">' + (done ? '🎉' : pr.have + '/' + pr.total) + '</b></div>' +
      '<div class="sbook">' + stickers + '</div>' +
      '<div class="page-foot"><span class="schip" role="img" aria-label="' + esc(t('secretWithin', { n: left })) + '"><span aria-hidden="true">✦ ≤' + left + '</span></span>' +
        '<button class="btn ghost slim" id="recycle"' + (ev ? '' : ' disabled') + ' aria-label="' + esc(ev ? t('recycle', { n: ev }) : t('noExtras')) + '"><span aria-hidden="true">♻️' + (ev ? ' +' + ev + ' ✨' : '') + '</span></button></div>' +
      '</div></section>');
  }
  // Weight range and sound of an item as two chips; the sound chip plays the sound again.
  function facts(it) {
    return '<div class="facts num"><span><span aria-hidden="true">⚖️ </span>' + it.w[0] + '–' + it.w[1] + ' oz</span>' +
      '<button data-snd="' + esc(it.snd) + '" aria-label="' + esc(t('dClueShake') + ': ' + t('snd')[it.snd]) + '"><span aria-hidden="true">🔊 ' + esc(t('sndShort')[it.snd]) + '</span></button></div>';
  }
  function itemModal(id) {
    const it = ITEMS[id], c = (it && state.owned[id]) || 0; if (!c) return;
    playTag(it.snd);
    modal('<div class="peek-art" aria-hidden="true">' + art(it, true) + '</div><h2>' + esc(iName(it)) + '</h2><div class="row tags">' + rbadge(it.r) + (c > 1 ? '<span class="dupc num">×' + c + '</span>' : '') + '</div>' +
      facts(it) + '<p class="note">“' + esc(iNote(it)) + '”</p><button class="btn ghost round" data-close aria-label="' + esc(t('close')) + '">↩</button>');
  }
  function helpModal(parts) {
    modal(parts.map(x => x[0] === 'h' ? '<h2>' + esc(x[1]) + '</h2>' : '<p class="small" style="margin:0;text-align:left">' + esc(x[1]) + '</p>').join('') + '<button class="btn" data-close>' + esc(t('close')) + '</button>');
  }
  function albumHelp() {
    const s = SERIES[albumTab] || SERIES[state.unlocked[0]], pr = seriesProgress(state, s.id);
    helpModal([['h', sName(s)], ['p', state.completed.includes(s.id) ? t('seriesDone', { shop: sShop(s) }) : t('collectAll', { n: pr.total, shop: sShop(s) })],
      ['p', t('secretWithin', { n: CONFIG.pity.secretHard - (state.pity.secret[s.id] || 0) })], ['p', t('albumHelp')]]);
  }

  function rushTab() {
    return '<button role="tab" data-tab="rush" aria-selected="' + (albumTab === 'rush') + '"><span class="dot" style="background:#8a5a2b"></span>' + esc(t('rushAlbum')) + ' <span class="num muted">' + state.rush.owned.length + '/' + RUSH_ITEMS.length + '</span></button>';
  }
  function rushAlbumView() {
    let tabs = '';
    CONFIG.series.forEach(x => {
      const unl = state.unlocked.includes(x.id), p2 = seriesProgress(state, x.id);
      tabs += '<button role="tab" data-tab="' + x.id + '" aria-selected="false"' + (unl ? '' : ' disabled style="opacity:.5"') + '><span class="dot" style="background:' + x.color + '"></span>' + esc(sName(x)) + (unl ? ' <span class="num muted">' + p2.have + '/' + p2.total + '</span>' : ' 🔒') + '</button>';
    });
    tabs += rushTab();
    const today = rushToday(state, Date.now());
    let cards = '';
    RUSH_ITEMS.forEach(it => {
      const have = state.rush.owned.includes(it.id), c = CONTENT[lang] && CONTENT[lang].rushItems && CONTENT[lang].rushItems[it.id];
      cards += '<div class="card' + (have ? '' : ' miss') + '"><span class="rk c-secret" title="' + esc(t('rushAlbum')) + '">✦</span><div class="e" aria-hidden="true">' + (have ? it.e : '❔') + '</div><div class="nm">' + (have ? esc(c ? c[0] : it.name) : '???') + '</div>' +
        '<div class="meta">' + esc(have ? (c ? c[1] : it.note) : it.id === today.prize ? t('rushAlbumToday') : t('rushAlbumLater')) + '</div></div>';
    });
    return header() + '<section class="panel"><div class="tabs" role="tablist">' + tabs + '</div>' +
      '<div class="panel-head"><h2>' + esc(t('rushAlbum')) + '</h2><span class="num muted">' + state.rush.owned.length + ' / ' + RUSH_ITEMS.length + '</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + RUSH_ITEMS.length + '" aria-valuenow="' + state.rush.owned.length + '"><i style="width:' + (state.rush.owned.length / RUSH_ITEMS.length * 100) + '%;background:#8a5a2b"></i></div>' +
      '<div class="grid">' + cards + '</div><p class="small muted" style="margin:0">' + esc(t('rushAlbumHelp')) + '</p></section>';
  }

  const OFFERS = [
    { id: 'noads', p: '$2.99' }, { id: 'gems60', p: '$0.99' }, { id: 'gems330', p: '$4.99' }, { id: 'outfit', p: '$1.99' },
    { id: 'parcel10', p: () => '💎 ' + t('gemsTbd') },
  ];
  // A platform store (Discord today, app stores later) supplies real offers. Other builds: the offers above.
  const store = platform.store || (backend && backend.store ? backend.store : null);
  let storeOffers = null, storeBusy = false;
  // Two-tap decoration buying: the first tap arms the button, the second buys. Any other tap or 4 s disarms it.
  let decorArm = null, decorArmTm = null;
  function loadOffers() {
    store.offers(document.documentElement.lang || 'en').then(o => { storeOffers = o; if (view === 'shop') render(); }, () => {});
  }
  function storeRows(O) {
    if (!store.canBuy()) return '<p class="small" style="margin:0">' + esc(t('buyOnDesktop')) + '</p>';
    if (!storeOffers) { loadOffers(); return ''; }
    return storeOffers.map(o => '<div class="offer"><div class="ot"><div class="t">' + esc(O[o.id][0]) + ' <span class="muted small">' + esc(o.price) + '</span></div><div class="d">' + esc(O[o.id][1]) + '</div></div>' +
      (o.owned ? '<button disabled>' + esc(t('owned')) + '</button>' : '<button data-buy="' + esc(o.id) + '"' + (storeBusy ? ' disabled' : '') + '>' + esc(t('buyShort') + ' · ' + o.price) + '</button>') + '</div>').join('');
  }
  // Discord shop: the parcel odds and guarantees stay in view next to the buy buttons, not only behind a button.
  function storeOddsLine() {
    const P = CONFIG.pity;
    return '<div class="store-odds" id="store-odds"><b class="small">' + esc(t('parcelOdds')) + '</b><div class="small">' +
      RARITIES.map(r => rbadge(r) + ' ' + pct(CONFIG.odds[r])).join(' · ') + '</div><div class="small muted">' +
      esc(t('ruleRare', { n: P.rareEvery })) + ' ' + esc(t('ruleEpic', { n: P.epicEvery })) + ' ' + esc(t('ruleSecret', { a: P.secretSoftStart, b: P.secretHard })) + '</div></div>';
  }
  async function buyFlow(id) {
    if (storeBusy) return;
    storeBusy = true; render();
    let r;
    try { r = await store.buy(id); } catch (e) { r = 'not-completed'; }
    storeBusy = false; storeOffers = null; render();
    if (r === 'pending') toast(t('buyPending'));
    else if (r === 'not-completed') toast(t('buyFailed'));
    else if (r === 'busy') toast(t('buyBusy'));
    else if (r === 'mobile') toast(t('buyOnDesktop'));
    else if (r === 'unavailable') toast(t('buyUnavailable'));
  }
  // Adds a delivered purchase. Throws while the game is not ready (no save yet, the player is choosing between
  // two saves, or the device save is not yet synced with the signed-in account), so the order waits and is
  // delivered by the next claim. The device save may still belong to another Discord account on a shared computer.
  function grant(g) {
    const u = auth.user();
    if (!state || syncing || !u || lastUid !== u.id || meta().owner !== u.id) throw new Error('not ready');
    if (g.gems > 0) state.gems += g.gems;
    save(); sfx('coin'); render();
    toast(g.product === 'outfit' ? t('buyOutfit') : t('buyGems', { n: g.gems }));
  }
  // The server's gem balance (refunds, orders delivered on another device). Same readiness rule as grant();
  // when the game is not ready the number is simply not shown yet, and the next claim brings it again.
  function setBalance(gems) {
    const u = auth.user();
    if (!state || syncing || !u || lastUid !== u.id || meta().owner !== u.id || state.gems === gems) return;
    state.gems = gems;
    save(); render();
  }
  function claimPurchases() { if (store && accountsOn()) enqueue(() => store.claim()).catch(() => {}); }
  // Station decorations: a shop section on every build (web, Discord, CrazyGames), first on the Shop page.
  // Prices are coins only; buying never adds anything to the album.
  function decorCard(d) {
    const open = decorOpen(state, d.id), owned = decorOwned(state, d.id);
    const shown = owned && !state.decor.hidden.includes(d.id), price = decorPrice(state, d.id);
    const found = !!d.item && (state.owned[d.item] || 0) > 0, spot = t('decorSpot')[String(d.slot).split('-')[0]];
    const kind = d.item ? t('decorModel') : t('decorPiece');
    let action;
    if (!open) action = '<span class="decor-lock small muted">🔒 ' + esc(t('decorOpens', { n: d.lv })) + '</span>';
    else if (owned) action = '<div class="decor-actions"><span class="decor-owned small">' + esc(shown ? t('decorOn') : t('decorPutAway')) + '</span><button class="link-btn small" data-decor-toggle="' + esc(d.id) + '">' + esc(shown ? t('decorHide') : t('decorShow')) + '</button></div>';
    else if (state.coins < price) action = '<button class="btn ghost slim" disabled>' + esc(t('decorNeed', { n: price - state.coins })) + '</button>';
    else if (decorArm === d.id) action = '<button class="btn slim warm" data-decor-buy="' + esc(d.id) + '">' + esc(t('decorBuyFor', { n: price })) + '</button>';
    else action = '<button class="btn slim" data-decor-buy="' + esc(d.id) + '">' + esc(t('decorBuy', { n: price })) + '</button>';
    const priceRow = open && !owned ? '<span class="decor-price num">' + (found ? '<s>' + d.price + '</s> ' : '') + price + ' 🪙' + (found ? ' · ' + esc(t('decorFound')) : '') + '</span>' : '';
    return '<div class="decor-card' + (open ? '' : ' locked') + (owned ? ' owned' : '') + '"><span class="decor-pic" aria-hidden="true"><img src="' + esc(decorImg(d)) + '" width="400" height="400" loading="lazy" decoding="async" alt="" draggable="false"></span>' +
      '<div class="decor-info"><b>' + esc(decorName(d)) + '</b><span class="small muted">' + esc(spot) + '</span><span class="small muted decor-model">' + esc(kind) + '</span></div>' + priceRow + action + '</div>';
  }
  function decorShop() {
    const owned = state.decor.owned.length;
    return '<section class="panel decor-shop" id="decor-shop"><div class="panel-head"><h2><span aria-hidden="true">🎨</span> ' + esc(t('decorTitle')) + '</h2><span class="small muted num">' + owned + '/' + DECOR.length + '</span></div>' +
      '<p class="small muted" style="margin:0">' + esc(t('decorRules')) + '</p><div class="decor-grid">' + DECOR.map(decorCard).join('') + '</div></section>';
  }
  function shopView() {
    if (adMode) return adShopView();
    const O = t('offers');
    let rows = '';
    if (store) rows = storeOddsLine() + storeRows(O);
    else OFFERS.forEach(o => { rows += '<div class="offer"><div class="ot"><div class="t">' + esc(O[o.id][0]) + ' <span class="muted small">' + esc(typeof o.p === 'function' ? o.p() : o.p) + '</span></div><div class="d">' + esc(O[o.id][1]) + '</div></div><button data-offer="' + o.id + '">' + esc(t('comingSoon')) + '</button></div>'; });
    // Web / H5: reward videos sit beside the paid store (the app stores will use the same combination in M4).
    const rewards = adsOn ? adRewardsPanel(false) : '';
    return header() + cols(
      decorShop() + rewards + '<section class="panel"><div class="panel-head"><h2>' + esc(t('shopTitle')) + '</h2><button class="link-btn small" id="open-odds">' + esc(t('parcelOdds')) + '</button></div>' +
      (underAge ? '<p class="small muted" style="margin:0">' + esc(t('ageLocalNote')) + '</p></section>' : '<p class="small muted" style="margin:0">' + esc(t(store ? 'shopNoteDiscord' : 'shopNote')) + '</p><div>' + rows + '</div></section>'),
      devPanel());
  }
  // Design v2 checks (docs/metrics.md), this device only. Not translated: developer panel.
  function metricsLine() {
    const m = metricsSummary(state, localDay(new Date()));
    const pc = v => (v === null ? '–' : Math.round(v * 100) + '%');
    const yn = v => (v === null ? '–' : v ? 'yes' : 'no');
    return 'v2 metrics · days ' + m.days + ' · guess-first ' + pc(m.guessFirst) + ' of ' + m.opened + ' · daily finished ' + pc(m.dailyFinish) + ' · shared ' + pc(m.dailyShare) + ' · D1 ' + yn(m.d1) + ' · D7 ' + yn(m.d7);
  }
  function devPanel() {
    if (!devTools) return '';
    const O = t('offers');
    const taps = OFFERS.filter(o => state.shopTaps[o.id]).map(o => O[o.id][0] + ': ' + state.shopTaps[o.id]).join(' · ') || t('noneYet');
    const st = state.stats;
    return '<section class="panel dev"><h3>' + esc(t('devTitle')) + '</h3><p class="small muted" style="margin:0">' + esc(t('devNote')) + '</p>' +
      '<div class="row"><button class="btn ghost" id="dev-parcels">' + esc(t('devParcels')) + '</button><button class="btn ghost" id="dev-mystery">' + esc(t('devMystery')) + '</button></div>' +
      '<div class="row"><button class="btn ghost" id="dev-rep">' + esc(t('devRep')) + '</button><button class="btn ghost" id="dev-coins">' + esc(t('devCoins')) + '</button><button class="btn ghost" id="dev-unlock">' + esc(t('devUnlock')) + '</button><button class="btn ghost" id="dev-age">' + esc(t('devAge')) + '</button></div>' +
      '<label class="switch"><input type="checkbox" id="dev-luck"' + (state.demoLuck ? ' checked' : '') + '> ' + esc(t('demoLuck')) + '</label>' +
      (adsOn ? '<label class="switch"><input type="checkbox" id="dev-noads"' + (noAdsOn() ? ' checked' : '') + '> ' + esc(t('devNoAds')) + '</label>' : '') +
      '<div class="small muted">' + esc(t('shopTaps', { x: taps })) + '</div>' +
      '<div class="small muted num">' + esc(t('stats', { a: st.opened, b: st.guessed, c: st.seriesRight, d: st.rarityRight, e: st.returned })) + '</div>' +
      '<div class="small muted num" id="dev-metrics">' + esc(metricsLine()) + '</div>' +
      '<div class="row"><button class="btn ghost" id="dev-day-next">' + esc(t('devDayNext')) + '</button><button class="btn ghost" id="dev-day-skip">' + esc(t('devDaySkip')) + '</button><button class="btn ghost" id="dev-day-real">' + esc(t('devDayReal')) + '</button></div>' +
      '<div class="row"><button class="btn ghost" id="dev-week-open">' + esc(t('devWeekOpen')) + '</button><button class="btn ghost" id="dev-week-closed">' + esc(t('devWeekClosed')) + '</button></div>' +
      '<div class="row"><button class="btn ghost" id="dev-reset">' + esc(t('reset')) + '</button></div></section>';
  }

  function render() {
    syncFirstGoals();
    const appEl = $('#app');
    appEl.innerHTML = view === 'album' ? albumView() : view === 'shop' ? shopView() : view === 'town' ? townView() : view === 'account' ? accountView() : stationView();
    if (view === 'album') newFinds = 0;
    if (view !== shownView) {
      shownView = view;
      appEl.classList.remove('entering'); void appEl.offsetWidth; appEl.classList.add('entering');
      clearTimeout(enterTimer); enterTimer = setTimeout(() => appEl.classList.remove('entering'), 900);
    }
    [['coins', state.coins], ['shards', state.shards]].forEach(([k, v]) => {
      const chip = $('[data-hud="' + k + '"]', appEl);
      if (chip && wallet[k] != null && v > wallet[k]) chip.classList.add('bump');
      wallet[k] = v;
    });
    const nav = [['station', '📮', 'navStation'], ['town', '🏘️', 'navTown'], ['album', '📒', 'navAlbum'], ['shop', '🏪', 'navShop']];
    if (rushOn()) nav.push(['rush', '📦', 'navRush']);
    $('#nav-in').style.setProperty('--nav-n', String(nav.length));
    // Red badges instead of words: board notes to claim (a number) or an unplayed daily parcel (!) in Town, new finds in the album.
    const ready = claimable(state), ds = dailyStatus(state, Date.now());
    const qReady = questClaimable(state), checkReady = canCheckIn(state, Date.now());
    const wkEvent = weekOn() ? weekEventStatus(state, nowMs()) : null;
    const weekReady = !!wkEvent && wkEvent.open && wkEvent.plays === 0;
    const dot = { station: qReady || checkReady || weekReady ? '!' : '', town: ready ? String(ready) : !ds.finished && !ds.waiting ? '!' : '', album: newFinds ? String(Math.min(newFinds, 99)) : '' };
    const dotSr = { station: qReady ? t('questReady') : checkReady ? t('checkinReady') : weekReady ? t('weekReady') : t('isNew'), town: ready ? t('boardReady', { n: ready }) : t('isNew'), album: dot.album + ' ' + t('isNew') };
    $('#nav-in').innerHTML = nav.map(n => '<button data-view="' + n[0] + '"' + (n[0] === view ? ' aria-current="page"' : '') + ' title="' + esc(t(n[2])) + '"><span class="ni" aria-hidden="true">' + n[1] + '</span><span class="nl" aria-hidden="true">' + esc(t(n[2])) + '</span><span class="sr">' + esc(t(n[2]) + (dot[n[0]] ? ' · ' + dotSr[n[0]] : '')) + '</span>' +
      (dot[n[0]] ? '<span class="badge' + (n[0] === 'town' && ready ? ' nav-dot' : '') + '" aria-hidden="true">' + dot[n[0]] + '</span>' : '') + '</button>').join('');
    levelCheck();
    renderCoach();
    autoHint();
  }

  function openRush() {
    if (rushOff || rushLoading) return;
    rushLoading = true;
    if (sheet) closeSheet();
    $('#modal-root').innerHTML = '';
    // Rush Hour is a lazy chunk in every build, so it does not grow the first load.
    import('../rush/rushHour').then(m => {
      rushLoading = false;
      rushOff = m.startRushHour({
        lang, baseUrl: import.meta.env.BASE_URL, onExit: closeRush,
        today: () => rushToday(state, Date.now()),
        begin: day => { const first = rushBegin(state, day); save(); return first; },
        finish: (day, official, result) => {
          const counts = official && state.rush.day === day;
          const out = rushFinish(state, day, official, result); save(); if (out.shards || out.prize || out.coins) sfx('coin');
          if (counts) noteBoard({ k: 'rush' });
          noteQuest({ k: 'rush' });
          return out;
        },
      });
    }, () => { rushLoading = false; toast(t('rushLoadFail')); });
  }
  function closeRush() {
    // Never leave a result panel behind: clear the overlay even when the dispose handle is missing.
    if (rushOff) { const off = rushOff; rushOff = null; try { off(); } catch (e) { /* the DOM cleanup below still runs */ } }
    rushLoading = false;
    document.querySelectorAll('.rh').forEach(el => el.remove());
    document.body.classList.remove('rush-active');
    view = 'station'; render(); window.scrollTo(0, 0);
  }

  // ---------- Station Week ----------
  function weekCard(compact = false) {
    if (!weekOn()) return '';
    const W = weekText(lang), live = state.week.run, ev = weekEventStatus(state, nowMs());
    const seed = live ? live.seed : ev.seed;
    const theme = weekTheme(seed).map(e => W.events[e][0]).join(' + ');
    const status = ev.open ? W.eventOpen : ev.clockBehind ? W.eventClockBehind : wfill(W.eventSoon, { n: ev.daysToOpen });
    const tier = (bit, label) => '<li' + (ev.claimed & bit ? ' class="done"' : '') + '>' + esc(label) + (ev.claimed & bit ? ' ✓' : '') + '</li>';
    const rewards = '<ul class="week-rewards">' +
      tier(1, wfill(W.rewardFinish, { c: CONFIG.weekEvent.coinsFinish })) +
      tier(2, wfill(W.rewardWin, { c: CONFIG.weekEvent.coinsWin, s: CONFIG.weekEvent.shardsWin })) +
      tier(4, wfill(W.rewardThree, { s: CONFIG.weekEvent.shardsThree })) + '</ul>';
    const best = ev.plays ? wfill(W.bestWeek, { g: stars(ev.best) }) + ' · ' + wfill(W.runsWeek, { n: ev.plays }) : W.noRuns;
    return '<section class="panel week-card has-banner">' + eventBanner('week', 'week-banner') +
      '<div class="panel-head"><h3>' + esc(W.title) + '</h3><span class="small muted">' + esc(W.kicker) + '</span></div>' +
      '<p class="small" style="margin:0"><b>🗓 ' + esc(wfill(W.theme, { a: W.events[weekTheme(seed)[0]][0], b: W.events[weekTheme(seed)[1]][0] })) + '</b></p>' +
      '<p class="small" style="margin:0">' + esc(status) + '</p>' +
      (compact ? '' : '<p class="small muted" style="margin:0">' + esc(W.practice) + '</p>') +
      (compact ? '' : '<p class="small" style="margin:0">' + esc(W.rewardTitle) + '</p>') + rewards +
      '<p class="small" style="margin:0">' + esc(best) + '</p>' +
      (compact ? '' : '<p class="small" style="margin:0">🖋 ' + state.week.marks + ' · ' + esc(W.ledger) + '</p>') +
      '<div class="row"><button class="btn" id="week-open">' + esc(live ? wfill(W.resume, { d: weekLoad(state)?.day ?? 1 }) : W.start) + '</button>' +
      (ev.plays ? '<button class="btn ghost" id="week-share">' + esc(W.share) + '</button>' : '') + '</div></section>';
  }
  function openWeek() {
    if (weekOff || weekLoading) return;
    weekLoading = true;
    if (sheet) closeSheet();
    $('#modal-root').innerHTML = '';
    import('../week/week').then(m => {
      weekLoading = false;
      weekOff = m.startStationWeek({
        lang, onExit: closeWeek,
        load: () => weekLoad(state),
        start: () => { const r = weekStart(state, weekSeed(nowMs())); save(); return r; },
        act: (run, a) => { const ok = weekAct(state, run, a); if (ok) saveQuiet(); return ok; },
        finish: run => { const out = weekFinish(state, run, nowMs()); save(); if (out && (out.marks || (out.event && out.event.paid))) sfx('coin'); return out; },
        abandon: () => { weekAbandon(state); save(); },
        buy: id => { const ok = weekBuy(state, id); if (ok) save(); return ok; },
        record: () => {
          const ev = weekEventStatus(state, nowMs());
          return { best: state.week.best, wins: state.week.wins, played: state.week.played, rewardedToday: state.week.rewarded.includes(localDay(new Date())), marks: state.week.marks, levels: state.week.levels,
            open: ev.open, daysToOpen: ev.daysToOpen, clockBehind: ev.clockBehind, week: ev.week, theme: ev.theme, claimed: ev.claimed, weekBest: ev.best, weekPlays: ev.plays };
        },
        share: (grade, sold) => weekShare(grade, sold),
      });
    }, () => { weekLoading = false; toast(weekText(lang).loadFail); });
  }
  async function weekShare(grade, sold) {
    const text = weekShareText(weekText(lang), weekOf(nowMs()), grade, sold);
    const fallback = () => modal('<h2>' + esc(weekText(lang).share) + '</h2><p class="small" style="margin:0">' + esc(t('dCopyHint')) + '</p><textarea readonly rows="3" style="width:100%;font:inherit">' + esc(text) + '</textarea><button class="btn" data-close>' + esc(t('close')) + '</button>');
    if (platform.share) {
      let r;
      try { r = await platform.share.share(text, cleanShareUrl(window.location)); } catch (e) { r = 'cancelled'; }
      if (r === 'sent' || r === 'copied') return true;
      if (r === 'cancelled') return false;
    }
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { fallback(); return false; }
  }
  function closeWeek() {
    if (!weekOff) return;
    weekOff(); weekOff = null;
    save(); view = 'station'; render(); window.scrollTo(0, 0);
  }


  // ---------- town: the golden daily parcel, and one street of neighbors ----------
  // Neighbour portraits: public/residents/<id>-<mood>.webp, one bust per neighbour, three moods
  // (normal on the street and in stories/requests, happy on thanks and gifts, worried while an urgent
  // parcel waits for them). The window colour still frames the picture; the emoji stays only as the
  // fallback when a portrait file is missing (a broken deploy then shows the drawn face icon).
  const FACE = { okafor: ['👵', '#ffd9b0'], theo: ['🧑‍🍳', '#ffe7a8'], lena: ['🚴', '#cfe8ff'], dube: ['👴', '#d7f0d2'], twins: ['👯', '#f6d0e8'], rosa: ['👩‍🌾', '#dff0c8'], ines: ['🧑‍🍳', '#e6dcf5'] };
  const faceOf = r => FACE[r.id] || ['🙂', '#eee6d6'];
  const PORTRAIT_MOODS = ['normal', 'happy', 'worried'];
  function face(r, mood) {
    const m = mood && PORTRAIT_MOODS.includes(mood) ? mood : 'normal';
    if (FACE[r.id]) return '<img class="face" src="residents/' + r.id + '-' + m + '.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false">';
    return '<span class="face" aria-hidden="true">' + faceOf(r)[0] + '</span>';
  }
  function clueText(c) {
    if (c.k === 'snd') return t('reqSnd', { s: t('snd')[c.v] });
    if (c.k === 'series') return t('reqSeries', { p: sPost(SERIES[c.v]) });
    if (c.k === 'rarity') return t('reqRarity', { r: RL(c.v) });
    return t(c.k === 'under' ? 'reqUnder' : 'reqOver', { w: oz(c.v) });
  }
  // A request clue as a picture: the sound word, the series icon, the rarity gem, or the scale with a limit.
  function clueIcon(c) {
    if (c.k === 'snd') return '🔊 ' + esc(t('sndShort')[c.v]);
    if (c.k === 'series') return SICON[c.v] || '📮';
    if (c.k === 'rarity') return '<span class="gemc c-' + c.v + '">' + RICON[c.v] + '</span>';
    return '⚖️ ' + (c.k === 'under' ? '≤' : '≥') + esc(oz(c.v));
  }
  const nextTale = h => CONFIG.taleHearts.find(n => h < n);
  function heartChip(h) { const nx = nextTale(h); return '<span class="hearts num" aria-hidden="true">♥ ' + h + (nx ? '/' + nx : '') + '</span>'; }
  let dailyFx = null; // the guess just made ({ id, ok }), so the next render shakes or pops that card once

  function dailyPanel() {
    const st = dailyStatus(state, Date.now()), p = st.puzzle;
    if (st.waiting) return '<section class="panel" id="daily"><h2>' + esc(t('dTitle')) + '</h2><p style="margin:0">' + esc(t('dWaiting')) + '</p></section>';
    const s = SERIES[p.series];
    // Three clue slots that turn over one by one. The sound slot plays the parcel's sound.
    const slots = [
      ['🔊', t('dClueShake'), '<span>' + esc(t('sndShort')[p.snd]) + '</span>', t('snd')[p.snd]],
      ['⚖️', t('dClueWeigh'), '<span class="mono">' + esc(oz(p.weight)) + '</span>', oz(p.weight)],
      ['📮', t('dCluePost'), '<span class="pmk" style="--c:' + s.color + '">' + (SICON[s.id] || '📦') + '</span>', sPost(s)],
    ].map((l, i) => {
      const open = i < st.clues, fresh = open && dailyFx && !dailyFx.ok && i === st.clues - 1;
      const inner = '<span class="ck" aria-hidden="true">' + l[0] + '</span><span class="cv" aria-hidden="true">' + (open ? l[2] : '🔒') + '</span>';
      const name = l[1] + ': ' + (open ? l[3] : t('dLocked'));
      return '<li class="cslot' + (open ? ' open' : '') + (fresh ? ' flip' : '') + '">' + (open && i === 0
        ? '<button class="cplay" data-snd="' + esc(p.snd) + '" aria-label="' + esc(name) + '">' + inner + '</button>'
        : '<span class="sr">' + esc(name) + '</span>' + inner) + '</li>';
    }).join('');
    let tries = '';
    for (let i = 0; i < CONFIG.dailyTries; i++) { const g = st.guesses[i]; tries += '<span class="try' + (g ? (g === p.answer ? ' ok' : ' no') : '') + '">' + (g ? (g === p.answer ? '✓' : '✗') : '📦') + '</span>'; }
    const prize = st.finished ? '' : '<span class="prize" role="img" aria-label="' + esc(t('dRewardAria', { n: CONFIG.dailyReward[st.guesses.length] })) + '"><span aria-hidden="true">✨' + CONFIG.dailyReward[st.guesses.length] + '</span></span>';
    const ans = ITEMS[p.answer];
    const result = st.finished
      ? '<div class="dres' + (st.won ? ' won' : '') + '"><p class="sr">' + esc(st.won ? t('dWon', { n: st.guesses.length, s: st.reward }) : t('dLost', { x: iName(ans), s: st.reward })) + '</p>' +
        '<span class="dres-art" aria-hidden="true">' + art(ans, true) + '</span><span class="rchip ' + (st.won ? 'yes' : 'no') + ' num" aria-hidden="true">' + (st.won ? '✓' : '✗') + ' +' + st.reward + ' ✨</span>' +
        '<button class="icon-btn" id="daily-share" aria-label="' + esc(t('dShare')) + '" title="' + esc(t('dShare')) + '">📋</button>' +
        '<span class="tclk num" role="img" aria-label="' + esc(t('dNext', { t: untilTomorrow() })) + '"><span aria-hidden="true">⏱ ' + esc(untilTomorrow()) + '</span></span></div>'
      : '<p class="sr">' + esc(t('dLeft', { n: CONFIG.dailyTries - st.guesses.length })) + '</p>';
    // Item cards: a picture and the weight range. A tap opens the item to listen to it and guess.
    const card = it => {
      const guessed = st.guesses.includes(it.id), right = it.id === p.answer;
      const mark = guessed ? (right ? '✓' : '✗') : (st.finished && right ? '✓' : '');
      const seen = (state.owned[it.id] || 0) > 0 || (st.finished && right); // unowned items show as silhouettes, as in the album
      const fx = dailyFx && dailyFx.id === it.id ? (dailyFx.ok ? ' pop' : ' shake') : '';
      return '<button class="dcard' + (seen ? '' : ' unseen') + (guessed && !right ? ' wrong' : '') + (st.finished && right ? ' right' : '') + fx + '" data-dpeek="' + esc(it.id) + '" data-day="' + esc(p.day) + '"' + (st.finished || guessed ? ' disabled' : '') +
        ' aria-label="' + esc(iName(it) + (mark ? ' ' + mark : '') + ' · ' + t('rangeAria', { a: it.w[0], b: it.w[1] })) + '"><span class="e" aria-hidden="true">' + art(it, false) + '</span>' +
        '<span class="w num" aria-hidden="true">' + it.w[0] + '–' + it.w[1] + '</span>' + (mark ? '<span class="mk" aria-hidden="true">' + mark + '</span>' : '') + '</button>';
    };
    const pool = dailyPool();
    const groups = CONFIG.startUnlocked.map(sid => '<div class="dgroup"><span class="gicon" style="--c:' + SERIES[sid].color + '" role="img" aria-label="' + esc(sName(SERIES[sid]) + ' · ' + sPost(SERIES[sid])) + '"><span aria-hidden="true">' + (SICON[sid] || '📦') + '</span></span>' +
      '<div class="dgrid">' + pool.filter(i => i.series === sid).map(card).join('') + '</div></div>').join('');
    return '<section class="scene town-daily" id="daily"><h2 class="sr">' + esc(t('dTitle')) + '</h2>' +
      '<div class="dhead"><span class="gbox" aria-hidden="true"><span class="q">?</span></span><span class="dnum num" aria-hidden="true">#' + p.n + '</span>' +
        '<span class="tries" role="img" aria-label="' + esc(t('dTriesAria', { a: st.guesses.length, b: CONFIG.dailyTries })) + '"><span aria-hidden="true">' + tries + '</span></span>' + prize +
        '<button class="icon-btn info" id="daily-help" aria-label="' + esc(t('howTo') + ' · ' + t('dTitle')) + '">ⓘ</button></div>' +
      '<ol class="cslots">' + slots + '</ol>' + result + '<div class="dgroups">' + groups + '</div></section>';
  }
  function dailyPeek(id, day) {
    const it = ITEMS[id]; if (!it || !dailyPool().some(i => i.id === id)) return;
    const st = dailyStatus(state, Date.now());
    const seen = (state.owned[id] || 0) > 0;
    playTag(it.snd);
    modal('<div class="peek-art' + (seen ? '' : ' unseen') + '" aria-hidden="true">' + art(it, seen) + '</div><h2>' + esc(iName(it)) + '</h2>' + facts(it) +
      (st.finished || st.guesses.includes(id) ? '' : '<span class="prize big" aria-hidden="true">✨' + CONFIG.dailyReward[st.guesses.length] + '</span>') +
      '<div class="row acts">' + (st.finished || st.guesses.includes(id) ? '' : '<button class="btn go" data-daily="' + esc(id) + '" data-day="' + esc(day) + '" aria-label="' + esc(t('dGuess', { x: iName(it) })) + '">✓</button>') +
      '<button class="btn ghost round" data-close aria-label="' + esc(t('close')) + '">↩</button></div>');
  }
  // The street: one house per neighbor. Today's requests float above their houses as icon bubbles (a tap hands over
  // a spare), an urgent parcel shows as a clock bubble, the 🎁 under a house gives a gift, and a tap on the house
  // reads the neighbor's stories, likes and perk. Neighbors who have not moved in yet are locked houses with their level.
  function streetPanel() {
    const lv = townLevel(state), now = Date.now(), haveSpare = spares(state).length > 0;
    const houses = CONFIG.residents.map(r => {
      if (r.lv > lv) return '<div class="neighbor house locked" style="--fc:#e6dccb"><span class="bubble none" aria-hidden="true"></span>' +
        '<div class="who" role="img" aria-label="' + esc('??? · ' + t('resLocked', { n: r.lv })) + '"><span class="roof" aria-hidden="true"></span><span class="face" aria-hidden="true">🔒</span><span class="door" aria-hidden="true"></span></div>' +
        '<span class="hearts num" aria-hidden="true">' + esc(t('lvShort', { n: r.lv })) + '</span></div>';
      const h = state.hearts[r.id] || 0, i = state.board.tasks.findIndex(q => q.kind === 'wish' && q.by === r.id), rq = i < 0 ? null : state.board.tasks[i];
      const urgent = state.parcels.some(p => p.urgent && p.resident === r.id);
      // An open request keeps its button (the only way to answer it); an urgent parcel adds a ⏱ to it.
      const bubble = rq && !rq.claimed
        ? '<button class="bubble" data-req="' + i + '" aria-label="' + esc(t('reqWants', { name: rName(r) }) + ' ' + rq.clues.map(clueText).join('. ') + '. ' + t('reqPick', { name: rName(r) }) + (urgent ? ' ' + t('stUrgent') : '')) + '"><span aria-hidden="true">' + (urgent ? '<span class="ci">⏱</span>' : '') +
          rq.clues.map(c => '<span class="ci">' + clueIcon(c) + '</span>').join('') + '<span class="gift">🎁</span></span></button>'
        : urgent ? '<span class="bubble urgent" role="img" aria-label="' + esc(rName(r) + ': ' + t('stUrgent')) + '"><span aria-hidden="true">⏱</span></span>'
        : rq ? '<span class="bubble done" role="img" aria-label="' + esc(rName(r) + ': ' + t('reqDone')) + '"><span aria-hidden="true">✓</span></span>'
        : '<span class="bubble none" aria-hidden="true"></span>';
      const gifted = giftedToday(state, r.id, now);
      const like = state.town.known.includes(r.id) ? t('likeKnown', { s: t('sndShort')[r.like] }) : t('likeUnknown');
      const gift = '<button class="gift-btn" data-gift="' + esc(r.id) + '"' + (gifted || !haveSpare ? ' disabled' : '') + ' aria-label="' + esc((gifted ? t('giftDone') : haveSpare ? t('giftBtn') : t('giftNoSpare')) + ' · ' + rName(r)) + '" title="' + esc(gifted ? t('giftDone') : haveSpare ? t('giftBtn') : t('giftNoSpare')) + '"><span aria-hidden="true">' + (gifted ? '✓' : '🎁') + '</span></button>';
      return '<div class="neighbor house" data-resident="' + esc(r.id) + '" style="--fc:' + faceOf(r)[1] + '">' + bubble +
        '<button class="who" data-res="' + esc(r.id) + '" aria-label="' + esc(t('stories', { name: rName(r) }) + ' · ' + t('heartsAria', { n: h })) + '"><span class="roof" aria-hidden="true"></span>' + face(r, urgent ? 'worried' : 'normal') + '<span class="door" aria-hidden="true"></span></button>' +
        '<span class="sr">' + esc(like) + '</span><span class="hrow">' + heartChip(h) + gift + '</span>' + decoRow(r.id) + '</div>';
    }).join('');
    const sp = streetProgress(state);
    return '<section class="scene town-street"><h2 class="sr">' + esc(t('reqTitle')) + ' · ' + esc(t('resTitle')) + '</h2>' +
      '<div class="shead"><span class="tclk num" role="img" aria-label="' + esc(t('reqNew', { t: untilTomorrow() })) + '"><span aria-hidden="true">⏱ ' + esc(untilTomorrow()) + '</span></span>' +
      '<button class="street-chip num" id="street-btn" aria-label="' + esc(t('stTitle') + ' · ' + t('stProgress', { a: sp.built, b: sp.total }) + (sp.next === null ? '' : ' · ' + t('stNext', { x: t('repairs')[sp.next][0], n: sp.toNext }))) + '"><span aria-hidden="true">🏘️ ' + sp.built + '/' + sp.total +
      (sp.next === null ? ' ✓' : ' · ' + STREET_STEPS[sp.next].e + ' ' + sp.toNext) + '</span></button>' +
      '<button class="icon-btn info" id="town-help" aria-label="' + esc(t('howTo') + ' · ' + t('reqTitle')) + '">ⓘ</button></div><div class="houses">' + houses + '</div></section>';
  }
  // Parcel Street (src/core/street.ts): the repairs a neighbor's building has got, as small decorations under the house.
  function decoRow(rid) {
    const bd = BUILDINGS.find(b => b.resident === rid); if (!bd) return '';
    const done = buildingDone(state, bd.id), steps = buildingSteps(bd.id);
    return '<span class="deco" aria-hidden="true">' + steps.map(i => done.includes(i) ? '<i>' + STREET_STEPS[i].e + '</i>' : '<i class="off"></i>').join('') + '</span>';
  }
  function streetModal() {
    const sp = streetProgress(state), R = t('repairs');
    const cards = BUILDINGS.map(bd => {
      const steps = buildingSteps(bd.id), open = buildingOpen(state, bd);
      const list = !open ? '<li class="muted">🔒 ' + esc(t('stWaiting', { name: t('reactShort')[bd.resident] })) + '</li>'
        : steps.map(i => i < sp.built ? '<li class="done">' + STREET_STEPS[i].e + ' ' + esc(R[i][0]) + '</li>' : '<li class="muted">🔒 ' + esc(t('stMore', { n: STREET_STEPS[i].rep - state.town.rep })) + '</li>').join('');
      return '<div class="bld' + (open ? '' : ' locked') + '"><b>' + bd.e + ' ' + esc(t('buildings')[bd.id]) + '</b><ul class="repairs">' + list + '</ul></div>';
    }).join('');
    const pctDone = sp.built / sp.total * 100;
    modal('<div class="big" aria-hidden="true">🏘️</div><h2>' + esc(t('stTitle')) + '</h2><p class="small" style="margin:0">' + esc(t('stProgress', { a: sp.built, b: sp.total })) + ' · ' + esc(sp.next === null ? t('stDone') : t('stNext', { x: R[sp.next][0], n: sp.toNext })) + '</p>' +
      '<div class="progress"><i style="width:' + pctDone + '%"></i></div><p class="small muted" style="margin:0">' + esc(t('stNote', { c: STREET_COINS })) + '</p>' +
      '<div class="bld-list">' + cards + '</div><button class="btn" data-close>' + esc(t('close')) + '</button>');
  }
  // New repairs wait, like level-ups, until no sheet or popup is showing. A long-away player sees the newest few.
  function streetCheck() {
    if (!state || sheet || $('#modal-root').innerHTML) return;
    const got = claimStreet(state);
    if (!got.length) return;
    saveQuiet(); sfx('rare'); buzz([40, 30, 80]); render();
    const R = t('repairs'), show = got.slice(-3), more = got.length - show.length;
    modal('<div class="big" aria-hidden="true">🏘️</div><h2>' + esc(t('stModalTitle')) + '</h2><ul class="unlocks" id="street-up">' +
      show.map(i => '<li>' + STREET_STEPS[i].e + ' <b>' + esc(R[i][0]) + '</b><br><span class="small muted">' + esc(R[i][1]) + '</span></li>').join('') +
      (more ? '<li class="muted">' + esc(t('stMoreDone', { n: more })) + '</li>' : '') + '</ul>' +
      '<p class="small" style="margin:0">' + esc(t('stCoins', { c: got.length * STREET_COINS })) + '</p><button class="btn" data-close>' + esc(t('stModalBtn')) + '</button>');
  }
  function perkText(id) { return t('perks')[id].replace('{n}', CONFIG.theoCoins); }
  function eventBanner(event, cls) {
    return '<img class="ev-banner' + (cls ? ' ' + cls : '') + '" src="ui/banner-' + esc(event) + '.webp" width="750" height="250" alt="" loading="lazy" decoding="async" draggable="false">';
  }
  function eventCard() {
    const ev = eventToday(state, Date.now());
    if (!ev) return '';
    const e = t('events')[ev];
    return '<div class="event-card has-banner" id="event" data-event="' + ev + '">' + eventBanner(ev) +
      '<div class="ev-body"><span class="ev-i" aria-hidden="true">' + e[0] + '</span><b>' + esc(e[1]) + '</b><span class="sr">' + esc(t('evTitle')) + ' · ' + esc(e[2].replace('{n}', CONFIG.movingBonus)) + '</span></div></div>';
  }
  function levelBar() {
    const lp = levelProgress(state), name = t('levelNames')[lp.level - 1];
    const pctDone = lp.to === null ? 100 : Math.min(100, (lp.rep - lp.from) / (lp.to - lp.from) * 100);
    return { name, lp, bar: '<div class="progress" role="progressbar" aria-valuemin="' + lp.from + '" aria-valuemax="' + (lp.to === null ? lp.rep : lp.to) + '" aria-valuenow="' + lp.rep + '"><i style="width:' + pctDone + '%"></i></div>',
      text: lp.to === null ? t('repMax', { a: lp.rep }) : t('repProgress', { a: lp.rep, b: lp.to, n: lp.level + 1 }),
      short: lp.to === null ? '🏘️ ' + lp.rep : '🏘️ ' + lp.rep + '/' + lp.to };
  }
  function unlockList(level) {
    const u = unlocksAt(level), out = [];
    u.residents.forEach(id => out.push('🏠 ' + t('unlockResident', { name: rName(resById(id)) })));
    u.features.forEach(f => out.push('✨ ' + t('unlockFeature')[f]));
    u.series.forEach(id => out.push('📦 ' + t('unlockSeries', { s: sName(SERIES[id]) })));
    u.decor.forEach(id => { const d = CONFIG.decor.items.find(x => x.id === id); if (d) out.push('🎨 ' + t('unlockDecor', { x: decorName(d) })); });
    return out;
  }
  function townStrip() {
    const b = levelBar();
    return '<section class="panel town-strip" id="town-strip"><div class="panel-head"><button class="link-btn" data-view="town"><b>' + esc(t('townLv', { n: b.lp.level })) + '</b><span class="sr"> · ' + esc(b.name) + '</span></button><span class="small muted num" aria-hidden="true">' + esc(b.short) + '</span><span class="sr">' + esc(b.text) + '</span></div>' + b.bar + boardLine() + eventCard() + '</section>';
  }
  // ---------- town board ----------
  const TASK_ICON = { open: '📦', guess: '🎯', sound: '🔊', series: '📮', return: '💌', gift: '🎁', daily: '🧩', request: '📝', rush: '⏱️', wish: '📝' };
  let justClaimed = null;
  function taskText(task) {
    if (task.kind === 'wish') return t('tasks').wish.replace('{name}', rName(resById(task.by))) + ': ' + (task.clues || []).map(clueText).join(', ');
    return t('tasks')[task.kind].replace('{n}', task.need)
      .replace('{s}', task.kind === 'sound' ? t('sndShort')[task.arg] : '')
      .replace('{p}', task.kind === 'series' ? sName(SERIES[task.arg]) : '');
  }
  function questText(task) { return t('quests')[task.kind].replace('{n}', task.need); }
  function boardLine() {
    const b = state.board; if (!b.tasks.length) return '';
    const ready = claimable(state), done = b.tasks.filter(taskDone).length;
    return '<button class="board-line" id="board-line" data-view="town"><span aria-hidden="true">📌 <b class="num">' + done + '/' + b.tasks.length + '</b></span><span class="sr">' + esc(t('boardStrip', { a: done, b: b.tasks.length })) + '</span>' +
      '<span class="pips" aria-hidden="true">' + b.tasks.map(x => '<i class="' + (x.claimed ? 'on' : taskDone(x) ? 'ready' : '') + '"></i>').join('') + '</span>' +
      (ready ? '<span class="ready-tag"><span aria-hidden="true">✓ ' + ready + '</span><span class="sr">' + esc(t('boardReady', { n: ready })) + '</span></span>' : '') + '</button>';
  }
  function boardPanel() {
    const b = state.board; if (!b.tasks.length) return '';
    const notes = b.tasks.map((task, i) => {
      const done = taskDone(task), pct = Math.round(task.got / task.need * 100);
      const end = task.claimed ? '<span class="stamp"><span aria-hidden="true">✓</span><span class="sr">' + esc(t('boardClaimed')) + '</span></span>'
        : task.kind === 'wish' ? '<button class="btn slim claim give-btn" data-req="' + i + '"><span class="sr">' + esc(t('wishGive')) + ' </span><span aria-hidden="true">🎁</span></button>'
        : done ? '<button class="btn slim claim" data-claim="' + i + '" data-board-day="' + esc(b.day) + '"><span class="sr">' + esc(t('boardClaim')) + ' </span>+' + CONFIG.board.coins + ' 🪙</button>' : '';
      const by = resById(task.by);
      return '<div class="note n' + i + (done ? ' done' : '') + (task.claimed ? ' claimed' : '') + (justClaimed === i ? ' just' : '') + '" data-task="' + esc(task.kind) + '" title="' + esc(taskText(task)) + '" style="--i:' + i + '"><i class="pin" aria-hidden="true"></i>' +
        '<div class="note-ic" aria-hidden="true">' + TASK_ICON[task.kind] + '</div><div class="note-body">' +
        (platform.features.stageLayout
          ? '<span class="note-t">' + esc(taskText(task)) + '</span><span class="sr">' + esc(t('taskSay')[task.kind]) + ' ' + esc(t('boardBy', { name: rName(by) })) + '</span>'
          : '<span class="sr note-t">' + esc(taskText(task)) + '. ' + esc(t('taskSay')[task.kind]) + ' ' + esc(t('boardBy', { name: rName(by) })) + '</span>') +
        '<span class="note-by" aria-hidden="true" title="' + esc(rName(by)) + '">' + (by ? faceOf(by)[0] : '') + '</span>' +
        (task.kind === 'wish'
          ? '<div class="note-foot wish-clues" aria-hidden="true">' + (task.clues || []).map(c => '<span class="ci">' + clueIcon(c) + '</span>').join('') + '</div>'
          : '<div class="note-foot"><div class="progress"><i style="width:' + pct + '%"></i></div><span class="num small">' + task.got + '/' + task.need + '</span></div>') + end + '</div></div>';
    }).join('');
    const seals = b.tasks.map(x => '<i class="seal' + (x.claimed ? ' on' : '') + '"></i>').join('');
    return '<section class="panel board-panel" id="board"><div class="panel-head"><h2><span aria-hidden="true">📌</span><span class="sr">' + esc(t('boardTitle')) + '</span></h2>' +
      '<span class="tclk num small muted" role="img" aria-label="' + esc(t('boardNew', { t: untilTomorrow() })) + '"><span aria-hidden="true">⏱ ' + esc(untilTomorrow()) + '</span></span>' +
      '<button class="icon-btn info" id="board-help" aria-label="' + esc(t('howTo') + ' · ' + t('boardTitle')) + '">ⓘ</button></div>' +
      '<div class="cork">' + notes + '</div>' +
      '<div class="board-bonus' + (b.bonus ? ' got' : '') + '"><span class="seals" aria-hidden="true">' + seals + '</span><b class="small num" aria-hidden="true">+' + CONFIG.board.bonusShards + ' ✨</b><span class="sr">' + esc(t('boardBonus', { s: CONFIG.board.bonusShards })) + '</span>' +
      '<span class="small muted num" aria-hidden="true">🏅 ' + b.stamps + '</span><span class="sr">' + esc(t('boardStamps', { n: b.stamps })) + '</span></div></section>';
  }
  // The Station "Today" panel: check-in card first, then the three fixed daily tasks and their star bonus.
  function todayPanel() {
    const c = state.checkin, q = state.quests, now = Date.now(), can = canCheckIn(state, now);
    const boxes = Array.from({ length: CONFIG.checkin.card }, (_, i) => '<i class="stamp-box' + (i < c.stamps ? ' on' : '') + '" aria-hidden="true">' + (i < c.stamps ? '✓' : '') + '</i>').join('');
    const check = '<div class="checkin"><div class="checkin-head"><b><span aria-hidden="true">📅</span> ' + esc(t('checkinTitle')) + '</b><span class="small muted num" aria-hidden="true">' + c.stamps + '/' + CONFIG.checkin.card + '</span></div>' +
      '<div class="stamp-row" role="img" aria-label="' + esc(t('checkinStamps', { n: c.stamps, max: CONFIG.checkin.card })) + '">' + boxes + '</div>' +
      '<div class="checkin-foot"><button class="btn slim" id="checkin-btn"' + (can ? '' : ' disabled') + '>' + esc(can ? t('checkinBtn') : t('checkinDone')) + '</button>' +
      '<span class="small muted">' + esc(can ? t('checkinHint') : t('checkinBackTomorrow')) + '</span></div>' +
      '<div class="small muted num checkin-big" aria-hidden="true">+' + CONFIG.checkin.bigParcels + ' 📦 · +' + CONFIG.checkin.bigShards + ' ✨ · ' + esc(t('checkinCards', { n: c.cards })) + '</div></div>';
    const rows = q.list.map((task, i) => {
      const done = questDone(task), pct = Math.round(task.got / task.need * 100);
      const end = task.claimed ? '<span class="stamp"><span aria-hidden="true">✓</span><span class="sr">' + esc(t('questClaimed')) + '</span></span>'
        : done ? '<button class="btn slim claim" data-qclaim="' + i + '" data-qday="' + esc(q.day) + '"><span class="sr">' + esc(t('questClaim')) + ' </span><span aria-hidden="true">+' + CONFIG.quests.coins + ' 🪙</span></button>' : '';
      return '<div class="quest-row' + (done ? ' done' : '') + (task.claimed ? ' claimed' : '') + '" data-quest="' + esc(task.kind) + '">' +
        '<span class="quest-ic" aria-hidden="true">' + QUEST_ICON[task.kind] + '</span><div class="quest-body"><span class="quest-t">' + esc(questText(task)) + '</span>' +
        '<div class="quest-foot"><div class="progress"><i style="width:' + pct + '%"></i></div><span class="num small">' + task.got + '/' + task.need + '</span></div></div>' + end + '</div>';
    }).join('');
    const bonus = '<div class="quest-bonus' + (q.bonus ? ' got' : '') + '"><span aria-hidden="true">★ ' + esc(t('questBonus', { s: CONFIG.quests.bonusShards, l: CONFIG.quests.bonusLost })) + '</span></div>';
    return '<section class="panel today-panel" id="today"><div class="panel-head"><h2><span aria-hidden="true">🗓️</span><span class="sr">' + esc(t('todayTitle')) + '</span></h2>' +
      '<span class="small muted sr">' + esc(t('questsTitle')) + '</span></div>' + check + '<div class="quest-list">' + rows + '</div>' + bonus + '</section>';
  }
  /** Puts up today's board and daily tasks; a toast for anything the old day still owed. Returns true when something changed. */
  function syncBoard() {
    const now = Date.now();
    const paid = refreshBoard(state, now, rng);
    const questPaid = refreshQuests(state, now, rng);
    const swapped = upgradeQuests(state, now) > 0;
    if (paid && (paid.coins || paid.shards)) setTimeout(() => toast(t('boardPaid', { c: paid.coins })), 800);
    if (questPaid && (questPaid.tasks || questPaid.bonus)) {
      const extra = (questPaid.shards ? ' · +' + questPaid.shards + ' ✨' : '') + (questPaid.lost ? ' · +' + questPaid.lost + ' 📦' : '');
      setTimeout(() => toast(t('questPaid', { c: questPaid.coins }) + extra), 1500);
    }
    const wished = addWishes(state, now, rng) > 0;
    const newWeek = refreshStory(state, now);
    if (paid && paid.coins) { const n = Math.round(paid.coins / CONFIG.board.coins); storyPages(n); socialLetters(n, false); }
    return !!paid || wished || newWeek || !!questPaid || swapped;
  }
  /** Counts a finished action on today's board and daily tasks, saves, and tells the player when a goal is done. */
  function noteBoard(ev) {
    const done = boardNote(state, ev, Date.now());
    // Rush Hour is sent to the daily tasks directly in the shift's finish callback, so it is not counted twice here.
    const qdone = ev.k === 'rush' ? [] : questNote(state, ev, Date.now());
    save();
    if (done.length) { const msg = t('boardDone', { x: taskText(done[0]) }); setTimeout(() => toast(msg), 1200); }
    if (qdone.length) { const msg = t('questDone', { x: questText(qdone[0]) }); setTimeout(() => toast(msg), 1600); }
  }
  function noteQuest(ev) {
    const done = questNote(state, ev, Date.now());
    save();
    if (done.length) { const msg = t('questDone', { x: questText(done[0]) }); setTimeout(() => toast(msg), 1600); }
  }
  function doClaim(btn) {
    if (btn.dataset.boardDay !== state.board.day) { toast(t('boardExpired')); render(); return; }
    const i = +btn.dataset.claim, r = claimTask(state, i);
    if (!r) return;
    storyPages(1);
    socialLetters(1, !!r.bonus);
    save(); sfx(r.bonus ? 'epic' : 'coin'); buzz(r.bonus ? [60, 40, 120] : [30]);
    justClaimed = i; render(); justClaimed = null;
    toast(r.bonus ? t('boardStamped', { n: r.bonus.stamps, s: r.bonus.shards }) : t('boardGot', { c: r.coins, r: r.rep }));
  }
  function doCheckIn() {
    const r = checkIn(state, Date.now(), rng);
    if (!r) return;
    save(); sfx(r.big ? 'epic' : 'coin'); buzz(r.big ? [60, 40, 120] : [30]);
    render();
    if (r.big) {
      if (host) host.happy();
      modal('<div class="big" aria-hidden="true">🎁</div><h2>' + esc(t('checkinBigTitle')) + '</h2>' +
        '<p style="margin:0">' + esc(t('checkinBigBody', { c: r.big.coins, p: r.big.parcels, s: r.big.shards })) + '</p>' +
        '<p class="small muted" style="margin:0">' + esc(t('checkinCards', { n: r.cards })) + '</p><button class="btn" data-close>' + esc(t('nice')) + '</button>');
    } else toast(t('checkinToast', { n: r.stamps, max: CONFIG.checkin.card }));
  }
  function doQuestClaim(btn) {
    if (btn.dataset.qday !== state.quests.day) { toast(t('questExpired')); render(); return; }
    const r = claimQuest(state, +btn.dataset.qclaim, Date.now(), rng);
    if (!r) return;
    save(); sfx(r.bonus ? 'epic' : 'coin'); buzz(r.bonus ? [60, 40, 120] : [30]);
    render();
    toast(r.bonus ? t('questBonusToast', { s: r.bonus.shards, l: r.bonus.lost }) : t('questGot', { c: r.coins, r: r.rep }));
  }
  function levelPanel() {
    const b = levelBar();
    const nextIcons = b.lp.level < MAX_LEVEL ? unlockList(b.lp.level + 1) : [];
    const next = nextIcons.length ? '<div class="next-unlocks"><span class="num small" aria-hidden="true">' + esc(t('lvShort', { n: b.lp.level + 1 })) + ' →</span><span class="ul-icons" aria-hidden="true">' + nextIcons.map(x => '<i title="' + esc(x.slice(x.indexOf(' ') + 1)) + '">' + x.slice(0, x.indexOf(' ')) + '</i>').join('') + '</span>' +
      '<span class="sr">' + esc(t('nextAt', { n: b.lp.level + 1 })) + ': ' + esc(nextIcons.map(x => x.slice(x.indexOf(' ') + 1)).join(', ')) + '</span></div>' : '';
    return '<section class="panel" id="town-level"><div class="panel-head"><h2>' + esc(t('townLv', { n: b.lp.level })) + '<span class="sr"> · ' + esc(b.name) + '</span></h2>' +
      '<span class="small muted num" aria-hidden="true">' + esc(b.short) + '</span><button class="icon-btn info" id="level-help" aria-label="' + esc(t('howTo') + ' · ' + t('townLv', { n: b.lp.level })) + '">ⓘ</button></div>' + b.bar +
      '<span class="sr">' + esc(b.text) + '</span>' + eventCard() + next + '</section>';
  }
  function levelHelp() {
    const b = levelBar(), ev = eventToday(state, Date.now());
    const parts = [['h', t('townLv', { n: b.lp.level }) + ' · ' + b.name], ['p', b.text], ['p', t('repHow')]];
    if (ev) { const e = t('events')[ev]; parts.push(['p', e[0] + ' ' + t('evTitle') + ' · ' + e[1] + ': ' + e[2].replace('{n}', CONFIG.movingBonus)]); }
    if (b.lp.level < MAX_LEVEL) parts.push(['p', t('nextAt', { n: b.lp.level + 1 }) + ': ' + unlockList(b.lp.level + 1).join(' · ')]);
    helpModal(parts);
  }
  function giftModal(rid) {
    const r = resById(rid); if (!r) return;
    const cards = spares(state).map(it => '<button class="card dpick" data-gift-item="' + esc(it.id) + '" data-gift-to="' + esc(rid) + '"><span class="cnt num">×' + Number(state.owned[it.id]) + '</span><div class="e" aria-hidden="true">' + art(it, true) + '</div><div class="nm">' + esc(iName(it)) + '</div><div class="meta">' + esc(RL(it.r)) + ' · ' + esc(t('sndShort')[it.snd]) + '</div></button>').join('');
    modal('<h2>' + esc(t('giftPick', { name: rName(r) })) + '</h2><p class="small muted" style="margin:0">' + esc(t('traits')[rid]) + '</p><p class="small" style="margin:0">' + esc(t('giftNote')) + '</p>' +
      '<div class="grid" style="max-height:min(50vh,calc(100dvh - 240px));overflow:auto">' + cards + '</div><button class="btn ghost" data-close>' + esc(t('close')) + '</button>');
  }
  function doGift(rid, itemId) {
    const knewBefore = state.town.known.includes(rid);
    const g = giveGift(state, rid, itemId, Date.now());
    $('#modal-root').innerHTML = '';
    if (!g) { render(); return; }
    save(); sfx(g.fav ? 'rare' : 'coin');
    noteBoard({ k: 'gift' });
    const found = g.fav && !knewBefore ? '<p class="small" style="margin:0"><b>' + esc(t('giftFound', { name: rName(g.resident), s: t('sndShort')[g.resident.like] })) + '</b></p>' : '';
    const tale = g.newTale != null ? '<p class="small" style="margin:0"><b>' + esc(t('taleNew')) + '</b> ' + esc(rTale(g.resident, g.newTale)) + '</p>' : '';
    render();
    modal('<div class="mface happy" style="--fc:' + faceOf(g.resident)[1] + '">' + face(g.resident, 'happy') + '</div><h2>' + esc(g.fav ? t('giftFav', { name: rName(g.resident) }) : t('giftOk', { name: rName(g.resident) })) + '</h2>' + found + tale +
      '<p class="small muted" style="margin:0">' + esc(t('repGot', { n: g.rep })) + '</p><button class="btn" data-close>' + esc(t('nice')) + '</button>');
  }
  // Level-ups wait until no sheet or other popup is showing, then announce the highest new level and what it opened.
  function levelCheck() {
    if (!state || sheet || $('#modal-root').innerHTML) return;
    const ups = claimLevelUp(state);
    if (!ups.length) { streetCheck(); return; }
    syncBoard();
    saveQuiet();
    if (ups.some(l => l >= CONFIG.townFeatures.rush)) platform.kv.set(RUSH_NEW, '1');
    const items = ups.flatMap(unlockList);
    sfx('epic'); buzz([60, 40, 120]); if (host) host.happy();
    const top = ups[ups.length - 1];
    hintHold = true; // a feature tip must wait behind the level-up popup
    render();
    hintHold = false;
    modal('<div class="big" aria-hidden="true">🏘️</div><h2>' + esc(t('levelUpTitle', { n: top })) + '</h2><p style="margin:0"><b>' + esc(t('levelNames')[top - 1]) + '</b></p>' +
      '<ul class="unlocks" id="level-up">' + items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><button class="btn" data-close>' + esc(t('levelUpBtn')) + '</button>');
  }
  // "Today" on the left, the street and the town level on the right: the two columns end at about the same height
  // on a 768px-tall laptop, so the level bar is not pushed below the fold by the daily parcel.
  function townView() {
    if (cgStage) {
      const tabs = [['board', t('tabBoard')], ['daily', t('tabDaily')], ['street', t('tabStreet')], ['level', t('tabLevel')], ['story', t('tabStory')]];
      const tab = stageTab.town;
      const content = tab === 'daily' ? dailyPanel() : tab === 'street' ? streetPanel() : tab === 'level' ? levelPanel() : tab === 'story' ? storyPanel() : boardPanel();
      return header() + stageBar('town', tabs) + stagePage(content);
    }
    return header() + cols(boardPanel() + storyPanel() + dailyPanel(), streetPanel() + socialPanel() + levelPanel());
  }
  // ---------- Discord social: carried parcels and the server board (backend.social; other builds have none) ----------
  const social = backend && backend.social ? backend.social : null;
  const CARRY_SEEN = 'parcelwood.carrySeen'; // the launch token already redeemed on this device
  let guildInfo = null, carryBusy = false, socialAt = 0;
  const socialReady = () => !!social && accountsOn() && !!auth.user() && !syncing && !!state;
  function socialPanel() {
    if (!social) return '';
    const s = state.social, S = CONFIG.social.carryShards, today = localDay(new Date());
    const got = state.board.tasks.filter(x => x.claimed).length, all = state.board.tasks.length || CONFIG.board.tasks;
    const carry = s.carryReady
      ? '<button class="btn carry-btn" id="carry-btn"' + (carryBusy ? ' disabled' : '') + '><span aria-hidden="true">📦 → 🧑‍🤝‍🧑 <b class="num">+' + S + ' ✨</b></span><span class="sr">' + esc(t('carryBtn')) + '. ' + esc(t('carryReady', { s: S })) + '</span></button>'
      : '<span class="carry-state num" aria-hidden="true">' + (s.carryDay === today ? '✓ 📦' : '✉️ ' + got + '/' + all + ' → 📦') + '</span><span class="sr">' + esc(t(s.carryDay === today ? 'carryDone' : 'carryLocked')) + '</span>';
    const stats = s.sent || s.got ? '<span class="small muted num" aria-hidden="true">↗ ' + s.sent + ' · ↙ ' + s.got + '</span><span class="sr">' + esc(t('carryStats', { a: s.sent, b: s.got })) + '</span>' : '';
    let board = '';
    if (social.guildId && guildInfo) {
      const g = guildInfo, next = guildNext(g.total), goal = next || CONFIG.social.guildGoals[CONFIG.social.guildGoals.length - 1];
      const pctDone = Math.min(100, Math.round(g.total / goal * 100));
      board = '<div class="guild-row" id="guild-board"><span aria-hidden="true">🏘️</span><div class="progress" role="progressbar" aria-label="' + esc(t('guildTitle')) + '" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(g.total, goal) + '"><i style="width:' + pctDone + '%"></i></div>' +
        '<span class="num small" aria-hidden="true">' + g.total + '/' + goal + (next ? ' · +' + CONFIG.social.guildShards + '✨' : ' ✓') + '</span>' +
        '<span class="sr">' + esc(t('guildLine', { n: g.total, p: g.players })) + ' ' + esc(next ? t('guildNext', { g: next, s: CONFIG.social.guildShards }) : t('guildAll')) + ' ' + esc(t('guildMine', { n: g.mine })) + '</span></div>';
    }
    return '<section class="panel social-panel" id="social"><div class="panel-head"><h2><span aria-hidden="true">🤝</span><span class="sr">' + esc(t('socialTitle')) + '</span></h2>' + stats +
      '<button class="icon-btn info" id="social-help" aria-label="' + esc(t('howTo') + ' · ' + t('socialTitle')) + '">ⓘ</button></div>' +
      '<div class="carry-row" id="carry">' + carry + '</div>' + board + '</section>';
  }
  function socialHelp() {
    const G = CONFIG.social.guildGoals;
    const parts = [['h', t('carryTitle')], ['p', t('socialRules', { s: CONFIG.social.carryShards })]];
    if (social.guildId) parts.push(['h', t('guildTitle')], ['p', t('guildRules', { a: G[0], b: G[1], c: G[2], g: CONFIG.social.guildShards })]);
    helpModal(parts);
  }
  /** n letters finished. bonus: it was the last of today's three, so a parcel to carry is earned. */
  function socialLetters(n, bonus) {
    if (!social || n < 1) return;
    if (bonus && earnCarry(state, Date.now())) saveQuiet();
    if (!socialReady() || !social.guildId) return;
    social.guildAdd(weekOf(Date.now()), Math.min(3, n)).then(() => socialPoll(true), () => {});
  }
  function pay(shards, msg) { if (!shards) return; save(); sfx('coin'); render(); setTimeout(() => toast(msg), 600); }
  /** Friends' thank-yous and the server board. Runs at start and on visits to the Town page, at most every 30 s. */
  function socialPoll(force) {
    if (!socialReady() || (!force && Date.now() - socialAt < 30000)) return Promise.resolve();
    socialAt = Date.now();
    return enqueue(async () => {
      if (!socialReady()) return;
      try { const n = await social.carryThanks(); if (n > 0) { const s = carryThanks(state, n); pay(s, t('carryThanks', { n, s })); } } catch (e) { /* offline */ }
      if (!social.guildId) return;
      try {
        const week = weekOf(Date.now()), g = await social.guildGet(week);
        if (!socialReady()) return;
        guildInfo = g;
        const r = guildClaim(state, Date.now(), g.total, g.mine);
        if (r.shards) pay(r.shards, t('guildPaid', { s: r.shards })); else { saveQuiet(); if (view === 'town') render(); }
      } catch (e) { /* offline: the board shows next time */ }
    });
  }
  /** Opened from a friend's shared link: redeem the carried parcel once, then poll. */
  function socialStart() {
    if (!social) return;
    const token = parseCarry(social.launchCode);
    if (token && platform.kv.get(CARRY_SEEN) !== token) enqueue(async () => {
      if (!socialReady()) return;
      let r;
      try { r = await social.carryClaim(token); } catch (e) { return; } // offline: try again next start
      platform.kv.set(CARRY_SEEN, token);
      if (r === 'ok') { const g = carryReceived(state, rng); save(); sfx('rare'); render(); setTimeout(() => toast(t('carryGot', { s: g.shards })), 600); }
      else setTimeout(() => toast(t(r === 'own' ? 'carryOwn' : 'carryGone')), 600);
    });
    socialPoll(true);
  }
  async function carryFlow() {
    if (carryBusy || !state.social.carryReady || !socialReady()) { if (!socialReady()) toast(t('carryFail')); return; }
    carryBusy = true; render();
    try {
      const token = await social.carrySend();
      const r = await social.share(t('carryMsg', { s: CONFIG.social.carryShards }), carryCode(token));
      if (r === 'cancelled') toast(t('carryCancel'));
      else { carrySent(state); save(); sfx('coin'); toast(t(r === 'sent' ? 'carrySent' : 'carryCopied', { s: CONFIG.social.carryShards })); }
    } catch (e) { toast(t('carryFail')); }
    carryBusy = false; render();
  }
  // ---------- this week's story ----------
  function storyText(id) { return t('storyTexts')[id]; }
  function storyPanel() {
    const st = state.story, s = storyById(st.id), n = chaptersOpen(st), N = CONFIG.story.chapters;
    const shelf = st.keep.length ? '<div class="story-shelf"><span class="sr">' + esc(t('storyShelf')) + '</span><span class="keeps">' +
      st.keep.map(id => { const k = storyById(id); return k ? '<i role="img" title="' + esc(storyText(id)[2]) + '" aria-label="' + esc(storyText(id)[2]) + '">' + k.keep + '</i>' : ''; }).join('') + '</span></div>' : '';
    const head = '<div class="panel-head"><h2><span aria-hidden="true">📖</span><span class="sr">' + esc(t('storyTitle')) + '</span></h2><button class="icon-btn info" id="story-help" aria-label="' + esc(t('howTo') + ' · ' + t('storyTitle')) + '">ⓘ</button></div>';
    if (!s) return '<section class="panel story-panel" id="story">' + head + '<span class="story-next" aria-hidden="true">🔒</span><span class="sr">' + esc(t('storyNone')) + '</span>' + shelf + '</section>';
    const r = resById(s.resident), txt = storyText(s.id), left = pagesToNext(st), news = unread(st);
    const dots = Array.from({ length: N }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('');
    return '<section class="panel story-panel" id="story">' + head +
      '<button class="story-card" data-story-read aria-label="' + esc(t('storyRead') + ' · ' + txt[0]) + '"><span class="mface sm" style="--fc:' + faceOf(r)[1] + '" aria-hidden="true">' + face(r) + '</span>' +
      '<span class="story-meta"><b class="sr">' + esc(txt[0]) + '</b><span class="sr">' + esc(t('storyBy', { name: rName(r) })) + '</span>' +
      '<span class="story-dots" role="img" aria-label="' + esc(n + '/' + N) + '">' + dots + '</span></span>' +
      (news ? '<span class="story-new num" aria-label="' + esc(t('storyNew', { x: news })) + '">' + news + '</span>' : '<span class="story-keep' + (st.finished ? '' : ' todo') + '" aria-hidden="true">' + s.keep + '</span>') + '</button>' +
      '<span class="story-next num" aria-hidden="true">' + (left === null ? '✓ ' + s.keep : '✉️ ×' + left + ' → 📖') + '</span><span class="sr">' + esc(left === null ? t('storyDone') : t('storyNext', { n: left })) + '</span>' + shelf + '</section>';
  }
  function storyModal() {
    const st = state.story, s = storyById(st.id); if (!s) return;
    const r = resById(s.resident), txt = storyText(s.id), n = chaptersOpen(st);
    const chs = txt[1].map((line, i) => i < n
      ? '<div class="chapter' + (i >= st.read ? ' fresh' : '') + '"><b class="small">' + esc(t('storyCh', { n: i + 1 })) + '</b><p class="tale">' + esc(line) + '</p></div>'
      : '<div class="chapter lock"><b class="small">' + esc(t('storyCh', { n: i + 1 })) + '</b><p class="tale lock"><span aria-hidden="true">🔒 </span>' + esc(t('storyLocked')) + '</p></div>').join('');
    markRead(state); saveQuiet();
    modal('<div class="mface" style="--fc:' + faceOf(r)[1] + '">' + face(r) + '</div><h2>' + esc(txt[0]) + '</h2><p class="small muted" style="margin:0">' + esc(t('storyBy', { name: rName(r) })) + '</p>' +
      '<div class="chapters">' + chs + '</div>' + (st.finished ? '<p class="small" style="margin:0"><b>' + s.keep + ' ' + esc(txt[2]) + '</b></p>' : '') +
      '<button class="btn" data-close>' + esc(t('nice')) + '</button>');
    render();
  }
  /** Finished letters write pages in this week's story. Tells the player about a new chapter or the end. */
  function storyPages(n) {
    const p = addPages(state, n, Date.now());
    if (!p.opened && !p.finished) return;
    saveQuiet();
    const s = storyById(state.story.id), txt = storyText(s.id);
    const msg = p.finished ? t('storyEnd', { s: p.finished.shards, r: p.finished.rep, k: p.finished.keep + ' ' + txt[2] }) : t('storyNew', { x: t('storyCh', { n: chaptersOpen(state.story) }) + ' · ' + txt[0] });
    setTimeout(() => toast(msg), 2200);
  }
  function storiesModal(id) {
    const r = CONFIG.residents.find(x => x.id === id); if (!r) return;
    const h = state.hearts[r.id] || 0, n = talesUnlocked(state, r.id);
    const tales = CONFIG.taleHearts.map((need, i) => i < n ? '<p class="tale">' + esc(rTale(r, i)) + '</p>'
      : '<p class="tale lock"><span class="sr">' + esc(t('taleLocked', { n: need })) + '</span><span aria-hidden="true">🔒 ♥ ' + need + '</span></p>').join('');
    const like = state.town.known.includes(r.id) ? t('likeKnown', { s: t('sndShort')[r.like] }) : t('likeUnknown');
    const perk = PERK_RESIDENTS.includes(r.id) ? '<p class="small perk' + (perkOn(state, r.id) ? ' on' : '') + '" style="margin:0">' + esc(perkOn(state, r.id) ? '✓ ' + perkText(r.id) : t('perkLocked', { n: CONFIG.perkHearts, x: perkText(r.id) })) + '</p>' : '';
    const gifted = giftedToday(state, r.id, Date.now()), haveSpare = spares(state).length > 0;
    modal('<div class="mface" style="--fc:' + faceOf(r)[1] + '">' + face(r) + '</div><h2>' + esc(rName(r)) + '</h2><span class="sr">' + esc(t('heartsAria', { n: h })) + '</span>' + heartChip(h) +
      '<p class="small muted" style="margin:0">' + esc(t('traits')[r.id]) + '</p><p class="small" style="margin:0">🎁 ' + esc(like) + '</p>' + perk + tales +
      '<div class="row acts">' + (!gifted && haveSpare ? '<button class="btn" data-gift="' + esc(r.id) + '">🎁 ' + esc(t('giftBtn')) + '</button>' : '') +
      '<button class="btn ghost round" data-close aria-label="' + esc(t('close')) + '">↩</button></div>');
  }
  function sparesModal(i) {
    const rq = state.board.tasks[i]; if (!rq || rq.kind !== 'wish' || rq.claimed) return;
    const r = CONFIG.residents.find(x => x.id === rq.by);
    const list = spares(state);
    if (!list.length) { sfx('tap'); toast(t('reqNoSpare')); return; }
    // Each spare shows only what this neighbor asked about (its sound, weight, series or rarity).
    const ks = rq.clues.map(c => c.k);
    const shown = it => (ks.includes('snd') ? '<span>🔊 ' + esc(t('sndShort')[it.snd]) + '</span>' : '') + (ks.includes('under') || ks.includes('over') ? '<span>⚖️ ' + it.w[0] + '–' + it.w[1] + '</span>' : '') +
      (ks.includes('series') ? '<span>' + (SICON[it.series] || '') + '</span>' : '') + (ks.includes('rarity') ? '<span class="gemc c-' + it.r + '">' + RICON[it.r] + '</span>' : '');
    const cards = list.map(it => '<button class="dcard give" data-give="' + esc(it.id) + '" data-req-i="' + i + '" data-req-day="' + esc(state.board.day) + '" aria-label="' + esc(iName(it) + ' · ×' + Number(state.owned[it.id]) + ' · ' + RL(it.r) + ' · ' + t('rangeAria', { a: it.w[0], b: it.w[1] }) + ' · ' + t('sndShort')[it.snd]) + '">' +
      '<span class="cnt num" aria-hidden="true">×' + Number(state.owned[it.id]) + '</span><span class="e" aria-hidden="true">' + art(it, true) + '</span><span class="w num" aria-hidden="true">' + shown(it) + '</span></button>').join('');
    modal('<h2 class="sr">' + esc(t('reqPick', { name: rName(r) })) + '</h2><p class="sr">' + esc(rq.clues.map(clueText).join('. ')) + '</p>' +
      '<div class="askrow" aria-hidden="true"><span class="mface" style="--fc:' + faceOf(r)[1] + '">' + face(r) + '</span><span class="bubble">' + rq.clues.map(c => '<span class="ci">' + clueIcon(c) + '</span>').join('') + '</span></div>' +
      '<div class="dgrid pickgrid">' + cards + '</div><button class="btn ghost round" data-close aria-label="' + esc(t('close')) + '">↩</button>');
  }
  function giveSpare(i, itemId) {
    const before = { coins: state.coins, shards: state.shards };
    const res = fulfillWish(state, i, itemId);
    if (!res) return;
    if (!res.ok) { // the picker stays open for another try
      sfx('tap'); buzz(30); toast(t('reqWrong', { name: rName(res.resident) }));
      const c = document.querySelector('#modal-root [data-give="' + itemId + '"]'); if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
      return;
    }
    socialLetters(1, !!res.bonus);
    save(); sfx(res.bonus ? 'epic' : 'coin'); storyPages(1); render();
    if (res.bonus) setTimeout(() => toast(t('boardStamped', { n: res.bonus.stamps, s: res.bonus.shards })), 900);
    const tale = res.newTale != null ? '<p class="tale"><b>' + esc(t('taleNew')) + '</b> ' + esc(rTale(res.resident, res.newTale)) + '</p>' : '';
    modal('<div class="mface happy" style="--fc:' + faceOf(res.resident)[1] + '">' + face(res.resident, 'happy') + '<span class="pop-heart" aria-hidden="true">♥</span></div><h2>' + esc(t('reqThanks', { name: rName(res.resident) })) + '</h2>' +
      '<div class="rchips"><span class="sr">' + esc(t('reqReward', { c: res.coins, s: res.shards })) + '</span><span class="rchip num" aria-hidden="true">+' + res.coins + ' 🪙</span><span class="rchip num" aria-hidden="true">+' + res.shards + ' ✨</span><span class="rchip num" aria-hidden="true">+1 ♥</span></div>' + tale +
      '<button class="btn" data-close>' + esc(t('nice')) + '</button>');
    flyFrom($('#modal-root .mface'), '#app', before);
  }
  async function shareDaily() {
    const ds = dailyStatus(state, Date.now());
    const text = dailyShare(ds, t('dShareTitle'));
    noteShare(state, ds.puzzle.day); save();
    const fallback = () => modal('<h2>' + esc(t('dShare')) + '</h2><p class="small" style="margin:0">' + esc(t('dCopyHint')) + '</p><textarea readonly rows="3" style="width:100%;font:inherit">' + esc(text) + '</textarea><button class="btn" data-close>' + esc(t('close')) + '</button>');
    // Phones (Web Share): the native share sheet. Desktops and old browsers: copy, as before.
    if (platform.share) {
      let r;
      try { r = await platform.share.share(text, cleanShareUrl(window.location)); } catch (e) { r = 'cancelled'; }
      if (r === 'sent') { toast(t('dShared')); return; }
      if (r === 'copied') { toast(t('dCopied')); return; }
      if (r === 'cancelled') return;
    }
    try { await navigator.clipboard.writeText(text); toast(t('dCopied')); } catch (e) { fallback(); }
  }

  // ---------- modals ----------
  function oddsModal() {
    const P = CONFIG.pity;
    const rows = RARITIES.map(r => '<tr><td>' + rbadge(r) + '</td><td>' + pct(CONFIG.odds[r]) + '</td><td>' + pct(CONFIG.mysteryOdds[r]) + '</td><td>' + CONFIG.series[0].items.filter(i => i.r === r).length + '</td></tr>').join('');
    const items = CONFIG.series.map(s => '<p class="small" style="margin:0;text-align:left"><b>' + esc(sName(s)) + ':</b> ' + s.items.map(i => esc(iName(i)) + ' (' + esc(RL(i.r)) + ')').join(', ') + '</p>').join('');
    modal('<h2>' + esc(t('parcelOdds')) + '</h2><div class="tbl-wrap"><table><thead><tr><th>' + esc(t('thRarity')) + '</th><th>' + esc(t('thParcel')) + '</th><th>' + esc(t('thMystery')) + '</th><th>' + esc(t('thItems')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="small odds-rules" style="text-align:left;display:flex;flex-direction:column;gap:4px"><span>' + esc(t('ruleRare', { n: P.rareEvery })) + '</span><span>' + esc(t('ruleEpic', { n: P.epicEvery })) + '</span><span>' + esc(t('ruleSecret', { a: P.secretSoftStart, b: P.secretHard })) + '</span><span>' + esc(t('ruleNew')) + '</span></div>' +
      '<div class="odds-items">' + items + '</div>' + (state.demoLuck ? '<p class="small" style="margin:0;color:var(--stamp)">' + esc(t('demoOn')) + '</p>' : '') + '<button class="btn" data-close>' + esc(t('close')) + '</button>');
  }
  function modal(html, cls) {
    $('#modal-root').innerHTML = '<div class="modal-back" id="mb"><div class="modal' + (cls ? ' ' + cls : '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('#mb').addEventListener('click', e => { if (e.target.id === 'mb' || e.target.hasAttribute('data-close')) { $('#modal-root').innerHTML = ''; levelCheck(); autoHint(); } });
    renderHint();
    focusInto($('#modal-root .modal'), null, false);
  }

  // ---------- dialog focus ----------
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let sheetReturn = null;
  function focusables(box) { return Array.from(box.querySelectorAll(FOCUSABLE)).filter(el => !el.closest('[hidden]')); }
  function focusKey(el) {
    if (!el || !el.closest || !el.closest('#sheet-root')) return null;
    if (el.id) return '#' + el.id;
    for (const a of ['data-tool', 'data-gs', 'data-gr', 'data-anon']) if (el.hasAttribute(a)) return '[' + a + '="' + el.getAttribute(a) + '"]';
    return null;
  }
  /** Puts focus inside a freshly drawn dialog: back on the same control if it is still usable, else on the first control. */
  function focusInto(box, key, keep) {
    if (!box) return;
    const same = key ? box.querySelector(key) : null;
    if (same && same.matches(FOCUSABLE)) { same.focus({ preventScroll: true }); return; }
    if (keep) { box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true }); return; }
    const first = focusables(box)[0];
    if (first) first.focus({ preventScroll: true });
    else { box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true }); }
  }
  function trapTab(e) {
    const box = $('#modal-root .modal') || $('#sheet-root .sheet');
    if (!box) return;
    const list = focusables(box);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1], at = document.activeElement;
    if (!box.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }
  function restoreSheetFocus() {
    const back = sheetReturn; sheetReturn = null;
    if ($('#modal-root .modal')) return;
    const el = back && back.isConnected ? back : $('#app [data-parcel]') || $('#app button');
    if (el) el.focus({ preventScroll: true });
  }

  // One live region for the whole session, made before it is first needed so the first message is read too.
  function liveRegion() {
    let live = document.getElementById('sr-live');
    if (!live) { live = document.createElement('div'); live.id = 'sr-live'; live.className = 'sr'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
    return live;
  }
  function announce(text) {
    const live = liveRegion();
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 60); // cleared first so the same words twice are still read
  }

  // ---------- inspect sheet ----------
  function openSheet(id) {
    const p = state.parcels.find(x => x.id === id); if (!p) return;
    if (!sheet) sheetReturn = document.activeElement;
    rollParcel(state, p, rng);
    stopFly(); liveRegion();
    if (!state.introSeen) state.introSeen = true; // the pointing finger on the shelf has done its job
    save();
    if (coachActive && coachStep === 'reveal') endCoach(); // the finished reveal is no longer the current tip
    if (coachActive && coachStep === 'parcel') coachStep = 'clue';
    sheet = { id, stage: 'inspect' };
    renderSheet(false); render();
  }
  function closeSheet() {
    stopFly(); sheet = null; $('#sheet-root').innerHTML = '';
    if (coachActive && coachStep !== 'reveal') coachStep = 'parcel';
    render(); restoreSheetFocus();
  }

  function renderSheet(keep) {
    const p = state.parcels.find(x => x.id === sheet.id);
    const root = $('#sheet-root');
    const old = $('.sheet', root); const y = keep && old ? old.scrollTop : 0;
    // Re-rendering replaces the buttons, so remember which one had focus and put it back afterwards.
    const ae = keep ? document.activeElement : null;
    const focusSel = ae && root.contains(ae) ? (ae.id ? '#' + ae.id : ae.dataset.tool ? '[data-tool="' + ae.dataset.tool + '"]' : ae.dataset.gs ? '[data-gs="' + ae.dataset.gs + '"]' : ae.dataset.gr ? '[data-gr="' + ae.dataset.gr + '"]' : null) : null;
    if (!p) { closeSheet(); return; }
    const s = SERIES[p.series], it = ITEMS[p.item];
    // Screen readers still get every clue as words; on screen the clues are stickers on the box.
    const clues = [];
    if (p.kind === 'normal') clues.push(t('kSticker') + ': ' + (p.sticker ? t('stickerYes', { c: t(COLORWORD[s.id]) }) : t('stickerNo')));
    else if (p.urgent) clues.push(t('kLabel') + ': ' + rName(resById(p.resident)) + ' · ' + t('urgentLabel', { time: clock(p.urgent) }));
    else if (p.anon) { clues.push(t('kLabel') + ': ' + t('anonLabel')); clues.push(t('kClue') + ': ' + (p.used.look ? t('anonClues')[p.resident][p.id % 2] : t('anonLook'))); }
    else clues.push(t('kLabel') + ': ' + t('labelMystery'));
    if (p.used.shake) clues.push(t('kShake') + ': ' + t('snd')[it.snd]);
    if (p.used.weigh) clues.push(t('kWeight') + ': ' + fmtWeight(p.weight));
    if (p.used.look) clues.push(t('kLook') + ': ' + (p.postmarkClear ? t('pmReads', { p: sPost(s) }) : t('pmSmudged')) + (p.insured ? t('careYes') : t('careNo')));
    if (p.used.xray) clues.push(t('kXray') + ': ' + t('xrayShape'));
    const tool = (k, art, name, tag, used, dis) => '<button class="tool t-' + k + (used ? ' used' : '') + '" data-tool="' + k + '"' + (dis ? ' disabled' : '') + ' aria-label="' + esc(name + (tag ? ' · ' + tag.replace('🪙', t('coins')) : '') + (used ? ' · ' + t('tDone') : '')) + '" title="' + esc(name) + '">' + art +
      '<span class="tc" aria-hidden="true">' + esc(String(name).split(' · ')[0]) + '</span>' +
      (tag ? '<span class="price num" aria-hidden="true">' + tag + '</span>' : '') + (used ? '<span class="ok" aria-hidden="true">✓</span>' : '') + '</button>';
    const reward = CONFIG.guessReward, xp = xrayPrice(state, Date.now()); // Mr. Dube's perk makes it free; a power cut takes it down
    const xName = t('tXray') + (p.used.xray ? '' : xp === null ? ' · ' + t('xrayDown') : xp === 0 ? ' · ' + t('xrayFree') : '');
    const xTag = p.used.xray ? '' : xp === null ? '⛔' : xp + ' 🪙';
    const sOpts = state.unlocked.map(id => '<button class="crate" data-gs="' + esc(id) + '" aria-pressed="' + (p.guess.series === id) + '" aria-label="' + esc(sName(SERIES[id])) + '" title="' + esc(sName(SERIES[id])) + '" style="--crate:' + SERIES[id].color + '"><span aria-hidden="true">' + (SICON[id] || '📦') + '</span></button>').join('');
    const rOpts = RARITIES.map(r => '<button class="gem c-' + r + '" data-gr="' + r + '" aria-pressed="' + (p.guess.rarity === r) + '" aria-label="' + esc(RL(r)) + '" title="' + esc(RL(r)) + '"><span aria-hidden="true">' + RICON[r] + '</span></button>').join('');
    const hintShake = !p.used.shake && state.stats.opened < 3; // first parcels only: a wiggling finger instead of an instruction
    const streakNext = streakBonus(state.streak.n + 1);
    const streakLine = p.guess.series ? t('streakNext', { n: state.streak.n, x: streakNext }) : t('streakNoGuess', { n: state.streak.n });
    const guess = '<div class="guess"><h3 class="sr">' + esc(t('guessTitle')) + '</h3>' +
        (state.stats.opened < 3 ? '<p class="guess-hint" aria-hidden="true">' + esc(t('guessHint')) + '</p>' : '') +
        '<div class="guess-row"><div class="pick crates" role="group" aria-label="' + esc(t('whichSeries')) + '">' + sOpts + '</div><span class="bonus num"><span class="sr">' + esc(t('guessReward', { a: reward.series, b: reward.rarity })) + '</span><span aria-hidden="true">+' + reward.series + '✨</span></span></div>' +
        '<div class="guess-row"><div class="pick gems" role="group" aria-label="' + esc(t('howRare')) + '">' + rOpts + '</div><span class="bonus num" aria-hidden="true">+' + reward.rarity + '✨</span></div>' +
        '<p class="streak-line small muted">' + esc(streakLine) + '</p></div>';
    const openBtn = '<button class="btn go" id="go-open" aria-label="' + esc(p.guess.series || p.guess.rarity ? t('lockOpen') : t('openNoGuess')) + '"><span class="go-i" aria-hidden="true">✂️</span><span class="go-t" aria-hidden="true">' + esc(t('openBtn')) + '</span></button>';
    let actions;
    if (p.urgent) {
      // An urgent parcel belongs to a neighbor: no guessing, no opening, only the delivery.
      const rr = resById(p.resident), late = Date.now() > p.urgent;
      // The worried neighbour waits beside the mailbox button: hand it over before the clock runs out.
      actions = '<div class="askrow"><span class="mface worried" style="--fc:' + faceOf(rr)[1] + '">' + face(rr, 'worried') + '</span>' +
        '<button class="btn warm mail" id="go-return" aria-label="' + esc(t('urgentBtn', { name: rName(rr) }) + '. ' + (late ? t('urgentLateNote', { name: rName(rr) }) : t('urgentNote', { c: CONFIG.urgentBonus }))) + '">' + MAILBOX +
        '<span class="small">' + esc(t('urgentBtn', { name: rName(rr) })) + '</span>' + (late ? '' : '<span class="price num" aria-hidden="true">+' + CONFIG.urgentBonus + ' 🪙</span>') + '</button></div>';
    } else if (p.anon) {
      // No name on it: after a look at the stamps, the clue reads as a line from the box; pick a face to deliver it.
      const who = openResidents(state).map(r => '<button class="face-pick" data-anon="' + esc(r.id) + '" aria-label="' + esc(rName(r)) + '" title="' + esc(rName(r)) + '" style="--fc:' + faceOf(r)[1] + '">' + face(r) + '</button>').join('');
      actions = '<div class="anon-who" id="anon-who"><h3 class="sr">' + esc(t('anonWho')) + '</h3>' + (p.used.look ? '<p class="anon-clue">“' + esc(t('anonClues')[p.resident][p.id % 2]) + '”</p>' : '<p class="anon-clue muted" aria-hidden="true">🔍 ?</p>') +
        '<div class="pick faces" role="group" aria-label="' + esc(t('anonWho') + ' ' + t('anonNote', { n: CONFIG.anonBonus })) + '">' + who + '<span class="price num" aria-hidden="true">+' + CONFIG.anonBonus + ' 🪙</span></div></div>' +
        guess + '<div class="row acts">' + openBtn + '</div>';
    } else {
      actions = guess + '<div class="row acts">' + openBtn +
        (p.kind === 'mystery' ? '<button class="btn warm mail" id="go-return" aria-label="' + esc(t('returnBtn') + '. ' + t('returnNote', { n: CONFIG.returnReward })) + '">' + MAILBOX + '<span class="small">' + esc(t('returnShort')) + '</span><span class="price num" aria-hidden="true">+' + CONFIG.returnReward + ' 🪙</span></button>' : '') + '</div>';
    }
    root.innerHTML = '<div class="sheet counter-scene" role="dialog" aria-modal="true" aria-label="' + esc(t('inspectAria')) + '"><div class="sheet-inner">' +
      '<div class="sheet-top"><div class="sheet-back"><button class="icon-btn" id="sheet-close" aria-label="' + esc(t('backShelf')) + '" title="' + esc(t('backShelf')) + '">↩</button><button class="icon-btn" id="sheet-help" aria-label="' + esc(t('howTo')) + '" title="' + esc(t('howTo')) + '">?</button></div>' + pills('mini') + '</div>' +
      '<div class="sheet-cols"><div class="sheet-left"><div class="stage">' + bigBox(p) + (hintShake ? '<span class="finger wiggle" aria-hidden="true">' + HAND + '</span>' : '') + '</div><p class="sr">' + esc(t('dragHint')) + '</p>' +
      '<ul class="sr" aria-label="' + esc(t('clues')) + '">' + clues.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>' +
      '<div class="sheet-right"><div class="tools">' +
        tool('shake', TOOLART.shake, t('tShake'), '', p.used.shake, false) + tool('weigh', TOOLART.weigh, t('tWeigh'), '', p.used.weigh, p.used.weigh) +
        tool('look', TOOLART.look, t('tLook'), '', p.used.look, p.used.look) +
        tool('xray', TOOLART.xray, xName, xTag, p.used.xray, p.used.xray || xp === null || state.coins < xp) + '</div>' +
      actions +
      '</div></div></div></div>';
    $('.sheet', root).scrollTop = y;
    if (focusSel) {
      // A used tool turns disabled, so focus moves on to the next tool that still works, or to the open button.
      const f = $(focusSel, root);
      const g = f && !f.disabled ? f : $('.tools button:not([disabled])', root) || $('#go-open', root);
      if (g) g.focus();
    } else if (!keep) focusInto($('.sheet', root), null, false);
    renderCoach();
    // A new clue only appears as a sticker on screen, so say it to screen readers too (only the clues that are new).
    if (sheet.clues) { const fresh = clues.filter(c => !sheet.clues.includes(c)); if (fresh.length) announce(fresh.join('. ')); }
    sheet.clues = clues;
    const bb = $('#bigbox');
    let lastX = null, travel = 0, dir = 0;
    bb.style.touchAction = 'none'; bb.style.cursor = 'grab';
    bb.addEventListener('pointerdown', e => { try { bb.setPointerCapture(e.pointerId); } catch (er) {} lastX = e.clientX; travel = 0; dir = 0; });
    bb.addEventListener('pointermove', e => {
      if (lastX == null) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      bb.style.transform = 'rotate(' + Math.max(-8, Math.min(8, dx)) + 'deg)';
      const d = Math.sign(dx); if (d && d !== dir) { dir = d; travel += 1; }
      if (travel >= 4) { travel = 0; shakeBox(); }
    });
    const end = () => { lastX = null; bb.style.transform = ''; };
    bb.addEventListener('pointerup', end); bb.addEventListener('pointercancel', end);
  }

  let shakeBusy = 0;
  function shakeBox() {
    const p = state.parcels.find(x => x.id === sheet.id); if (!p) return;
    const now = performance.now(); if (shakeBusy && now - shakeBusy < 500) return; shakeBusy = now;
    playTag(ITEMS[p.item].snd); buzz([30, 40, 30]);
    const bb = $('#bigbox'); if (bb) { bb.classList.remove('shake'); void bb.offsetWidth; bb.classList.add('shake'); }
    if (!p.used.shake) {
      p.used.shake = true; save();
      if (coachActive && coachStep === 'clue') advanceCoach('series');
      setTimeout(() => { if (sheet && sheet.stage === 'inspect') renderSheet(true); }, 460);
    }
  }

  function doTool(k) {
    const p = state.parcels.find(x => x.id === sheet.id); if (!p) return;
    if (k === 'shake') { shakeBox(); return; }
    if (k === 'weigh') { p.used.weigh = true; sfx('scale'); }
    if (k === 'look') { p.used.look = true; sfx('tap'); }
    if (k === 'xray') { if (p.used.xray || !payXray(state, Date.now())) return; p.used.xray = true; sfx('coin'); }
    save(); renderSheet(true); render();
    if (coachActive && coachStep === 'clue') advanceCoach('series');
  }

  // ---------- unbox ----------
  function startUnbox() {
    const p = state.parcels.find(x => x.id === sheet.id); if (!p) return;
    sheet.stage = 'cut';
    // First few parcels: a hand swipes across the tape and one short line says what to do. After that, words go to screen readers only.
    const learning = state.stats.opened < 3;
    const swipe = learning ? '<span class="finger swipe" id="swipe" aria-hidden="true">' + HAND + '</span>' : '';
    $('#sheet-root').innerHTML = '<div class="sheet counter-scene unbox" role="dialog" aria-modal="true" aria-label="' + esc(t('openAria')) + '"><div class="sheet-inner">' +
      '<div class="sheet-top"><span></span><button class="icon-btn with-label" id="skip" aria-label="' + esc(bare(t('skip'))) + '" title="' + esc(bare(t('skip'))) + '">⏭<span class="btn-word" aria-hidden="true">' + esc(bare(t('skip'))) + '</span></button></div>' +
      '<div class="stage">' + bigBox(p, { tape: true }) + swipe + '</div>' +
      '<p class="' + (learning ? 'cut-hint' : 'sr') + '" id="cut-hint" aria-live="polite"><b>' + esc(t('cutHint')) + '</b> <span>' + esc(t('cutAlt')) + '</span></p></div></div>';
    if (coachActive) coachStep = 'tape';
    renderCoach();
    const tape = $('#tape'), cut = $('#cut');
    let minX = null, maxX = null, taps = 0, done = false, lastScrape = 0, down = false;
    const finish = () => { if (done) return; done = true; tape.classList.add('done'); const sw = $('#swipe'); if (sw) sw.remove(); sfx('tape'); buzz(40); setTimeout(() => reveal(p.id), 350); };
    const progress = () => {
      const w = tape.getBoundingClientRect().width || 1; const cov = maxX == null ? 0 : (maxX - minX) / w;
      cut.style.width = Math.min(100, (cov * 100 + taps * 34)) + '%';
      if (cov > 0.65 || taps >= 2) finish();
    };
    tape.addEventListener('pointerdown', e => { down = true; try { tape.setPointerCapture(e.pointerId); } catch (er) {} const x = e.clientX - tape.getBoundingClientRect().left; minX = Math.min(minX == null ? x : minX, x); maxX = Math.max(maxX == null ? x : maxX, x); });
    tape.addEventListener('pointermove', e => {
      if (!down) return;
      const x = e.clientX - tape.getBoundingClientRect().left; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      const now = performance.now(); if (now - lastScrape > 60) { sfx('scrape'); lastScrape = now; }
      progress();
    });
    const up = () => { down = false; };
    tape.addEventListener('pointerup', up); tape.addEventListener('pointercancel', up);
    tape.addEventListener('click', () => { taps++; sfx('scrape'); buzz(10); progress(); });
    tape.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); taps = 3; progress(); } });
    $('#skip').addEventListener('click', () => { done = true; reveal(p.id, true); });
  }

  // The whole reveal stays under 1.5 s: suspense time + the short lid-open beat. Skip shows the result at once.
  const SUSPENSE = { common: 200, rare: 400, epic: 650, secret: 900 };
  const BURST = { common: 6, rare: 10, epic: 16, secret: 24 };
  function burst(host, r, n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const a = Math.round(i * 360 / n + Math.random() * 18), d = 70 + Math.round(Math.random() * 70);
      html += '<i style="--a:' + a + 'deg;--d:' + d + 'px;--s:' + (0.6 + Math.random() * 0.7).toFixed(2) + ';--t:' + Math.round(Math.random() * 120) + 'ms"></i>';
    }
    const el = document.createElement('div');
    el.className = 'burst b-' + r; el.setAttribute('aria-hidden', 'true'); el.innerHTML = html;
    host.appendChild(el);
  }
  const SUSPENSE_TXT = { common: 'sCommon', rare: 'sRare', epic: 'sEpic', secret: 'sSecret' };
  const GLOW = { common: 'radial-gradient(circle, rgba(255,255,255,.9), transparent 62%)', rare: 'radial-gradient(circle, rgba(47,127,224,.55), transparent 62%)', epic: 'radial-gradient(circle, rgba(140,79,216,.6), transparent 62%)', secret: 'conic-gradient(from 0deg, rgba(226,75,75,.55), rgba(232,162,27,.55), rgba(67,179,106,.55), rgba(58,134,224,.55), rgba(154,85,216,.55), rgba(226,75,75,.55))' };

  function reveal(parcelId, skip) {
    if (!sheet || sheet.stage === 'reveal') return;
    sheet.stage = 'reveal';
    const before = { coins: state.coins, shards: state.shards };
    const res = townOpen(state, parcelId, rng, Date.now());
    if (res) noteOpen(state, localDay(new Date()), res.seriesRight !== null);
    // The three short goals begin only after a new player's first reveal; old saves never start them.
    if (res && !veteran && !state.firstGoals.started && state.stats.opened >= 1) { state.firstGoals.started = true; saveQuiet(); }
    save();
    if (res) res.before = before; // the reveal counts up from here; the saved total also includes any set-complete bonus
    if (!res) { closeSheet(); return; }
    noteBoard({ k: 'open', item: res.item, right: (res.seriesRight ? 1 : 0) + (res.rarityRight ? 1 : 0) });
    opensSinceBreak++;
    if (res.isNew) newFinds++; // red number on the album tab until it is opened
    const sw = $('#swipe'); if (sw) sw.remove();
    const bb = $('#bigbox'), glow = $('#glow');
    const r = res.rarity;
    const show = () => showResult(res);
    if (skip || !bb) { sfx(r); show(); return; }
    sfx('flap');
    glow.style.background = GLOW[r]; glow.classList.add('on');
    if (prefersReducedMotion()) { bb.classList.add('lid-open'); sfx(r); show(); return; }
    if (r !== 'common') { bb.classList.add('rumble'); buzz(r === 'secret' ? [80, 60, 80, 60, 200] : r === 'epic' ? [60, 50, 120] : [40]); }
    const hint = $('#cut-hint'); if (hint) hint.textContent = t(SUSPENSE_TXT[r]);
    const skipBtn = $('#skip'); let gone = false;
    const go = (immediate) => {
      if (gone) return; gone = true;
      bb.classList.remove('rumble'); bb.classList.add('lid-open', 'lr-' + r); sfx(r);
      if (BURST[r]) burst(bb, r, BURST[r]);
      setTimeout(show, immediate ? 0 : 200);
    };
    if (skipBtn) skipBtn.onclick = () => go(true);
    setTimeout(() => go(false), SUSPENSE[r]);
  }

  function showResult(res) {
    sheet.result = res;
    if (coachActive) {
      coachStep = 'reveal';
      if (state && !state.guideSeen) { state.guideSeen = true; saveQuiet(); }
      hideHelpDot();
      clearTimeout(coachTimer);
      coachTimer = setTimeout(() => { if (coachStep === 'reveal') { coachActive = false; coachStep = null; renderCoach(); autoHint(); } }, 2200);
    }
    renderResult();
    flyRewards(res, res.before); // once per reveal; a language switch re-renders the result without replaying it
    render();
    if (res.complete) setTimeout(() => celebrate(res.complete), 500);
  }
  // The reveal is a moment, not a table: dark backdrop with rays in the rarity colour, the item pops in,
  // sparkles burst, and the coins and shards fly up into the counters, which then count up.
  function renderResult() {
    const res = sheet.result, it = res.item, s = SERIES[it.series], r = res.rarity;
    const next = state.parcels.find(p => p.kind === 'normal') || state.parcels[0];
    const guessChip = (right, label, n) => '<span class="rchip ' + (right ? 'yes' : 'no') + '"><span class="sr">' + esc(label + ': ' + (right ? t('rRight', { n }) : t('rMissed'))) + '</span><span aria-hidden="true">' + (right ? '✓ +' + n + '✨' : '✗') + '</span></span>';
    let chips = '<span class="rchip coin num"><span class="sr">' + esc(t('rCoins') + ' +' + res.coins) + '</span><span aria-hidden="true">+' + res.coins + ' 🪙</span></span>';
    if (res.seriesRight !== null) chips += guessChip(res.seriesRight, t('rSeries', { s: sName(SERIES[res.parcel.guess.series]) }), CONFIG.guessReward.series);
    if (res.streak && res.seriesRight === true) chips += '<span class="rchip yes num"><span class="sr">' + esc(t('streakChipAria', { n: res.streak.n, x: res.streak.bonus })) + '</span><span aria-hidden="true">' + esc(t('streakChip', { n: res.streak.n, x: res.streak.bonus })) + '</span></span>';
    else if (res.streak && res.seriesRight === false && res.streak.broke != null) chips += '<span class="rchip no num shake"><span class="sr">' + esc(t('streakEnded', { n: res.streak.broke })) + '</span><span aria-hidden="true">' + esc(t('streakEnded', { n: res.streak.broke })) + '</span></span>';
    if (res.rarityRight !== null) chips += guessChip(res.rarityRight, t('rRarity', { r: RL(res.parcel.guess.rarity) }), CONFIG.guessReward.rarity);
    if (res.bonus) { const e = t('events')[res.event]; chips += '<span class="rchip yes num"><span class="sr">' + esc(t('evBonus', { e: e[1] }) + ' +' + res.bonus) + '</span><span aria-hidden="true">' + e[0] + ' +' + res.bonus + '✨</span></span>'; }
    chips += '<span class="rchip num"><span class="sr">' + esc(t('repGot', { n: res.rep }) + ' · ' + t('townLv', { n: townLevel(state) })) + '</span><span aria-hidden="true">🏘️ +' + res.rep + '</span></span>';
    // The neighbour who reacts to a right series guess. At a milestone the same neighbour says a streak line instead.
    let reaction = '';
    if (res.seriesRight) {
      const rx = reactionFor(state, it, res.parcel.id, localDay(new Date()));
      if (rx) {
        const who = rName(rx.resident), x = iName(it);
        let line;
        if (res.streak && res.streak.milestone) line = String(t('streakReact')[rx.resident.id]).replace(/\{n\}/g, String(res.streak.n));
        else if (rx.kind === 'like') line = rx.known ? t('reactLikeKnown', { name: who, s: t('sndShort')[it.snd], x }) : t('reactLikeHint', { x });
        else line = String(t('react')[rx.resident.id][rx.line]).replace(/\{x\}/g, x);
        reaction = '<p class="react-line">' + face(rx.resident) + ' <span>' + esc(line) + '</span></p>';
      }
    }
    const pr = seriesProgress(state, s.id);
    const sparks = r === 'common' ? 6 : r === 'rare' ? 10 : r === 'epic' ? 16 : 22;
    let sp = ''; for (let i = 0; i < sparks; i++) sp += '<i style="--a:' + Math.round(i * 360 / sparks) + 'deg;--d:' + (60 + (i % 3) * 30) + 'px"></i>';
    $('#sheet-root').innerHTML = '<div class="sheet result-scene r-' + r + '" role="dialog" aria-modal="true" aria-label="' + esc(t('resultAria')) + '"><div class="sheet-inner">' +
      '<div class="sheet-top"><span></span>' + pills('mini') + '</div>' +
      '<div class="reveal rv-' + r + '"><div class="art" aria-hidden="true"><span class="rays"></span><span class="sparks">' + sp + '</span><span class="itm-wrap">' + art(it, true) + '</span></div>' +
      '<div class="rtext">' + rbadge(r) + '<h2>' + esc(iName(it)) + '</h2>' +
      '<div class="row tags">' + (res.isNew ? '<span class="tagnew">' + esc(t('isNew')) + '</span>' : '<span class="dupc num"><span class="sr">' + esc(t('dup', { n: res.count })) + '</span><span aria-hidden="true">×' + res.count + '</span></span>') +
      '<span class="setp"><span class="sr">' + esc(sName(s) + ' ' + pr.have + '/' + pr.total) + '</span><span aria-hidden="true">' + (SICON[s.id] || '📦') + '</span><span class="bar"><i style="width:' + Math.round(pr.have / pr.total * 100) + '%"></i></span><span class="num" aria-hidden="true">' + pr.have + '/' + pr.total + '</span></span></div>' +
      '<p class="note">“' + esc(iNote(it)) + '”</p>' + reaction +
      '<div class="rchips">' + chips + '</div></div></div>' +
      '<div class="row acts">' + (next ? '<button class="btn go" id="next-parcel" data-next="' + next.id + '" aria-label="' + esc(t('nextParcel')) + '" title="' + esc(t('nextParcel')) + '"><span aria-hidden="true">▶</span><span class="go-t" aria-hidden="true">' + esc(t('nextParcel')) + '</span></button>' : '') +
      '<button class="btn ghost" id="back-shelf" aria-label="' + esc(t('backShelf')) + '" title="' + esc(t('backShelf')) + '"><span aria-hidden="true">↩</span> <span aria-hidden="true">' + esc(t('backShort')) + '</span></button></div></div></div>';
    renderCoach();
  }

  // Coins and shards fly from the item to the counters at the top, then the numbers count up to the new total.
  // Timers are tracked so leaving the result early stops the flight and the late coin sound.
  let flyTimers = [];
  function stopFly() { flyTimers.forEach(clearTimeout); flyTimers = []; document.querySelectorAll('.flyer').forEach(f => f.remove()); }
  function flyRewards(res, before) { flyFrom($('#sheet-root .reveal .art'), '#sheet-root', before); }
  // Coins and shards fly from src to the counters inside scope (the reveal sheet, or the page header).
  function flyFrom(src, scope, before) {
    stopFly();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!src || !before || reduce) return;
    const later = (fn, ms) => flyTimers.push(setTimeout(fn, ms));
    [['coins', '🪙'], ['shards', '✨']].forEach(([k, icon]) => {
      const chip = $(scope + ' .wallet [data-hud="' + k + '"]'); if (!chip) return;
      const num = $('.num', chip), to = Number(state[k]), from = Number(before[k]);
      if (from === to) return;
      num.textContent = String(from);
      const a = src.getBoundingClientRect(), b = chip.getBoundingClientRect();
      const n = Math.min(8, Math.max(3, Math.round((to - from) / 3)));
      for (let i = 0; i < n; i++) {
        const f = document.createElement('span'); f.className = 'flyer'; f.textContent = icon; f.setAttribute('aria-hidden', 'true');
        const x = a.left + a.width / 2 + (Math.random() - .5) * 60, y = a.top + a.height / 2 + (Math.random() - .5) * 40;
        f.style.left = x + 'px'; f.style.top = y + 'px';
        document.body.appendChild(f);
        later(() => { f.style.transform = 'translate(' + (b.left + b.width / 2 - x) + 'px,' + (b.top + b.height / 2 - y) + 'px) scale(.6)'; f.style.opacity = '.4'; }, 500 + i * 70);
        later(() => { f.remove(); if (i === 0) sfx('coin'); }, 1150 + i * 70);
      }
      const steps = 12;
      for (let j = 1; j <= steps; j++) later(() => { num.textContent = String(Math.round(from + (to - from) * j / steps)); if (j === steps) chip.classList.add('bump'); }, 900 + j * 40);
    });
  }

  function celebrate(c) {
    const s = SERIES[c.seriesId];
    sfx('secret'); buzz([100, 60, 100, 60, 300]); if (host) host.happy();
    modal('<div class="big" aria-hidden="true">🏬</div><h2>' + esc(t('celebTitle', { shop: sShop(s) })) + '</h2><p style="margin:0">' + esc(t('celebBody', { s: sName(s), n: CONFIG.completeReward })) + '</p>' +
      '<p class="small muted" style="margin:0">' + esc(t('repGot', { n: CONFIG.rep.complete })) + '</p><button class="btn" data-close>' + esc(t('nice')) + '</button>');
  }

  function doReturn(residentId) {
    const p = sheet && state.parcels.find(x => x.id === sheet.id);
    if (!p) return;
    const r = deliverTo(state, p.id, residentId || p.resident, Date.now());
    if (!r) return;
    save();
    if (!r.ok) { sfx('tap'); toast(t('anonWrong', { name: rName(r.resident) })); return; }
    noteBoard({ k: 'return' });
    const taleLine = r.newTale != null ? '<p class="small" style="margin:0"><b>' + esc(t('taleNew')) + '</b> ' + esc(rTale(r.resident, r.newTale)) + '</p>' : '';
    const extras = [];
    if (r.onTime) extras.push(t('dOnTime', { c: CONFIG.urgentBonus }));
    if (r.firstTry) extras.push(t('dFirst', { c: CONFIG.anonBonus }));
    if (eventToday(state, Date.now()) === 'moving') extras.push(t('dMoving', { c: CONFIG.movingBonus }));
    extras.push(t('repGot', { n: r.rep }));
    sfx('coin');
    sheet = null; $('#sheet-root').innerHTML = '';
    modal('<div class="big" aria-hidden="true">💌</div><h2>' + esc(t('deliveredTo', { name: rName(r.resident) })) + '</h2><p style="margin:0">' + esc(rStory(r.resident)) + '</p><p class="small muted" style="margin:0">+' + r.coins + ' 🪙 · ' + esc(t('friendship')) + ' ' + '♥'.repeat(Math.min(r.hearts, 5)) + '</p>' +
      extras.map(x => '<p class="small" style="margin:0">' + esc(x) + '</p>').join('') + taleLine + '<button class="btn" data-close>' + esc(t('backCounter')) + '</button>');
    render();
  }



  // ---------- ads: free rewards and break ads (ad-supported hosts only) ----------
  // Rules from the host's ad policy: reward only after the ad finishes, one ad per reward, a visible cooldown,
  // a coin option for every ad reward, ad buttons hidden when ads can't play, input blocked and sound off while an ad runs.
  function mmss(ms) { const x = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); }
  function adLedger() { try { return sanitizeLedger(JSON.parse(platform.kv.get(AD_LEDGER) || 'null')); } catch (e) { return sanitizeLedger(null); } }
  // Remove ads (M1 dev switch): break ads stop, rewarded ads stay optional. The real entitlement arrives in M2.
  function noAdsOn() { return platform.kv.get(NOADS) === '1'; }
  function applyNoAds() { if (ads && ads.setNoAds) ads.setNoAds(noAdsOn()); }
  function setNoAds(on) { if (on) platform.kv.set(NOADS, '1'); else platform.kv.remove(NOADS); applyNoAds(); if (state) render(); }
  function rewardRow(kind) {
    const O = t('adOffers')[kind], room = rewardRoom(state, kind), st = rewardedStatus(adLedger(), Date.now());
    const price = AD_RULES.coinPrice[kind];
    let adBtn = '';
    if (ads.available()) {
      let label;
      if (room === 0) label = esc(kind === 'parcels' ? t('adFull') : t('adBinFull'));
      else if (st.left === 0) label = esc(t('adDailyDone'));
      else if (!st.ready) label = esc(t('adWait', { t: '\u0000' })).replace('\u0000', '<span class="num" data-ad-until="' + (Date.now() + st.waitMs) + '">' + mmss(st.waitMs) + '</span>');
      else label = PLAY + ' ' + esc(t('adWatch'));
      adBtn = '<button class="btn ghost slim" data-ad-watch="' + kind + '"' + (room === 0 || !st.ready ? ' disabled' : '') + ' title="' + esc(t('adWatchAria', { x: O[0] })) + '">' + label + '</button>';
    }
    const coinBtn = '<button class="btn ghost slim num" data-ad-coins="' + kind + '"' + (room === 0 || state.coins < price ? ' disabled' : '') + ' aria-label="' + esc(t('adCoinsAria', { n: price, x: O[0] })) + '">' + price + ' 🪙</button>';
    return '<div class="offer ad-offer" data-ad-row="' + kind + '"><span class="ad-art" aria-hidden="true">' + (kind === 'parcels' ? '📦' : '🎁') + '</span><div class="ot"><div class="t">' + esc(O[0]) + '</div><div class="d">' + esc(O[1]) + '</div></div><div class="ad-btns">' + adBtn + coinBtn + '</div></div>';
  }
  function adRewardsPanel(withOdds = true) {
    return '<section class="panel"><div class="panel-head"><h2>' + esc(t('adShopTitle')) + '</h2>' +
      (withOdds ? '<button class="link-btn small" id="open-odds">' + esc(t('parcelOdds')) + '</button>' : '') + '</div>' +
      '<p class="small muted" style="margin:0">' + esc(t('adShopNote')) + '</p>' + (ads.available() ? '' : '<p class="small" style="margin:0">' + esc(t('adOff')) + '</p>') +
      '<div>' + AD_REWARDS.map(rewardRow).join('') + '</div></section>';
  }
  function adShopView() {
    const rewards = adRewardsPanel() + shopEarn();
    if (cgStage) {
      const tabs = [['rewards', t('tabRewards')], ['decor', t('tabDecor')], ['today', t('tabToday')]];
      if (devTools) tabs.push(['dev', t('devTitle')]);
      const tab = stageTab.shop;
      const content = tab === 'decor' ? decorShop() : tab === 'today' ? shopToday() : tab === 'dev' ? devPanel() : rewards;
      return header() + stageBar('shop', tabs) + stagePage(content);
    }
    return header() + cols(decorShop() + rewards, shopToday() + devPanel());
  }
  // Free-rewards side column: today's station at a glance and the free ways to earn coins, so the page is never just two buttons.
  function shopToday() {
    const normal = state.parcels.filter(p => p.kind === 'normal').length, nm = nextMysteryIn(), st = rewardedStatus(adLedger(), Date.now());
    const li = (ico, text) => '<li><span class="ti" aria-hidden="true">' + ico + '</span><span>' + esc(text) + '</span></li>';
    return '<section class="panel shop-today"><h3>' + esc(t('shopTodayTitle')) + '</h3><ul class="today-list">' +
      li('📦', t('shopTodayShelf', { n: normal, max: CONFIG.shelfSize, t: untilTomorrow() })) +
      li('<span class="mq">?</span>', nm ? t('shopTodayBin', { n: binCount(state), max: CONFIG.mysteryMax, t: nm }) : t('shopTodayBinFull', { n: binCount(state), max: CONFIG.mysteryMax })) +
      (ads.available() ? li(PLAY, t('shopTodayAds', { n: st.left, max: AD_RULES.rewardedPerDay })) : '') +
      li('🪙', t('shopTodayCoins', { n: state.coins })) + '</ul></section>';
  }
  function shopEarn() {
    const li = (ico, text) => '<li><span class="ti" aria-hidden="true">' + ico + '</span><span>' + esc(text) + '</span></li>';
    return '<section class="panel shop-earn"><h3>' + esc(t('shopEarnTitle')) + '</h3><ul class="today-list">' +
      li('💌', t('shopEarnReturn')) + li('📌', t('shopEarnBoard', { n: CONFIG.board.coins })) + li('🏬', t('shopEarnSeries', { n: CONFIG.completeReward })) + '</ul></section>';
  }
  function adCover(on) {
    let root = $('#ad-root');
    if (!root) { root = document.createElement('div'); root.id = 'ad-root'; document.body.appendChild(root); }
    root.innerHTML = on ? '<div class="ad-cover" role="alertdialog" aria-modal="true" aria-label="' + esc(t('adPlaying')) + '"><div class="big" aria-hidden="true">' + PLAY + '</div><b>' + esc(t('adPlaying')) + '</b><span class="small">' + esc(t('adPlayingBody')) + '</span></div>' : '';
  }
  function adStarted() { adPlaying = true; silenceAudio(); }
  // Covers the game from request to result, so nothing can be played while an ad is being fetched or shown.
  async function runAd(type) {
    // Remove ads = no break ads. Rewarded ads stay optional, so only midgame is blocked here.
    if (type === 'midgame' && noAdsOn()) return 'unavailable';
    adBusy = true; adCover(true); if (host) host.gameplayStop();
    let r = 'failed';
    try { r = await (type === 'rewarded' ? ads.rewarded(adStarted) : ads.midgame(adStarted)); } catch (e) { r = 'failed'; }
    adPlaying = false; adBusy = false; adCover(false);
    if (state && !state.muted && !(host && host.muted())) wakeAudio();
    if (host) host.gameplayStart();
    return r;
  }
  async function watchFor(kind) {
    if (adBusy || !ads.available() || rewardRoom(state, kind) === 0 || !rewardedStatus(adLedger(), Date.now()).ready) return;
    const r = await runAd('rewarded');
    if (r === 'rewarded') {
      const n = grantReward(state, kind, rng); save();
      if (n) platform.kv.set(AD_LEDGER, JSON.stringify(recordRewarded(adLedger(), Date.now()))); // a reward that couldn't land doesn't use up a daily slot
      if (n) { sfx('coin'); toast(kind === 'parcels' ? t('adGotParcels', { n }) : t('adGotMystery')); }
      else toast(kind === 'parcels' ? t('adFull') : t('adBinFull')); // filled up by a delivery while the ad played
    } else toast(r === 'unavailable' ? t('adOff') : t('adNoReward'));
    if (!sheet) render();
  }
  function payCoins(kind) {
    const n = buyWithCoins(state, kind, rng);
    if (n) { save(); sfx('coin'); toast(kind === 'parcels' ? t('adGotParcels', { n }) : t('adGotMystery')); }
    else toast(rewardRoom(state, kind) ? t('noCoins') : (kind === 'parcels' ? t('adFull') : t('adBinFull')));
    render();
  }
  // Live countdown on the reward buttons; at zero only that reward row is redrawn, so focus and open menus stay put.
  function adTick() {
    document.querySelectorAll('[data-ad-until]').forEach(sp => {
      const left = +sp.dataset.adUntil - Date.now();
      if (left > 0) { sp.textContent = mmss(left); return; }
      const row = sp.closest('[data-ad-row]');
      if (!row || !AD_REWARDS.includes(row.dataset.adRow)) return;
      const f = document.activeElement, coinsFocused = f && row.contains(f) && f.dataset.adCoins;
      row.outerHTML = rewardRow(row.dataset.adRow);
      if (coinsFocused) { const c = document.querySelector('[data-ad-row="' + coinsFocused + '"] [data-ad-coins]'); if (c) c.focus(); }
    });
  }

  // ---------- account: age screen, sign-in, cloud save ----------
  // The game never waits on the network: it starts from the device save, then syncs in the background.
  const auth = backend ? backend.auth : null;
  const cloud = backend ? backend.saves : null;
  const META = 'parcelwood.saveMeta'; // { owner, ownerGuest, version, dirty }: whose save this is, the cloud version it last synced with, unsynced progress
  let underAge = false;   // passed 'under' with the 'local' policy: device-only play
  let lastUid = null;     // account the device save is synced with
  let syncing = false;    // true while the player is choosing between two saves
  let epoch = 0;          // bumped on every account change and reset; work started under an older epoch is dropped
  let queue = Promise.resolve(); // pulls and pushes run one at a time, in order
  let accBusy = false, accMsg = null, emailDraft = '', pendingCloud = null, pushTm = null, saveSeq = 0;
  const accountsOn = () => platform.features.accounts && !!auth && !underAge;
  function enqueue(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }
  function stale(ep, u) { const cur = auth.user(); return ep !== epoch || !cur || cur.id !== u.id; }
  function meta() {
    const d = { owner: null, ownerGuest: true, version: 0, dirty: true };
    try { return Object.assign(d, JSON.parse(platform.kv.get(META) || 'null')); } catch (e) { return d; }
  }
  function setMeta(m) { platform.kv.set(META, JSON.stringify(m)); }
  function markDirty() { saveSeq++; const m = meta(); if (!m.dirty) setMeta(Object.assign(m, { dirty: true })); }
  function schedulePush() { if (!accountsOn() || !auth.user()) return; clearTimeout(pushTm); pushTm = setTimeout(pushNow, 3000); }
  function pushNow() { clearTimeout(pushTm); return accountsOn() ? enqueue(pushTask) : Promise.resolve(); }
  async function pushTask() {
    const u = auth.user(); if (!u || syncing) return;
    const m = meta(); if (m.owner !== u.id || !m.dirty) return;
    const ep = epoch, seq = saveSeq;
    let r;
    try { r = await cloud.push(u.id, state, m.version); } catch (e) { return; } // offline: the next save tries again
    if (stale(ep, u)) return; // signed out or switched while uploading: this result is not for the current game
    if (r.ok) setMeta({ owner: u.id, ownerGuest: u.anonymous, version: r.version, dirty: saveSeq !== seq });
    else await syncTask(u); // another device uploaded first: decide again
  }
  function useState(s, m) {
    state = s;
    if (!devTools) state.demoLuck = false;
    deliver(state, Date.now(), rng);
    refreshBoard(state, Date.now(), rng, { rush: platform.features.rush });
    addWishes(state, Date.now(), rng);
    refreshStory(state, Date.now());
    saveQuiet(); setMeta(m);
    sheet = null; $('#sheet-root').innerHTML = '';
  }
  function newGame() { const s = newState(Date.now()); deliver(s, Date.now(), rng); s.parcels.unshift(makeParcel(s, 'mystery', rng)); return s; }
  // New guest game on this device, owned by nobody until the next account syncs it.
  function freshGame() {
    epoch++; clearTimeout(pushTm); pendingCloud = null; syncing = false; lastUid = null;
    useState(newGame(), { owner: null, ownerGuest: true, version: 0, dirty: true });
  }
  // A guest's gems sit in the guest wallet. Keep a one-time ticket before switching accounts (ticket says
  // which guest and which random token); the signed-in account redeems it on the server (0004).
  function storedTicket() {
    try {
      const t = JSON.parse(platform.kv.get(GUEST_TICKET) || 'null');
      return t && typeof t.token === 'string' && typeof t.guest === 'string' ? t : null;
    } catch { return null; }
  }
  async function rememberGuestTicket() {
    const u = auth.user();
    if (!u || !u.anonymous || !cloud || !cloud.guestTicket) return;
    const have = storedTicket();
    if (have && have.guest === u.id) return; // already asked for this guest; the server reuses the ticket
    try {
      const t = await cloud.guestTicket(u.id);
      // Keep it even at 0 gems: the balance is read again when the ticket is redeemed, so gems bought in
      // between (or a save that has not been uploaded yet) still travel.
      if (t) platform.kv.set(GUEST_TICKET, JSON.stringify({ token: t.token, guest: u.id }));
    } catch (e) { /* offline: the balance stays on the guest wallet; nothing is lost */ }
  }
  // Moves the guest's gems on the server and drops the ticket. A network error keeps the ticket for next time.
  async function redeemGuestTicket(u) {
    const t = storedTicket();
    if (!t || !cloud || !cloud.claimGuestTicket) return;
    // Upgraded in place (manual linking keeps the user id): the wallet is already this player's.
    if (t.guest === u.id) { platform.kv.remove(GUEST_TICKET); return; }
    try {
      const r = await cloud.claimGuestTicket(u.id, t.token);
      if (r === 'gone') { platform.kv.remove(GUEST_TICKET); return; } // used, expired or removed
      platform.kv.remove(GUEST_TICKET);
    } catch (e) { /* network: keep the ticket and try again next time */ }
  }
  // Gems belong to the server wallet (0003). Show that number after a sync or a merge, not the save's old one.
  async function refreshGems(u) {
    if (!u || !cloud || !cloud.walletGems || !state) return;
    try {
      const g = await cloud.walletGems(u.id);
      if (state && typeof g === 'number' && state.gems !== g) { state.gems = g; saveQuiet(); render(); }
    } catch (e) { /* offline: the save keeps its last number */ }
  }
  // Redeem before the sync so the first upload already carries the server balance.
  function syncFor(u) { return enqueue(async () => {
    if (!u.anonymous) await redeemGuestTicket(u);
    await syncTask(u);
    await refreshGems(u);
  }); }
  async function syncTask(u) {
    if (!u || !cloud || syncing) return;
    const ep = epoch;
    let remote;
    try { remote = await cloud.pull(u.id); } catch (e) { return; } // offline: try again on the next sign-in or start
    if (stale(ep, u)) return;
    const m = meta();
    const mine = (version, dirty) => ({ owner: u.id, ownerGuest: u.anonymous, version, dirty });
    const cleanRemote = remote ? sanitizeState(remote.state) : null;
    if (remote && !cleanRemote) {
      // The cloud save is malformed (or was tampered with): never load it. Replace it with this device's save,
      // or with a new game when the device save belongs to another full account.
      if (!m.owner || m.ownerGuest || m.owner === u.id) setMeta(mine(remote.version, true));
      else { useState(newGame(), mine(remote.version, true)); render(); }
      await pushTask(); return;
    }
    if (remote) remote = { state: cleanRemote, version: remote.version }; // older cloud saves get today's new fields filled in
    const plan = planMerge({ state, owner: m.owner, ownerGuest: m.ownerGuest, version: m.version, dirty: m.dirty }, remote, u.id);
    if (plan.action === 'take-cloud') { useState(remote.state, mine(remote.version, false)); render(); }
    else if (plan.action === 'fresh') { useState(newGame(), mine(0, true)); render(); await pushTask(); }
    else if (plan.action === 'push-local') { setMeta(mine(remote ? remote.version : 0, true)); await pushTask(); } // device save joins this account
    else if (plan.action === 'ask') { syncing = true; conflictModal(plan, remote, u.id); } // uploads wait until the player picks
  }
  function conflictModal(plan, remote, uid) {
    pendingCloud = { state: remote.state, version: remote.version, uid, ep: epoch };
    const line = x => esc(t('conflictLine', { a: x.items, b: x.opened, c: x.gems }));
    const opt = (k, title, x) => '<div class="panel" style="gap:6px;text-align:left"><b>' + esc(t(title)) + '</b><span class="small num">' + line(x) + '</span><button class="btn ghost" data-keep="' + k + '">' + esc(t('keepThis')) + '</button></div>';
    $('#modal-root').innerHTML = '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cf-t"><h2 id="cf-t">' + esc(t('conflictTitle')) + '</h2><p class="small" style="margin:0">' + esc(t('conflictBody')) + '</p>' +
      opt('local', 'conflictLocal', plan.local) + opt('cloud', 'conflictCloud', plan.cloud) + '</div></div>';
  }
  function resolveConflict(which) {
    const pc = pendingCloud; if (!pc) return;
    pendingCloud = null; syncing = false; $('#modal-root').innerHTML = '';
    const u = auth.user(); if (pc.ep !== epoch || !u || u.id !== pc.uid) return; // account changed meanwhile
    useState(which === 'local' ? keepOne(state, pc.state) : keepOne(pc.state, state), { owner: u.id, ownerGuest: u.anonymous, version: pc.version, dirty: true });
    pushNow().then(() => refreshGems(u)); toast(t('accSynced')); render();
    claimPurchases(); // purchases that waited while the player chose
    socialStart();
  }
  function onAuth(u) {
    if (!u) return;
    if (u.id !== lastUid) { epoch++; lastUid = u.id; guildInfo = null; syncFor(u); claimPurchases(); socialStart(); } // claims run after the sync in the queue
    else {
      const t = storedTicket();
      if (t && t.guest === u.id && !u.anonymous) platform.kv.remove(GUEST_TICKET); // upgraded in place: the wallet stayed
      schedulePush();
    }
    if (view === 'account') render();
  }
  // Sign out: upload what is left first. If that fails (offline), ask before dropping it.
  async function signOutFlow(force) {
    if (!force) {
      await pushNow();
      const m = meta(), u = auth.user();
      if (m.dirty && u && m.owner === u.id) { unsyncedModal(); return; }
    }
    freshGame();                 // the device forgets the account's save before any network call
    await auth.signOut();
    const u = auth.user(); if (u) onAuth(u); // the new guest account takes over the fresh game
    accMsg = { k: 'accSignedOut' };
  }
  async function deleteFlow() {
    await auth.deleteAccount();  // server first: if this fails, nothing on the device changes
    freshGame();
    const u = auth.user(); if (u) onAuth(u);
    accMsg = { k: 'accDeleted' };
  }
  function unsyncedModal() {
    modal('<h2>' + esc(t('accUnsyncedTitle')) + '</h2><p style="margin:0">' + esc(t('accUnsyncedBody')) + '</p><button class="btn warm" id="acc-signout-force">' + esc(t('accSignOutAnyway')) + '</button><button class="btn ghost" data-close>' + esc(t('accStay')) + '</button>');
  }
  function errKey(e) { const c = e && e.code; return c === 'invalid-email' ? 'accEmailBad' : c === 'rate-limit' ? 'accRateLimit' : c === 'network' ? 'accNetwork' : 'accError'; }
  async function accAction(fn) {
    if (accBusy) return;
    accBusy = true; accMsg = null; render();
    try { await fn(); } catch (e) { accMsg = { k: errKey(e), bad: true }; }
    accBusy = false; render();
  }
  function accountView() {
    const u = auth.user();
    const dis = accBusy ? ' disabled' : '';
    const msg = accMsg ? '<p class="small" role="status" style="margin:0' + (accMsg.bad ? ';color:var(--stamp)' : '') + '">' + esc(t(accMsg.k)) + '</p>' : '';
    const mock = auth.mode === 'mock' ? '<p class="small muted" style="margin:0">' + esc(t('accMock')) + '</p>' : '';
    let body;
    if (auth.provider === 'discord') {
      // Discord build: the Discord account is the login. No guest, email, Apple, Google or sign-out.
      body = '<h2>' + esc(t('accDiscordTitle')) + '</h2>' + (auth.displayName() ? '<p style="margin:0">' + esc(t('accDiscordAs', { x: auth.displayName() })) + '</p>' : '') +
        '<p class="small muted" style="margin:0">' + esc(t('accDiscordNote')) + '</p>';
    } else if (!u || u.anonymous) {
      body = '<h2>' + esc(t('accGuestTitle')) + '</h2><p style="margin:0">' + esc(t('accGuestBody')) + '</p>' +
        '<button class="btn sso-apple" id="acc-apple"' + dis + '>' + esc(t('accApple')) + '</button>' +
        '<button class="btn ghost" id="acc-google"' + dis + '>' + esc(t('accGoogle')) + '</button>' +
        '<div class="small muted" style="text-align:center">' + esc(t('accOr')) + '</div>' +
        '<label class="field"><span class="small">' + esc(t('accEmailLabel')) + '</span><input id="acc-email" type="email" autocomplete="email" inputmode="email" value="' + esc(emailDraft) + '"></label>' +
        '<button class="btn ghost" id="acc-email-go"' + dis + '>' + esc(t('accEmailBtn')) + '</button>';
    } else {
      const names = t('methodNames');
      const methods = u.methods.map(m => names[m]).join(', ');
      body = '<h2>' + esc(t('accSignedTitle')) + '</h2><p style="margin:0">' + esc(t('accSignedAs', { x: u.email || methods })) + '</p>' +
        (methods ? '<p class="small muted" style="margin:0">' + esc(t('accVia', { x: methods })) + '</p>' : '') +
        '<button class="btn ghost" id="acc-signout"' + dis + '>' + esc(t('accSignOut')) + '</button><p class="small muted" style="margin:0">' + esc(t('accSignOutNote')) + '</p>';
    }
    // Apple requires in-app deletion for any account. Guests get it too: their guest account and cloud save are removed.
    const del = u ? '<section class="panel"><button class="btn ghost" id="acc-delete"' + dis + '>' + esc(t('accDelete')) + '</button></section>' : '';
    return header() + cols('<section class="panel">' + body + msg + mock + '</section>' + del, '');
  }
  function deleteModal() {
    modal('<h2>' + esc(t('accDeleteTitle')) + '</h2><p style="margin:0">' + esc(t('accDeleteBody')) + '</p><button class="btn warm" id="acc-delete-yes">' + esc(t('accDeleteYes')) + '</button><button class="btn ghost" data-close>' + esc(t('accDeleteNo')) + '</button>');
  }
  function langPicker() {
    const opts = LANGS.map(l => '<option value="' + l.id + '"' + (l.id === lang ? ' selected' : '') + '>' + l.label + '</option>').join('');
    return '<label class="lang"><span class="sr">' + esc(t('language')) + '</span><span aria-hidden="true">🌐</span><select id="lang">' + opts + '</select></label>';
  }
  function ageScreen(err) {
    $('#nav-in').innerHTML = '';
    const months = t('months').map((m, i) => '<option value="' + (i + 1) + '">' + esc(m) + '</option>').join('');
    const years = yearOptions(new Date()).map(y => '<option value="' + y + '">' + y + '</option>').join('');
    $('#app').innerHTML = '<header class="top"><div class="brand"><h1>' + esc(t('title')) + '</h1></div><div class="wallet">' + langPicker() + '</div></header>' +
      '<section class="panel" id="age-gate"><h2>' + esc(t('ageTitle')) + '</h2><p style="margin:0">' + esc(t('ageBody')) + '</p>' +
      '<div class="row"><label class="field"><span class="small">' + esc(t('ageMonth')) + '</span><select id="age-m"><option value="">—</option>' + months + '</select></label>' +
      '<label class="field"><span class="small">' + esc(t('ageYear')) + '</span><select id="age-y"><option value="">—</option>' + years + '</select></label></div>' +
      (err ? '<p class="small" role="alert" style="margin:0;color:var(--stamp)">' + esc(t('agePick')) + '</p>' : '') +
      '<button class="btn" id="age-go">' + esc(t('ageGo')) + '</button></section>';
  }
  function blockedScreen() {
    $('#nav-in').innerHTML = '';
    $('#app').innerHTML = '<header class="top"><div class="brand"><h1>' + esc(t('title')) + '</h1></div><div class="wallet">' + langPicker() + '</div></header>' +
      '<section class="panel" id="age-blocked"><div class="big" aria-hidden="true" style="font-size:56px;text-align:center">📮</div><h2>' + esc(t('ageBlockedTitle')) + '</h2><p style="margin:0">' + esc(t('ageBlockedBody')) + '</p>' + (devTools ? '<button class="btn ghost" id="dev-age">' + esc(t('devAge')) + '</button>' : '') + '</section>';
  }
  function gateScreen() { return platform.loadAge() === 'under' && UNDER_AGE_POLICY === 'block' ? blockedScreen() : ageScreen(); }
  async function boot() {
    setLang(pickLang());
    const age = platform.features.ageGate ? platform.loadAge() : 'ok'; // the all-ages CrazyGames build has no age screen
    if (!age || (age === 'under' && UNDER_AGE_POLICY === 'block')) { gateScreen(); return; }
    underAge = age === 'under';
    start({});
    if (!accountsOn()) return;
    auth.onChange(onAuth);
    // init() may already have reported the account through onAuth; onAuth ignores a repeat, so exactly one sync runs.
    try { const u = await auth.init(); if (u) onAuth(u); } catch (e) { /* offline: play continues on the device save */ }
    if (store) { store.onGrant(grant); store.onBalance(setBalance); claimPurchases(); } // runs after the first save sync in the queue
    if (view === 'account') render();
  }

  // ---------- events ----------
  on('click', e => {
    if (adBusy) { e.preventDefault(); return; } // an ad is running: the game waits
    const b = e.target.closest('button, [data-parcel]');
    // Any tap that is not the armed decoration button disarms it (the button also disarms after 4 s).
    if (decorArm && !(b && b.dataset.decorBuy === decorArm)) {
      decorArm = null; clearTimeout(decorArmTm);
      if (!b && view === 'shop') render(); // the armed label must not stay on screen after a tap on empty space
    }
    if (!b) return;
    if (b.id === 'hint-skip') { sfx('tap'); closeHint(); return; }
    if (b.dataset.money) { sfx('tap'); moneyModal(b.dataset.money); return; }
    if (b.id === 'goals-off') { state.firstGoals.off = true; save(); render(); return; }
    if (b.id === 'coach-skip') { sfx('tap'); endCoach(); return; }
    gestureSeen = true; audio(); tryMusic();
    if (b.dataset.stagetab) {
      const [page, id] = b.dataset.stagetab.split(':');
      if (stageTab[page] !== id) { stageTab[page] = id; render(); }
      return;
    }
    if (b.dataset.view === 'rush') { if (rushOn()) openRush(); return; }
    if (b.id === 'week-open') { if (weekOn()) openWeek(); return; }
    if (b.id === 'week-share' && weekOn()) {
      const ev = weekEventStatus(state, nowMs());
      weekShare(ev.best, ev.bestSold).then(ok => toast(ok ? weekText(lang).shareCopied : weekText(lang).shareFail));
      return;
    }
    if (b.id === 'decor-open') {
      view = 'shop'; render();
      const el = document.getElementById('decor-shop');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    if (b.id === 'checkin-btn') { doCheckIn(); return; }
    if (b.dataset.qclaim) { doQuestClaim(b); return; }
    if (b.dataset.view) {
      view = b.dataset.view; render();
      if (view === 'town') socialPoll(false);
      const jump = b.dataset.jump ? document.getElementById(b.dataset.jump) : null;
      if (jump && jump.scrollIntoView) jump.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); else window.scrollTo(0, 0);
      return;
    }
    if (b.id === 'age-go') {
      const m = +($('#age-m') || {}).value, y = +($('#age-y') || {}).value;
      if (!m || !y) { ageScreen(true); return; }
      platform.saveAge(checkAge(y, m, new Date())); boot(); return;
    }
    if (b.id === 'dev-age' && devTools) { platform.clearAge(); window.location.reload(); return; }
    if (b.id === 'account') { view = 'account'; accMsg = null; render(); window.scrollTo(0, 0); return; }
    if (b.id === 'help') { startCoach(); return; }
    if (b.id === 'acc-apple' || b.id === 'acc-google') { const pr = b.id === 'acc-apple' ? 'apple' : 'google'; accAction(async () => { await rememberGuestTicket(); await auth.oauth(pr); }); return; }
    if (b.id === 'acc-email-go') {
      emailDraft = ($('#acc-email') || {}).value || '';
      accAction(async () => { await rememberGuestTicket(); const r = await auth.emailLink(emailDraft); accMsg = { k: r === 'sent' ? 'accEmailSent' : 'accSynced' }; });
      return;
    }
    if (b.id === 'acc-signout') { accAction(() => signOutFlow(false)); return; }
    if (b.id === 'acc-signout-force') { $('#modal-root').innerHTML = ''; accAction(() => signOutFlow(true)); return; }
    if (b.id === 'acc-delete') { deleteModal(); return; }
    if (b.id === 'acc-delete-yes') { $('#modal-root').innerHTML = ''; accAction(deleteFlow); return; }
    if (b.dataset.keep) { resolveConflict(b.dataset.keep); return; }
    if (b.id === 'mute') { if (host && host.muted()) return; state.muted = !state.muted; save(); if (state.muted) silenceAudio(); else wakeAudio(); render(); return; }
    if (b.id === 'open-odds') { oddsModal(); return; }
    if (b.dataset.parcel) { sfx('tap'); openSheet(+b.dataset.parcel); return; }
    // A break ad only on "Next parcel" (the natural pause after a reveal; never on navigation buttons), not when ads
    // can't play, and not right after a finished series, whose celebration is about to show.
    if (b.id === 'next-parcel' && adsOn && !noAdsOn() && ads.available() && !(sheet && sheet.result && sheet.result.complete) && midgameDue(opensSinceBreak, sessionStart, Date.now())) {
      const next = +b.dataset.next;
      opensSinceBreak = 0; closeSheet();
      runAd('midgame').then(() => { if (state.parcels.some(p => p.id === next)) openSheet(next); });
      return;
    }
    if (b.id === 'sheet-close' || b.id === 'back-shelf') { closeSheet(); return; }
    if (b.id === 'next-parcel') { openSheet(+b.dataset.next); return; }
    if (b.id === 'sheet-help') { startCoach(); return; }
    if (b.dataset.tool) { doTool(b.dataset.tool); return; }
    if (sheet && (b.dataset.gs || b.dataset.gr)) {
      const p = state.parcels.find(x => x.id === sheet.id); if (!p) return;
      if (b.dataset.gs) p.guess.series = p.guess.series === b.dataset.gs ? null : b.dataset.gs;
      if (b.dataset.gr) p.guess.rarity = p.guess.rarity === b.dataset.gr ? null : b.dataset.gr;
      sfx('tap'); save(); renderSheet(true);
      if (coachActive && coachStep === 'series' && b.dataset.gs) advanceCoach('open');
      return;
    }
    if (b.id === 'go-open') {
      if (coachActive && (coachStep === 'series' || coachStep === 'open')) coachStep = 'tape';
      startUnbox(); return;
    }
    if (b.id === 'go-return') { doReturn(); return; }
    if (b.dataset.anon && sheet) { doReturn(b.dataset.anon); return; }
    if (b.dataset.giftItem) { doGift(b.dataset.giftTo, b.dataset.giftItem); return; }
    if (b.dataset.gift) { giftModal(b.dataset.gift); return; }
    if (b.dataset.tab) { albumTab = b.dataset.tab; render(); return; }
    if (b.dataset.snd) { playTag(b.dataset.snd); buzz(15); return; }
    if (b.dataset.item) { sfx('tap'); itemModal(b.dataset.item); return; }
    if (b.id === 'album-help') { albumHelp(); return; }
    if (b.id === 'daily-help') { helpModal([['h', t('dTitle')], ['p', t('dRules', { a: CONFIG.dailyReward[0], b: CONFIG.dailyReward[1], c: CONFIG.dailyReward[2], d: CONFIG.dailyFailReward })]]); return; }
    if (b.id === 'board-help') { helpModal([['h', t('boardTitle')], ['p', t('boardRules', { c: CONFIG.board.coins, s: CONFIG.board.bonusShards })], ['p', t('boardNew', { t: untilTomorrow() })], ['p', t('boardStamps', { n: state.board.stamps })]]); return; }
    if (b.id === 'level-help') { levelHelp(); return; }
    if (b.id === 'street-btn') { sfx('tap'); streetModal(); return; }
    if (b.id === 'story-help') { helpModal([['h', t('storyTitle')], ['p', t('storyRules', { p: CONFIG.story.pagesPerChapter, s: CONFIG.story.shards, r: CONFIG.story.rep })]]); return; }
    if (b.id === 'social-help') { socialHelp(); return; }
    if (b.id === 'carry-btn') { carryFlow(); return; }
    if (b.dataset.storyRead !== undefined) { sfx('tap'); storyModal(); return; }
    if (b.id === 'town-help') {
      helpModal([['h', t('reqTitle')], ['p', hasFeature(state, 'requests') ? t('reqNote', { c: CONFIG.requestCoins, s: CONFIG.requestBonusShards }) : t('reqLocked', { n: CONFIG.townFeatures.requests })],
        ['h', t('resTitle')], ['p', t('resNote') + ' ' + t('giftNote')]]);
      return;
    }
    if (b.dataset.res) { sfx('tap'); storiesModal(b.dataset.res); return; }
    if (b.dataset.claim) { doClaim(b); return; }
    // drawn before midnight: the card or the guess button belongs to yesterday's puzzle
    if ((b.dataset.daily || b.dataset.dpeek) && b.dataset.day !== dailyStatus(state, Date.now()).puzzle.day) { $('#modal-root').innerHTML = ''; render(); toast(t('dNewDay')); return; }
    if (b.dataset.dpeek) { sfx('tap'); dailyPeek(b.dataset.dpeek, b.dataset.day); return; }
    if (b.dataset.daily) {
      $('#modal-root').innerHTML = '';
      const before = { coins: state.coins, shards: state.shards };
      const r = townDailyGuess(state, Date.now(), b.dataset.daily);
      if (r) {
        noteDaily(state, r.puzzle.day, r.finished);
        save();
        const ok = r.guesses[r.guesses.length - 1] === r.puzzle.answer;
        sfx(ok ? 'rare' : 'tap'); if (!ok) buzz(40);
        if (r.finished) noteBoard({ k: 'daily' });
        dailyFx = { id: b.dataset.daily, ok }; render(); dailyFx = null;
        if (r.finished) { toast(t('shardsGot', { n: r.reward })); flyFrom($('#daily .dres-art'), '#app', before); }
        const clue = $('#daily .cslot.flip .sr');
        announce(r.finished ? (r.won ? t('dWon', { n: r.guesses.length, s: r.reward }) : t('dLost', { x: iName(ITEMS[r.puzzle.answer]), s: r.reward }))
          : '✗ ' + (clue ? clue.textContent + '. ' : '') + t('dLeft', { n: CONFIG.dailyTries - r.guesses.length }));
        const f = $(r.finished ? '#daily-share' : '#daily [data-dpeek]:not([disabled])'); if (f) f.focus();
      }
      return;
    }
    if (b.id === 'daily-share') { shareDaily(); return; }
    if (b.dataset.give) {
      // Letters are replaced at midnight; a picker opened yesterday must not hand the item to today's letter.
      if (b.dataset.reqDay !== state.board.day) { $('#modal-root').innerHTML = ''; toast(t('reqExpired')); render(); return; }
      giveSpare(+b.dataset.reqI, b.dataset.give); return;
    }
    if (b.dataset.req) { sparesModal(+b.dataset.req); return; }
    if (b.dataset.ex) { const r = exchangeItem(state, b.dataset.ex); save(); if (r) { sfx('rare'); toast(t('traded', { x: iName(ITEMS[b.dataset.ex]) })); render(); if (r.complete) celebrate(r.complete); } return; }
    if (b.id === 'recycle') { const g = recycleExtras(state, albumTab); save(); if (g) { sfx('coin'); toast(t('shardsGot', { n: g })); } render(); return; }
    if (adsOn && AD_REWARDS.includes(b.dataset.adWatch)) { watchFor(b.dataset.adWatch); return; }
    if (adsOn && AD_REWARDS.includes(b.dataset.adCoins)) { payCoins(b.dataset.adCoins); return; }
    if (b.dataset.buy && store) { buyFlow(b.dataset.buy); return; }
    if (b.dataset.decorBuy) {
      const id = b.dataset.decorBuy;
      if (decorArm !== id) { decorArm = id; clearTimeout(decorArmTm); decorArmTm = setTimeout(() => { decorArm = null; if (view === 'shop') render(); }, 4000); render(); return; }
      clearTimeout(decorArmTm); decorArm = null;
      const d = DECOR.find(x => x.id === id);
      if (d && buyDecor(state, id)) {
        save(); sfx('coin'); if (host) host.happy();
        toast(t('decorToast', { x: decorName(d) }));
      }
      render(); return;
    }
    if (b.dataset.decorToggle) { if (toggleDecor(state, b.dataset.decorToggle)) { save(); sfx('tap'); render(); } return; }
    if (b.dataset.offer) { state.shopTaps[b.dataset.offer] = (state.shopTaps[b.dataset.offer] || 0) + 1; save(); toast(t('tapNoted')); render(); return; }
    if (b.id === 'dev-parcels' && devTools) { for (let i = 0; i < 10; i++) state.parcels.push(makeParcel(state, 'normal', rng)); save(); toast(t('added10')); render(); return; }
    if (b.id === 'dev-unlock' && devTools) {
      // Test tool only: two of every item, every series unlocked, every shop open. The second copy is a spare, so QA
      // can test gifts, requests and the hand-over picker straight away. No coins or rewards are paid.
      Object.keys(ITEMS).forEach(id => { if (!(state.owned[id] >= 2)) state.owned[id] = 2; });
      CONFIG.series.forEach(x => { if (!state.unlocked.includes(x.id)) state.unlocked.push(x.id); if (!state.completed.includes(x.id)) state.completed.push(x.id); });
      save(); toast(t('unlockedAll')); render(); return;
    }
    if (b.id === 'dev-rep' && devTools) { state.town.rep += 50; save(); render(); return; }
    if (b.id === 'dev-coins' && devTools) { state.coins += 500; save(); render(); return; }
    if ((b.id === 'dev-day-next' || b.id === 'dev-day-skip' || b.id === 'dev-day-real') && devTools) {
      const cur = Number(platform.kv.get('parcelwood.dev.dayOffset')) || 0;
      const next = b.id === 'dev-day-real' ? 0 : Math.min(365, cur + (b.id === 'dev-day-skip' ? 2 : 1));
      platform.kv.set('parcelwood.dev.dayOffset', String(next));
      window.location.reload();
      return;
    }
    if ((b.id === 'dev-week-open' || b.id === 'dev-week-closed') && devTools) {
      const cur = Number(platform.kv.get('parcelwood.dev.dayOffset')) || 0;
      const day = new Date().getDay();
      const delta = b.id === 'dev-week-open' ? (5 - day + 7) % 7 : (8 - day) % 7;
      platform.kv.set('parcelwood.dev.dayOffset', String(Math.min(365, cur + delta)));
      window.location.reload();
      return;
    }
    if (b.id === 'dev-mystery' && devTools) { state.parcels.push(makeParcel(state, 'mystery', rng)); save(); toast(t('addedM')); render(); return; }
    if (b.id === 'dev-reset' && devTools) {
      if (b.dataset.armed) { const keepLang = lang; state = newState(Date.now()); deliver(state, Date.now(), rng); state.parcels.unshift(makeParcel(state, 'mystery', rng)); setLang(keepLang); save(); view = 'station'; toast(t('resetDone')); render(); }
      else { b.dataset.armed = '1'; b.textContent = t('resetConfirm'); b.classList.add('warm'); }
      return;
    }
  });
  on('change', e => {
    if (e.target.id === 'dev-luck' && devTools) { state.demoLuck = e.target.checked; save(); toast(state.demoLuck ? t('luckOn') : t('luckOff')); }
    if (e.target.id === 'dev-noads' && devTools) { setNoAds(e.target.checked); toast(e.target.checked ? t('devNoAdsOn') : t('devNoAdsOff')); }
    if (e.target.id === 'lang') {
      if (!state) { setLang(e.target.value); gateScreen(); const s = $('#lang'); if (s) s.focus(); return; }
      setLang(e.target.value); render();
      if (sheet && sheet.stage === 'inspect') renderSheet(true);
      else if (sheet && sheet.stage === 'reveal' && sheet.result) renderResult();
      const sel = $('#lang'); if (sel) sel.focus();
    }
  });
  // No Esc shortcuts: CrazyGames uses Esc to leave fullscreen. Popups close with their ✕/Close button or a tap on
  // the dimmed backdrop (see modal() below); the inspect sheet has its own Back button.
  on('keydown', e => { if (adBusy) { e.preventDefault(); return; } if (e.key === 'Tab') trapTab(e); });

  function tick() {
    const got = townDeliver(state, Date.now(), rng);
    const board = syncBoard();
    const newDay = noteVisit(state, localDay(new Date()));
    if (got.normal || got.mystery || got.urgent || got.extra || got.coins || board) { saveQuiet(); if (!sheet) render(); }
    else if (newDay) saveQuiet();
    const msg = [];
    if (got.normal) msg.push(t('truck', { n: got.normal })); else if (got.mystery || got.extra) msg.push(t('mysteryArrived'));
    if (got.urgent) msg.push(t('urgentArrived'));
    if (got.coins) msg.push(t('theoMorning', { n: got.coins }));
    if (msg.length) toast(msg.join(' '));
  }

  function start(data) {
    state = (data && data.state && data.state.v === 1) ? data.state : (load() || null);
    const fresh = !state;
    // Demo luck changes the odds, so it can never stay on outside a dev build.
    if (!devTools && state) state.demoLuck = false;
    if (fresh) state = newState(Date.now());
    applyNoAds();
    // Preview tool: ?devlv=2 raises the town to Lv2 on boot; the normal level-up popup then follows.
    const devLv = devTools ? Math.floor(Number(new URLSearchParams(window.location.search).get('devlv'))) : 0;
    if (Number.isInteger(devLv) && devLv >= 1 && devLv <= MAX_LEVEL) state.town.rep = Math.max(state.town.rep, CONFIG.townLevels[devLv - 1]);
    syncUnlocks(state);
    const got = townDeliver(state, Date.now(), rng);
    if (fresh) state.parcels.unshift(makeParcel(state, 'mystery', rng));
    syncBoard();
    noteVisit(state, localDay(new Date()));
    // Saves already at Lv2 or above see Rush Hour appear without a level-up popup; one short toast explains it.
    // The claimed level, not today's reputation, decides: a ?devlv jump must not toast before the level-up popup.
    if (!fresh && state.town.level >= CONFIG.townFeatures.rush && platform.kv.get(RUSH_NEW) !== '1') {
      platform.kv.set(RUSH_NEW, '1');
      if (!state.rush.played.length && !state.rush.owned.length) setTimeout(() => toast(t('rushNew')), 2100);
    }
    if (!fresh && (got.urgent || got.coins)) setTimeout(() => toast([got.urgent ? t('urgentArrived') : '', got.coins ? t('theoMorning', { n: got.coins }) : ''].filter(Boolean).join(' ')), 600);
    if (data && data.view) view = data.view;
    veteran = hasPlayed(state);
    // An old save gets no pile of new tips. A new player who already opened the first parcel keeps their
    // pending goals/tips across a refresh (firstGoals.started), so this only marks genuinely old saves.
    if (veteran && !state.firstGoals.started && !state.hintsSeen.length) { state.hintsSeen = HINT_IDS.slice(); }
    if (!state.guideSeen && !veteran) { coachActive = true; coachStep = 'parcel'; }
    saveQuiet(); render(); tryMusic();
    // The host clock arrives after the first paint. Once it is trusted, redraw so the weekend card and badge use it.
    if (platform.time) void platform.time.sync().then(ok => { if (ok && state) render(); }, () => {});
    // Adapter setup runs after the first paint; if it finds an ad blocker, redraw once so ad buttons disappear and
    // the coin alternative is all that is left.
    if (ads && ads.init) void ads.init().then(() => { if (state && !ads.available()) render(); }, () => {});
    if (host) { host.gameplayStart(); host.onMutedChange(() => { if (host.muted()) silenceAudio(); else if (state && !state.muted) wakeAudio(); const m = $('#mute'); if (m) { m.textContent = silent() ? '🔇' : '🔊'; m.setAttribute('aria-label', silent() ? t('soundOn') : t('soundOff')); m.disabled = host.muted(); } }); }
    if (adsOn) timer.ad = setInterval(adTick, 1000);
    timer.iv = setInterval(() => { tick(); if (!sheet && (view === 'station' || view === 'town')) render(); }, 60000);
  }
  const coachFit = () => renderCoach();
  window.addEventListener('resize', coachFit);
  window.addEventListener('scroll', coachFit, true);
  boot();
  return () => {
    offs.forEach(f => f());
    window.removeEventListener('resize', coachFit);
    window.removeEventListener('scroll', coachFit, true);
    clearInterval(timer.iv); clearInterval(timer.ad); clearTimeout(pushTm); clearTimeout(coachTimer);
    document.getElementById('coach-root')?.remove();
    document.body.classList.remove('coach-on');
    if (rushOff) { rushOff(); rushOff = null; }
    if (weekOff) { weekOff(); weekOff = null; }
  };
}
