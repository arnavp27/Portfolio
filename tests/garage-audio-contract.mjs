import assert from 'node:assert/strict';
import { createGarageSound } from '../src/lib/garage/sound.ts';
import { garageAudioClips } from '../src/lib/garage/audio-clips.ts';
import {
  keyboardNotes,
  keyboardNoteIds,
  keyboardSampleUrl,
} from '../src/lib/garage/keyboard-notes.ts';
const configuredClips = { ...garageAudioClips };
assert.deepEqual(
  configuredClips,
  {
    'power-on': '/assets/audio/computers/windows-xp-startup.mp3',
    'power-off': '/assets/audio/computers/windows-xp-shutdown.mp3',
  },
  'Power switches have configured recordings; the keyboard uses a separate four-note bank',
);
// Null mappings remain a supported synthesis-only fallback.
Object.assign(garageAudioClips, { 'power-on': null, 'power-off': null });
const nodes = [],
  contexts = [],
  handlers = new Map(),
  requests = [],
  decodes = [],
  decodeGates = new Map();
const settle = () => new Promise((r) => setTimeout(r, 0));
function holdDecode(url) {
  let release;
  decodeGates.set(url, new Promise((resolve) => (release = resolve)));
  return () => {
    decodeGates.delete(url);
    release();
  };
}
class Param {
  value = 0;
  targets = [];
  automation = [];
  setTargetAtTime(v, time, constant) {
    assert(Number.isFinite(v));
    this.targets.push({ value: v, time, constant });
    this.value = v;
  }
  setValueAtTime(v, time) {
    assert(Number.isFinite(v));
    this.automation.push({ type: 'set', value: v, time });
    this.value = v;
  }
  linearRampToValueAtTime(v, time) {
    assert(Number.isFinite(v));
    this.automation.push({ type: 'ramp', value: v, time });
    this.value = v;
  }
  cancelScheduledValues(time) {
    this.automation.push({ type: 'cancel', time });
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
  start(...args) {
    this.started = true;
    this.startArgs = args;
  }
  stop(...args) {
    this.stopped = true;
    this.stopCalls ??= [];
    this.stopCalls.push(args);
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
    decodes.push(bytes.asset);
    await decodeGates.get(bytes.asset);
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
audio.playKeyboardNote('1', 'kazam');
assert.equal(contexts.length, 0, 'No audio graph before user activation');
assert.deepEqual(audio.update({ x: 0, y: 1.64, z: 13 }, { x: 0, y: 0, z: -1 }), {
  gain: 1,
  cutoff: 9500,
  zone: 'street',
});
assert.equal(contexts.length, 0, 'Acoustic feedback does not activate audio');
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
]) {
  const count = nodes.length;
  audio.play(effect);
  await settle();
  assert(nodes.length > count, `${effect} schedules audio`);
}
audio.update({ x: 1, y: 1.6, z: -2 }, { x: 0, y: 0, z: -1 });
assert.equal(contexts[0].listener.positionZ.value, -2);
const listenerParams = Object.values(contexts[0].listener);
assert.deepEqual(
  listenerParams.map((param) => param.targets.at(-1)),
  [1, 1.6, -2, 0, 0, -1, 0, 1, 0].map((value) => ({ value, time: 10, constant: 0.03 })),
  'All listener axes use the same smooth spatial update',
);
contexts[0].currentTime = 10.25;
audio.update({ x: -3, y: 1.7, z: 8 }, { x: 0.3, y: -0.2, z: -0.9 });
assert.deepEqual(
  listenerParams.map((param) => param.targets.at(-1)),
  [-3, 1.7, 8, 0.3, -0.2, -0.9, 0, 1, 0].map((value) => ({ value, time: 10.25, constant: 0.03 })),
  'Turning and walking preserve the position, orientation and interpolation curve',
);
contexts[0].currentTime = 10.5;
audio.update({ x: -3, y: 1.7, z: 8 }, { x: 0.3, y: -0.2, z: -0.9 });
assert(
  listenerParams.every((param) => param.targets.length === 3 && param.targets.at(-1).time === 10.5),
  'Stationary frames preserve the existing automation schedule',
);
assert(
  requests.every((url) => url === '/assets/audio/after-rain.ogg' || url === keyboardSampleUrl),
  'Synthesized cues never fetch recordings; the keyboard bank alone preloads after entry',
);
// Exercise all production mappings through mocked fetch/decode; tests never
// fetch a recording from the network.
Object.assign(garageAudioClips, configuredClips);
const clipsFor = (url) => nodes.filter((n) => n.buffer?.asset === url && n.started);
for (const [cue, url] of Object.entries(configuredClips)) {
  contexts[0].currentTime += 1.1;
  audio.play(cue);
  await settle();
  const clips = () => clipsFor(url);
  const first = clips().at(-1);
  assert(first, `${cue} starts its own recording`);
  assert.equal(
    first.target.gain.value,
    0.6,
    'Clips use the SFX bus, so the environment volume slider controls them',
  );
  contexts[0].currentTime += 1.1;
  audio.play(cue);
  assert(first.stopped, 'Retrigger stops the previous playback immediately');
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
// The startup and shutdown channel replaces its current source at request time,
// including while the next clip is still decoding. Other channels stay intact.
audio.playKeyboardNote('1', 'kazam');
const keyboardSource = clipsFor(keyboardSampleUrl).at(-1),
  previousShutdown = clipsFor(configuredClips['power-off']).at(-1),
  delayedOnUrl = '/assets/audio/computers/test-delayed-on.mp3',
  delayedOffUrl = '/assets/audio/computers/test-delayed-off.mp3',
  releaseOn = holdDecode(delayedOnUrl),
  releaseOff = holdDecode(delayedOffUrl);
Object.assign(garageAudioClips, { 'power-on': delayedOnUrl, 'power-off': delayedOffUrl });
audio.play('power-on');
assert(previousShutdown.stopped, 'Startup immediately stops an active shutdown cue');
await settle();
audio.play('power-off');
await settle();
releaseOff();
await settle();
assert.equal(clipsFor(delayedOffUrl).length, 1, 'The newest power request starts when ready');
releaseOn();
await settle();
assert.equal(clipsFor(delayedOnUrl).length, 0, 'Late startup decoding cannot override shutdown');
assert(!keyboardSource.stopped, 'Power changes do not interrupt the keyboard clip channel');

const delayedReplayUrl = '/assets/audio/computers/test-delayed-replay.mp3',
  releaseReplay = holdDecode(delayedReplayUrl),
  activeShutdown = clipsFor(delayedOffUrl).at(-1);
garageAudioClips['power-on'] = delayedReplayUrl;
audio.play('power-on');
assert(activeShutdown.stopped, 'Opposing power playback stops before the new decode finishes');
audio.play('power-on');
await settle();
assert.equal(requests.filter((url) => url === delayedReplayUrl).length, 1);
releaseReplay();
await settle();
assert.equal(
  clipsFor(delayedReplayUrl).length,
  1,
  'Rapid same-cue requests share decoding and only the newest request starts',
);
Object.assign(garageAudioClips, configuredClips);
const powerBeforeNotes = clipsFor(delayedReplayUrl).at(-1);
assert.equal(requests.filter((url) => url === keyboardSampleUrl).length, 1);
assert.equal(decodes.filter((url) => url === keyboardSampleUrl).length, 1);
assert.deepEqual(
  keyboardNoteIds.map((id) => [keyboardNotes[id].offset, keyboardNotes[id].duration]),
  [
    [0.59, 0.365],
    [0.97, 0.435],
    [1.405, 1.33],
    [3.912, 0.898],
  ],
  'The first two keys split the opening pair; the last two retain the following selected notes',
);
for (const note of keyboardNoteIds) {
  const count = clipsFor(keyboardSampleUrl).length;
  contexts[0].currentTime += 0.06;
  audio.playKeyboardNote(note, 'kazam');
  const source = clipsFor(keyboardSampleUrl).at(-1),
    { offset, duration } = keyboardNotes[note],
    time = contexts[0].currentTime,
    release = Math.min(0.03, duration * 0.05);
  assert.equal(
    clipsFor(keyboardSampleUrl).length,
    count + 1,
    'Ready notes start immediately without a throttle',
  );
  assert.deepEqual(source.startArgs, [time, offset, duration]);
  assert.equal(source.target.target.gain.value, 0.6, 'Notes follow the shared SFX volume');
  assert.deepEqual(
    source.target.gain.automation,
    [
      { type: 'set', value: 0, time },
      { type: 'ramp', value: 1, time: time + 0.004 },
      { type: 'set', value: 1, time: time + duration - release },
      { type: 'ramp', value: 0, time: time + duration },
    ],
    'Every sprite segment has its own click-free attack and release',
  );
}
assert(!powerBeforeNotes.stopped, 'Playing notes never stops the independent power channel');
const releasedNote = clipsFor(keyboardSampleUrl).at(-1);
contexts[0].currentTime += 0.02;
audio.playKeyboardNote('1', 'kazam');
assert.deepEqual(releasedNote.stopCalls.at(-1), [contexts[0].currentTime + 0.008]);
assert.deepEqual(
  releasedNote.target.gain.automation.slice(-3),
  [
    { type: 'cancel', time: contexts[0].currentTime },
    { type: 'set', value: 1, time: contexts[0].currentTime },
    { type: 'ramp', value: 0, time: contexts[0].currentTime + 0.008 },
  ],
  'Retrigger uses a short release instead of abruptly cutting the previous waveform',
);
for (let tap = 0; tap < 30; tap++) {
  contexts[0].currentTime += 0.002;
  audio.playKeyboardNote(keyboardNoteIds[tap % 4], 'kazam');
  assert(
    clipsFor(keyboardSampleUrl).filter((n) => !n.disconnected).length <= 2,
    'Rapid taps keep at most one active voice and one release tail',
  );
}
assert.equal(
  requests.filter((url) => url === keyboardSampleUrl).length,
  1,
  'Every note reuses the single preloaded bank',
);
assert.equal(
  decodes.filter((url) => url === keyboardSampleUrl).length,
  1,
  'Rapid taps never re-decode the bank',
);
audio.playKeyboardNote('1', 'kazam');
const kazamNote = clipsFor(keyboardSampleUrl).at(-1);
audio.setComputerPower('projects', false);
assert(!kazamNote.stopped, 'Switching the other computer off does not cut a playing note');
audio.setComputerPower('projects', true);
audio.playKeyboardNote('2', 'projects');
const projectsNote = clipsFor(keyboardSampleUrl).at(-1);
audio.setComputerPower('kazam', false);
assert(kazamNote.disconnected, 'Power-off disconnects that computer’s release tail');
assert(!projectsNote.stopped, 'The other computer’s playing note remains independent');
audio.setComputerPower('projects', false);
assert(
  projectsNote.stopped && projectsNote.disconnected,
  'Power-off stops its active keyboard voice',
);
const poweredOffCount = clipsFor(keyboardSampleUrl).length;
audio.playKeyboardNote('3', 'projects');
assert.equal(
  clipsFor(keyboardSampleUrl).length,
  poweredOffCount,
  'An off computer cannot start a note',
);
assert(!powerBeforeNotes.stopped, 'Keyboard power gating does not cut the power-cue channel');
audio.setComputerPower('kazam', true);
audio.setComputerPower('projects', true);
const beforeMute = nodes.length,
  beforeRequests = requests.length;
audio.setSettings({ muted: true, music: 0.4, effects: 0.6 });
audio.playKeyboardNote('1', 'kazam');
audio.play('power-on');
await settle();
assert.equal(nodes.length, beforeMute);
assert.equal(requests.length, beforeRequests, 'Muted cues do not fetch or start recordings');
audio.setSettings({ muted: false, music: 0.4, effects: 0.6 });
const mutedPendingUrl = '/assets/audio/computers/test-muted-pending.mp3',
  releaseMuted = holdDecode(mutedPendingUrl);
garageAudioClips['power-on'] = mutedPendingUrl;
audio.play('power-on');
await settle();
audio.setSettings({ muted: true, music: 0.4, effects: 0.6 });
releaseMuted();
await settle();
assert.equal(clipsFor(mutedPendingUrl).length, 0, 'Muting during decode prevents late playback');
audio.setSettings({ muted: false, music: 0.4, effects: 0.6 });
Object.assign(garageAudioClips, configuredClips);
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
  kind: ['bus', 'auto', 'car'][i % 3],
}));
const streetProfile = audio.update({ x: 0, y: 1.64, z: 13 }, { x: 0, y: 0, z: -1 }, sampleTraffic);
assert.equal(cityEnvelope.gain.value, 1);
assert.equal(cityFilter.frequency.value, 9500);
assert.deepEqual(streetProfile, {
  gain: cityEnvelope.gain.value,
  cutoff: cityFilter.frequency.value,
  zone: 'street',
});
assert.deepEqual(cityEnvelope.gain.targets.at(-1), {
  value: 1,
  time: contexts[0].currentTime,
  constant: 0.22,
});
assert.deepEqual(cityFilter.frequency.targets.at(-1), {
  value: 9500,
  time: contexts[0].currentTime,
  constant: 0.26,
});
const engines = cityPanners
  .slice(1)
  .map((panner) =>
    nodes.find((node) => node.kind === 'oscillator' && node.target?.target?.target === panner),
  );
