# Asset sources and rights

The repository contains optimized runtime assets. Original photographs, research documents, earlier designs and image-generation working files are retained separately outside this tree. The small HDRI used to regenerate the night sky is retained in `assets-source/garage/`, outside the deployed `public/` directory.

## Models and materials

The following models and their textures come from [Poly Haven](https://polyhaven.com/) under [CC0](https://polyhaven.com/license). Runtime files are under `public/assets/garage/models/`.

| Asset                 | Author                         | Source                                                                 |
| --------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Green Chair 01        | Kirill Sannikov                | [GreenChair_01](https://polyhaven.com/a/GreenChair_01)                 |
| Desk Lamp Arm 01      | Yann Kervran, Kuutti Siitonen  | [desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01)           |
| Metal Office Desk     | Ulan Cabanilla                 | [metal_office_desk](https://polyhaven.com/a/metal_office_desk)         |
| Wooden Bookshelf Worn | Ulan Cabanilla                 | [wooden_bookshelf_worn](https://polyhaven.com/a/wooden_bookshelf_worn) |
| Yellow Plaster        | Rob Tuytel                     | [yellow_plaster](https://polyhaven.com/a/yellow_plaster)               |
| Wood Floor Worn       | Dimitrios Savva                | [wood_floor_worn](https://polyhaven.com/a/wood_floor_worn)             |
| Wood Table Worn       | Dimitrios Savva, Rico Cilliers | [wood_table_worn](https://polyhaven.com/a/wood_table_worn)             |

Furniture and interior material JPEGs use coefficient-preserving Huffman optimization (`jpegtran -copy all -optimize`). Their dimensions, metadata and decoded pixels are unchanged. Exterior maps that did not shrink were left untouched.

The exterior paving, dark wood, bark, asphalt, brick, plaster, roof tiles and sky environment are also Poly Haven CC0 assets. [material-sources.json](material-sources.json) records their original download URLs, source checksums and local SHA-256 hashes. Optimized files and maps live in `public/assets/garage/surfaces/` and `textures/`. The street layout, houses, vehicles, vegetation meshes and room props are authored in the project.

The sky asset `night-sky.rgba16f.bin` is generated with `node scripts/generate-night-sky.mjs`. Its gzip-compressed RGBA16F payload preserves every half-float word from the original HDRLoader and night-grading calculation, including alpha. The browser decompresses those bytes with its native `DecompressionStream` and uses the same texture orientation, filtering, color space and runtime PMREM processing. Browsers without that API lazily load Three.js's bundled gzip decoder, preserving the same sky without an additional package dependency. Both paths validate the payload before texture creation; the fallback also bounds its output and verifies the gzip checksum. [Source and binary format details](../assets-source/garage/README.md) explain reproducibility; the source HDRI is not deployed. Invalid sky data rejects loading so the renderer can use its existing lighting fallback.

## Fonts, images and personal content

Font licenses are kept alongside the files in `public/assets/fonts/`: IBM Plex Mono, Instrument Sans, Instrument Serif, Noto Sans Kannada and Pixelify Sans use their included SIL Open Font License notices. Preserve those notices when redistributing the fonts. The full fonts are delivered as WOFF2, without subsetting or changing glyphs, metrics or hinting; conversion uses `woff2_compress`. The Noto Sans Kannada notice matches the font’s embedded 2022 copyright and [upstream OFL license](https://github.com/notofonts/kannada/blob/main/OFL.txt).

`public/assets/garage/poster.webp` derives from the generated workshop concept artwork and is used as a loading image. It is not a photograph of Arnav's home. It keeps its original 1586 × 992 dimensions and composition, encoded with WebP quality 86 and method 6 after visual comparison. Optimized SDI photographs under `public/assets/images/` were supplied by Arnav for his portfolio. They remain personal portfolio material; no general license for reuse is granted here.

`public/assets/social/garage.jpg` is a 1200 × 630 sharing card made from the actual rendered garage screenshot in `docs/preview.webp`. Its crop removes the old screenshot controls; the name and role are added using the bundled fonts. This image is for link previews and is not loaded by the live scene.

No open-source license has been selected for the project's own code or written content. Third-party asset licenses apply to their respective files and do not automatically license the whole repository.

## Audio

`public/assets/audio/after-rain.ogg` is an original 48-second ambient composition. The generator is `scripts/compose-garage-music.mjs`; it uses oscillators and synthesis, without third-party samples. Computer startup/shutdown, keyboard interaction, footsteps, switches, fans and street ambience use original synthesized sounds. Film and Windows recordings are not bundled.

To regenerate the music, run `node scripts/compose-garage-music.mjs /path/to/after-rain.wav`. An omitted output path writes to the operating system's temporary directory. Encoding the resulting WAV to Ogg requires FFmpeg; FFmpeg is an optional authoring tool, not a runtime or website-build dependency.

Optional replacement clips are configured in `src/lib/garage/audio-clips.ts`. The default mappings are `null`, which selects synthesis without fetching a recording. To use a recording you have permission to redistribute, place an optimized file under `public/assets/audio/`, document its source/license here, and replace the appropriate `alien`, `power-on` or `power-off` mapping with its `/assets/audio/...` URL. All clips share the existing mute and SFX controls.
