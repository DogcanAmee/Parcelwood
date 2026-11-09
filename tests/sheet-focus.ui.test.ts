// @vitest-environment jsdom
// Keyboard focus for the inspect sheet: it moves into the dialog, Tab stays inside, tool clicks keep focus,
// and closing hands focus back to the shelf.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { BOARD_UI } from '../src/i18n/board';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const tab = (shiftKey = false) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
  if ($('#intro-ok')) $('#intro-ok')!.click();
});

describe('inspect sheet focus', () => {
  let parcelId = 0;
  it('moves focus into the sheet when a parcel opens', () => {
    parcelId = box.saved!.parcels.find(p => p.kind === 'normal')!.id;
    const btn = $(`[data-parcel="${parcelId}"]`)!;
    btn.focus(); btn.click();
    expect($('#sheet-root .sheet')!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.id).toBe('sheet-close');
  });

  it('wraps Tab and Shift+Tab inside the sheet', () => {
    const sheet = $('#sheet-root .sheet')!;
    tab(true);
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.id).not.toBe('sheet-close');
    tab();
    expect(document.activeElement!.id).toBe('sheet-close');
    $('#app button')!.focus();
    tab();
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it('keeps focus on a tool after the sheet redraws', () => {
    const look = $('[data-tool="look"]')!;
    look.focus(); look.click();
    expect($('#sheet-root .sheet')!.contains(document.activeElement)).toBe(true);
  });

  it('gives focus back to the shelf on close', () => {
    $('#sheet-close')!.click();
    expect($('#sheet-root')!.innerHTML).toBe('');
    expect($('#app')!.contains(document.activeElement)).toBe(true);
  });
});

describe('board guess note copy', () => {
  it('does not promise a streak, since right guesses add up across parcels', () => {
    expect(BOARD_UI.en.taskSay.guess).not.toMatch(/in a row/i);
    expect(BOARD_UI.zh.taskSay.guess).not.toContain('连');
    expect(BOARD_UI.es.taskSay.guess).not.toMatch(/seguid/i);
  });
});