for (let i = 0; i < sampleTraffic.length; i++) {
  const car = sampleTraffic[i],
    time = contexts[0].currentTime;
  assert.deepEqual(cityPanners[i + 1].positionX.targets.at(-1), {
    value: car.x,
    time,
    constant: 0.03,
  });
  assert.deepEqual(cityPanners[i + 1].positionZ.targets.at(-1), {
    value: car.z,
    time,
    constant: 0.03,
  });
  assert.deepEqual(engines[i].target.gain.targets.at(-1), {
    value: [0.07, 0.045, 0.028][i % 3],
    time,
    constant: 0.15,
  });
  assert.deepEqual(engines[i].frequency.targets.at(-1), {
    value: [49, 86, 64][i % 3] + Math.sin(time * 0.7 + i) * 2,
    time,
    constant: 0.2,
  });
}
audio.update({ x: 0, y: 1.64, z: 8 }, { x: 0, y: 0, z: -1 }, sampleTraffic);
assert(Math.abs(cityEnvelope.gain.value - 0.28) < 1e-8);
assert.equal(cityFilter.frequency.value, 2000);
audio.update({ x: 0, y: 1.64, z: 1 }, { x: 0, y: 0, z: -1 }, sampleTraffic);
assert(cityEnvelope.gain.value < 0.07);
assert.equal(cityFilter.frequency.value, 600);
assert.equal(cityPanners[5].positionX.value, 12, 'Moving engines follow the visible vehicles');
const untouchedEngineTargets = engines[1].frequency.targets.length;
audio.update({ x: 0, y: 1.64, z: 13 }, { x: 0, y: 0, z: -1 }, [{ ...sampleTraffic[0], x: 1000 }]);
assert.equal(engines[0].target.gain.value, 0, 'Distant engines retain their existing fade target');
assert.equal(cityPanners[1].positionX.value, 1000);
assert.equal(
  engines[1].frequency.targets.length,
  untouchedEngineTargets,
  'Missing vehicles do not alter other engine automation',
);

