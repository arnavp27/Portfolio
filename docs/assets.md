# Asset sources and rights

The repository contains optimized runtime assets. Original photographs, research documents, earlier designs and image-generation working files are retained separately outside this tree.

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

The exterior paving, dark wood, bark, asphalt, brick, plaster, roof tiles and sky environment are also Poly Haven CC0 assets. [material-sources.json](material-sources.json) records their original download URLs, source checksums and local SHA-256 hashes. Optimized files and maps live in `public/assets/garage/surfaces/` and `textures/`. The street layout, houses, vehicles, vegetation meshes and room props are authored in the project.

## Fonts, images and personal content

Font licenses are kept alongside the files in `public/assets/fonts/`: IBM Plex Mono, Instrument Sans, Instrument Serif, Noto Sans Kannada and Pixelify Sans use their included SIL Open Font License notices. Preserve those notices when redistributing the fonts.

`public/assets/garage/poster.webp` derives from the generated workshop concept artwork and is used as a loading image. It is not a photograph of Arnav's home. Optimized SDI photographs under `public/assets/images/` were supplied by Arnav for his portfolio. They remain personal portfolio material; no general license for reuse is granted here.

No open-source license has been selected for the project's own code or written content. Third-party asset licenses apply to their respective files and do not automatically license the whole repository.

## Audio

`public/assets/audio/after-rain.ogg` is an original 48-second ambient composition. The generator is `scripts/compose-garage-music.mjs`; it uses oscillators and synthesis, without third-party samples. Computer startup/shutdown, keyboard interaction, footsteps, switches, fans and street ambience use original synthesized sounds. Film and Windows recordings are not bundled.

To regenerate the music, run `node scripts/compose-garage-music.mjs /path/to/after-rain.wav`. An omitted output path writes to the operating system's temporary directory. Encoding the resulting WAV to Ogg requires FFmpeg; FFmpeg is an optional authoring tool, not a runtime or website-build dependency.

Optional replacement clips are configured in `src/lib/garage/audio-clips.ts`. The default mappings are `null`, which selects synthesis without fetching a recording. To use a recording you have permission to redistribute, place an optimized file under `public/assets/audio/`, document its source/license here, and replace the appropriate `alien`, `power-on` or `power-off` mapping with its `/assets/audio/...` URL. All clips share the existing mute and SFX controls.
