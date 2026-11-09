// @vitest-environment jsdom
// The Station "Today" panel: check-in card and three fixed daily tasks.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/core/config';
import { seeded } from '../src/core/daily';
import { newState } from '../src/core/logic';
import { refreshQuests } from '../src/core/quests';
import { startApp } from '../src/ui/app';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let stop: (() => void) | null = null;

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
});

afterEach(() => { if (stop) { stop(); stop = null; } });

describe('Station Today panel', () => {
  it('shows the check-in card and three daily tasks below the shelf', () => {
    const { platform, box } = fakePlatform('ok');
    const now = Date.now();
    const s = newState(now);
    s.introSeen = true;
    refreshQuests(s, now, seeded(1));
    box.saved = s;
    stop = startApp(platform, false);
    const panel = $('#today')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('.quest-row')).toHaveLength(3);
    expect(panel.querySelectorAll('.stamp-box')).toHaveLength(CONFIG.checkin.card);
    expect(panel.querySelector('#checkin-btn')).not.toBeNull();
    // The shelf stays the first thing on the page.
    expect($('.counter')!.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('checks in once a day and claims a finished task', () => {
    const { platform, box } = fakePlatform('ok');
    const now = Date.now();
    const s = newState(now);
    s.introSeen = true;
    refreshQuests(s, now, seeded(1));
    s.quests.list[0].got = s.quests.list[0].need;
    box.saved = s;
    stop = startApp(platform, false);
    const coins = box.saved!.coins;
    // The Station nav dot is on for the claim and the open check-in.
    expect(document.querySelector('[data-view="station"] .badge')).not.toBeNull();
    click($('[data-qclaim="0"]'));
    expect(box.saved!.coins).toBe(coins + CONFIG.quests.coins);
    expect(box.saved!.quests.list[0].claimed).toBe(true);
    click($('#checkin-btn'));
    expect(box.saved!.checkin.stamps).toBe(1);
    expect(box.saved!.checkin.last).toBe('2026-11-02');
    expect(($('#checkin-btn') as HTMLButtonElement).disabled).toBe(true);
    expect($('#checkin-btn')!.textContent).toContain('Come back tomorrow');
  });

  it('the fifth check-in shows the big delivery and adds parcels', () => {
    const { platform, box } = fakePlatform('ok');
    const now = Date.now();
    const s = newState(now);
    s.introSeen = true;
    s.checkin = { last: '2026-11-01', stamps: CONFIG.checkin.card - 1, cards: 0 };
    box.saved = s;
    stop = startApp(platform, false);
    const parcels = box.saved!.parcels.length;
    click($('#checkin-btn'));
    expect($('#modal-root')!.textContent).toContain('Big delivery');
    expect(box.saved!.checkin.stamps).toBe(0);
    expect(box.saved!.checkin.cards).toBe(1);
    expect(box.saved!.parcels.length).toBe(parcels + CONFIG.checkin.bigParcels);
    click($('#modal-root [data-close]'));
  });
});
