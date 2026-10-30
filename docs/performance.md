# Reproducible performance measurements

The benchmark is an explicit, local command. It is not part of `test`, `verify`, CI or deployment. It uses the existing Playwright dependency and full Chromium with `--enable-gpu`. The regular browser smoke tests use software rendering and are not FPS benchmarks.

Build and serve the production site yourself:

```sh
npm run build
npm run preview
```

In another terminal, start a measurement:

```sh
npm run benchmark
```

If the Playwright Chromium browser is missing, install it with `npx playwright install chromium` before running the benchmark. The benchmark does not build the site, start a server, install browsers, change source files or deploy anything.

Defaults are `http://127.0.0.1:4173/`, a 1920 × 1080 CSS viewport, DPR 1 and 15 seconds at each of two stationary views: the entrance and Work desk. It warms up for three seconds after entry, uses the public guided-navigation controls to walk to the desk, and allows one second to settle there. Navigation time is excluded from the two samples. Touch capability selects guided mode without depending on native pointer lock; it does not emulate a mobile processor.

All options are optional:

```sh
npm run benchmark -- --url http://127.0.0.1:4173/ --width 2560 --height 1440 --dpr 1 --seconds 30 --out test-results/benchmark-1440p.json
npm run benchmark -- --help
```

Width and height must be integers from 1 to 8192, DPR must be 0.5–4, and seconds must be 1–300. Use dimensions your GPU can actually support. `--out` overwrites the selected JSON report; its parent directories are created as needed. The default `test-results/benchmark.json` is already ignored by Git. Reports include raw samples, graphics settings, actual canvas/drawing-buffer dimensions, renderer identification, browser version, machine details, startup timing and any failures.

## What the numbers mean

The probe wraps `requestAnimationFrame` only in the benchmark browser and identifies the scene callback from its existing camera-position DOM update. Unrelated UI callbacks are excluded. No profiling globals or instrumentation ship in the production bundle.

- **Average FPS:** 1000 divided by the mean gap between consecutive scene callbacks. The number of intervals is one less than the number of callbacks.
- **p95 frame time:** the nearest-rank 95th percentile of those gaps in milliseconds. Lower is better.
- **1% low FPS:** 1000 divided by the mean of the slowest `ceil(intervalCount × 0.01)` intervals. It is not the reciprocal of p99.
- **Callback time:** JavaScript and command-submission duration around the scene callback. It does not measure asynchronous GPU execution.
- **Ready time:** milliseconds from navigation until the first observed scene frame, with a separate entry-UI timestamp. This includes asset loading and initial work; OS and network caches can still be warm despite a fresh browser context.

These are hardware-accelerated scene-callback measurements, not proof that every frame was presented by a physical display. Headless scheduling and refresh limits can cap cadence. The probe itself adds overhead, so comparisons must use the same harness. A short run cannot establish smoothness on every computer or reveal every long-session stall.

## Valid comparisons

The command rejects SwiftShader, llvmpipe, other recognized software renderers and unavailable renderer identification. It also exits nonzero for page/resource errors, the specific garage-lighting-fallback warning (which changes the authored environment), insufficient frame samples, a paused/hidden scene, changing settings or camera position during a sample, or a detected external-power transition. Invalid runs retain their JSON diagnostics but do not print a successful FPS summary.

On Linux, existing `/sys/class/power_supply/*/online` adapter files are sampled once a second. Initial state and changes are recorded. Plugging or unplugging power invalidates the run; repeat under stable conditions. Stable battery-powered runs are labeled by their recorded power state and should only be compared to equivalent battery-powered runs. Platforms without this interface remain supported with power state recorded as unknown; power monitoring is not required there. Transitions shorter than the polling interval can be missed.

For before/after comparisons, use the same browser, GPU, viewport, DPR, authored graphics settings and power profile. Close other GPU-heavy applications, allow the system to settle, and repeat both versions in alternating order. In older builds, the visible “Enter garage” screen still animated continuously; either close that tab or enter and explicitly pause it with Escape. The current entry screen draws once and waits for play, while resize/settings changes can request another still frame. Report the spread across runs alongside the median; thermal and scheduling variability can outweigh small differences. Preserve each report under a distinct `--out` path. The two stationary views are useful checkpoints, but walking, computer transitions and native pointer lock still need separate interaction checks.

## October 2026 experiment findings

The next optimization pass tested tighter box bounds, solid-side-wall occlusion, per-material light selection and a distant-facade radiance bake while preserving all authored settings. None is included in the runtime.

- Box and wall culling reduced desk-view submissions from 218 to 165 and preserved matching frozen images, but the generic checks increased outdoor CPU cost. Restricting them to the garage reduced that cost; the final desk comparison was 40.8–41.5 FPS versus 40.9 FPS for the reference, with the same 33.4 ms p95 frame time. This did not establish a repeatable worthwhile gain.
- Uniform light masks regressed important views. Compiled masks added 16 shader programs and extra compilation work, with mixed rendering results. The existing zero-contribution direct-light guard remains.
- A visible distant-facade bake removed only 462 triangles, added one draw call and roughly 2.4 MB of texture storage, softened window detail and did not materially reduce GPU time. This was a radiance-image substitution, not a diffuse-only lightmap on unchanged geometry. It does not rule out a properly measured bake on larger visible surfaces.

These are local Intel UHD measurements at 1920×1080 CSS/DPR1 and the authored 60% render scale. They are not universal hardware results. Rejected prototypes, raw samples and paired images are kept outside the repository; the previously verified optimization baseline remains intact.

## Material-cost and wall-cache trial

A subsequent local pass measured GPU time for individual rendering passes and compared warmed baseline → candidate → baseline sequences at identical camera positions. Resolution and effects stayed fixed. Experimental shader variants and captures remain outside the repository.

- Removing only procedural noise saved roughly 0.04–0.22 ms in the more stable samples. Lighting was the larger cost: diagnostic removal of static direct lights reduced the main scene pass by about 4.9–7.5 ms. These diagnostics change appearance; they are not shipping settings, and their savings cannot be added together.
- Back-facing-light rejection preserved the comparison images but made the stable entrance/street/desk samples slower. Early finite-range rejection, a squared-distance fast path and a grouped point-light bound did not establish a repeatable gain. None is retained.
- A 1024×256 HDR cache of point-light response on one upper exterior wall preserved the geometry but added about 2.7 MiB of texture storage and froze part of the material's view-dependent response. Near and angled samples did not improve; the wide sample varied too much to establish a gain. The cache is not retained. This narrow experiment does not rule out a larger diffuse-only lightmap system.
- Visible entry-screen rendering was discovered during these measurements. Older builds could compete for GPU time even before the visitor pressed Enter. Consequently, variable samples are not used to claim speedups, and no new in-game FPS gain is claimed from this pass.

The retained change stops continuous rendering and world-time advancement before entry. First-frame loading, one-shot resize redraws, normal gameplay, computer interactions and pause/resume keep their existing paths. This saves idle work without changing the in-game graphics; it does not reduce the cost of an actively played frame.
