// Every sound in the game is synthesized here at runtime, so the build ships no audio files. The items keep their
// eight sound words; the rest are short UI events. All of them go through the same warm master bus (low-pass and a
// gentle compressor) so a click does not jump out next to a thud. See docs/audio-credits.md.

export const MASTER_LOWPASS_HZ = 6500;
export const MUSIC_LEVEL = 0.13;
export const MUTE_FADE_SECONDS = 0.035;

export type ItemSound = 'rustle' | 'thud' | 'slosh' | 'clack' | 'clank' | 'jingle' | 'chime' | 'squeak';
export type GameSfx = 'tape' | 'scrape' | 'flap' | 'scale' | 'tap' | 'coin' | 'common' | 'rare' | 'epic' | 'secret';

export const ITEM_SOUNDS: readonly ItemSound[] = ['rustle', 'thud', 'slosh', 'clack', 'clank', 'jingle', 'chime', 'squeak'];
export const GAME_SFX: readonly GameSfx[] = ['tape', 'scrape', 'flap', 'scale', 'tap', 'coin', 'common', 'rare', 'epic', 'secret'];

/** The shared output stage: a soft low-pass, then a compressor, then a little headroom. */
export function createMaster(ctx: AudioContext): AudioNode {
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = MASTER_LOWPASS_HZ;
  low.Q.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.25;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  low.connect(comp);
  comp.connect(out);
  out.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.connect(low);
  return bus;
}

/**
 * Silences or restores everything on the master bus with a very short fade, so the mute button stops the notes that
 * are already scheduled instead of waiting for them to ring out. The fade is inaudible at 35 ms but avoids a click.
 */
export function setMasterMuted(ctx: AudioContext | null, bus: AudioNode | null, muted: boolean): void {
  if (!ctx || !bus) return;
  const gain = (bus as GainNode).gain;
  if (!gain) return;
  const level = muted ? 0 : 1;
  const t = ctx.currentTime;
  try {
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(level, t + MUTE_FADE_SECONDS);
  } catch {
    /* An older browser without the full AudioParam API jumps straight to the level. */
    try { gain.value = level; } catch { /* keep the current level */ }
  }
}

/** Lowers the music for a moment so a short sound stays clear. */
export function duckMusic(ctx: AudioContext | null, gain: GainNode | null): void {
  if (!ctx || !gain) return;
  const t = ctx.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(MUSIC_LEVEL * 0.4, t, 0.02);
    gain.gain.setTargetAtTime(MUSIC_LEVEL, t + 0.28, 0.25);
  } catch {
    /* An older browser without the full AudioParam API stays at its current level. */
  }
}

function noiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noise(ctx: AudioContext, dest: AudioNode, tm: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, dur);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, tm);
  g.gain.exponentialRampToValueAtTime(0.001, tm + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(tm);
  s.stop(tm + dur);
  return { f, g };
}

function tone(ctx: AudioContext, dest: AudioNode, tm: number, freq: number, dur: number, type: OscillatorType, gain: number, freqEnd?: number) {
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, tm);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, tm + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, tm);
  g.gain.exponentialRampToValueAtTime(gain, tm + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, tm + dur);
  o.connect(g);
  g.connect(dest);
  o.start(tm);
  o.stop(tm + dur + 0.02);
}