await audio.start();
assert.equal(contexts.length, 1, 'Resume never stacks a second soundtrack');
document.hidden = true;
handlers.get('visibilitychange')();
assert.equal(contexts[0].state, 'suspended');
const suspendedTargets = listenerParams.map((param) => param.targets.length);
const suspendedCityTargets = cityEnvelope.gain.targets.length;
assert.deepEqual(audio.update({ x: 0, y: 1.64, z: 13 }, { x: 0, y: 0, z: -1 }, sampleTraffic), {
  gain: 1,
  cutoff: 9500,
  zone: 'street',
});
assert.deepEqual(
  listenerParams.map((param) => param.targets.length),
  suspendedTargets,
);
assert.equal(
  cityEnvelope.gain.targets.length,
  suspendedCityTargets,
  'Suspended frames report acoustics without scheduling audio',
);
document.hidden = false;
handlers.get('visibilitychange')();
await Promise.resolve();
assert.equal(contexts[0].state, 'running');
const disposedPendingUrl = '/assets/audio/computers/test-disposed-pending.mp3',
  releaseDisposed = holdDecode(disposedPendingUrl);
garageAudioClips['power-on'] = disposedPendingUrl;
audio.play('power-on');
await settle();
audio.dispose();
releaseDisposed();
await settle();
assert.equal(clipsFor(disposedPendingUrl).length, 0, 'Disposal prevents late decoded playback');
Object.assign(garageAudioClips, configuredClips);
assert.equal(contexts[0].state, 'closed');
assert.equal(handlers.size, 0);
assert(
  nodes.filter((n) => n.started).every((n) => n.stopped),
  'Every looping, recorded, keyboard and release-tail source stops on disposal',
);
// A visitor can reach a keyboard while the bank is still loading. Only the
// newest gesture may play, and mute/tab changes invalidate it even if undone
// before decoding completes.
async function pendingKeyboardScenario(action) {
  const releaseBank = holdDecode(keyboardSampleUrl),
    firstNode = nodes.length,
    firstRequest = requests.length,
    firstDecode = decodes.length,
    pendingAudio = createGarageSound();
  await pendingAudio.start();
  await settle();
  pendingAudio.playKeyboardNote('1', 'kazam');
  pendingAudio.playKeyboardNote('2', 'kazam');
  pendingAudio.playKeyboardNote('4', 'kazam');
  const notes = () =>
    nodes.slice(firstNode).filter((n) => n.buffer?.asset === keyboardSampleUrl && n.started);
  assert.equal(notes().length, 0);
  if (action === 'mute') {
    pendingAudio.setSettings({ muted: true, music: 0.3, effects: 0.65 });
    pendingAudio.setSettings({ muted: false, music: 0.3, effects: 0.65 });
  }
  if (action === 'hide') {
    document.hidden = true;
    handlers.get('visibilitychange')();
    document.hidden = false;
    handlers.get('visibilitychange')();
    await settle();
  }
  if (action === 'power-off') {
    pendingAudio.setComputerPower('kazam', false);
    pendingAudio.setComputerPower('kazam', true);
  }
  if (action === 'other-power-off') pendingAudio.setComputerPower('projects', false);
  if (action === 'dispose') pendingAudio.dispose();
  releaseBank();
  await settle();
  assert.equal(requests.slice(firstRequest).filter((url) => url === keyboardSampleUrl).length, 1);
  assert.equal(decodes.slice(firstDecode).filter((url) => url === keyboardSampleUrl).length, 1);
  if (action === 'latest' || action === 'other-power-off') {
    assert.equal(
      notes().length,
      1,
      'Only the latest pending note plays after shared decoding finishes',
    );
    assert.deepEqual(notes()[0].startArgs.slice(1), [
      keyboardNotes['4'].offset,
      keyboardNotes['4'].duration,
    ]);
    pendingAudio.playKeyboardNote('3', 'kazam');
    assert.equal(notes().length, 2, 'Subsequent notes start synchronously from the decoded bank');
  } else {
    assert.equal(notes().length, 0, `${action} cancels pending keyboard playback permanently`);
  }
  if (action !== 'dispose') pendingAudio.dispose();
  assert(
    nodes
      .slice(firstNode)
      .filter((n) => n.started)
      .every((n) => n.stopped),
    'Disposal also stops active notes and their release tails',
  );
}
for (const action of ['latest', 'mute', 'hide', 'power-off', 'other-power-off', 'dispose'])
  await pendingKeyboardScenario(action);
console.log(
  'PASS: gesture-only startup, looping BGM, SFX and power synthesis, shared clip cache/power ordering, four-note sprites, rapid retrigger bounds, pending-note cancellation, mute, reading duck, spatial listener, tab suspension and disposal.',
);
