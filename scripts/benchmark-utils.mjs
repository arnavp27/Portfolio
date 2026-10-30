import { parseArgs } from 'node:util';

export function parseBenchmarkArgs(args) {
  const { values } = parseArgs({
    args,
    options: Object.fromEntries([
      ...['url', 'width', 'height', 'dpr', 'seconds', 'out'].map((name) => [
        name,
        { type: 'string' },
      ]),
      ['help', { type: 'boolean', short: 'h' }],
    ]),
  });
  if (values.help) return { help: true };
  const number = (key, fallback, min, max, integer = false) => {
    const value = values[key] === undefined ? fallback : Number(values[key]);
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      throw new Error(
        `--${key} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`,
      );
    return value;
  };
  const url = new URL(values.url ?? 'http://127.0.0.1:4173/');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('--url must be an HTTP(S) URL without embedded credentials.');
  const out = values.out ?? 'test-results/benchmark.json';
  if (!out.trim() || out.includes('\0')) throw new Error('--out must be a nonempty file path.');
  return {
    url: url.href,
    width: number('width', 1920, 1, 8192, true),
    height: number('height', 1080, 1, 8192, true),
    dpr: number('dpr', 1, 0.5, 4),
    seconds: number('seconds', 15, 1, 300),
    out,
  };
}

const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;

export function summarizeFrames(frames) {
  if (frames.length < 2) throw new Error('Too few scene frames to measure cadence.');
  const gaps = frames.slice(1).map((frame, index) => frame[0] - frames[index][0]);
  if (gaps.some((gap) => !Number.isFinite(gap) || gap <= 0))
    throw new Error('Scene frame timestamps must be finite and strictly increasing.');
  const sorted = [...gaps].sort((a, b) => a - b);
  const cpu = frames.map((frame) => frame[1]).sort((a, b) => a - b);
  if (cpu.some((duration) => !Number.isFinite(duration) || duration < 0))
    throw new Error('Scene callback durations must be finite and nonnegative.');
  const tail = sorted.slice(-Math.max(1, Math.ceil(sorted.length * 0.01)));
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    frames: frames.length,
    measuredIntervalSeconds: gaps.reduce((sum, gap) => sum + gap, 0) / 1000,
    averageFps: 1000 / mean(gaps),
    low1PercentFps: 1000 / mean(tail),
    medianFrameMs: percentile(sorted, 0.5),
    p95FrameMs: percentile(sorted, 0.95),
    p99FrameMs: percentile(sorted, 0.99),
    maxFrameMs: sorted.at(-1),
    framesOver33_5Ms: gaps.filter((gap) => gap > 33.5).length,
    framesOver50Ms: gaps.filter((gap) => gap > 50).length,
    callbackMedianMs: percentile(cpu, 0.5),
    callbackP95Ms: percentile(cpu, 0.95),
  };
}
