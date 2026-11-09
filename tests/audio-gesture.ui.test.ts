// @vitest-environment jsdom
// Audio must stay silent (and build no AudioContext) until the player's first gesture, so browsers do not
// log "AudioContext was not allowed to start" on load.
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { fakePlatform, ROOTS } from './helpers';
import { FakeAudioContext } from './fake-audio';

const { platform, box } = fakePlatform('ok');
let stop: (() => void) | null = null;

beforeAll(() => {
  (window as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  stop = startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

afterAll(() => {
  if (stop) stop();
  vi.useRealTimers();
});

describe('audio waits for a user gesture', () => {
  it('builds no AudioContext on load or while timers run before any gesture', () => {
    vi.advanceTimersByTime(2000);
    expect(box.saved).not.toBeNull();
    expect(FakeAudioContext.built).toBe(0);
  });

  it('creates exactly one AudioContext on the first sound after a gesture', () => {
    window.dispatchEvent(new Event('pointerdown'));
    const parcel = document.querySelector('[data-parcel]') as HTMLElement | null;
    expect(parcel).not.toBeNull();
    parcel!.click();
    expect(FakeAudioContext.built).toBe(1);
  });
});
