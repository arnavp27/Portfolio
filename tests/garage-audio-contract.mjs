import assert from 'node:assert/strict';
import { createGarageSound } from '../src/lib/garage/sound.ts';
import { garageAudioClips } from '../src/lib/garage/audio-clips.ts';
assert.deepEqual(
  garageAudioClips,
  { alien: null, 'power-on': null, 'power-off': null },
  'The public build defaults to original synthesized cues',
);
const nodes = [],
  contexts = [],
  handlers = new Map(),
  requests = [];
const settle = () => new Promise((r) => setTimeout(r, 0));
class Param {
  value = 0;
  setTargetAtTime(v) {
    assert(Number.isFinite(v));
    this.value = v;
  }
  setValueAtTime(v) {
    assert(Number.isFinite(v));
    this.value = v;
  }
  exponentialRampToValueAtTime(v) {
    assert(v > 0 && Number.isFinite(v));
    this.value = v;
  }
}
class Node {
  constructor(kind) {
    this.kind = kind;
    this.gain = new Param();
    this.frequency = new Param();
    this.Q = new Param();
    this.threshold = new Param();
    this.knee = new Param();
    this.ratio = new Param();
    for (const name of ['positionX', 'positionY', 'positionZ']) this[name] = new Param();
    nodes.push(this);
  }
  connect(n) {
    this.target = n;
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}
class Context {
  constructor() {
    contexts.push(this);
    this.state = 'suspended';
    this.sampleRate = 24000;
    this.currentTime = 10;
    this.destination = new Node('destination');
    this.listener = {};
    for (const name of [
      'positionX',
      'positionY',
      'positionZ',
      'forwardX',
      'forwardY',
      'forwardZ',
      'upX',
      'upY',
      'upZ',
    ])
      this.listener[name] = new Param();
  }
  createGain() {
    return new Node('gain');
  }
  createDynamicsCompressor() {
    return new Node('compressor');
  }
  createPanner() {
    return new Node('panner');
  }
  createBiquadFilter() {
    return new Node('filter');
  }
  createBufferSource() {
    return new Node('source');
  }
  createOscillator() {
    return new Node('oscillator');
  }
  createBuffer(_channels, n) {
    return { getChannelData: () => new Float32Array(n) };
  }
  async decodeAudioData(bytes) {
    return { asset: bytes.asset, music: bytes.asset === '/assets/audio/after-rain.ogg' };
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
  }
}
globalThis.AudioContext = Context;
globalThis.document = {
  hidden: false,
  addEventListener: (n, f) => handlers.set(n, f),
  removeEventListener: (n) => handlers.delete(n),
};
globalThis.fetch = async (url) => {
  requests.push(url);
  return {
    ok: true,
    arrayBuffer: async () => {
      const bytes = new ArrayBuffer(1);
      bytes.asset = url;
      return bytes;
    },
  };
};
let status = 'idle';
const audio = createGarageSound((s) => (status = s));
audio.play('boot');
assert.equal(contexts.length, 0, 'No audio graph before user activation');
await audio.start();
await new Promise((r) => setTimeout(r, 0));
assert.equal(status, 'running');
assert.equal(contexts.length, 1);
const musicSource = nodes.find((n) => n.buffer?.music);
assert(musicSource?.loop && musicSource.started, 'The music really loops');
const music = musicSource.target,
  master = music.target;
audio.setSettings({ muted: false, music: 0.4, effects: 0.6 });
assert.equal(music.gain.value, 0.4);
audio.setReading(true);
assert.equal(music.gain.value, 0.4 * 0.48, 'Music ducks while reading');
audio.setSettings({ muted: true, music: 0.4, effects: 0.6 });
assert.equal(master.gain.value, 0, 'Mute reaches every audio bus');
const before = nodes.length;
audio.play('key');
assert.equal(nodes.length, before, 'Muted clicks create no sound');
audio.setSettings({ muted: false, music: 0.4, effects: 0.6 });
for (const effect of [
  'key',
  'boot',
  'ready',
  'switch',
  'chair',
  'car',
  'step',
  'power-on',
  'power-off',
  'alien',
]) {
  const count = nodes.length;
  audio.play(effect);
  await settle();
  assert(nodes.length > count, `${effect} schedules audio`);
}
audio.update({ x: 1, y: 1.6, z: -2 }, { x: 0, y: 0, z: -1 });
assert.equal(contexts[0].listener.positionZ.value, -2);
assert(
  requests.every((url) => url === '/assets/audio/after-rain.ogg'),
  'Synthesized cues never fetch external recordings',
);
// Exercise the optional replacement hook with mocked bytes only; no recordings
// are bundled or fetched from the network by this test.

for (const cue of ['alien', 'power-on']) {
  const url = `/assets/audio/computers/test-${cue}.ogg`;
  garageAudioClips[cue] = url;
  contexts[0].currentTime += 1.1;
  audio.play(cue);
  await settle();
  const clips = () => nodes.filter((n) => n.buffer?.asset === url && n.started);
  const first = clips().at(-1);
  assert(first, `${cue} starts its own recording`);
  assert.equal(
    first.target.gain.value,
    0.6,
    'Clips use the SFX bus, so the environment volume slider controls them',
  );
  contexts[0].currentTime += 1.1;
  audio.play(cue);
  await settle();
  const next = clips().at(-1);
  assert.notEqual(next, first);
  assert(first.stopped, 'Retrigger replaces the previous playback without layering it');
  assert.equal(
    requests.filter((path) => path === url).length,
    1,
    'Decoded clips are reused without fetching again',
  );
}
const beforeMute = nodes.length,
  beforeRequests = requests.length;
audio.setSettings({ muted: true, music: 0.4, effects: 0.6 });
audio.play('alien');
audio.play('power-on');
await settle();
assert.equal(nodes.length, beforeMute);
assert.equal(requests.length, beforeRequests, 'Muted cues do not fetch or start recordings');
audio.setSettings({ muted: false, music: 0.4, effects: 0.6 });
Object.assign(garageAudioClips, { alien: null, 'power-on': null, 'power-off': null });
// Fan power follows each physical tower; it never silences the other machine or city.
const fanPanners = nodes.filter(
  (n) => n.kind === 'panner' && n.maxDistance === 20 && [1.04, -2.47].includes(n.positionZ.value),
);
assert.equal(fanPanners.length, 2);
const fanGains = fanPanners.map((p) => nodes.find((n) => n.kind === 'gain' && n.target === p));
audio.setComputerPower('kazam', false);
assert.equal(fanGains[0].gain.value, 0);
assert.equal(fanGains[1].gain.value, 1);
audio.setComputerPower('projects', false);
assert.equal(fanGains[1].gain.value, 0);
audio.setComputerPower('kazam', true);
assert.equal(fanGains[0].gain.value, 1);
assert.equal(fanGains[1].gain.value, 0);
// Check the actual shared city bus, not just the acoustic calculation.
const cityPanners = nodes.filter((n) => n.kind === 'panner' && n.maxDistance === 100);
assert.equal(cityPanners.length, 13);
const cityFilter = cityPanners[0].target,
  cityEnvelope = cityFilter.target;
assert(
  cityPanners.every((p) => p.target === cityFilter),
  'Passing engines and the breakfast counter share gate occlusion',
);
const sampleTraffic = Array.from({ length: 12 }, (_, i) => ({
  x: i * 3,
  y: 0.7,
  z: i % 2 ? 22.4 : 18.4,
  speed: 5.4,
  kind: 'car',
}));
audio.update({ x: 0, y: 1.64, z: 13 }, { x: 0, y: 0, z: -1 }, sampleTraffic);
assert.equal(cityEnvelope.gain.value, 1);
assert.equal(cityFilter.frequency.value, 9500);
audio.update({ x: 0, y: 1.64, z: 8 }, { x: 0, y: 0, z: -1 }, sampleTraffic);
assert(Math.abs(cityEnvelope.gain.value - 0.28) < 1e-8);
assert.equal(cityFilter.frequency.value, 2000);
audio.update({ x: 0, y: 1.64, z: 1 }, { x: 0, y: 0, z: -1 }, sampleTraffic);
assert(cityEnvelope.gain.value < 0.07);
assert.equal(cityFilter.frequency.value, 600);
assert.equal(cityPanners[5].positionX.value, 12, 'Moving engines follow the visible vehicles');

await audio.start();
assert.equal(contexts.length, 1, 'Resume never stacks a second soundtrack');
document.hidden = true;
handlers.get('visibilitychange')();
assert.equal(contexts[0].state, 'suspended');
document.hidden = false;
handlers.get('visibilitychange')();
await Promise.resolve();
assert.equal(contexts[0].state, 'running');
audio.dispose();
assert.equal(contexts[0].state, 'closed');
assert.equal(handlers.size, 0);
assert(
  nodes.filter((n) => n.started).every((n) => n.stopped),
  'Every looping source stops on disposal',
);
console.log(
  'PASS: gesture-only startup, looping BGM, every SFX, synthesized defaults, optional clip cache/retrigger, mute, reading duck, spatial listener, tab suspension and disposal.',
);
