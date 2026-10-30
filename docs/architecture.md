# Architecture

The homepage is a first-person Three.js garage in a fictional Koramangala street. Astro builds static pages and content; React manages entry, menus and the HTML desktops projected onto the two CRT screens. No backend or API key is required.

## Boundaries

| Location                                                                   | Responsibility                                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/components/GarageLanding.astro`                                       | Loads published content, renders the garage island, project templates and no-JavaScript reading fallback |
| `src/components/Garage.tsx`                                                | Entry/pause UI, sound preferences, computer surfaces and the SDI photo view                              |
| `src/components/ComputerDesktop.tsx`                                       | Work and personal desktop windows; projects/articles are data-driven                                     |
| `src/components/GarageRecovery.tsx`                                        | Readable recovery UI for unavailable graphics or asset failures                                          |
| `src/lib/garage/explorer.ts`                                               | Coordinates scene lifecycle, input, movement and computer approach/exit                                  |
| `src/lib/garage/player-controls.ts`, `pointer-capture.ts`, `fullscreen.ts` | Keyboard policy, native mouse capture and fullscreen lifecycle                                           |
| `src/lib/garage/navigation.ts`, `interaction.ts`                           | Collision/path planning and projection of HTML onto monitor glass                                        |
| `src/lib/garage/world.ts`, `city/`, `foliage.ts`                           | Room geometry, street/vehicles, plants and interaction targets                                           |
| `src/lib/garage/rendering.ts`, `environment.ts`, `src/lib/graphics/`       | Render resolution, postprocessing, lighting and generated textures                                       |
| `src/lib/garage/sound.ts`, `city/soundscape.ts`, `audio-clips.ts`          | One audio graph, spatial ambience, original SFX and optional clip mappings                               |
| `src/content/`, `src/content.config.ts`                                    | Markdown and validated metadata                                                                          |
| `src/pages/work/`, `notes/`, `resume.astro`                                | Static reading routes independent of WebGL                                                               |

## Interaction and lifecycle

The explorer moves through `room → approaching → using → leaving → room`. Menus and computer transitions suspend walking. On desktop, Escape pauses and exits fullscreen; Enter activates the focused Back to the garage button to resume fullscreen with confirmed mouse capture. Touch-guided Escape still toggles the menu or leaves a computer. Shift toggles run/walk; Space jumps; E uses the current target. Physical keyboards and tower power buttons are separate interactions from the monitors. The two entrance switches control garage lighting and computer power independently.

Desktop entry requests Pointer Lock, then fullscreen from the same click or Enter key. Pausing releases both; native fullscreen exit also pauses, including while approaching or using a computer. Computer pauses settle at a safe standing position so the menu can always resume. Enter on the focused Back to the garage button requests pointer capture and fullscreen again. Escape does not attempt desktop resumption: browsers exclude Escape from the activation needed to enter fullscreen. There is no Keyboard Lock or second resume screen. Touch devices retain their guided, windowed experience. If fullscreen is unavailable or denied, mouse capture still governs safe windowed play and the same menu remains usable. The playRequested flag records current user intent independently of the browser's native lock. Native grants can resume play only while that intent remains valid. Escape, unexpected capture loss, window blur and hidden tabs clear intent and pause; late grants are released. Computer screens intentionally release capture for HTML interaction, and stepping away requests it again before the return animation continues. Menus and computer screens use the normal pointer; desktop exploration shows only the fixed interaction marker. Touch devices automatically use drag-to-look and destination buttons, with no centre marker.

The pointer-capture module owns serialized native requests, bounded missing-event waits, cancellation, late results and release-in-flight handling. Requests come only from entry/resume/return user actions, never focus handlers or timers. The player-controls module gates movement and mouse-look, and deduplicates Escape key/native-unlock ordering. There is no desktop free-cursor mode or edge-turn fallback.

World coordinates remain fixed during movement. The browser renders actual 3D geometry; the loading poster is only a temporary placeholder. Close-up desktop text uses transformed HTML so reading is not limited by the scene's rendering. Render/audio work suspends when appropriate, and component teardown disposes listeners, Three.js resources and the audio graph.

The public site always uses the authored graphics defaults: 60% of native display resolution with MSAA + SMAA, ambient occlusion, bloom and full shadow detail. There is no automatic quality downgrade. Graphics preferences saved by the former public editor are ignored in production, including local `npm run preview` builds. Sound and reduced-motion controls remain available to visitors. `graphics-settings.ts` owns the defaults and validated ranges; the rendering pipeline preserves the settings across viewport and display-density changes. Colour filters apply only to the 3D canvas; computer desktop text remains HTML at native resolution.

For local art direction, `npm run dev` includes Pause → Graphics & display. Its module and CSS are excluded from production by `import.meta.env.DEV`. Only development reads and writes the versioned graphics local-storage key. Comparison temporarily previews defaults without overwriting saved experiments, and Reset restores them. The panel controls rendering, tone mapping, exposure, fog, rain, surface filtering, contrast, saturation and the vignette, redrawing the paused view without moving its camera.

## Rendering cost and resource ownership

The authored settings remain fixed. Optimizations remove redundant work instead of lowering resolution, light counts, shadows, materials or effects:

- `scene-render-pass.ts` owns the geometry pass's half-float colour/depth target and MSAA samples. It resolves colour once and copies it without blending or colour conversion into depth-free, single-sample effect buffers. GTAO keeps its own depth pass; the final OutputPass still performs tone mapping once.
- `direct-lighting.ts` skips point/spot BRDF evaluation only when Three already marks that light's contribution as zero. Material hooks and program cache keys are composed, and contract tests pin the expected shader structure for dependency upgrades.
- `geometry-batching.ts` preserves authored indices and normal/UV seams, including the former flat-normal fallback. Empty static groups left by merging are pruned while dynamic, interactive and light-target branches remain intact. Once assembly finishes, unused construction geometries and the foliage construction cache are released; scene-referenced geometry remains owned until teardown.
- Scene shaders are queued with `compileAsync` against the same HDR target used for rendering. The target is restored immediately; readiness waits inside the original 90-second startup deadline, and disposal prevents late completion from activating the room. Shader diagnostics stay enabled. This reduces synchronous first-frame blocking rather than promising shorter total loading.
- The pedestrian/audio loops reuse existing data instead of constructing temporary transform and listener tuples each frame.
- The pregraded night sky is lossless. Its original source and generator remain reproducible outside the deployed assets. Fallback environment generation happens only when sky loading fails.

Use the opt-in [hardware benchmark](performance.md) for performance comparisons. It injects instrumentation only into its own browser; regular CI browser tests verify behaviour using software rendering and are not FPS measurements.

## Extension and validation

Add projects and writing through the [content guide](editing-content.md); new entries do not need another physical computer. Shared metadata remains independent of the room's props.

`npm run check` rejects unused TypeScript locals and parameters. `npm test` runs every `tests/*-contract.mjs` suite. Contracts cover navigation, city spacing/lighting, power circuits, audio, input/capture, graphics recovery and quality, screen alignment and content publication. Production handler tests locate declarations using the TypeScript AST, so formatting does not invalidate them. The content suite builds a disposable temporary site and never edits this checkout's content or output.

`npm run test:browser` uses the full Chromium browser in headless mode (`channel: chromium`) so native capture and animation resumption follow the browser implementation rather than the separate headless shell. The small smoke suite runs against the built site: entry, Escape toggling, both computers, local asset responses, the compatibility redirect and mobile reading without JavaScript. Desktop-capture regressions use native Escape key information to exercise browser-owned exit. They let activation expire and observe state through CDP with userGesture:false; ordinary Playwright evaluations can otherwise grant activation and conceal failure. They verify Escape pauses and exits fullscreen, Enter returns to captured fullscreen play, both computers remain resumable, captured mouse-look works, and denied fullscreen retains the same menu. Guided-mode tests separately cover touch controls; native capture still deserves manual checking in other browser hosts. Browser snapshots/traces stay in ignored output directories.

Historical implementations, research notes and original source media are outside this repository, except for the small CC0 HDRI in `assets-source/garage/` needed to regenerate the exact night sky. That source directory is not deployed. `tests/repository-contract.mjs` checks that archived trees and stale runtime references do not return, and that literal asset/model dependencies exist.

## Hosting

`npm run build` emits `dist/`. `/camera-workshop/` redirects to `/`; `/work/`, `/work/<slug>/`, `/resume/` and published `/notes/` routes remain ordinary static pages. Asset paths and public metadata target the domain root at `https://arnavpatil.pages.dev/`. CI verifies pull requests; successful pushes to `main` publish the same tested `dist/` build to Cloudflare Pages. See the [deployment guide](deployment.md) for configuration, publishing and rollback.
