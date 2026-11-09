// Station Week overlay. Draws the run from the pure rules in core/run.ts and reports every action through opts.act,
// which logs and saves it. Loaded on demand, like Rush Hour.
import { CONFIG } from '../core/config';
import { ITEMS, SERIES } from '../core/logic';
import { RUN, RUN_TOOLS, STAMP, canInspect, itemsLeft, rerollCost, seriesLeft, storageSize, toolAvailable, toolCost } from '../core/run';
import type { RunEvent, RunParcel, RunState, RunTool } from '../core/run';
import { SERIES_IDS } from '../core/rushHour';
import type { TrayClue } from '../core/rushHour';
import { LEDGER, WEEK_TIER, modsFromLevels } from '../core/week';
import type { WeekFinish } from '../core/week';
import type { Clue, LedgerId, Sound, WeekLedger } from '../core/types';
import { CONTENT, UI } from '../i18n/strings';
import { weekText } from './strings';
import './week.css';

export interface WeekRecord {
  best: number; wins: number; played: number; rewardedToday: boolean; marks: number; levels: WeekLedger;
  open: boolean; daysToOpen: number; clockBehind: boolean; week: string; theme: [RunEvent, RunEvent];
  claimed: number; weekBest: number; weekPlays: number;
}
export interface WeekOptions {
  lang: string;
  onExit: () => void;
  load: () => RunState | null;
  start: () => RunState;
  act: (run: RunState, action: string) => boolean;
  finish: (run: RunState) => WeekFinish | null;
  abandon: () => void;
  buy: (id: LedgerId) => boolean;
  record: () => WeekRecord;
  share: (grade: number, sold: number) => Promise<boolean>;
}

const TOOL_ICON: Record<RunTool, string> = { postmark: '📮', shake: '👂', weigh: '⚖️', xray: '🩻' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const starsOf = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? String(v[k]) : '{' + k + '}'));

