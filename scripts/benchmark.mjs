import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform, arch, release, cpus } from 'node:os';
import { chromium, expect as baseExpect } from '@playwright/test';
import { parseBenchmarkArgs, summarizeFrames } from './benchmark-utils.mjs';

const expect = baseExpect.configure({ timeout: 90_000 });
const limitations = [
  'FPS is scene requestAnimationFrame callback cadence, not GPU execution time or confirmed display presentation.',
  'Callback duration measures JavaScript/submission time; the GPU can continue asynchronously.',
  'Headless Chromium scheduling, refresh limits, background load, thermals and power mode affect results.',
  'Touch capability selects guided navigation; it does not emulate a phone CPU or GPU.',
  'Ready time includes first-frame loading/compilation in a fresh browser context; OS/network caches may still be warm.',
  'Compare repeated runs on the same hardware, browser, power state, viewport, DPR and settings.',
];

// Playwright injects this into the benchmark page only; production gains no debug globals.
function installProbe() {
  const nativeFrame = window.requestAnimationFrame.bind(window);
  let host,
    observer,
    current,
    firstSceneFrameAt = null;
  const state = () => {
    const root = document.querySelector('.garage');
    const container = document.querySelector('.workshop-canvas');
    const canvas = container?.querySelector('canvas');
    return {
      dataset: container ? { ...container.dataset } : null,
      paused: root?.dataset.paused,
      reducedMotion: root?.classList.contains('reduce-motion'),
      hidden: document.hidden,
      canvas: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
            cssWidth: canvas.clientWidth,
            cssHeight: canvas.clientHeight,
          }
        : null,
    };
  };
  document.addEventListener('visibilitychange', () => {
    if (current && document.hidden) current.invalidReasons.push('Page became hidden.');
  });
  window.requestAnimationFrame = (callback) =>
    nativeFrame((timestamp) => {
      if (!host) {
        host = document.querySelector('.workshop-canvas');
        if (host) {
          observer = new MutationObserver(() => {});
          observer.observe(host, { attributes: true, attributeFilter: ['data-camera-position'] });
          const root = document.querySelector('.garage');
          if (root)
            new MutationObserver(() => {
              if (current && root.dataset.paused !== 'false')
                current.invalidReasons.push('Scene paused during measurement.');
            }).observe(root, { attributes: true, attributeFilter: ['data-paused'] });
        }
      }
      observer?.takeRecords();
      const before = performance.now();
      try {
        return callback.call(window, timestamp);
      } finally {
        if (observer?.takeRecords().length) {
          const after = performance.now();
          firstSceneFrameAt ??= after;
          if (current) current.frames.push([timestamp, after - before]);
        }
      }
    });
  window.__garageBenchmark = {
    ready: () => ({
      firstSceneFrameMs: firstSceneFrameAt,
      readyUiMs: performance.now(),
      state: state(),
    }),
    begin(label) {
      if (current) throw new Error('Measurement already active.');
      current = {
        label,
        startMs: performance.now(),
        startState: state(),
        frames: [],
        invalidReasons: [],
      };
    },
    end() {
      if (!current) throw new Error('No active measurement.');
      const result = { ...current, endMs: performance.now(), endState: state() };
      current = null;
      return result;
    },
  };
}

async function monitorPower() {
  const directory = '/sys/class/power_supply',
    paths = [],
    changes = [];
  try {
    for (const name of await readdir(directory)) {
      try {
        const entry = join(directory, name);
        if ((await readFile(join(entry, 'type'), 'utf8')).trim() === 'Battery') continue;
        await readFile(join(entry, 'online'), 'utf8');
        paths.push({ name, file: join(entry, 'online') });
      } catch {
        /* Some devices do not expose adapter state. */
      }
    }
  } catch {
    /* Optional Linux interface: other platforms remain supported. */
  }
  let pending;
  const sample = async () => {
    const supplies = await Promise.all(
      paths.map(async ({ name, file }) => {
        try {
          const value = (await readFile(file, 'utf8')).trim();
          return { name, online: value === '1' ? true : value === '0' ? false : null };
        } catch {
          return { name, online: null };
        }
      }),
    );
    const online =
      !supplies.length || supplies.some((supply) => supply.online === null)
        ? null
        : supplies.some((supply) => supply.online);
    if (!changes.length || JSON.stringify(changes.at(-1).supplies) !== JSON.stringify(supplies))
      changes.push({ time: new Date().toISOString(), online, supplies });
  };
  await sample();
  const timer = paths.length
    ? setInterval(() => {
        if (!pending)
          pending = sample().finally(() => {
            pending = undefined;
          });
      }, 1000)
    : undefined;
  return {
    async stop() {
      clearInterval(timer);
      await pending;
      await sample();
      const known = changes.filter((change) => change.online !== null);
      return {
        supported: paths.length > 0,
        changes,
        unstable: known.some(
          (change, index) => index > 0 && change.online !== known[index - 1].online,
        ),
      };
    },
  };
}

