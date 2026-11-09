// @vitest-environment jsdom
// Town levels in a fake browser: Rush Hour is open from Lv2, a return pushes the town to Lv4, and the level-up popup lists what opened,
// urgent parcels can only be delivered, and a favourite gift is found on the Town page.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { seeded } from '../src/core/daily';
import { makeParcel, newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let lost = 0;

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
  const s = newState(Date.now());
  s.introSeen = true;
  s.town.rep = CONFIG.townLevels[3] - 1; s.town.level = 3;
  s.owned['rice-ball'] = 2; s.owned['soda-can'] = 2;
  const p = makeParcel(s, 'mystery', seeded(1)); s.parcels.push(p); lost = p.id;
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('town levels in the game', () => {
  it('shows the town level and today’s event on the station, with Rush Hour open from Lv2', () => {
    expect($('#town-strip')!.textContent).toContain('Town Lv 3');
    expect($('#event')).not.toBeNull();
    expect($('[data-view="rush"]')).not.toBeNull();
    expect(box.saved!.parcels.filter(p => p.urgent)).toHaveLength(1);
    expect(document.querySelector('.slot.urgent')).not.toBeNull();
  });

  it('shows each open neighbour as its own portrait, worried while an urgent parcel waits', () => {
    click(document.querySelector('[data-view="town"]'));
    const urgentRes = box.saved!.parcels.find(p => p.urgent)!.resident;
    const open = CONFIG.residents.filter(r => r.lv <= 3);
    for (const r of open) {
      const img = document.querySelector(`[data-res="${r.id}"] img.face`) as HTMLImageElement;
      expect(img, r.id).not.toBeNull();
      expect(img.getAttribute('src'), r.id).toBe(`residents/${r.id}-${r.id === urgentRes ? 'worried' : 'normal'}.webp`);
      expect(img.getAttribute('alt'), r.id).toBe('');
      expect(img.getAttribute('aria-hidden'), r.id).toBe('true');
    }
    // locked houses keep the drawn lock, not a portrait
    const locked = [...document.querySelectorAll('.neighbor.locked')] as HTMLElement[];
    expect(locked.length).toBe(CONFIG.residents.length - open.length);
    for (const el of locked) {
      expect(el.querySelector('img.face')).toBeNull();
      expect(el.querySelector('.face')).not.toBeNull();
    }
    click(document.querySelector('[data-view="station"]'));
  });

  it('an urgent parcel can be delivered but not opened', () => {
    const u = box.saved!.parcels.find(p => p.urgent)!;
    click(document.querySelector(`[data-parcel="${u.id}"]`));
    expect($('#go-open')).toBeNull();
    expect($('#go-return')!.textContent).toContain('Deliver to');
    const sheetFace = $('#sheet-root .mface img.face') as HTMLImageElement;
    expect(sheetFace.getAttribute('src')).toBe(`residents/${u.resident}-worried.webp`);
    click($('#sheet-close'));
  });

  it('a return reaches Lv4: the popup lists Lena, and Rush Hour was already open', () => {
    click(document.querySelector(`[data-parcel="${lost}"]`));
    click($('#go-return'));
    expect($('#modal-root')!.textContent).toContain('reputation');
    click($('#modal-root [data-close]'));
    expect($('#level-up')).not.toBeNull();
    expect($('#modal-root')!.textContent).toContain('Lv 4');
    expect($('#level-up')!.textContent).toContain('Lena');
    expect($('#level-up')!.textContent).not.toContain('Rush Hour');
    click($('#modal-root [data-close]'));
    expect($('[data-view="rush"]')).not.toBeNull();
    expect(box.saved!.town.level).toBe(4);
  });

  it('the Town page shows who moved in, who is still to come, and finds a favourite gift', () => {
    click($('[data-view="town"]'));
    expect($('[data-resident="lena"]')).not.toBeNull();
    expect(document.querySelectorAll('.neighbor.locked')).toHaveLength(3);
    click($('[data-gift="theo"]'));
    click($('[data-gift-item="rice-ball"]'));
    expect($('#modal-root')!.textContent).toContain('loves it');
    expect(box.saved!.town.known).toEqual(['theo']);
    expect(box.saved!.owned['rice-ball']).toBe(1);
    click($('#modal-root [data-close]'));
    expect(($('[data-gift="theo"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reads in Chinese', () => {
    const sel = $('#lang') as HTMLSelectElement;
    sel.value = 'zh'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#town-level')!.textContent).toContain('小镇 Lv 4');
    expect($('#app')!.textContent).toContain('最爱的礼物');
  });
});
