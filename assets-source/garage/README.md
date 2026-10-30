# Night sky source

`kloofendal_overcast_puresky_1k.hdr` is the original 1024 × 512 Poly Haven HDRI, distributed under [CC0](https://polyhaven.com/license). Its source URL and checksums are recorded in [the material manifest](../../docs/material-sources.json).

This small source file is retained outside `public/` so a clean checkout can regenerate the exact runtime sky without downloading an external file. It is not deployed. Regenerate the derived asset and its checksums with:

```sh
node scripts/generate-night-sky.mjs
```

The generator uses the locked Three.js HDRLoader in half-float mode, applies the original night grading calculation, then writes a gzip-compressed `NSKY` v1 file. The decompressed format is a 16-byte header: ASCII `NSKY`, little-endian uint16 version `1`, uint16 pixel format `1` (RGBA16F), uint32 width and uint32 height; the remaining bytes are little-endian RGBA half-float words. Alpha is retained unchanged.

The browser uses native `DecompressionStream` where available. Older browsers lazily import the gzip decoder already bundled with Three.js. This fallback checks the gzip trailer length before allocating a bounded output, rejects truncated or oversized data, and verifies its CRC32 before the common binary-header checks. It introduces no new package dependency and produces the same pixels.

Serve `night-sky.rgba16f.bin` as an ordinary binary asset, without an HTTP `Content-Encoding: gzip` header: the sky loader performs its one decompression explicitly. The opaque `.bin` extension prevents Vite's static middleware from treating a `.gz` suffix as HTTP transport encoding and causing the browser to decompress the payload before the loader. The exact-path rule in `public/_headers` sets `Content-Type: application/octet-stream`, retains ETag revalidation with `max-age=0, must-revalidate`, adds `no-transform`, and removes `Content-Encoding` using [Cloudflare Pages' documented `! Header-Name` syntax](https://developers.cloudflare.com/pages/configuration/headers/#detach-a-header). Cloudflare documents that [`no-transform` prevents compression changes](https://developers.cloudflare.com/speed/optimization/content/compression/#content-compression-from-origin-servers-to-the-cloudflare-network). This rule applies to this static asset; there are no Pages Functions in this project. PMREM generation still occurs in the renderer using the same decoded pixels and texture settings.