/** Mounts the Station Week overlay. Returns a dispose function. */
export function startStationWeek(opts: WeekOptions): () => void {
  const T = weekText(opts.lang);
  const strings = (UI as Record<string, any>)[opts.lang] || UI.en;
  const content = (CONTENT as Record<string, any>)[opts.lang];
  const root = document.createElement('div');
  root.className = 'wk';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', T.title);
  document.body.appendChild(root);
  document.body.classList.add('week-active');

  let run: RunState | null = opts.load();
  let screen: 'intro' | 'play' | 'over' = 'intro';
  let sel: number | null = null;
  let confirm: 'abandon' | 'end' | null = null;
  let msg: { text: string; bad: boolean } | null = null;
  let result: WeekFinish | null = null;
  let disposed = false;

  const soundShort = (s: Sound) => String((strings.sndShort || UI.en.sndShort)[s] || s);
  const seriesName = (id: string) => content?.series?.[id]?.[0] || SERIES[id].name;
  const shopName = (id: string) => content?.series?.[id]?.[2] || SERIES[id].shop;
  const itemName = (id: string) => content?.items?.[id]?.[0] || ITEMS[id].name;
  const residentName = (id: string) => content?.residents?.[id]?.[0] || CONFIG.residents.find(r => r.id === id)?.name || id;

  function themeName(e: RunEvent): string { return T.events[e][0]; }
  function rewardRows(rec: WeekRecord): string {
    const c = CONFIG.weekEvent;
    const tiers = [
      { bit: WEEK_TIER.finish, label: fill(T.rewardFinish, { c: c.coinsFinish }) },
      { bit: WEEK_TIER.win, label: fill(T.rewardWin, { c: c.coinsWin, s: c.shardsWin }) },
      { bit: WEEK_TIER.three, label: fill(T.rewardThree, { s: c.shardsThree }) },
    ];
    return tiers.map(t => '<li class="' + (rec.claimed & t.bit ? 'done' : '') + '">' + esc(t.label) +
      ' <b>' + esc(rec.claimed & t.bit ? T.rewardClaimed : T.rewardPending) + '</b></li>').join('');
  }
  function eventStatus(rec: WeekRecord): string {
    return rec.open ? T.eventOpen : rec.clockBehind ? T.eventClockBehind : fill(T.eventSoon, { n: rec.daysToOpen });
  }
  function clueShort(rp: RunParcel, c: TrayClue): string {
    const p = rp.p;
    if (c === 'sound') return '👂 ' + soundShort(p.sound);
    if (c === 'weight') return '⚖️ ' + p.weight + ' oz';
    if (c === 'postmark') return '📮 ' + p.postmark;
    if (c === 'smudge') return '📮 ' + p.smudge.join('…');
    return '🩻 ' + seriesName(p.series);
  }
  function clueLong(rp: RunParcel, c: TrayClue): string {
    const p = rp.p;
    if (c === 'sound') return fill(T.clueSound, { s: soundShort(p.sound) });
    if (c === 'weight') return fill(T.clueWeight, { w: p.weight });
    if (c === 'postmark') return fill(T.cluePostmark, { p: p.postmark });
    if (c === 'smudge') return fill(T.clueSmudge, { l: p.smudge.join(' · ') });
    return fill(T.clueSticker, { s: seriesName(p.series) });
  }
  function orderText(c: Clue): string {
    if (c.k === 'series') return fill(T.clueSeries, { s: seriesName(c.v) });
    if (c.k === 'snd') return fill(T.clueSnd, { s: soundShort(c.v) });
    if (c.k === 'under') return fill(T.clueUnder, { w: c.v });
    if (c.k === 'over') return fill(T.clueOver, { w: c.v });
    return '';
  }
  function nextTarget(r: RunState): { day: number; coins: number } | null {
    const d = Object.keys(RUN.targets).map(Number).sort((a, b) => a - b).find(x => x >= r.day);
    return d === undefined ? null : { day: d, coins: RUN.targets[d] };
  }

  // ---------- screens ----------
  function top(sub: string): string {
    return '<header class="wk-top"><button class="wk-icon" data-w="exit" aria-label="' + esc(T.exit) + '">←</button>' +
      '<div class="wk-brand"><span class="wk-kicker">' + esc(sub) + '</span><h1>' + esc(T.title) + '</h1></div>' +
      '<span class="wk-bulb" aria-hidden="true"></span></header>';
  }

  /** A plain wholesale carton. Every crate looks the same: only the checks you paid for get stamped onto it. */
  function crateArt(rp: RunParcel, big: boolean): string {
    const p = rp.p, has = (c: TrayClue) => rp.shown.includes(c);
    const no = String(p.id).padStart(2, '0');
    let marks = '';
    if (has('postmark')) marks += '<span class="wk-mk pm">' + esc(p.postmark) + '</span>';
    else if (has('smudge')) marks += '<span class="wk-mk pm smudge">' + esc(p.smudge.join('·')) + '</span>';
    if (has('weight')) marks += '<span class="wk-mk wt">' + p.weight + ' oz</span>';
    if (has('sound')) marks += '<span class="wk-mk snd">' + esc(soundShort(p.sound)) + '</span>';
    if (has('sticker')) marks += '<span class="wk-mk xr" style="--c:' + SERIES[p.series].color + '">' + esc(seriesName(p.series)) + '</span>';
    return '<span class="wk-crate' + (big ? ' big' : '') + '" aria-hidden="true"><i class="wk-flap"></i><i class="wk-tape"></i>' +
      '<b class="wk-no">' + no + '</b><i class="wk-arrows">↑↑</i>' + (rp.insured ? '<span class="wk-mk ins">' + esc(T.insured) + '</span>' : '') + marks + '</span>';
  }

  function introView(): string {
    const rec = opts.record();
    const rules = T.rules.map(r => '<li>' + esc(r) + '</li>').join('');
    const pile = '<div class="wk-pile" aria-hidden="true">' + [3, 1, 2].map(n => '<span class="wk-crate"><i class="wk-flap"></i><i class="wk-tape"></i><b class="wk-no">0' + n + '</b><i class="wk-arrows">↑↑</i></span>').join('') + '</div>';
    const theme = fill(T.theme, { a: themeName(rec.theme[0]), b: themeName(rec.theme[1]) });
    const weekLine = rec.weekPlays ? fill(T.bestWeek, { g: starsOf(rec.weekBest) }) + ' · ' + fill(T.runsWeek, { n: rec.weekPlays }) : T.noRuns;
    const brief = '<section class="wk-panel wk-room wk-brief">' + pile +
      '<p class="wk-lead">' + esc(T.intro) + '</p><ol class="wk-rules">' + rules + '</ol>' +
      '<p class="wk-small wk-theme"><b>🗓 ' + esc(theme) + '</b></p>' +
      '<p class="wk-small">' + esc(eventStatus(rec)) + '</p>' +
      '<p class="wk-small">' + esc(T.practice) + '</p>' +
      '<div class="wk-rewards"><b>' + esc(T.rewardTitle) + '</b><ul class="wk-rules wk-reward-list">' + rewardRows(rec) + '</ul></div>' +
      '<p class="wk-small">' + esc(weekLine) + '</p>' +
      '<p class="wk-small">' + esc(fill(T.record, { g: starsOf(rec.best), w: rec.wins, p: rec.played })) + '</p>' +
      '<p class="wk-small">' + esc(rec.rewardedToday ? T.rewardDone : T.rewardToday) + '</p>' +
      '<div class="wk-actions">' +
        (run ? '<button class="wk-btn" data-w="resume">' + esc(fill(T.resume, { d: run.day })) + '</button>' +
          '<button class="wk-btn ghost" data-w="abandon">' + esc(confirm === 'abandon' ? T.abandonConfirm : T.abandon) + '</button>'
          : '<button class="wk-btn" data-w="start">' + esc(T.start) + '</button>') +
      '</div></section>';
    return top(T.kicker) + '<main class="wk-body wk-intro"><div class="wk-intro-cols">' + brief + ledgerView(rec) + '</div></main>';
  }

  function ledgerView(rec: WeekRecord): string {
    const busy = !!run;
    const active = modsFromLevels(rec.levels);
    const effects: string[] = [];
    if (active.ap) effects.push('+' + active.ap + ' ' + T.ap);
    if (active.storage) effects.push('+' + active.storage + ' ' + T.storageShort);
    if (active.checks) effects.push(fill(T.freeChecksDay, { n: active.checks }));
    if (active.coins) effects.push('+' + active.coins * 10 + ' ' + T.startCoins);
    if (active.keen) effects.push(T.keen);
    const rows = LEDGER.map(def => {
      const level = rec.levels[def.id];
      const tier = def.tiers[level];
      const desc = tier ? fill(T.ledgerNext, { d: T.ledgerDesc[def.id][level] ?? '' }) : (T.ledgerDesc[def.id][def.tiers.length - 1] ?? T.maxed);
      const pips = def.tiers.map((_, i) => '<i class="' + (i < level ? 'on' : '') + '"></i>').join('');
      let action: string;
      if (!tier) action = '<span class="wk-max">' + esc(T.maxed) + '</span>';
      else {
        const label = busy ? T.ledgerBusy : rec.marks < tier.cost ? T.notEnough : fill(T.buy, { c: tier.cost });
        action = '<button class="wk-buy" data-w="buy" data-l="' + def.id + '"' + (busy || rec.marks < tier.cost ? ' disabled' : '') + '>' + esc(label) + '</button>';
      }
      return '<div class="wk-lrow"><div class="wk-linfo"><b>' + esc(T.ledgerNames[def.id]) + '</b><small>' + esc(desc) + '</small></div>' +
        '<span class="wk-pips" aria-label="' + esc(fill(T.level, { n: level, m: def.tiers.length })) + '">' + pips + '</span>' + action + '</div>';
    }).join('');
    return '<section class="wk-panel wk-ledger"><div class="wk-head"><h2>' + esc(T.ledger) + '</h2>' +
      '<span class="wk-marks" title="' + esc(T.marks) + '">🖋 <b>' + rec.marks + '</b></span></div>' +
      '<p class="wk-small">' + esc(T.ledgerNote) + '</p>' +
      '<p class="wk-active">' + esc(fill(T.ledgerActive, { d: effects.length ? effects.join(' · ') : T.ledgerNone })) + '</p>' +
      rows + '</section>';
  }

  function statusBar(r: RunState): string {
    const tg = nextTarget(r);
    const hearts = Array.from({ length: RUN.complaintsMax }, (_, i) => '<i class="' + (i < r.complaints ? 'on' : '') + '"></i>').join('');
    const ev = r.event ? '<div class="wk-event"><b>' + esc(T.events[r.event][0]) + '</b> ' + esc(T.events[r.event][1]) + '</div>' : '';
    const stamps = r.stamps.length ? '<div class="wk-owned">' + r.stamps.map(id => '<span class="wk-chip" title="' + esc(T.stamps[id][1]) + '">' + esc(T.stamps[id][0]) + '</span>').join('') + '</div>' : '';
    const mods: string[] = [];
    if (r.mods.ap) mods.push('+' + r.mods.ap + ' ' + T.ap);
    if (r.mods.storage) mods.push('+' + r.mods.storage + ' ' + T.storageShort);
    if (r.mods.checks && r.freeChecks > 0) mods.push(fill(T.freeLeft, { n: r.freeChecks }));
    if (r.mods.coins) mods.push('+' + r.mods.coins * 10 + ' ' + T.startCoins);
    if (r.mods.keen) mods.push(T.keen);
    const ledger = mods.length ? '<div class="wk-mods"><span aria-hidden="true">🖋</span> ' + esc(mods.join(' · ')) + '</div>' : '';
    return '<div class="wk-stats">' +
      '<span class="wk-stat ap"><b id="wk-ap">' + r.ap + '</b><small>' + esc(T.ap) + '</small></span>' +
      '<span class="wk-stat coin"><b>' + r.earned + '</b><small>' + esc(T.takings) + '</small></span>' +
      '<span class="wk-stat"><b>' + (tg ? tg.coins : '—') + '</b><small>' + esc(tg ? (tg.day === RUN.days ? T.goal : fill(T.target, { c: tg.coins, d: tg.day })) : T.noTarget) + '</small></span>' +
      '<span class="wk-stat"><span class="wk-hearts" aria-label="' + esc(T.complaints + ' ' + r.complaints + '/' + RUN.complaintsMax) + '">' + hearts + '</span><small>' + esc(T.complaints) + '</small></span>' +
      '</div>' + ledger + ev + stamps;
  }

  function shopsRow(r: RunState): string {
    return '<div class="wk-shops">' + SERIES_IDS.map(id => {
      const d = r.demand[id] ?? 1;
      const tag = d > 1 ? '<em class="hot">' + esc(T.hot) + ' ×' + d + '</em>' : d < 1 ? '<em class="cold">' + esc(T.cold) + ' ×' + d + '</em>' : '';
      return '<div class="wk-shop" style="--c:' + SERIES[id].color + '"><b>' + esc(shopName(id)) + '</b><small>' + esc(SERIES[id].postmark) + '</small>' + tag + '</div>';
    }).join('') + '</div>';
  }

  function ordersView(r: RunState): string {
    const open = r.orders.map((o, i) => ({ o, i })).filter(x => !x.o.done);
    return '<section class="wk-panel"><h2>' + esc(T.orders) + '</h2>' + (open.length
      ? '<ul class="wk-orders">' + open.map(({ o }) => '<li><b>' + esc(residentName(o.resident)) + '</b> · ' + esc(orderText(o.clue)) + '</li>').join('') + '</ul>'
      : '<p class="wk-small">' + esc(T.noOrders) + '</p>') + '</section>';
  }

  function deskView(r: RunState): string {
    const cards = r.desk.map((rp, i) => {
      const label = fill(T.parcelNo, { n: rp.p.id }) + (rp.insured ? ', ' + T.insured : '') + '. ' + (rp.shown.map(c => clueShort(rp, c)).join(', ') || T.unchecked);
      return '<button class="wk-parcel' + (sel === i ? ' sel' : '') + (rp.shown.length ? '' : ' fresh') + '" style="--i:' + i + '" data-w="sel" data-i="' + i + '" aria-pressed="' + (sel === i) + '" aria-label="' + esc(label) + '">' +
        crateArt(rp, false) + '</button>';
    }).join('');
    return '<section class="wk-panel wk-room"><div class="wk-head"><h2>' + esc(T.desk) + '</h2><span class="wk-count">' + r.desk.length + '</span></div>' +
      (cards ? '<div class="wk-desk">' + cards + '</div>' : '<p class="wk-small">' + esc(T.deskEmpty) + '</p>') +
      '<p class="wk-small">' + esc(fill(T.storage, { n: storageSize(r) })) + '</p></section>';
  }

  function detailView(r: RunState): string {
    if (sel === null || !r.desk[sel]) return '<section class="wk-panel wk-detail"><p class="wk-small">' + esc(T.pickParcel) + '</p></section>';
    const rp = r.desk[sel], i = sel;
    const tools = RUN_TOOLS.map(tool => {
      const cost = toolCost(r, tool), done = rp.checks.includes(tool), on = canInspect(r, i, tool);
      const note = !toolAvailable(r, tool) ? T.toolOff : cost === 0 ? T.free : String(cost);
      return '<button class="wk-tool' + (done ? ' done' : '') + '" data-w="inspect" data-t="' + tool + '"' + (on ? '' : ' disabled') + '>' +
        '<span aria-hidden="true">' + TOOL_ICON[tool] + '</span>' + esc(T.tools[tool]) + '<small>' + esc(done ? '✓' : note) + '</small></button>';
    }).join('');
    const series = seriesLeft(rp), items = itemsLeft(rp);
    const lines = rp.shown.map(c => '<li>' + esc(clueLong(rp, c)) + '</li>').join('');
    const guess = series.length ? fill(T.maybe, { s: series.map(shopName).join(' / ') }) : T.nothingFits;
    const hold = items.length && items.length <= 4 ? '<p class="wk-small">' + esc(fill(T.mayHold, { s: items.map(itemName).join(', ') })) + '</p>' : '';
    const shops = SERIES_IDS.map(id => '<button class="wk-route" data-w="sell" data-s="' + id + '" style="--c:' + SERIES[id].color + '">' + esc(fill(T.sellTo, { s: shopName(id) })) + '</button>').join('');
    const orders = r.orders.map((o, n) => o.done ? '' : '<button class="wk-route order" data-w="order" data-o="' + n + '">' + esc(fill(T.giveTo, { r: residentName(o.resident) })) + '<small>' + esc(orderText(o.clue)) + '</small></button>').join('');
    return '<section class="wk-panel wk-detail"><div class="wk-head"><h2>' + esc(fill(T.parcelNo, { n: rp.p.id })) + '</h2>' + (rp.insured ? '<em class="wk-ins">' + esc(T.insured) + '</em>' : '') + '</div>' +
      '<div class="wk-stage">' + crateArt(rp, true) + '</div><div class="wk-tools">' + tools + '</div>' + (lines ? '<ul class="wk-lines">' + lines + '</ul>' : '') +
      '<p class="wk-guess' + (series.length ? '' : ' bad') + '">' + esc(guess) + '</p>' + hold +
      '<div class="wk-routes">' + shops + orders + '<button class="wk-route back" data-w="return">' + esc(T.sendBack) + '</button></div></section>';
  }

  function dayView(r: RunState): string {
    const lost = Math.max(0, r.desk.length - storageSize(r));
    return top(fill(T.day, { d: r.day, n: RUN.days })) + '<main class="wk-body">' + statusBar(r) + shopsRow(r) +
      '<div class="wk-cols"><div>' + deskView(r) + ordersView(r) + '</div><div>' + detailView(r) + '</div></div>' +
      '<div class="wk-actions"><button class="wk-btn" data-w="end">' + esc(confirm === 'end' && lost ? fill(T.endDayWarn, { n: lost }) : T.endDay) + '</button></div></main>';
  }

  function eveningView(r: RunState): string {
    const tg = RUN.targets[r.day];
    const note = tg === undefined ? '' : '<p class="wk-small' + (r.earned >= tg ? '' : ' bad') + '">' + esc(r.earned >= tg ? T.targetMet : T.targetMissed) + '</p>';
    const cards = r.offer.map(id => '<button class="wk-stamp" data-w="pick" data-p="' + id + '"><span class="wk-paper"><small>' + esc(T.schools[STAMP[id].school]) + '</small><b>' + esc(T.stamps[id][0]) + '</b><span>' + esc(T.stamps[id][1]) + '</span></span></button>').join('');
    const cost = rerollCost(r);
    return top(fill(T.evening, { d: r.day })) + '<main class="wk-body">' + statusBar(r) +
      '<section class="wk-panel"><p class="wk-lead">' + esc(fill(T.earnedToday, { c: r.earned })) + '</p>' + note + '</section>' +
      '<section class="wk-panel"><h2>' + esc(T.pickTitle) + '</h2><div class="wk-offer">' + cards + '</div>' +
      '<div class="wk-actions"><button class="wk-btn ghost" data-w="reroll"' + (cost === null || r.coins < cost ? ' disabled' : '') + '>' + esc(cost === null ? T.noReroll : fill(T.reroll, { c: cost })) + '</button>' +
      '<button class="wk-btn ghost" data-w="skip">' + esc(T.skip) + '</button></div></section></main>';
  }

  function overView(r: RunState): string {
    const res = result;
    const paid = res && res.official ? fill(T.marksEarned, { n: res.marks }) : T.marksPractice;
    const ev = res && res.event;
    const eventLine = ev ? (ev.paid ? fill(T.eventPaid, { c: ev.coins, s: ev.shards }) : T.eventAlready) : T.eventClosed;
    return top(fill(T.day, { d: r.day, n: RUN.days })) + '<main class="wk-body wk-over"><section class="wk-panel wk-end">' +
      '<h2 class="wk-result">' + esc(r.win ? T.win : T.lose) + '</h2>' +
      '<p class="wk-grade" aria-label="' + esc(T.grade + ' ' + (res ? res.grade : 0) + '/3') + '">' + starsOf(res ? res.grade : 0) + '</p>' +
      '<p class="wk-lead">' + esc(paid) + '</p>' +
      '<p class="wk-small">' + esc(eventLine) + '</p>' +
      '<p class="wk-small">' + esc(fill(T.stats, { a: r.stats.sold, b: r.stats.orders, c: r.stats.returned, d: r.stats.mistakes })) + '</p>' +
      '<div class="wk-actions"><button class="wk-btn" data-w="again">' + esc(T.again) + '</button>' +
      '<button class="wk-btn ghost" data-w="share">' + esc(T.share) + '</button>' +
      '<button class="wk-btn ghost" data-w="ledger">' + esc(T.openLedger) + '</button>' +
      '<button class="wk-btn ghost" data-w="exit">' + esc(T.back) + '</button></div></section></main>';
  }

  function draw(): void {
    if (disposed) return;
    const focusKey = (document.activeElement as HTMLElement | null)?.closest?.('.wk [data-w]')?.getAttribute('data-w');
    let html: string;
    if (screen === 'intro' || !run) html = introView();
    else if (screen === 'over') html = overView(run);
    else html = run.phase === 'evening' ? eveningView(run) : dayView(run);
    root.innerHTML = '<div class="wk-scene">' + html + '<div class="wk-feedback' + (msg?.bad ? ' bad' : '') + '" role="status" aria-live="polite">' + esc(msg ? msg.text : '') + '</div></div>';
    const again = focusKey ? root.querySelector<HTMLElement>('[data-w="' + focusKey + '"]:not([disabled])') : null;
    (again || root.querySelector<HTMLElement>('[data-w]:not([disabled])'))?.focus({ preventScroll: true });
  }

  // ---------- actions ----------
  function act(action: string): void {
    if (!run) return;
    const before = { earned: run.earned, complaints: run.complaints, mistakes: run.stats.mistakes, right: run.stats.right, returned: run.stats.returned, orders: run.stats.orders };
    if (!opts.act(run, action)) return;
    const k = action[0];
    const coins = run.earned - before.earned;
    if (k === 's' || k === 'o' || k === 'b') {
      sel = null;
      if (run.complaints > before.complaints) msg = { text: T.complaint, bad: true };
      else if (run.stats.mistakes > before.mistakes) msg = { text: T.forgiven, bad: false };
      else if (k === 's') msg = { text: fill(run.stats.right > before.right ? T.sold : T.soldWrong, { c: coins }), bad: run.stats.right === before.right };
      else if (k === 'o') msg = { text: run.stats.orders > before.orders ? fill(T.orderDone, { c: coins }) : T.orderWrong, bad: run.stats.orders === before.orders };
      else msg = run.stats.returned > before.returned ? { text: fill(T.returned, { c: coins }), bad: false } : { text: T.wasted, bad: true };
    } else if (k === 'e') {
      sel = null; msg = null;
    } else if (k === 'p') {
      msg = null;
    }
    if (run.phase === 'over') { result = opts.finish(run); screen = 'over'; }
    draw();
  }

  function onClick(e: Event): void {
    e.stopPropagation(); // the overlay's buttons are not the station's: keep them away from the game's own click handler
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const w = b.dataset.w;
    if (w !== 'abandon' && w !== 'end') confirm = null;
    switch (w) {
      case 'exit': opts.onExit(); return;
      case 'start': case 'again': run = opts.start(); result = null; sel = null; msg = null; screen = 'play'; draw(); return;
      case 'share': {
        if (!run) return;
        const grade = result ? result.grade : 0, sold = run.stats.sold;
        void opts.share(grade, sold).then(ok => { msg = { text: ok ? T.shareCopied : T.shareFail, bad: !ok }; draw(); });
        return;
      }
      case 'resume': screen = 'play'; draw(); return;
      case 'ledger': run = null; result = null; sel = null; msg = null; screen = 'intro'; draw(); return;
      case 'buy': {
        const id = b.dataset.l as LedgerId;
        if (opts.buy(id)) { msg = { text: T.bought, bad: false }; draw(); }
        return;
      }
      case 'abandon':
        if (confirm !== 'abandon') { confirm = 'abandon'; draw(); return; }
        opts.abandon(); run = null; confirm = null; draw(); return;
      case 'sel': {
        sel = Number(b.dataset.i); msg = null; draw();
        // On a phone the parcel panel sits under the counter: bring it into view.
        if (window.innerWidth < 760) root.querySelector<HTMLElement>('.wk-detail')?.scrollIntoView?.({ block: 'start' });
        return;
      }
      case 'inspect': if (sel !== null) act('i:' + sel + ':' + b.dataset.t); return;
      case 'sell': if (sel !== null) act('s:' + sel + ':' + b.dataset.s); return;
      case 'order': if (sel !== null) act('o:' + sel + ':' + b.dataset.o); return;
      case 'return': if (sel !== null) act('b:' + sel); return;
      case 'end': {
        const lost = run ? Math.max(0, run.desk.length - storageSize(run)) : 0;
        if (lost && confirm !== 'end') { confirm = 'end'; draw(); return; }
        confirm = null; act('e'); return;
      }
      case 'pick': act('p:' + b.dataset.p); return;
      case 'skip': act('p:'); return;
      case 'reroll': act('x'); return;
    }
  }
  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') opts.onExit(); }

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  draw();

  return () => {
    disposed = true;
    root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    root.remove();
    document.body.classList.remove('week-active');
  };
}
