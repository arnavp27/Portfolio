import {
  ClampToEdgeWrapping,
  DataTexture,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
} from 'three';

export const NIGHT_SKY_WIDTH = 1024;
export const NIGHT_SKY_HEIGHT = 512;
export const NIGHT_SKY_HEADER_BYTES = 16;
const byteLength = NIGHT_SKY_HEADER_BYTES + NIGHT_SKY_WIDTH * NIGHT_SKY_HEIGHT * 8;
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** NSKY v1: 16-byte little-endian header followed by RGBA half-float words. */
export function parseNightSky(buffer: ArrayBuffer): DataTexture {
  if (buffer.byteLength !== byteLength) throw new Error('Invalid night sky payload length.');
  const header = new DataView(buffer);
  if (
    header.getUint32(0, false) !== 0x4e534b59 ||
    header.getUint16(4, true) !== 1 ||
    header.getUint16(6, true) !== 1 ||
    header.getUint32(8, true) !== NIGHT_SKY_WIDTH ||
    header.getUint32(12, true) !== NIGHT_SKY_HEIGHT
  )
    throw new Error('Invalid night sky header.');

  const pixels = new Uint16Array(buffer, NIGHT_SKY_HEADER_BYTES);
  // Files are always little-endian; typed arrays use the host's byte order.
  if (!littleEndian)
    for (let i = 0; i < pixels.length; i++)
      pixels[i] = header.getUint16(NIGHT_SKY_HEADER_BYTES + i * 2, true);
  const texture = new DataTexture(
    pixels,
    NIGHT_SKY_WIDTH,
    NIGHT_SKY_HEIGHT,
    RGBAFormat,
    HalfFloatType,
  );
  // Match HDRLoader's data texture exactly, including its nondefault orientation.
  texture.colorSpace = LinearSRGBColorSpace;
  texture.flipY = true;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 1;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.premultiplyAlpha = false;
  texture.mapping = EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

/** Reject malformed/truncated data before allocating a GPU texture. */
export async function loadNightSky(): Promise<DataTexture> {
  const response = await fetch('/assets/garage/surfaces/night-sky.rgba16f.bin');
  if (!response.ok) throw new Error(`Night sky request failed (${response.status}).`);
  if (!response.body) throw new Error('Night sky response has no body.');
  if (typeof DecompressionStream === 'undefined') {
    const compressed = await response.arrayBuffer();
    if (
      compressed.byteLength < 18 ||
      new DataView(compressed).getUint32(compressed.byteLength - 4, true) !== byteLength
    )
      throw new Error('Invalid night sky gzip payload length.');
    // Older WebGL2 browsers load this existing Three.js dependency only when needed.
    const { gunzipSync } = await import('three/addons/libs/fflate.module.js');
    // fflate can silently clip a caller-owned buffer. One extra byte detects overflow.
    const bytes = gunzipSync(new Uint8Array(compressed), {
      out: new Uint8Array(byteLength + 1),
    });
    if (bytes.byteLength !== byteLength)
      throw new Error('Invalid night sky expanded payload length.');
    // gunzipSync checks DEFLATE structure but does not verify the gzip checksum.
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < crcTable.length; i++) {
      let crc = i;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      crcTable[i] = crc;
    }
    let checksum = 0xffffffff;
    for (const byte of bytes) checksum = (checksum >>> 8) ^ crcTable[(checksum ^ byte) & 255];
    if (
      (checksum ^ 0xffffffff) >>> 0 !==
      new DataView(compressed).getUint32(compressed.byteLength - 8, true)
    )
      throw new Error('Invalid night sky gzip checksum.');
    return parseNightSky(bytes.slice().buffer);
  }
  const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader();
  // Bound decompressed data to the authored dimensions, including corrupt gzip files.
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > bytes.byteLength) {
        await reader.cancel();
        throw new Error('Night sky payload exceeds its expected size.');
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== bytes.byteLength) throw new Error('Night sky payload is truncated.');
  return parseNightSky(bytes.buffer);
}
