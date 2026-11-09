// A stand-in AudioContext for UI tests: every node and AudioParam the sound code touches exists and does nothing.
// It counts how many contexts were built so tests can check when audio starts.
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = (): Record<string, unknown> => new Proxy({ connect() {}, disconnect() {}, start() {}, stop() {}, buffer: null, type: '' } as Record<string | symbol, unknown>, {
  get(t, k) { if (!(k in t)) t[k] = param(); return t[k]; },
}) as Record<string, unknown>;

export class FakeAudioContext {
  static built = 0;
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = node();
  constructor() { FakeAudioContext.built++; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { return node(); }
  createOscillator() { return node(); }
  createBiquadFilter() { return node(); }
  createDynamicsCompressor() { return node(); }
  createBufferSource() { return node(); }
  createStereoPanner() { return node(); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
}
