import { garageAudioClips, type ClipCue } from './audio-clips.ts';
import { keyboardNotes, keyboardSampleUrl, type KeyboardNoteId } from './keyboard-notes.ts';
import type { ComputerId } from './computers';
import { createCitySoundscape } from './city/soundscape.ts';
import { cityAcousticsAt, type TrafficPosition } from './city/layout.ts';
type Position = { x: number; y: number; z: number };
export type SoundEffect =
  'key' | 'boot' | 'ready' | 'switch' | 'car' | 'chair' | 'step' | 'power-on' | 'power-off';
type KeyboardVoice = {
  computer: ComputerId;
  source: AudioBufferSourceNode;
  envelope: GainNode;
  startedAt: number;
  duration: number;
  release: number;
};
export type SoundSettings = { muted: boolean; music: number; effects: number };
export const defaultSound: SoundSettings = { muted: false, music: 0.3, effects: 0.65 };
/** One audio graph per room. Starts only from Enter/Resume, and suspends off-tab. */
export function createGarageSound(report: (state: string) => void = () => {}) {
  let context: AudioContext | null = null,
    master: GainNode | null = null,
    music: GainNode | null = null,
    effects: GainNode | null = null,
    noise: AudioBuffer | null = null;
  let settings = { ...defaultSound },
    reading = false,
    closed = false,
    lastKey = 0,
    musicSource: AudioBufferSourceNode | null = null;
  let city: ReturnType<typeof createCitySoundscape> | null = null;
  const fans: Partial<Record<ComputerId, GainNode>> = {},
    computerPower = { kazam: true, projects: true };
  const clipBuffers = new Map<string, Promise<AudioBuffer>>();
  let powerSource: AudioBufferSourceNode | null = null,
    powerGeneration = 0,
    keyboardGeneration = 0,
    keyboardPendingComputer: ComputerId | null = null,
    keyboardBuffer: AudioBuffer | null = null,
    keyboardVoice: KeyboardVoice | null = null,
    keyboardRelease: KeyboardVoice | null = null;
  const sources: AudioScheduledSourceNode[] = [],
    panners: PannerNode[] = [];
  function gain(value: number, target: AudioNode) {
    const g = context!.createGain();
    g.gain.value = value;
    g.connect(target);
    return g;
  }
  function filter(type: BiquadFilterType, frequency: number, target: AudioNode) {
    const f = context!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.connect(target);
    return f;
  }
  function spatial(p: Position) {
    const node = context!.createPanner();
    node.panningModel = 'HRTF';
    node.distanceModel = 'inverse';
    node.refDistance = 1;
    node.rolloffFactor = 1.1;
    node.maxDistance = 20;
    node.positionX.value = p.x;
    node.positionY.value = p.y;
    node.positionZ.value = p.z;
    node.connect(effects!);
    panners.push(node);
    return node;
  }
  function continuousNoise(volume: number, freq: number, target: AudioNode) {
    const source = context!.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.connect(filter('lowpass', freq, gain(volume, target)));
    source.start();
    sources.push(source);
  }
  function apply() {
    if (!context || !master || !music || !effects) return;
    const t = context.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : 0.72, t, 0.06);
    music.gain.setTargetAtTime(settings.music * (reading ? 0.48 : 1), t, 0.6);
    effects.gain.setTargetAtTime(settings.effects, t, 0.08);
  }
  function tone(
    freq: number,
    time: number,
    duration: number,
    volume: number,
    target: AudioNode,
    type: OscillatorType = 'sine',
    end = freq,
  ) {
    const c = context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, end), time + duration);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(volume, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    o.connect(g);
    g.connect(target);
    o.start(time);
    o.stop(time + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  function burst(time: number, duration: number, volume: number, freq: number, target: AudioNode) {
    const c = context!,
      s = c.createBufferSource(),
      g = c.createGain(),
      f = c.createBiquadFilter();
    s.buffer = noise;
    f.type = 'bandpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(freq, time);
    f.frequency.exponentialRampToValueAtTime(Math.max(50, freq * 0.35), time + duration);
    g.gain.setValueAtTime(volume, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    s.connect(f);
    f.connect(g);
    g.connect(target);
    s.start(time, 0.35);
    s.stop(time + duration + 0.01);
    s.onended = () => {
      s.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }
  const visibility = () => {
    if (!context) return;
    if (document.hidden) {
      invalidatePendingClips();
      stopKeyboard();
      void context.suspend();
      report('suspended');
    } else if (!closed) {
      void context
        .resume()
        .then(() => report(context!.state))
        .catch(() => report('suspended'));
    }
  };
  async function start() {
    if (closed) return;
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -9;
        limiter.knee.value = 8;
        limiter.ratio.value = 12;
        master.connect(limiter);
        limiter.connect(context.destination);
        music = gain(0, master);
        effects = gain(0, master);
        noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
        const data = noise.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < data.length; i++) {
          brown = (brown + (Math.random() * 2 - 1) * 0.035) / 1.02;
          data[i] = (Math.random() * 2 - 1) * 0.55 + brown * 0.5;
        }
        city = createCitySoundscape(context, effects!, noise);
        continuousNoise(0.16, 2500, spatial({ x: 0.5, y: 1.7, z: 5.2 }));
        continuousNoise(0.055, 3200, spatial({ x: 0, y: 2.2, z: -3.5 }));
        for (const [id, p] of [
          ['kazam', { x: -1.04, y: 0.3, z: 1.04 }],
          ['projects', { x: 0.99, y: 1.1, z: -2.47 }],
        ] as const) {
          const fan = gain(computerPower[id] ? 1 : 0, spatial(p));
          fans[id] = fan;
          continuousNoise(0.032, 520, fan);
          const o = context.createOscillator();
          o.type = 'sine';
          o.frequency.value = 84;
          o.connect(gain(0.018, fan));
          o.start();
          sources.push(o);
        }
        document.addEventListener('visibilitychange', visibility);
        void fetch('/assets/audio/after-rain.ogg')
          .then((r) => {
            if (!r.ok) throw Error('Music load failed');
            return r.arrayBuffer();
          })
          .then((b) => context!.decodeAudioData(b))
          .then((buffer) => {
            if (closed) return;
            musicSource = context!.createBufferSource();
            musicSource.buffer = buffer;
            musicSource.loop = true;
            musicSource.connect(music!);
            musicSource.start();
          })
          .catch(() => report('effects-only'));
      }
      await context.resume();
      // A single bank is fetched/decoded after the entry gesture, ahead of a
      // visitor reaching either keyboard. It is shared by all four notes.
      if (!closed) void prepareKeyboardBank().catch(() => {});
      apply();
      report(context.state);
    } catch {
      report('unavailable');
    }
  }
  function loadClip(url: string) {
    let pending = clipBuffers.get(url);
    if (!pending) {
      const activeContext = context!;
      pending = fetch(url)
        .then((r) => {
          if (!r.ok) throw Error('Clip unavailable');
          return r.arrayBuffer();
        })
        .then((b) => activeContext.decodeAudioData(b));
      clipBuffers.set(url, pending);
      // A failed preload can be retried by a later physical key press.
      void pending.catch(() => {
        if (clipBuffers.get(url) === pending) clipBuffers.delete(url);
      });
    }
    return pending;
  }
  function canPlay(activeContext = context) {
    return (
      activeContext !== null &&
      context === activeContext &&
      activeContext.state === 'running' &&
      !document.hidden &&
      !settings.muted &&
      !closed &&
      effects !== null
    );
  }
  function invalidatePendingClips() {
    powerGeneration++;
    keyboardGeneration++;
    keyboardPendingComputer = null;
  }
  async function prepareKeyboardBank() {
    if (keyboardBuffer) return keyboardBuffer;
    const activeContext = context,
      buffer = await loadClip(keyboardSampleUrl);
    if (!closed && context === activeContext) keyboardBuffer = buffer;
    return buffer;
  }
  function stopVoice(voice: KeyboardVoice | null) {
    if (!voice) return;
    try {
      voice.source.stop();
    } catch {}
    voice.source.disconnect();
    voice.envelope.disconnect();
  }
  function stopKeyboard(computer?: ComputerId) {
    if (!computer || keyboardPendingComputer === computer) {
      keyboardGeneration++;
      keyboardPendingComputer = null;
    }
    if (!computer || keyboardVoice?.computer === computer) {
      stopVoice(keyboardVoice);
      keyboardVoice = null;
    }
    if (!computer || keyboardRelease?.computer === computer) {
      stopVoice(keyboardRelease);
      keyboardRelease = null;
    }
  }
  function soundKeyboardNote(note: KeyboardNoteId, computer: ComputerId, buffer: AudioBuffer) {
    const c = context!,
      time = c.currentTime,
      { offset, duration } = keyboardNotes[note];
    // At most one playing note and one 8 ms release tail. Retriggering is
    // immediate; a short release prevents a discontinuity in the old waveform.
    stopVoice(keyboardRelease);
    keyboardRelease = keyboardVoice;
    if (keyboardRelease) {
      const previous = keyboardRelease,
        elapsed = Math.max(0, time - previous.startedAt),
        level = Math.max(
          0,
          Math.min(1, elapsed / 0.004, (previous.duration - elapsed) / previous.release),
        );
      previous.envelope.gain.cancelScheduledValues(time);
      previous.envelope.gain.setValueAtTime(level, time);
      previous.envelope.gain.linearRampToValueAtTime(0, time + 0.008);
      previous.source.stop(time + 0.008);
    }
    const source = c.createBufferSource(),
      envelope = c.createGain(),
      release = Math.min(0.03, duration * 0.05),
      voice = { computer, source, envelope, startedAt: time, duration, release };
    source.buffer = buffer;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(1, time + 0.004);
    envelope.gain.setValueAtTime(1, time + duration - release);
    envelope.gain.linearRampToValueAtTime(0, time + duration);
    source.connect(envelope);
    envelope.connect(effects!);
    keyboardVoice = voice;
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      if (keyboardVoice === voice) keyboardVoice = null;
      if (keyboardRelease === voice) keyboardRelease = null;
    };
    source.start(time, offset, duration);
  }
  function playKeyboardNote(note: KeyboardNoteId, computer: ComputerId) {
    const activeContext = context;
    if (!canPlay(activeContext) || !computerPower[computer] || !keyboardNotes[note]) return;
    const generation = ++keyboardGeneration;
    keyboardPendingComputer = null;
    if (keyboardBuffer) {
      soundKeyboardNote(note, computer, keyboardBuffer);
      return;
    }
    keyboardPendingComputer = computer;
    void prepareKeyboardBank()
      .then((buffer) => {
        if (generation !== keyboardGeneration) return;
        keyboardPendingComputer = null;
        if (canPlay(activeContext) && computerPower[computer])
          soundKeyboardNote(note, computer, buffer);
      })
      .catch(() => {
        if (generation === keyboardGeneration) keyboardPendingComputer = null;
      });
  }
  async function playPowerClip(url: string) {
    const activeContext = context;
    if (!activeContext) return;
    // Opposing power cues share one channel. Invalidate before decoding so an
    // earlier, slower request cannot play after a more recent switch press.
    const generation = ++powerGeneration;
    try {
      powerSource?.stop();
    } catch {}
    powerSource?.disconnect();
    powerSource = null;
    try {
      const buffer = await loadClip(url);
      if (generation !== powerGeneration || !canPlay(activeContext)) return;
      const source = activeContext.createBufferSource();
      source.buffer = buffer;
      source.connect(effects!);
      powerSource = source;
      source.onended = () => {
        source.disconnect();
        if (powerSource === source) powerSource = null;
      };
      source.start();
    } catch {}
  }
  function play(kind: SoundEffect) {
    if (!canPlay() || !context || !effects) return;
    const t = context.currentTime;
    if (kind in garageAudioClips) {
      const cue = kind as ClipCue,
        url = garageAudioClips[cue];
      if (url) {
        void playPowerClip(url);
        return;
      }
    }
    // Null clip mappings retain the original synthesized cues.
    if (kind === 'power-on') {
      burst(t, 0.22, 0.09, 3400, effects);
      [262, 330, 523].forEach((hz, i) =>
        tone(hz, t + 0.18 + i * 0.14, 0.42, 0.04, effects!, 'sine'),
      );
    }
    if (kind === 'power-off') {
      [392, 294, 196].forEach((hz, i) => tone(hz, t + i * 0.13, 0.3, 0.035, effects!, 'sine'));
      burst(t + 0.42, 0.08, 0.05, 800, effects);
    }
    if (kind === 'key') {
      if (t - lastKey < 0.035) return;
      lastKey = t;
      burst(t, 0.043, 0.21, 2100, effects);
      tone(160, t, 0.045, 0.045, effects, 'triangle', 105);
      burst(t + 0.045, 0.025, 0.065, 1250, effects);
    }
    if (kind === 'boot') {
      burst(t, 0.33, 0.18, 4400, effects);
      burst(t + 0.2, 0.14, 0.08, 2400, effects);
      tone(70, t, 0.28, 0.07, effects, 'triangle', 115);
      tone(650, t + 0.48, 0.07, 0.035, effects);
      tone(850, t + 0.58, 0.09, 0.025, effects);
    }
    if (kind === 'ready') {
      tone(440, t, 0.13, 0.025, effects);
      tone(660, t + 0.11, 0.23, 0.021, effects);
    }
    if (kind === 'switch') {
      burst(t, 0.03, 0.14, 3000, effects);
      tone(180, t, 0.04, 0.035, effects, 'triangle', 100);
    }
    if (kind === 'chair') {
      burst(t, 0.4, 0.055, 350, effects);
      tone(210, t, 0.25, 0.018, effects, 'triangle', 175);
    }
    if (kind === 'car') {
      burst(t, 0.45, 0.065, 1800, effects);
      tone(180, t, 0.24, 0.016, effects, 'triangle', 260);
    }
    if (kind === 'step') {
      const soft = Math.random();
      burst(t, 0.14, 0.12 + soft * 0.025, 340 + soft * 180, effects);
      tone(72, t, 0.1, 0.04, effects, 'sine', 45);
    }
  }
  return {
    start,
    play,
    playKeyboardNote,
    setComputerPower: (id: ComputerId, on: boolean) => {
      computerPower[id] = on;
      if (!on) stopKeyboard(id);
      if (context) fans[id]?.gain.setTargetAtTime(on ? 1 : 0, context.currentTime, 0.12);
    },
    setSettings: (value: SoundSettings) => {
      if (value.muted && !settings.muted) {
        invalidatePendingClips();
        stopKeyboard();
      }
      settings = { ...value };
      apply();
    },
    setReading: (value: boolean) => {
      reading = value;
      apply();
    },
    update: (p: Position, forward: Position, traffic: TrafficPosition[] = []) => {
      if (!context || context.state !== 'running') return cityAcousticsAt(p);
      const profile = city ? city.update(p, traffic) : cityAcousticsAt(p);
      const l = context.listener,
        t = context.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.03);
      l.positionY.setTargetAtTime(p.y, t, 0.03);
      l.positionZ.setTargetAtTime(p.z, t, 0.03);
      l.forwardX.setTargetAtTime(forward.x, t, 0.03);
      l.forwardY.setTargetAtTime(forward.y, t, 0.03);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.03);
      l.upX.setTargetAtTime(0, t, 0.03);
      l.upY.setTargetAtTime(1, t, 0.03);
      l.upZ.setTargetAtTime(0, t, 0.03);
      return profile;
    },
    dispose: () => {
      closed = true;
      invalidatePendingClips();
      stopKeyboard();
      keyboardBuffer = null;
      try {
        powerSource?.stop();
      } catch {}
      powerSource?.disconnect();
      powerSource = null;
      clipBuffers.clear();
      city?.dispose();
      city = null;
      document.removeEventListener('visibilitychange', visibility);
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {}
        s.disconnect();
      });
      try {
        musicSource?.stop();
      } catch {}
      panners.forEach((p) => p.disconnect());
      void context?.close();
      context = null;
    },
  };
}
export type GarageSound = ReturnType<typeof createGarageSound>;
