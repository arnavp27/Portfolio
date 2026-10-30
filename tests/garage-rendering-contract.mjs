import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Run the whole production module with GPU boundaries replaced, so these checks
// exercise the real resize/render lifecycle without needing a WebGL context.
const source = new URL('../src/lib/garage/rendering.ts', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const settingsSource = new URL('../src/lib/garage/graphics-settings.ts', import.meta.url);
const settingsModule = {};
Function(
  'exports',
  ts.transpileModule(readFileSync(settingsSource, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
)(settingsModule);
const { defaultGraphics } = settingsModule;
class Pass {
  enabled = true;
  renders = 0;
  render() {
    this.renders++;
  }
  setSize(width, height) {
    this.size = [width, height];
  }
  dispose() {
    this.disposed = true;
    this.disposeCount = (this.disposeCount ?? 0) + 1;
  }
}
const renderTargets = [];
class WebGLRenderTarget extends Pass {
  constructor(width, height, options = {}) {
    super();
    this.size = [width, height];
    this.options = { ...options };
    this.samples = options.samples ?? 0;
    this.depthBuffer = options.depthBuffer ?? true;
    this.type = options.type;
    renderTargets.push(this);
  }
  clone() {
    return new WebGLRenderTarget(...this.size, this.options);
  }
}
let latestComposer;
class EffectComposer extends Pass {
  passes = [];
  ratio = 1;
  size = [1, 1];
  constructor(_renderer, target) {
    super();
    this.target = target;
    this.otherTarget = target.clone();
    latestComposer = this;
  }
  addPass(pass) {
    this.passes.push(pass);
  }
  setPixelRatio(ratio) {
    this.ratio = ratio;
    this.setSize(...this.size);
  }
  setSize(width, height) {
    this.size = [width, height];
    for (const pass of this.passes) pass.setSize(width * this.ratio, height * this.ratio);
  }
  render() {
    for (const pass of this.passes) if (pass.enabled) pass.render();
  }
  reset(target) {
    this.target.dispose();
    this.otherTarget.dispose();
    this.target = target;
    this.otherTarget = target.clone();
    this.resets = (this.resets ?? 0) + 1;
  }
  dispose() {
    super.dispose();
    this.target.dispose();
    this.otherTarget.dispose();
  }
}
class GTAOPass extends Pass {
  updateGtaoMaterial(values) {
    this.parameters = { ...this.parameters, ...values };
  }
  updatePdMaterial() {}
}
// The real pass's attachment lifecycle is tested in garage-scene-render-pass-contract.
// Here the boundary records how the rendering module configures that independent pass.
class SceneRenderPass extends Pass {
  sampleUpdates = [];
  constructor(scene, camera, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.samples = samples;
  }
  compileAsync(renderer) {
    if (this.disposed) return Promise.resolve();
    this.compileRenderer = renderer;
    this.compilations = (this.compilations ?? 0) + 1;
    return this.compilation ?? Promise.resolve();
  }
  setSamples(samples) {
    this.samples = samples;
    this.sampleUpdates.push(samples);
  }
}
class UnrealBloomPass extends Pass {}
class SMAAPass extends Pass {}
class OutputPass extends Pass {}
class Vector2 {
  constructor(x = 0, y = 0) {
    this.set(x, y);
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  clone() {
    return new Vector2(this.x, this.y);
  }
}
class Texture extends Pass {
  anisotropy = 1;
  minFilter = 'authored-min';
  magFilter = 'authored-mag';
}
class FogExp2 {
  constructor(color, density) {
    this.color = color;
    this.density = density;
  }
}
const pmremGenerators = [],
  roomEnvironments = [];
class PMREMGenerator extends Pass {
  sceneCalls = [];
  equirectangularCalls = [];
  constructor() {
    super();
    pmremGenerators.push(this);
  }
  fromScene(scene, sigma) {
    assert(!this.disposed, 'Disposed PMREM generators must not receive fallback work');
    const target = new Pass();
    target.texture = {};
    this.sceneCalls.push({ scene, sigma, target });
    return target;
  }
  fromEquirectangular(texture) {
    assert(!this.disposed, 'Disposed PMREM generators must not receive sky work');
    const target = new Pass();
    target.texture = {};
    this.equirectangularCalls.push({ texture, target });
    return target;
  }
}
class RoomEnvironment extends Pass {
  constructor() {
    super();
    roomEnvironments.push(this);
  }
}
const three = {
  WebGLRenderTarget,
  HalfFloatType: 1,
  Vector2,
  Texture,
  FogExp2,
  ACESFilmicToneMapping: 'aces-tone',
  NeutralToneMapping: 'neutral-tone',
  NoToneMapping: 'no-tone',
  PCFShadowMap: 'pcf-shadow',
  BasicShadowMap: 'basic-shadow',
  Color: Pass,
  PMREMGenerator,
};
const pendingSkyLoads = [],
  optimizedMaterials = [],
  warnings = [];
const modules = {
  three,
  './scene-render-pass': { SceneRenderPass },
  './direct-lighting': {
    optimizeDirectLighting(material) {
      optimizedMaterials.push(material);
    },
  },
  './night-sky': {
    loadNightSky() {
      const request = pendingSkyLoads.shift();
      assert(request, 'Every rig must provide its own sky request');
      request.calls++;
      return request.promise;
    },
  },
};
for (const [name, Constructor] of Object.entries({
  EffectComposer,
  GTAOPass,
  UnrealBloomPass,
  SMAAPass,
  OutputPass,
  RoomEnvironment,
}))
  modules[name] = { [name]: Constructor };
const exports = {};
Function(
  'require',
  'exports',
  'console',
  outputText,
)(
  (id) => {
    if (id === './graphics-settings') return settingsModule;
    const module = modules[id] ?? modules[id.split('/').at(-1).replace('.js', '')];
    assert(module, `Unexpected production dependency: ${id}`);
    return module;
  },
  exports,
  { warn: (...args) => warnings.push(args) },
);

async function createRig({
  dpr = 1,
  sampleSupport = [8, 4, 2],
  depthSampleSupport = [8, 4, 2],
  maxSamples = 8,
  maxAnisotropy = 8,
  initialSettings,
  skyPromise,
  waitForReady = true,
} = {}) {
  const targetStart = renderTargets.length,
    roomStart = roomEnvironments.length,
    materialStart = optimizedMaterials.length,
    warningStart = warnings.length;
  const skyTexture = skyPromise ? undefined : new Texture();
  const skyLoad = { promise: skyPromise ?? Promise.resolve(skyTexture), calls: 0 };
  const view = { devicePixelRatio: dpr };
  const gl = {
    RENDERBUFFER: 0x8d41,
    RGBA16F: 0x881a,
    DEPTH_COMPONENT24: 0x81a6,
    SAMPLES: 0x80a9,
    getInternalformatParameter(target, format, parameter) {
      assert.equal(target, this.RENDERBUFFER);
      assert.equal(parameter, this.SAMPLES);
      assert([this.RGBA16F, this.DEPTH_COMPONENT24].includes(format));
      const support = format === this.RGBA16F ? sampleSupport : depthSampleSupport;
      return support === null ? null : Int32Array.from(support);
    },
  };
  const renderer = {
    capabilities: { maxSamples, maxTextureSize: 8192, getMaxAnisotropy: () => maxAnisotropy },
    shadowMap: { enabled: true, type: three.PCFShadowMap, needsUpdate: false },
    toneMappingExposure: 1.08,
    toneMapping: three.ACESFilmicToneMapping,
    getContext() {
      return gl;
    },
    setPixelRatio(ratio) {
      this.ratio = ratio;
    },
    setSize(width, height) {
      this.buffer = [Math.floor(width * this.ratio), Math.floor(height * this.ratio)];
    },
  };
  const texture = new Texture();
  const material = { map: texture, transparent: false, alphaTest: 0, needsUpdate: false };
  const shadowMap = new Pass();
  shadowMap.depthTexture = new Pass();
  const shadowPass = new Pass();
  const shadow = {
    mapSize: new Vector2(4096, 4096),
    map: shadowMap,
    mapPass: shadowPass,
    getFrameExtents: () => new Vector2(1, 1),
    needsUpdate: false,
  };
  const scene = {
    backgroundRotation: {},
    environmentRotation: {},
    fog: new FogExp2('#142033', 0.0095),
    traverse(visit) {
      visit({ isMesh: true, material, visible: true });
      visit({ isLight: true, shadow });
    },
  };
  const host = { dataset: {}, ownerDocument: { defaultView: view } };
  const camera = {};
  pendingSkyLoads.push(skyLoad);
  const graphics = exports.createGarageRendering(renderer, scene, camera, host);
  if (initialSettings) graphics.setSettings(initialSettings);
  const composer = latestComposer,
    pmrem = pmremGenerators.at(-1);
  if (waitForReady) await graphics.ready;
  const beauty = composer.passes.find((pass) => pass instanceof SceneRenderPass);
  assert(beauty, 'The scene must include an independently configured geometry pass');
  assert.equal(beauty.scene, scene);
  assert.equal(beauty.camera, camera);
  const ao = composer.passes.find((pass) => pass instanceof GTAOPass);
  const bloom = composer.passes.find((pass) => pass instanceof UnrealBloomPass);
  const smaa = composer.passes.find((pass) => pass instanceof SMAAPass);
  assert(ao && bloom, 'The scene must include depth shading and bloom');
  return {
    graphics,
    renderer,
    composer,
    beauty,
    ao,
    bloom,
    smaa,
    view,
    scene,
    texture,
    material,
    shadow,
    shadowMap,
    shadowPass,
    skyTexture,
    skyLoad,
    pmrem,
    rooms: () => roomEnvironments.slice(roomStart),
    lightingMaterials: () => optimizedMaterials.slice(materialStart),
    warnings: () => warnings.slice(warningStart),
    targets: () => renderTargets.slice(targetStart),
  };
}

function assertFullEffects({ ao, bloom, smaa }, context) {
  assert.equal(ao.enabled, true, `Depth shading must stay enabled ${context}`);
  assert.equal(bloom.enabled, true, `Bloom must stay enabled ${context}`);
  if (smaa) assert.equal(smaa.enabled, true, `Edge smoothing must stay enabled ${context}`);
}

await test('window width preserves full effects and the fixed 60% scene resolution', async () => {
  const rig = await createRig();
  try {
    for (const width of [1280, 699, 700, 578, 390, 1280]) {
      rig.graphics.resize(width, 762);
      assertFullEffects(rig, `at width ${width}`);
      assert.equal(rig.renderer.ratio, 0.6);
      assert.equal(rig.composer.ratio, 0.6);
      assert.deepEqual(rig.renderer.buffer, [Math.floor(width * 0.6), Math.floor(762 * 0.6)]);
      assert.deepEqual(rig.composer.size, [width, 762]);
      assert.deepEqual(rig.beauty.size, [width * 0.6, 762 * 0.6]);
      const before = [rig.ao.renders, rig.bloom.renders];
      rig.graphics.render();
      assert.deepEqual(
        [rig.ao.renders, rig.bloom.renders],
        before.map((count) => count + 1),
      );
    }
  } finally {
    rig.graphics.dispose();
  }
});

await test('native display density controls scene resolution and follows display changes', async () => {
  const rig = await createRig();
  try {
    rig.graphics.resize(1280, 720);
    for (const dpr of [1, 1.25, 2]) {
      rig.view.devicePixelRatio = dpr;
      rig.graphics.render();
      const expectedRatio = dpr * 0.6;
      assert.equal(rig.renderer.ratio, expectedRatio);
      assert.equal(rig.composer.ratio, expectedRatio);
      assert.deepEqual(rig.renderer.buffer, [
        Math.floor(1280 * expectedRatio),
        Math.floor(720 * expectedRatio),
      ]);
      assert.deepEqual(rig.composer.size, [1280, 720]);
      rig.graphics.resize(720, 480);
      assert.deepEqual(rig.renderer.buffer, [
        Math.floor(720 * expectedRatio),
        Math.floor(480 * expectedRatio),
      ]);
      rig.graphics.resize(1280, 720);
    }
    for (const unavailableOrReduced of [undefined, 0.8]) {
      rig.view.devicePixelRatio = unavailableOrReduced;
      rig.graphics.render();
      assert.equal(
        rig.renderer.ratio,
        0.6,
        'Unavailable or sub-unit display density uses the fixed 60% scale',
      );
      assert.deepEqual(rig.renderer.buffer, [Math.floor(1280 * 0.6), Math.floor(720 * 0.6)]);
    }
  } finally {
    rig.graphics.dispose();
  }
});

await test('HDR multisampling respects both attachments and the device sample limit', async () => {
  for (const [options, expected] of [
    [{}, 4],
    [{ sampleSupport: [8, 2] }, 2],
    [{ sampleSupport: [8] }, 0],
    [{ sampleSupport: [] }, 0],
    [{ sampleSupport: null }, 0],
    [{ sampleSupport: [4, 2], depthSampleSupport: [8, 2] }, 2],
    [{ sampleSupport: [4], depthSampleSupport: [2] }, 0],
    [{ depthSampleSupport: null }, 0],
    [{ maxSamples: 2 }, 2],
    [{ maxSamples: 0 }, 0],
  ]) {
    const rig = await createRig(options);
    try {
      assert.equal(rig.beauty.samples, expected, JSON.stringify(options));
      for (const target of [rig.composer.target, rig.composer.otherTarget]) {
        assert.equal(target.samples, 0, 'Fullscreen effects remain single-sample');
        assert.equal(target.depthBuffer, false, 'Fullscreen effects allocate no scene depth');
        assert.equal(target.type, three.HalfFloatType, 'Postprocessing retains HDR precision');
      }
    } finally {
      rig.graphics.dispose();
    }
  }
});

await test('edge smoothing follows the scaled scene resolution and releases its resources', async () => {
  const rig = await createRig({ dpr: 2 });
  try {
    assert.deepEqual(
      rig.composer.passes.map((pass) => pass.constructor.name),
      ['SceneRenderPass', 'GTAOPass', 'UnrealBloomPass', 'SMAAPass', 'OutputPass'],
    );
    rig.graphics.resize(1280, 720);
    assert.deepEqual(rig.smaa.size, [1280 * 1.2, 720 * 1.2]);
    rig.graphics.render();
    assert.equal(rig.smaa.enabled, true);
    assert.equal(rig.smaa.renders, 1);
    rig.graphics.resize(390, 762);
    assert.deepEqual(rig.smaa.size, [390 * 1.2, 762 * 1.2]);
    rig.graphics.render();
    assert.equal(rig.smaa.renders, 2);
  } finally {
    rig.graphics.dispose();
  }
  assert.equal(rig.smaa.disposed, true);
});

await test('sustained slow frames cannot permanently downgrade scene effects', async () => {
  const rig = await createRig();
  try {
    rig.graphics.resize(1280, 720);
    let now = 1000;
    // Legacy timing arguments reproduce the original 150-frame warmup followed
    // by 120 slow samples. Fixed-quality renderers simply ignore these arguments.
    rig.graphics.render(now, true);
    for (const frameMs of [33, 100, 16]) {
      for (let frame = 0; frame < 600; frame++) {
        now += frameMs;
        rig.graphics.render(now, true);
      }
      assertFullEffects(rig, `after sustained ${frameMs} ms frames`);
    }
    assert.equal(rig.ao.renders, 1801);
    assert.equal(rig.bloom.renders, 1801);
  } finally {
    rig.graphics.dispose();
  }
});

await test('live settings change the real pipeline and survive resizing and display changes', async () => {
  const rig = await createRig({ dpr: 2 });
  try {
    rig.graphics.prepare();
    rig.graphics.resize(1280, 720);
    const custom = {
      ...defaultGraphics,
      renderScale: 0.4,
      antialias: 'off',
      ao: false,
      bloom: false,
      aoIntensity: 0.65,
      aoRadius: 0.8,
      bloomStrength: 0.3,
      bloomRadius: 0.7,
      bloomThreshold: 1.1,
      exposure: 1.4,
      toneMapping: 'neutral',
      environmentIntensity: 0.5,
      fogDensity: 0.02,
      shadows: 'off',
      anisotropy: 2,
    };
    rig.graphics.setSettings(custom);
    function assertCustom() {
      assert.equal(rig.renderer.ratio, rig.view.devicePixelRatio * 0.4);
      assert.equal(rig.composer.ratio, rig.renderer.ratio);
      assert.equal(rig.ao.enabled, false);
      assert.equal(rig.bloom.enabled, false);
      assert.equal(rig.smaa.enabled, false);
      assert.equal(rig.beauty.samples, 0);
      assert.equal(rig.composer.target.samples, 0);
      assert.equal(rig.ao.blendIntensity, 0.65);
      assert.equal(rig.ao.parameters.radius, 0.8);
      assert.equal(rig.bloom.strength, 0.3);
      assert.equal(rig.bloom.radius, 0.7);
      assert.equal(rig.bloom.threshold, 1.1);
      assert.equal(rig.renderer.toneMappingExposure, 1.4);
      assert.equal(rig.renderer.toneMapping, three.NeutralToneMapping);
      assert.equal(rig.scene.environmentIntensity, 0.5);
      assert.equal(rig.scene.fog.density, 0.02);
      assert.equal(rig.renderer.shadowMap.enabled, false);
      assert.equal(rig.texture.anisotropy, 2);
    }
    assertCustom();
    for (const width of [390, 700, 1280]) {
      rig.graphics.resize(width, 720);
      rig.graphics.render();
      assert.deepEqual(rig.renderer.buffer, [Math.floor(width * 0.8), 576]);
      assertCustom();
    }
    rig.view.devicePixelRatio = 1.25;
    rig.graphics.render();
    assertCustom();
    assert.deepEqual(rig.renderer.buffer, [640, 360]);
    rig.graphics.setSettings(defaultGraphics);
    assertFullEffects(rig, 'after resetting settings');
    assert.equal(rig.renderer.ratio, 0.75);
    assert.equal(rig.renderer.toneMappingExposure, 1.08);
    assert.equal(rig.renderer.toneMapping, three.ACESFilmicToneMapping);
    assert.equal(rig.scene.fog.density, 0.0095);
    assert.equal(rig.renderer.shadowMap.enabled, true);
  } finally {
    rig.graphics.dispose();
  }
});

await test('AA switching changes only scene samples and preserves fullscreen buffers and passes', async () => {
  const rig = await createRig();
  try {
    rig.graphics.resize(1280, 720);
    const originalPasses = [...rig.composer.passes];
    const postTargets = [rig.composer.target, rig.composer.otherTarget];
    assert.equal(rig.beauty.samples, 4);
    for (const [antialias, samples, smoothing] of [
      ['smaa', 0, true],
      ['off', 0, false],
      ['msaa', 4, false],
      ['both', 4, true],
      ['off', 0, false],
      ['both', 4, true],
    ]) {
      const previousSamples = rig.beauty.samples;
      const previousUpdates = rig.beauty.sampleUpdates.length;
      rig.graphics.setSettings({ ...defaultGraphics, antialias });
      assert.equal(rig.beauty.samples, samples);
      assert.equal(
        rig.beauty.sampleUpdates.length,
        previousUpdates + (previousSamples === samples ? 0 : 1),
        'Only a changed sample count requests replacement scene attachments',
      );
      assert.equal(rig.smaa.enabled, smoothing);
      assert.deepEqual(rig.composer.passes, originalPasses);
      assert.equal(rig.composer.target, postTargets[0]);
      assert.equal(rig.composer.otherTarget, postTargets[1]);
      assert.equal(rig.composer.resets ?? 0, 0, 'AA never resets the postprocessing composer');
      assert.equal(rig.targets().length, 2, 'AA does not allocate replacement fullscreen buffers');
      for (const target of postTargets) {
        assert.equal(target.samples, 0);
        assert.equal(target.depthBuffer, false);
        assert.equal(target.disposeCount ?? 0, 0);
      }
    }
    assert.deepEqual(rig.beauty.sampleUpdates, [0, 4, 0, 4]);
    rig.graphics.setSettings({ ...defaultGraphics, exposure: 1.5, ao: false });
    assert.deepEqual(
      rig.beauty.sampleUpdates,
      [0, 4, 0, 4],
      'Uniform changes do not rebuild scene attachments',
    );
    assert.equal(
      rig.composer.target,
      postTargets[0],
      'Uniform changes do not rebuild postprocessing buffers',
    );
    assert.equal(rig.composer.otherTarget, postTargets[1]);
  } finally {
    rig.graphics.dispose();
  }
  for (const target of rig.targets()) assert.equal(target.disposeCount, 1);
  for (const pass of rig.composer.passes) assert.equal(pass.disposeCount, 1);
  assert.equal(rig.composer.disposeCount, 1);
  const count = rig.targets().length;
  const sampleUpdates = [...rig.beauty.sampleUpdates];
  rig.graphics.setSettings({ ...defaultGraphics, antialias: 'off' });
  assert.equal(rig.targets().length, count, 'Disposed renderers must not allocate new targets');
  assert.deepEqual(
    rig.beauty.sampleUpdates,
    sampleUpdates,
    'Disposed renderers do not reconfigure scene attachments',
  );
});

await test('late assets preserve chosen settings and shadow sizes restore from authored dimensions', async () => {
  const custom = {
    ...defaultGraphics,
    environmentIntensity: 0.6,
    shadows: 'sharp',
    shadowResolution: 0.5,
    anisotropy: 16,
    toneMapping: 'none',
  };
  const rig = await createRig({ initialSettings: custom, maxAnisotropy: 4 });
  try {
    assert.equal(
      rig.scene.environmentIntensity,
      0.6,
      'Loading the authored sky must retain settings',
    );
    assert.deepEqual(rig.lightingMaterials(), []);
    rig.graphics.prepare();
    assert.deepEqual(
      rig.lightingMaterials(),
      [rig.material],
      'Late scene materials receive the direct-light optimization',
    );
    assert.equal(rig.renderer.shadowMap.type, three.BasicShadowMap);
    assert.equal(rig.renderer.toneMapping, three.NoToneMapping);
    assert.equal(rig.renderer.shadowMap.needsUpdate, true);
    assert.deepEqual([rig.shadow.mapSize.x, rig.shadow.mapSize.y], [2048, 2048]);
    assert.equal(rig.shadowMap.disposeCount, 1);
    assert.equal(rig.shadowMap.depthTexture.disposeCount, 1);
    assert.equal(rig.shadowPass.disposeCount, 1);
    assert.equal(rig.shadow.map, null);
    assert.equal(rig.texture.anisotropy, 4, 'Texture detail must respect GPU support');
    assert.equal(rig.texture.minFilter, 'authored-min');
    assert.equal(rig.texture.magFilter, 'authored-mag');
    rig.graphics.prepare();
    assert.deepEqual(
      rig.lightingMaterials(),
      [rig.material, rig.material],
      'Rescanning applies the idempotent hook to discovered materials',
    );
    assert.deepEqual([rig.shadow.mapSize.x, rig.shadow.mapSize.y], [2048, 2048]);
    assert.equal(rig.shadowMap.disposeCount, 1, 'Rescanning must not dispose a retired map again');
    rig.graphics.setSettings(defaultGraphics);
    assert.deepEqual([rig.shadow.mapSize.x, rig.shadow.mapSize.y], [4096, 4096]);
    assert.equal(rig.renderer.shadowMap.type, three.PCFShadowMap);
  } finally {
    rig.graphics.dispose();
  }
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

await test('authored sky loading never builds a fallback and owns its final GPU resources', async () => {
  const load = deferred(),
    texture = new Texture();
  const rig = await createRig({
    skyPromise: load.promise,
    waitForReady: false,
    initialSettings: { ...defaultGraphics, environmentIntensity: 0.6 },
  });
  try {
    assert.equal(rig.skyLoad.calls, 1);
    assert.equal(rig.rooms().length, 0, 'Pending sky loads allocate no fallback environment');
    assert.equal(rig.pmrem.sceneCalls.length, 0);
    assert.equal(rig.pmrem.equirectangularCalls.length, 0);
    load.resolve(texture);
    await rig.graphics.ready;
    assert.equal(rig.rooms().length, 0, 'Successful sky loads never construct a room environment');
    assert.equal(rig.pmrem.sceneCalls.length, 0);
    assert.equal(rig.pmrem.equirectangularCalls.length, 1);
    const generated = rig.pmrem.equirectangularCalls[0];
    assert.equal(generated.texture, texture);
    assert.equal(rig.scene.environment, generated.target.texture);
    assert.equal(rig.scene.background, texture);
    assert.equal(rig.scene.backgroundIntensity, 1);
    assert.equal(rig.scene.backgroundBlurriness, 0.035);
    assert.equal(rig.scene.backgroundRotation.y, 0.7);
    assert.equal(rig.scene.environmentRotation.y, 0.7);
    assert.equal(rig.scene.environmentIntensity, 0.6);
    assert.equal(generated.target.disposeCount ?? 0, 0);
    assert.equal(texture.disposeCount ?? 0, 0);
    assert.deepEqual(rig.warnings(), []);
  } finally {
    rig.graphics.dispose();
  }
  assert.equal(rig.pmrem.equirectangularCalls[0].target.disposeCount, 1);
  assert.equal(texture.disposeCount, 1);
  assert.equal(rig.pmrem.disposeCount, 1);
  assert.equal(rig.scene.environment, null);
  assert.equal(rig.scene.background, null);
});

await test('sky failure lazily builds the lighting fallback and disposes its temporary scene', async () => {
  const load = deferred(),
    failure = new Error('night sky request failed');
  const rig = await createRig({ skyPromise: load.promise, waitForReady: false });
  const originalBackground = rig.scene.background;
  try {
    assert.equal(rig.rooms().length, 0);
    assert.equal(rig.pmrem.sceneCalls.length, 0);
    load.reject(failure);
    await rig.graphics.ready;
    assert.equal(rig.rooms().length, 1);
    assert.equal(rig.pmrem.sceneCalls.length, 1);
    assert.equal(rig.pmrem.equirectangularCalls.length, 0);
    const generated = rig.pmrem.sceneCalls[0];
    assert.equal(generated.scene, rig.rooms()[0]);
    assert.equal(generated.sigma, 0.06);
    assert.equal(generated.scene.disposeCount, 1, 'The fallback room is temporary');
    assert.equal(generated.target.disposeCount ?? 0, 0, 'Its generated lighting stays live');
    assert.equal(rig.scene.environment, generated.target.texture);
    assert.equal(rig.scene.background, originalBackground);
    assert.deepEqual(rig.warnings(), [['Using the garage lighting fallback.', failure]]);
  } finally {
    rig.graphics.dispose();
  }
  assert.equal(rig.pmrem.sceneCalls[0].target.disposeCount, 1);
  assert.equal(rig.rooms()[0].disposeCount, 1);
  assert.equal(rig.pmrem.disposeCount, 1);
});

await test('a sky that resolves after disposal is released without reviving the scene or PMREM', async () => {
  const load = deferred(),
    texture = new Texture();
  const rig = await createRig({ skyPromise: load.promise, waitForReady: false });
  rig.graphics.dispose();
  load.resolve(texture);
  await rig.graphics.ready;
  assert.equal(texture.disposeCount, 1);
  assert.equal(rig.pmrem.disposeCount, 1);
  assert.equal(rig.pmrem.equirectangularCalls.length, 0);
  assert.equal(rig.pmrem.sceneCalls.length, 0);
  assert.equal(rig.rooms().length, 0);
  assert.equal(rig.scene.environment, null);
  assert.equal(rig.scene.background, null);
  assert.deepEqual(rig.warnings(), []);
  assert.equal(rig.targets().length, 2);
  for (const target of rig.targets()) assert.equal(target.disposeCount, 1);
  for (const pass of rig.composer.passes) assert.equal(pass.disposeCount, 1);
});

await test('a sky that rejects after disposal cannot allocate fallback resources', async () => {
  const load = deferred();
  const rig = await createRig({ skyPromise: load.promise, waitForReady: false });
  rig.graphics.dispose();
  load.reject(new Error('late sky failure'));
  await rig.graphics.ready;
  assert.equal(rig.pmrem.disposeCount, 1);
  assert.equal(rig.pmrem.sceneCalls.length, 0);
  assert.equal(rig.pmrem.equirectangularCalls.length, 0);
  assert.equal(rig.rooms().length, 0);
  assert.equal(rig.scene.environment, null);
  assert.equal(rig.scene.background, null);
  assert.deepEqual(rig.warnings(), []);
  for (const target of rig.targets()) assert.equal(target.disposeCount, 1);
  for (const pass of rig.composer.passes) assert.equal(pass.disposeCount, 1);
});

await test('prewarming delegates to the beauty pass and preserves pending work and failures', async () => {
  const rig = await createRig();
  try {
    const compilation = deferred();
    rig.beauty.compilation = compilation.promise;
    assert.equal(rig.graphics.compile(), compilation.promise);
    assert.equal(rig.beauty.compileRenderer, rig.renderer);
    assert.equal(rig.beauty.compilations, 1);
    assert.equal(rig.beauty.renders, 0, 'Prewarming must not draw an incomplete frame');
    const failure = new Error('Compile failed');
    const rejected = assert.rejects(compilation.promise, (error) => error === failure);
    compilation.reject(failure);
    await rejected;
    rig.graphics.dispose();
    await rig.graphics.compile();
    assert.equal(rig.beauty.compilations, 1, 'Disposed passes cannot queue more shaders');
  } finally {
    if (!rig.beauty.disposed) rig.graphics.dispose();
  }
});
