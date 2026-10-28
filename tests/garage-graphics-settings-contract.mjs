import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = new URL('../src/lib/garage/graphics-settings.ts', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const exports = {};
Function('exports', outputText)(exports);
const { defaultGraphics, normalizeGraphics } = exports;

await test('defaults preserve the authored 60% look and normalization returns an independent value', () => {
  assert.deepEqual(defaultGraphics, {
    renderScale: 0.6,
    antialias: 'both',
    pixelated: false,
    anisotropy: 8,
    exposure: 1.08,
    toneMapping: 'aces',
    ao: true,
    aoIntensity: 0.38,
    aoRadius: 0.38,
    bloom: true,
    bloomStrength: 0.045,
    bloomRadius: 0.25,
    bloomThreshold: 2,
    shadows: 'soft',
    shadowResolution: 1,
    environmentIntensity: 0.24,
    fogDensity: 0.0095,
    rain: true,
    contrast: 1,
    saturation: 1,
    vignette: 1,
  });
  const settings = normalizeGraphics(defaultGraphics);
  assert.deepEqual(settings, defaultGraphics);
  assert.notEqual(settings, defaultGraphics);
  settings.renderScale = 1;
  assert.equal(defaultGraphics.renderScale, 0.6);
});

await test('malformed saved values fall back without coercing strings, booleans or nonfinite numbers', () => {
  for (const malformed of [undefined, null, [], ['renderScale', 1], 42, false, '{}'])
    assert.deepEqual(normalizeGraphics(malformed), defaultGraphics);
  assert.deepEqual(
    normalizeGraphics({
      renderScale: '0.9',
      antialias: 'ultra',
      pixelated: 'false',
      anisotropy: 3,
      exposure: NaN,
      toneMapping: 'filmic',
      ao: 0,
      aoIntensity: Infinity,
      aoRadius: -Infinity,
      bloom: 'true',
      bloomStrength: NaN,
      bloomRadius: null,
      bloomThreshold: false,
      shadows: true,
      shadowResolution: '0.5',
      environmentIntensity: Infinity,
      fogDensity: NaN,
      rain: null,
      contrast: '1.2',
      saturation: NaN,
      vignette: [],
      unsupportedSetting: 'ignored',
    }),
    defaultGraphics,
  );
});

await test('finite values clamp to supported limits while valid false and zero values survive', () => {
  const actual = normalizeGraphics({
    renderScale: 0.01,
    exposure: 20,
    aoIntensity: -1,
    aoRadius: 3,
    bloomStrength: 7,
    bloomRadius: -1,
    bloomThreshold: 100,
    environmentIntensity: -2,
    fogDensity: 2,
    contrast: 0,
    saturation: 4,
    vignette: 3,
    ao: false,
    bloom: false,
    rain: false,
    pixelated: true,
  });
  assert.deepEqual(actual, {
    ...defaultGraphics,
    renderScale: 0.3,
    exposure: 2,
    aoIntensity: 0,
    aoRadius: 1.5,
    bloomStrength: 1,
    bloomRadius: 0,
    bloomThreshold: 4,
    environmentIntensity: 0,
    fogDensity: 0.04,
    contrast: 0.7,
    saturation: 1.6,
    vignette: 1,
    ao: false,
    bloom: false,
    rain: false,
    pixelated: true,
  });
  const zeroes = normalizeGraphics({
    ...defaultGraphics,
    fogDensity: 0,
    bloomStrength: 0,
    vignette: 0,
  });
  assert.equal(zeroes.fogDensity, 0);
  assert.equal(zeroes.bloomStrength, 0);
  assert.equal(zeroes.vignette, 0);
});

await test('supported modes survive a JSON round trip and unknown keys are dropped', () => {
  for (const [key, choices] of Object.entries({
    antialias: ['off', 'smaa', 'msaa', 'both'],
    toneMapping: ['aces', 'neutral', 'none'],
    shadows: ['off', 'soft', 'sharp'],
    anisotropy: [1, 2, 4, 8, 16],
    shadowResolution: [0.5, 1],
  })) {
    for (const value of choices) {
      const input = { ...defaultGraphics, [key]: value, obsoleteOption: 'remove' };
      const actual = normalizeGraphics(JSON.parse(JSON.stringify(input)));
      assert.equal(actual[key], value);
      assert.equal('obsoleteOption' in actual, false);
      assert.equal(input.obsoleteOption, 'remove', 'Normalization must not mutate the input');
    }
  }
});