async function benchmark(config) {
  const record = {
    status: 'running',
    startedAt: new Date().toISOString(),
    config,
    machine: { platform: platform(), arch: arch(), release: release(), cpu: cpus()[0]?.model },
    stages: [],
    errors: [],
    limitations,
  };
  let browser;
  const power = await monitorPower();
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: ['--enable-gpu'],
    });
    record.browser = browser.version();
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: config.dpr,
      hasTouch: true,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    page.on('pageerror', (error) => record.errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' ||
        (message.type() === 'warning' &&
          message.text().startsWith('Using the garage lighting fallback.'))
      )
        record.errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) record.errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', (request) =>
      record.errors.push(`${request.failure()?.errorText} ${request.url()}`),
    );
    await page.addInitScript(installProbe);
    await page.goto(config.url, { waitUntil: 'domcontentloaded' });
    const enter = page.getByRole('button', { name: /^Enter garage/ });
    await expect(enter).toBeVisible({ timeout: 120_000 });
    record.ready = await page.evaluate(() => window.__garageBenchmark.ready());
    record.context = await page.evaluate(() => {
      const canvas = document.querySelector('.workshop-canvas canvas');
      const gl = canvas?.getContext('webgl2');
      if (!gl || gl.isContextLost()) throw new Error('A working WebGL2 context is required.');
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
        version: gl.getParameter(gl.VERSION),
        attributes: gl.getContextAttributes(),
        drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
        dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
        userAgent: navigator.userAgent,
        settings: JSON.parse(document.querySelector('.workshop-canvas').dataset.graphicsSettings),
        renderAntialias: document.querySelector('.workshop-canvas').dataset.renderAntialias,
        renderDpr: document.querySelector('.workshop-canvas').dataset.renderDpr,
      };
    });
    const cdp = await browser.newBrowserCDPSession();
    record.gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
    console.log(`Renderer: ${record.context.renderer ?? 'unavailable'}`);
    console.log(`Context/buffers/settings: ${JSON.stringify(record.context)}`);
    console.log(
      `Ready: first scene frame ${record.ready.firstSceneFrameMs?.toFixed(1)} ms; entry UI ${record.ready.readyUiMs.toFixed(1)} ms`,
    );
    if (
      !record.context.renderer ||
      /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|^(webkit webgl|webgl|angle)$/i.test(
        record.context.renderer,
      )
    )
      throw new Error(
        'Hardware renderer could not be verified; refusing software/unknown-renderer FPS results.',
      );
    await enter.click();
    await expect(page.locator('.workshop-canvas')).toHaveAttribute('data-control-mode', 'guided');
    await expect(page.locator('.garage')).toHaveAttribute('data-paused', 'false');
    await page.waitForTimeout(3000);
    const measure = async (label) => {
      await page.evaluate((name) => window.__garageBenchmark.begin(name), label);
      await page.waitForTimeout(config.seconds * 1000);
      const stage = await page.evaluate(() => window.__garageBenchmark.end());
      record.stages.push(stage);
      for (const state of [stage.startState, stage.endState]) {
        if (state.hidden || state.paused !== 'false' || state.reducedMotion)
          stage.invalidReasons.push('Scene was hidden, paused or in reduced-motion mode.');
      }
      if (
        JSON.stringify(stage.startState.canvas) !== JSON.stringify(stage.endState.canvas) ||
        stage.startState.dataset.graphicsSettings !== stage.endState.dataset.graphicsSettings ||
        stage.startState.dataset.cameraPosition !== stage.endState.dataset.cameraPosition
      )
        stage.invalidReasons.push(
          'Camera, buffer dimensions or graphics settings changed during the stationary sample.',
        );
      if (stage.invalidReasons.length)
        throw new Error(`${label}: ${stage.invalidReasons.join(' ')}`);
      stage.summary = summarizeFrames(stage.frames);
    };
    await measure('entrance');
    await page
      .getByRole('navigation', { name: 'Walk to a corner' })
      .getByRole('button', { name: 'Work desk', exact: true })
      .click();
    await page.waitForFunction(
      () => {
        const p = (document.querySelector('.workshop-canvas')?.dataset.cameraPosition ?? '')
          .split(',')
          .map(Number);
        return Math.hypot(p[0] + 1.2, p[2] - 2.05) < 0.012;
      },
      undefined,
      { timeout: 90_000 },
    );
    await page.waitForTimeout(1000);
    await measure('work-desk');
    if (record.errors.length)
      throw new Error('Page/resource errors or fallback lighting occurred; see the JSON report.');
    record.status = 'complete';
  } catch (error) {
    record.status = 'failed';
    record.failure = error.stack ?? String(error);
  } finally {
    if (browser) await browser.close().catch((error) => record.errors.push(error.message));
    record.power = await power.stop();
    if (record.power.unstable)
      record.errors.push('External power changed during this run; repeat under stable power.');
    if (record.errors.length) record.status = 'failed';
    record.finishedAt = new Date().toISOString();
    const out = resolve(config.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(record, null, 2) + '\n');
    console.log(`Report: ${out}`);
  }
  console.log(`Power: ${JSON.stringify(record.power)}`);
  for (const limitation of limitations) console.log(`Limit: ${limitation}`);
  if (record.status !== 'complete') {
    console.error(record.failure ?? record.errors.join('\n'));
    if (record.power.unstable) console.error('Run invalidated by a power-state transition.');
    process.exitCode = 1;
    return;
  }
  for (const stage of record.stages) {
    const s = stage.summary;
    console.log(
      `${stage.label}: ${s.averageFps.toFixed(1)} FPS; p95 ${s.p95FrameMs.toFixed(2)} ms; 1% low ${s.low1PercentFps.toFixed(1)} FPS; ${s.frames} scene callbacks`,
    );
  }
}

try {
  const config = parseBenchmarkArgs(process.argv.slice(2));
  if (config.help)
    console.log(`Opt-in garage benchmark (requires a running production preview and Playwright Chromium).
Usage: npm run benchmark -- [--url URL] [--width PX] [--height PX] [--dpr N] [--seconds N] [--out FILE]
Defaults: http://127.0.0.1:4173/  1920×1080  DPR 1  15 seconds per view  test-results/benchmark.json
Ranges: width/height integer 1–8192; DPR 0.5–4; seconds 1–300.
Measures entrance and Work desk after warm-up; does not build, start a server or deploy.`);
  else await benchmark(config);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
