// @vitest-environment jsdom
// The town board in a fake browser: the station shows today's progress, a gift given on the Town page finishes
// its note, the nav shows what can be claimed, and claiming all three notes stamps the board.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let coins0 = 0;

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
  const s = newState(Date.now());
  s.introSeen = true;
  s.owned['rice-ball'] = 2;
  s.board = { day: '2026-11-02', made: ['2026-11-02'], bonus: false, stamps: 2, tasks: [
    { kind: 'open', by: 'theo', need: 3, got: 3, arg: null, claimed: false },
    { kind: 'return', by: 'okafor', need: 1, got: 1, arg: null, claimed: true },
    { kind: 'gift', by: 'okafor', need: 1, got: 0, arg: null, claimed: false },
  ] };
  coins0 = s.coins;
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('town board in the game', () => {
  it('shows today’s board on the station, with a claim badge on the Town tab', () => {
    expect($('#board-line')!.textContent).toContain('Today’s letters 2/3');
    expect($('#board-line')!.textContent).toContain('1 to claim');
    expect($('.nav-dot')!.textContent).toBe('1');
  });

  it('lists three pinned notes on the Town page', () => {
    click($('#board-line'));
    expect(document.querySelectorAll('#board .note')).toHaveLength(3);
    expect($('#board')!.textContent).toContain('Give a neighbor a gift');
    expect(document.querySelectorAll('#board .note.claimed')).toHaveLength(1);
    expect(document.querySelectorAll('#board [data-claim]')).toHaveLength(1);
  });

  it('a gift finishes its note', () => {
    click($('[data-gift="okafor"]'));
    click($('[data-gift-item="rice-ball"]'));
    click($('#modal-root [data-close]'));
    vi.advanceTimersByTime(1300);
    expect($('#toast-root')!.textContent).toContain('Letter done');
    expect(box.saved!.board.tasks[2].got).toBe(1);
    expect($('.nav-dot')!.textContent).toBe('2');
  });

  it('claiming pays coins, and the last claim stamps the board', () => {
    click($('[data-claim="0"]'));
    expect(box.saved!.coins).toBe(coins0 + CONFIG.board.coins);
    expect($('#board .note.n0.claimed.just .stamp')).not.toBeNull();
    click($('[data-claim="2"]'));
    expect($('#toast-root')!.textContent).toContain('Stamp #3');
    expect(box.saved!.board.stamps).toBe(3);
    expect(box.saved!.shards).toBe(CONFIG.board.bonusShards);
    expect($('.board-bonus.got')).not.toBeNull();
    expect($('.nav-dot')).toBeNull();
  });

  it('a claim button from yesterday does nothing to the new board', () => {
    const btn = document.createElement('button');
    btn.dataset.claim = '0'; btn.dataset.boardDay = '2026-11-01';
    document.body.appendChild(btn);
    const coins = box.saved!.coins;
    click(btn);
    expect($('#toast-root')!.textContent).toContain('New letters arrived');
    expect(box.saved!.coins).toBe(coins);
  });
});
