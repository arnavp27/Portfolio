import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DataUtils, EquirectangularReflectionMapping, HalfFloatType } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { encodeNightSky, sha256 } from '../scripts/generate-night-sky.mjs';
import { loadNightSky, parseNightSky } from '../src/lib/garage/night-sky.ts';

const source = await readFile(
  new URL('../assets-source/garage/kloofendal_overcast_puresky_1k.hdr', import.meta.url),
);
const compressed = await readFile(
  new URL('../public/assets/garage/surfaces/night-sky.rgba16f.bin', import.meta.url),
);
const raw = gunzipSync(compressed);
const arrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

await test('generated sky preserves every original half-float pixel and texture property', () => {
  const expected = new HDRLoader()
    .setDataType(HalfFloatType)
    .createDataTexture(arrayBuffer(source));
  const pixels = expected.image.data;
  // Independent reference: the previous runtime calculation, including both half conversions.
  for (let i = 0; i < pixels.length; i += 4) {
    const r = DataUtils.fromHalfFloat(pixels[i]);
    const g = DataUtils.fromHalfFloat(pixels[i + 1]);
    const b = DataUtils.fromHalfFloat(pixels[i + 2]);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const cloud = luminance / (1 + luminance);
    const night = [0.002 + cloud * 0.009, 0.004 + cloud * 0.016, 0.012 + cloud * 0.037];
    for (let channel = 0; channel < 3; channel++)
      pixels[i + channel] = DataUtils.toHalfFloat(night[channel]);
  }
  expected.mapping = EquirectangularReflectionMapping;
  const actual = parseNightSky(arrayBuffer(raw));
  assert.deepEqual(actual.image.data, pixels);
  for (const key of [
    'type',
    'format',
    'colorSpace',
    'flipY',
    'minFilter',
    'magFilter',
    'wrapS',
    'wrapT',
    'anisotropy',
    'generateMipmaps',
    'unpackAlignment',
    'premultiplyAlpha',
    'mapping',
  ])
    assert.equal(actual[key], expected[key], key);
  assert.equal(actual.image.width, expected.image.width);
  assert.equal(actual.image.height, expected.image.height);
  assert.deepEqual(
    encodeNightSky(source).raw,
    raw,
    'Clean checkout regenerates the same decoded bytes',
  );
  actual.dispose();
  expected.dispose();
});

await test('source, generated asset and decoded payload match their provenance checksums', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../docs/material-sources.json', import.meta.url), 'utf8'),
  );
  const entry = manifest.find((item) => item.asset === 'kloofendal_overcast_puresky');
  assert.equal(entry.file, 'night-sky.rgba16f.bin');
  assert.equal(sha256(source), entry.sourceSha256);
  assert.equal(sha256(compressed), entry.localSha256);
  assert.equal(sha256(raw), entry.decodedSha256);
  assert(compressed.length < source.length);
});

await test('invalid headers, dimensions and payload lengths fail before texture creation', () => {
  for (const offset of [0, 4, 6, 8, 12]) {
    const corrupted = Buffer.from(raw);
    corrupted[offset] ^= 1;
    assert.throws(() => parseNightSky(arrayBuffer(corrupted)), /header/);
  }
  assert.throws(() => parseNightSky(arrayBuffer(raw.subarray(0, -2))), /length/);
  assert.throws(
    () => parseNightSky(arrayBuffer(Buffer.concat([raw, Buffer.from([0, 0])]))),
    /length/,
  );
});

await test('native stream loading rejects HTTP errors, corrupt gzip and invalid expanded lengths', async () => {
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, '/assets/garage/surfaces/night-sky.rgba16f.bin');
      return new Response(compressed, { headers: { 'Content-Type': 'application/octet-stream' } });
    };
    const texture = await loadNightSky();
    const expected = parseNightSky(arrayBuffer(raw));
    assert.deepEqual(texture.image.data, expected.image.data);
    texture.dispose();
    expected.dispose();
    globalThis.fetch = async () => new Response(null, { status: 404 });
    await assert.rejects(loadNightSky(), /404/);
    globalThis.fetch = async () => new Response('not gzip');
    await assert.rejects(loadNightSky());
    globalThis.fetch = async () => new Response(gzipSync(raw.subarray(0, -2)));
    await assert.rejects(loadNightSky(), /truncated/);
    globalThis.fetch = async () =>
      new Response(gzipSync(Buffer.concat([raw, Buffer.from([0, 0])])));
    await assert.rejects(loadNightSky(), /exceeds/);
  } finally {
    globalThis.fetch = savedFetch;
  }
});

await test('older browsers decode identical pixels with bounded lazy fallback and reject corrupt data', async () => {
  const savedFetch = globalThis.fetch;
  const savedDecompressionStream = globalThis.DecompressionStream;
  try {
    globalThis.DecompressionStream = undefined;
    globalThis.fetch = async (url) => {
      assert.equal(url, '/assets/garage/surfaces/night-sky.rgba16f.bin');
      return new Response(compressed, { headers: { 'Content-Type': 'application/octet-stream' } });
    };
    const texture = await loadNightSky();
    const expected = parseNightSky(arrayBuffer(raw));
    assert.deepEqual(texture.image.data, expected.image.data);
    texture.dispose();
    expected.dispose();

    const hugeDeclaredLength = Buffer.from(compressed);
    hugeDeclaredLength.writeUInt32LE(0xffffffff, hugeDeclaredLength.length - 4);
    globalThis.fetch = async () => new Response(hugeDeclaredLength);
    await assert.rejects(loadNightSky(), /gzip payload length/);

    // A dishonest trailer must not hide either a truncated or an oversized DEFLATE result.
    for (const payload of [raw.subarray(0, -2), Buffer.concat([raw, Buffer.from([0, 0])])]) {
      const mismatched = gzipSync(payload);
      mismatched.writeUInt32LE(raw.length, mismatched.length - 4);
      globalThis.fetch = async () => new Response(mismatched);
      await assert.rejects(loadNightSky(), /expanded payload length/);
    }

    const corruptChecksum = Buffer.from(compressed);
    corruptChecksum[corruptChecksum.length - 8] ^= 1;
    globalThis.fetch = async () => new Response(corruptChecksum);
    await assert.rejects(loadNightSky(), /checksum/);

    const corruptHeader = Buffer.from(raw);
    corruptHeader[0] ^= 1;
    globalThis.fetch = async () => new Response(gzipSync(corruptHeader));
    await assert.rejects(loadNightSky(), /header/);
    globalThis.fetch = async () => new Response('not gzip');
    await assert.rejects(loadNightSky(), /gzip payload length/);
  } finally {
    globalThis.fetch = savedFetch;
    globalThis.DecompressionStream = savedDecompressionStream;
  }
});
