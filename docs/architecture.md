# Architecture

The homepage is a first-person Three.js garage in a fictional Koramangala street. Astro builds static pages and content; React manages entry, menus and the HTML desktops projected onto the two CRT screens. No backend or API key is required.

## Boundaries

| Location                                                             | Responsibility                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/components/GarageLanding.astro`                                 | Loads published content, renders the garage island, project templates and no-JavaScript reading fallback |
| `src/components/Garage.tsx`                                          | Entry/pause UI, sound preferences, computer surfaces and the SDI photo view                              |
| `src/components/ComputerDesktop.tsx`                                 | Work and personal desktop windows; projects/articles are data-driven                                     |
| `src/components/GarageRecovery.tsx`                                  | Readable recovery UI for unavailable graphics or asset failures                                          |
| `src/lib/garage/explorer.ts`                                         | Coordinates scene lifecycle, input, movement and computer approach/exit                                  |
| `src/lib/garage/player-controls.ts`, `pointer-capture.ts`            | Keyboard policy and the native mouse-capture lifecycle                                                   |
| `src/lib/garage/navigation.ts`, `interaction.ts`                     | Collision/path planning and projection of HTML onto monitor glass                                        |
| `src/lib/garage/world.ts`, `city/`, `foliage.ts`                     | Room geometry, street/vehicles, plants and interaction targets                                           |
| `src/lib/garage/rendering.ts`, `environment.ts`, `src/lib/graphics/` | Render resolution, postprocessing, lighting and generated textures                                       |
| `src/lib/garage/sound.ts`, `city/soundscape.ts`, `audio-clips.ts`    | One audio graph, spatial ambience, original SFX and optional clip mappings                               |
| `src/content/`, `src/content.config.ts`                              | Markdown and validated metadata                                                                          |
| `src/pages/work/`, `notes/`, `resume.astro`                          | Static reading routes independent of WebGL                                                               |

## Interaction and lifecycle

The explorer moves through `room → approaching → using → leaving → room`. Menus and computer transitions suspend walking. Escape pauses/resumes or leaves a computer. Shift toggles run/walk; Space jumps; E uses the current target. Physical keyboards and tower power buttons are separate interactions from the monitors. The two entrance switches control garage lighting and computer power independently.

Desktop gameplay requires confirmed Pointer Lock. The entry click starts capture; the pause menu remains visible while capture is pending or denied. The playRequested flag records current user intent independently of the browser's native lock. Native grants can resume play only while that intent remains valid. Escape, unexpected capture loss, window blur and hidden tabs clear intent and pause; late grants are released. Computer screens intentionally release capture for HTML interaction, and stepping away requests it again before the return animation continues. Menus and computer screens use the normal pointer; desktop exploration shows only the fixed interaction marker. Touch devices automatically use drag-to-look and destination buttons, with no centre marker.

The pointer-capture module owns serialized native requests, bounded missing-event waits, cancellation, late results and release-in-flight handling. Requests come only from entry/resume/return user actions, never focus handlers or timers. The player-controls module gates movement and mouse-look, and deduplicates Escape key/native-unlock ordering. There is no desktop free-cursor mode or edge-turn fallback.

World coordinates remain fixed during movement. The browser renders actual 3D geometry; the loading poster is only a temporary placeholder. Close-up desktop text uses transformed HTML so reading is not limited by the scene's rendering. Render/audio work suspends when appropriate, and component teardown disposes listeners, Three.js resources and the audio graph.

Graphics are manually adjustable through Pause → Graphics & display. The current default remains 60% of native display resolution with MSAA + SMAA, ambient occlusion, bloom and full shadow detail. There is no automatic quality downgrade. `graphics-settings.ts` owns the defaults, validated ranges and versioned local-storage key; the rendering pipeline preserves the selected settings across viewport and display-density changes. Saved experiments affect only the visitor's browser. Comparison temporarily previews the defaults without overwriting saved choices, and Reset restores them. The panel also controls tone mapping, exposure, fog, rain, surface filtering, contrast, saturation and the vignette. Colour filters apply only to the 3D canvas; computer desktop text remains HTML at native resolution. Settings redraw the paused view immediately without moving its camera.

## Extension and validation

Add projects and writing through the [content guide](editing-content.md); new entries do not need another physical computer. Shared metadata remains independent of the room's props.

`npm run check` rejects unused TypeScript locals and parameters. `npm test` runs every `tests/*-contract.mjs` suite. Contracts cover navigation, city spacing/lighting, power circuits, audio, input/capture, graphics recovery and quality, screen alignment and content publication. Production handler tests locate declarations using the TypeScript AST, so formatting does not invalidate them. The content suite builds a disposable temporary site and never edits this checkout's content or output.

`npm run test:browser` runs a small Chromium smoke suite against the built site: entry, Escape toggling, both computers, local asset responses, the compatibility redirect and mobile reading without JavaScript. Guided mode avoids depending on headless native mouse capture; real desktop capture still deserves a manual check when its controller changes. Browser snapshots/traces stay in ignored output directories.

Historical implementations, research notes and original source media are outside this repository. `tests/repository-contract.mjs` checks that archived trees and stale runtime references do not return, and that literal asset/model dependencies exist.

## Hosting

`npm run build` emits `dist/`. `/camera-workshop/` redirects to `/`; `/work/`, `/work/<slug>/`, `/resume/` and published `/notes/` routes remain ordinary static pages. The current asset paths assume a domain root. A GitHub Pages project subpath needs a deliberate base-path change before deployment; pushing the repository does not deploy it. CI only verifies the code.
