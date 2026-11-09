// The background loop is generated, so these tests lock the musical shape and the scheduler rather than a file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_BPM, MUSIC_BAR, MUSIC_STEPS, MUSIC_STEP_SECONDS, MUSIC_LOOP_SECONDS, MUSIC_LOWPASS_HZ, startMusic } from '../src/ui/music';
import { createMaster, duckMusic, GAME_SFX, ITEM_SOUNDS, MASTER_LOWPASS_HZ, MUTE_FADE_SECONDS, MUSIC_LEVEL, playSfx, playTag, setMasterMuted } from '../src/ui/sfx';

function fakeCtx(now = 0) {
  const made = { osc: 0, gain: 0, filter: 0, comp: 0, source: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect() {} });
  const ctx = {
    currentTime: now,
    sampleRate: 48000,
    destination: node(),
    createOscillator() { made.osc++; return { ...node(), type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} }; },
    createGain() { made.gain++; return { ...node(), gain: param() }; },
    createBiquadFilter() { made.filter++; return { ...node(), type: 'lowpass', frequency: param(), Q: param() }; },
    createDynamicsCompressor() { made.comp++; return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; },
    createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() { made.source++; return { ...node(), buffer: null, start() {}, stop() {} }; },
  };
  return { ctx: ctx as unknown as AudioContext, made, setNow(n: number) { ctx.currentTime = n; } };
}

afterEach(() => vi.useRealTimers());

describe('background music', () => {
  it('is a whole number of bars and a warm, short loop', () => {
    expect(MUSIC_STEPS % MUSIC_BAR).toBe(0);
    expect(MUSIC_LOOP_SECONDS).toBeCloseTo(29.09, 1);
    expect(MUSIC_LOOP_SECONDS).toBeGreaterThan(20);
    expect(MUSIC_LOWPASS_HZ).toBeLessThanOrEqual(3000);
    expect(MUSIC_BPM).toBe(66);
    expect(MUSIC_STEP_SECONDS).toBeCloseTo(60 / MUSIC_BPM / 2, 6);
  });

  it('schedules notes on the fly and stops when the returned stop function is called', () => {
    vi.useFakeTimers();
    const { ctx, made } = fakeCtx();
    const stop = startMusic(ctx, { connect() {} } as unknown as AudioNode, () => false);
    expect(made.filter).toBe(1); // the warm low-pass
    expect(made.osc).toBeGreaterThan(0);
    const afterStart = made.osc;
    stop();
    vi.advanceTimersByTime(1000);
    expect(made.osc).toBe(afterStart);
  });

  it('schedules nothing while muted, then resumes when unmuted', () => {
    vi.useFakeTimers();
    const { ctx, made, setNow } = fakeCtx();
    let muted = true;
    const stop = startMusic(ctx, { connect() {} } as unknown as AudioNode, () => muted);
    expect(made.osc).toBe(0);
    muted = false;
    setNow(0);
    vi.advanceTimersByTime(150);
    expect(made.osc).toBeGreaterThan(0);
    stop();
  });
});

describe('synthesized sound effects', () => {
  it('builds one warm master bus', () => {
    const { ctx, made } = fakeCtx();
    const bus = createMaster(ctx);
    expect(bus).not.toBeNull();
    expect(made.filter).toBe(1);
    expect(made.comp).toBe(1);
    expect(made.gain).toBe(2); // the trim and the bus
  });

  it('has a playable cue for every item sound and every action', () => {
    const { ctx, made } = fakeCtx();
    const bus = createMaster(ctx);
    for (const tag of ITEM_SOUNDS) expect(() => playTag(ctx, bus, tag)).not.toThrow();
    for (const name of GAME_SFX) expect(() => playSfx(ctx, bus, name)).not.toThrow();
    expect(ITEM_SOUNDS).toHaveLength(8);
    expect(GAME_SFX).toHaveLength(10);
    expect(made.osc).toBeGreaterThan(20);
    expect(made.source).toBeGreaterThan(4);
  });

  it('ducks the music and returns it to the normal level', () => {
    const { ctx } = fakeCtx();
    const seen: number[] = [];
    const gain = { gain: { cancelScheduledValues() {}, setTargetAtTime(v: number) { seen.push(v); } } } as unknown as GainNode;
    duckMusic(ctx, gain);
    expect(seen).toEqual([MUSIC_LEVEL * 0.4, MUSIC_LEVEL]);
    expect(MASTER_LOWPASS_HZ).toBe(6500);
  });
});

describe('instant mute', () => {
  function recordBus(value = 1) {
    const ramps: number[] = [];
    const param = {
      value,
      cancelScheduledValues() {},
      setValueAtTime() {},
      linearRampToValueAtTime(v: number) { ramps.push(v); },
    };
    return { bus: { gain: param } as unknown as AudioNode, param, ramps };
  }

  it('ramps the whole master bus to zero and back within 50 ms', () => {
    const { bus, ramps } = recordBus();
    const ctx = { currentTime: 4 } as AudioContext;
    setMasterMuted(ctx, bus, true);
    expect(ramps).toEqual([0]);
    setMasterMuted(ctx, bus, false);
    expect(ramps).toEqual([0, 1]);
    expect(MUTE_FADE_SECONDS).toBeGreaterThanOrEqual(0.02);
    expect(MUTE_FADE_SECONDS).toBeLessThanOrEqual(0.05);
  });

  it('falls back to the direct value when an old browser has no ramp API', () => {
    const param = { value: 1, cancelScheduledValues() { throw new Error('not supported'); } };
    const bus = { gain: param } as unknown as AudioNode;
    setMasterMuted({ currentTime: 0 } as AudioContext, bus, true);
    expect(param.value).toBe(0);
    setMasterMuted({ currentTime: 0 } as AudioContext, bus, false);
    expect(param.value).toBe(1);
  });

  it('ignores a missing context or bus', () => {
    expect(() => setMasterMuted(null, null, true)).not.toThrow();
  });
});
