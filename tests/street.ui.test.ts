// @vitest-environment jsdom
// Parcel Street on the Town page: the progress chip, decorations under each house, the full list and the repair popup.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { newState } from '../src/core/logic';
import { STREET_COINS, STREET_STEPS } from '../src/core/street';
import { fakePlatform, ROOTS } from './helpers';
import { STREET_UI } from '../src/i18n/street';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
  const s: any = newState(Date.now());
  s.introSeen = true; s.guideSeen = true;
  s.town.rep = 20; s.town.street = 0; // one repair paid for, not announced yet
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('Parcel Street', () => {
  it('announces a repair it has not shown yet and pays for it', () => {
    expect($('#street-up')!.textContent).toContain(STREET_UI.en.repairs[0][0]);
    expect(box.saved!.town.street).toBe(1);
    expect(box.saved!.coins).toBe(newState(0).coins + STREET_COINS);
    click($('#modal-root [data-close]'));
  });

  it('shows progress on the street and the next repair', () => {
    click($('[data-view="town"]'));
    expect($('#street-btn')!.textContent).toContain('1/' + STREET_STEPS.length);
    expect($('#street-btn')!.textContent).toContain(STREET_STEPS[1].e);
  });

  it('lists every building and its repairs', () => {
    click($('#street-btn'));
    const txt = $('#modal-root')!.textContent!;
    for (const name of Object.values(STREET_UI.en.buildings)) expect(txt).toContain(name as string);
    expect(txt).toContain(STREET_UI.en.repairs[0][0]);
    expect(document.querySelectorAll('#modal-root .repairs li.done').length).toBe(1);
    click($('#modal-root [data-close]'));
  });

  it('puts repairs under the neighbor\'s house as they are made', () => {
    const theo = () => document.querySelector('[data-resident="theo"] .deco')!;
    expect(theo().textContent).toBe('');
    expect(theo().querySelectorAll('i.off').length).toBe(4);
  });
});
