// The background loop. It is synthesized at runtime, so the build ships no audio file (0 KB) and has no third-party
// sample licence to track. See docs/audio-credits.md.
//
// 64 eighth-notes at 66 BPM = a 29.09 s loop. Chords change on every bar (16 steps); the fourth bar resolves back to
// the first, so playback is seamless. The scheduler looks ahead, which keeps the loop steady when the tab is busy.

export const MUSIC_BPM = 66;
export const MUSIC_STEPS = 64;
export const MUSIC_BAR = 16;
export const MUSIC_STEP_SECONDS = 60 / MUSIC_BPM / 2;
export const MUSIC_LOOP_SECONDS = MUSIC_STEPS * MUSIC_STEP_SECONDS;
export const MUSIC_LOWPASS_HZ = 2400;

/** Four bars, repeated twice. MIDI notes; the last chord leads back to the first. */
const CHORDS: number[][] = [
  [48, 55, 59, 64], // Cmaj7
  [45, 52, 55, 60], // Am7
  [41, 48, 52, 57], // Fmaj7
  [43, 50, 55, 62], // Gsus4
];

/** Sparse pentatonic melody: step index inside one bar -> MIDI note. */
const MELODY: Array<number | null> = [
  72, null, null, 76, null, null, 74, null, 72, null, 69, null, null, 67, null, null,
  69, null, null, 72, null, null, 76, null, 72, null, null, 69, null, null, null, null,
  65, null, null, 69, null, null, 72, null, 69, null, 65, null, null, 64, null, null,
  62, null, null, 65, null, null, 69, null, 67, null, null, 64, null, null, null, null,
];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function voice(ctx: AudioContext, dest: AudioNode, at: number, freq: number, dur: number, type: OscillatorType,
  gain: number, attack: number, release: number, detune = 0): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.detune.setValueAtTime(detune, at);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.setValueAtTime(gain, at + Math.max(attack, dur - release));
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env); env.connect(dest);
  osc.start(at); osc.stop(at + dur + 0.05);
}

/**
 * Starts the loop. Returns a stop function. `isMuted` is polled: while it is true no notes are scheduled, so the loop
 * pauses with the game's mute switch, the SDK's muteAudio, and ads.
 */
export function startMusic(ctx: AudioContext, dest: AudioNode, isMuted: () => boolean): () => void {
  let step = 0;
  let next = ctx.currentTime + 0.12;
  // A warm low-pass sits between the voices and the game's master bus, so pads never sound glassy.
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass'; warm.frequency.value = MUSIC_LOWPASS_HZ; warm.Q.value = 0.4;
  warm.connect(dest);
  const voicing = warm as unknown as AudioNode;
  const timer = setInterval(tick, 120);

  function tick(): void {
    if (isMuted()) { next = ctx.currentTime + 0.12; return; }
    // After a suspended context or a throttled tab, do not replay the missed minutes all at once.
    if (next < ctx.currentTime - 0.5) next = ctx.currentTime + 0.12;
    const horizon = ctx.currentTime + 0.55;
    while (next < horizon) {
      const bar = Math.floor(step / MUSIC_BAR) % CHORDS.length;
      const inBar = step % MUSIC_BAR;
      if (inBar === 0) {
        const chord = CHORDS[bar];
        // Soft pad, one bar long, and a low root that fades before the next bar.
        for (const note of chord) voice(ctx, voicing, next, hz(note), MUSIC_STEP_SECONDS * 15, 'triangle', 0.028, 0.7, 2.2, (note % 3) - 1);
        voice(ctx, voicing, next, hz(chord[0] - 12), MUSIC_STEP_SECONDS * 13, 'sine', 0.075, 0.08, 2.8);
      }
      const note = MELODY[(step % MUSIC_STEPS) % MELODY.length];
      if (note != null) {
        voice(ctx, voicing, next, hz(note), MUSIC_STEP_SECONDS * 3.2, 'sine', 0.055, 0.02, MUSIC_STEP_SECONDS * 2.2);
      }
      step = (step + 1) % MUSIC_STEPS;
      next += MUSIC_STEP_SECONDS;
    }
  }

  tick();
  return () => clearInterval(timer);
}
