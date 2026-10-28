import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
// Original, seamlessly wrapped 16-bar ambient cue. No samples or game audio.
const rate = 24000,
  seconds = 48,
  n = rate * seconds,
  L = new Float32Array(n),
  R = new Float32Array(n),
  tau = Math.PI * 2;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function voice(start, duration, midi, volume, pan, kind = 'pad') {
  const total = Math.floor(duration * rate),
    f = hz(midi),
    attack = kind === 'pad' ? 2.7 : 0.035;
  for (let i = 0; i < total; i++) {
    const t = i / rate,
      env =
        kind === 'pad'
          ? Math.min(1, t / attack) * Math.min(1, (duration - t) / 3)
          : Math.exp(-t / 1.4) * (1 - Math.exp(-t / attack));
    const vibrato = 0.0007 * Math.sin(tau * 0.19 * t),
      base = tau * f * t;
    const v =
      (kind === 'pad'
        ? (Math.sin(base + vibrato) + 0.28 * Math.sin(base * 2.001) + 0.12 * Math.sin(base * 3)) *
          0.6
        : Math.sin(base) * 0.8 + Math.sin(base * 2.002) * 0.15) *
      env *
      volume;
    for (const [delay, gain, flip] of [
      [0, 1, false],
      [0.375, 0.22, true],
      [0.75, 0.14, false],
      [1.125, 0.08, true],
      [2.15, 0.09, false],
    ]) {
      const p = (Math.floor(start * rate) + i + Math.floor(delay * rate)) % n;
      L[p] += v * gain * (1 + (flip ? -pan : pan)) * 0.7;
      R[p] += v * gain * (1 - (flip ? -pan : pan)) * 0.7;
    }
  }
}
const chords = [
  [45, 52, 59, 60],
  [41, 48, 55, 59],
  [48, 55, 62, 64],
  [43, 50, 57, 59],
];
chords.forEach((chord, k) =>
  chord.forEach((note, j) => voice(k * 12, 17, note, 0.037, j % 2 ? 0.35 : -0.35)),
);
const motif = [76, 71, 74, 67, 72, 71, 64, 67];
motif.forEach((note, i) => voice(i * 6 + 2.25, 5, note, 0.022, i % 2 ? 0.3 : -0.3, 'bell'));
// Low heartbeat pulse, deliberately soft and sparse.
for (let b = 0; b < 64; b++) {
  const start = Math.floor(b * 0.75 * rate);
  for (let i = 0; i < rate * 0.35; i++) {
    const t = i / rate,
      v = Math.sin(tau * (48 * t + (6 * (1 - Math.exp(-t * 15))) / 15)) * Math.exp(-t * 16) * 0.016;
    L[(start + i) % n] += v;
    R[(start + i) % n] += v;
  }
}
let peak = 0,
  sum = 0;
for (let i = 0; i < n; i++) {
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  sum += L[i] * L[i] + R[i] * R[i];
}
const scale = 0.48 / peak,
  bytes = Buffer.alloc(44 + n * 4);
bytes.write('RIFF', 0);
bytes.writeUInt32LE(36 + n * 4, 4);
bytes.write('WAVEfmt ', 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(2, 22);
bytes.writeUInt32LE(rate, 24);
bytes.writeUInt32LE(rate * 4, 28);
bytes.writeUInt16LE(4, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36);
bytes.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  bytes.writeInt16LE(Math.round(L[i] * scale * 32767), 44 + i * 4);
  bytes.writeInt16LE(Math.round(R[i] * scale * 32767), 46 + i * 4);
}
const output = resolve(process.argv[2] || join(tmpdir(), 'arnav-garage-after-rain.wav'));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes);
console.log(
  JSON.stringify({ seconds, peak: 0.48, rms: Math.sqrt(sum / (n * 2)) * scale, original: true }),
);
