import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBenchmarkArgs, summarizeFrames } from '../scripts/benchmark-utils.mjs';

await test('benchmark defaults and explicit options parse without starting a workload', () => {
  assert.deepEqual(parseBenchmarkArgs([]), {
    url: 'http://127.0.0.1:4173/',
    width: 1920,
    height: 1080,
    dpr: 1,
    seconds: 15,
    out: 'test-results/benchmark.json',
  });
  assert.deepEqual(
    parseBenchmarkArgs([
      '--url=https://example.test',
      '--width',
      '1280',
      '--height=720',
      '--dpr',
      '2',
      '--seconds',
      '3.5',
      '--out',
      'test-results/alternate.json',
    ]),
    {
      url: 'https://example.test/',
      width: 1280,
      height: 720,
      dpr: 2,
      seconds: 3.5,
      out: 'test-results/alternate.json',
    },
  );
  assert.deepEqual(parseBenchmarkArgs(['--help']), { help: true });
  assert.deepEqual(parseBenchmarkArgs(['-h']), { help: true });
});

await test('invalid benchmark inputs fail before a browser can launch', () => {
  for (const args of [
    ['--width', '0'],
    ['--height', '8193'],
    ['--width', '1.5'],
    ['--dpr', 'NaN'],
    ['--dpr', '0'],
    ['--dpr', '4.1'],
    ['--seconds', 'Infinity'],
    ['--seconds', '-1'],
    ['--seconds', '301'],
    ['--seconds', ''],
    ['--url', 'file:///tmp/site'],
    ['--url', 'https://user:password@example.test/'],
    ['--out', ''],
    ['--out', 'bad\0path'],
    ['--unknown'],
    ['--width'],
    ['positional'],
  ])
    assert.throws(() => parseBenchmarkArgs(args), args.join(' '));
});

function framesFromGaps(gaps) {
  let time = 0;
  return [[0, 2], ...gaps.map((gap) => [(time += gap), 2])];
}

await test('FPS uses elapsed frame intervals and 1% low uses the mean of the slowest 1%', () => {
  const result = summarizeFrames(framesFromGaps([...Array(198).fill(10), 50, 100]));
  assert.equal(result.frames, 201);
  assert.equal(result.averageFps, 200000 / 2130);
  assert.equal(result.low1PercentFps, 1000 / 75);
  assert.equal(result.p95FrameMs, 10);
  assert.equal(result.p99FrameMs, 10);
  assert.equal(result.maxFrameMs, 100);
  assert.equal(result.framesOver33_5Ms, 2);
  assert.equal(result.framesOver50Ms, 1);
  assert.equal(result.callbackP95Ms, 2);
  const short = summarizeFrames([
    [0, 0],
    [20, 1],
    [60, 3],
  ]);
  assert.equal(short.averageFps, 1000 / 30);
  assert.equal(short.low1PercentFps, 25);
  assert.equal(short.p95FrameMs, 40);
});

await test('empty, nonmonotonic and invalid frame samples cannot become FPS claims', () => {
  for (const frames of [
    [],
    [[0, 2]],
    [
      [0, 2],
      [0, 2],
    ],
    [
      [10, 2],
      [5, 2],
    ],
    [
      [0, 2],
      [NaN, 2],
    ],
    [
      [0, 2],
      [10, -1],
    ],
  ])
    assert.throws(() => summarizeFrames(frames));
});
