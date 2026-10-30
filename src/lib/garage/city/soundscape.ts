import { cityAcousticsAt, cityLayout, type TrafficPosition } from './layout.ts';

/** Every city source shares the gate's acoustic envelope; room effects have their own bus. */
export function createCitySoundscape(context: AudioContext, output: AudioNode, noise: AudioBuffer) {
  const nodes: AudioNode[] = [],
    sources: AudioScheduledSourceNode[] = [];
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 9500;
  lowpass.Q.value = 0.35;
  const envelope = context.createGain();
  envelope.gain.value = 1;
  lowpass.connect(envelope);
  envelope.connect(output);
  nodes.push(lowpass, envelope);
  const gain = (value: number, target: AudioNode) => {
    const g = context.createGain();
    g.gain.value = value;
    g.connect(target);
    nodes.push(g);
    return g;
  };
  function panner(x: number, y: number, z: number) {
    const p = context.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    p.rolloffFactor = 0.9;
    p.maxDistance = 100;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(lowpass);
    nodes.push(p);
    return p;
  }
  function noiseLoop(volume: number, frequency: number, target: AudioNode) {
    const f = context.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = frequency;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.connect(f);
    f.connect(gain(volume, target));
    source.start();
    nodes.push(f);
    sources.push(source);
  }
  noiseLoop(0.035, 530, lowpass);
  noiseLoop(0.09, 2600, panner(cityLayout.cafe.x - 1, 1.8, cityLayout.cafe.z + 1.6));
  const engines = Array.from({ length: 12 }, (_, i) => {
    const p = panner(0, 0.5, cityLayout.lanes[i % 2]),
      f = context.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    f.connect(p);
    nodes.push(f);
    const level = gain(0, f),
      osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = i === 5 ? 49 : i % 3 === 0 ? 86 : 64;
    osc.connect(level);
    osc.start();
    sources.push(osc);
    noiseLoop(0.018, 900, p);
    return { p, level, osc };
  });
  return {
    update(position: { x: number; z: number }, traffic: TrafficPosition[]) {
      const profile = cityAcousticsAt(position),
        t = context.currentTime;
      envelope.gain.setTargetAtTime(profile.gain, t, 0.22);
      lowpass.frequency.setTargetAtTime(profile.cutoff, t, 0.26);
      for (let i = 0; i < engines.length; i++) {
        const engine = engines[i],
          car = traffic[i];
        if (!car) continue;
        const distance = Math.hypot(car.x - position.x, car.z - position.z);
        engine.p.positionX.setTargetAtTime(car.x, t, 0.03);
        engine.p.positionZ.setTargetAtTime(car.z, t, 0.03);
        engine.level.gain.setTargetAtTime(
          distance < 65 ? (car.kind === 'bus' ? 0.07 : car.kind === 'auto' ? 0.045 : 0.028) : 0,
          t,
          0.15,
        );
        const pitch = car.kind === 'bus' ? 49 : car.kind === 'auto' ? 86 : 64;
        engine.osc.frequency.setTargetAtTime(pitch + Math.sin(t * 0.7 + i) * 2, t, 0.2);
      }
      return profile;
    },
    dispose() {
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {}
        s.disconnect();
      });
      nodes.forEach((n) => n.disconnect());
    },
  };
}