/** The eight sounds an item can make when the player shakes or picks it up. */
export function playTag(ctx: AudioContext, dest: AudioNode, tag: ItemSound): void {
  const tm = ctx.currentTime + 0.02;
  if (tag === 'rustle') {
    for (let i = 0; i < 4; i++) noise(ctx, dest, tm + i * 0.09, 0.12, 'bandpass', 1400 + Math.random() * 1200, 0.7, 0.22);
  } else if (tag === 'thud') {
    tone(ctx, dest, tm, 110, 0.25, 'sine', 0.6, 50);
    noise(ctx, dest, tm, 0.08, 'lowpass', 380, 1, 0.3);
    tone(ctx, dest, tm + 0.22, 90, 0.2, 'sine', 0.35, 45);
  } else if (tag === 'slosh') {
    const n = noise(ctx, dest, tm, 0.7, 'lowpass', 500, 4, 0.38);
    n.f.frequency.setValueAtTime(300, tm);
    n.f.frequency.linearRampToValueAtTime(1000, tm + 0.3);
    n.f.frequency.linearRampToValueAtTime(350, tm + 0.7);
  } else if (tag === 'clack') {
    [0, 0.11, 0.19].forEach(d => {
      noise(ctx, dest, tm + d, 0.04, 'highpass', 1600, 1, 0.32);
      tone(ctx, dest, tm + d, 1200, 0.05, 'triangle', 0.07);
    });
  } else if (tag === 'clank') {
    [420, 880, 1320, 1760].forEach((f, i) => tone(ctx, dest, tm, f, 0.5 - i * 0.08, 'sine', 0.18 - i * 0.04));
    tone(ctx, dest, tm + 0.18, 520, 0.3, 'triangle', 0.1);
  } else if (tag === 'jingle') {
    for (let i = 0; i < 7; i++) tone(ctx, dest, tm + i * 0.045, 1400 + Math.random() * 900, 0.18, 'sine', 0.07);
  } else if (tag === 'chime') {
    tone(ctx, dest, tm, 1047, 1.2, 'sine', 0.12);
    tone(ctx, dest, tm + 0.02, 1568, 1.0, 'sine', 0.07);
    tone(ctx, dest, tm + 0.3, 1318, 1.0, 'sine', 0.08);
  } else if (tag === 'squeak') {
    tone(ctx, dest, tm, 700, 0.18, 'sine', 0.18, 1200);
    tone(ctx, dest, tm + 0.22, 800, 0.12, 'sine', 0.15, 1100);
  }
}

/** Unpacking, tools, coins and the four reveal flourishes. */
export function playSfx(ctx: AudioContext, dest: AudioNode, name: GameSfx): void {
  const tm = ctx.currentTime + 0.02;
  if (name === 'tape') {
    const n = noise(ctx, dest, tm, 0.35, 'highpass', 1200, 0.7, 0.3);
    n.f.frequency.linearRampToValueAtTime(3200, tm + 0.35);
  } else if (name === 'scrape') {
    noise(ctx, dest, tm, 0.05, 'bandpass', 2200, 2, 0.1);
  } else if (name === 'flap') {
    noise(ctx, dest, tm, 0.15, 'lowpass', 800, 1, 0.4);
    tone(ctx, dest, tm, 140, 0.15, 'sine', 0.3, 80);
  } else if (name === 'scale') {
    tone(ctx, dest, tm, 660, 0.08, 'triangle', 0.1);
    tone(ctx, dest, tm + 0.5, 880, 0.12, 'triangle', 0.1);
  } else if (name === 'tap') {
    tone(ctx, dest, tm, 520, 0.06, 'triangle', 0.12);
  } else if (name === 'coin') {
    tone(ctx, dest, tm, 988, 0.08, 'square', 0.06);
    tone(ctx, dest, tm + 0.08, 1319, 0.2, 'square', 0.06);
  } else if (name === 'common') {
    tone(ctx, dest, tm, 523, 0.4, 'triangle', 0.2);
  } else if (name === 'rare') {
    [523, 659, 784].forEach((f, i) => tone(ctx, dest, tm + i * 0.09, f, 0.45, 'triangle', 0.18));
  } else if (name === 'epic') {
    [523, 659, 784, 1047].forEach(f => tone(ctx, dest, tm, f, 1.0, 'triangle', 0.11));
    [1047, 1319].forEach((f, i) => tone(ctx, dest, tm + 0.25 + i * 0.12, f, 0.6, 'sine', 0.1));
  } else if (name === 'secret') {
    [784, 988, 1175, 1568, 1319, 1568, 2093].forEach((f, i) => tone(ctx, dest, tm + i * 0.11, f, 0.7, 'sine', 0.12));
    [523, 784, 1047].forEach(f => tone(ctx, dest, tm + 0.8, f, 1.4, 'triangle', 0.07));
  }
}
