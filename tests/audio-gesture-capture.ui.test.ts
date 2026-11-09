// @vitest-environment jsdom
// A first Enter/Space on the tape must still create the AudioContext: the tape's own keydown handler runs
// before a bubble-phase listener, so audio arming has to be registered on the window in the capture phase.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { fakePlatform, ROOTS } from './helpers';
import { FakeAudioContext } from './fake-audio';

const { platform } = fakePlatform('ok');
let stop: (() => void) | null = null;

beforeAll(() => {
  (window as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  stop = startApp(platform, false);
});

afterAll(() => {
  if (stop) stop();
  vi.useRealTimers();
});

describe('a first keydown arms audio before the element handles it', () => {
  it('has the AudioContext ready when an element keydown handler (like the tape) runs on the first ever key', () => {
    expect(FakeAudioContext.built).toBe(0);
    // Stands in for the tape's own keydown handler, which plays the tape sound: it must find audio already armed.
    const target = document.querySelector('#app') as HTMLElement;
    let builtWhenHandled = -1;
    target.addEventListener('keydown', () => { builtWhenHandled = FakeAudioContext.built; }, { once: true });
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(builtWhenHandled).toBe(1);
  });
});
