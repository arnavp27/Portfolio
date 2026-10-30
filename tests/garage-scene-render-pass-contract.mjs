import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { SceneRenderPass } from '../src/lib/garage/scene-render-pass.ts';

// Real passes, materials and targets; only the GPU boundary is replaced.
function rig({ autoClear = true, failDraw = 0 } = {}) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    previousTarget = new THREE.WebGLRenderTarget(4, 4),
    read = new THREE.WebGLRenderTarget(320, 180, { depthBuffer: false }),
    write = read.clone(),
    draws = [],
    clears = [];
  let target = previousTarget,
    face = 2,
    mip = 1,
    alpha = 0.7;
  const color = new THREE.Color('#193a57');
  const renderer = {
    autoClear,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: false,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.08,
    outputColorSpace: THREE.SRGBColorSpace,
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    getClearColor: (destination) => destination.copy(color),
    getClearAlpha: () => alpha,
    setClearColor(value, nextAlpha = 1) {
      color.set(value);
      alpha = nextAlpha;
    },
    setClearAlpha(value) {
      alpha = value;
    },
    setRenderTarget(next, nextFace = 0, nextMip = 0) {
      target = next;
      face = nextFace;
      mip = nextMip;
    },
    clear(...flags) {
      clears.push({ target, flags });
    },
    clearDepth() {
      clears.push({ target, depthOnly: true });
    },
    render(object, view) {
      draws.push({ object, view, target, autoClear: this.autoClear });
      if (draws.length === failDraw) throw new Error('simulated GPU failure');
    },
  };
  const initial = { color: color.clone(), alpha, autoClear };
  function assertRestored() {
    assert.equal(renderer.getRenderTarget(), previousTarget);
    assert.equal(renderer.getActiveCubeFace(), 2);
    assert.equal(renderer.getActiveMipmapLevel(), 1);
    assert.equal(renderer.autoClear, initial.autoClear);
    assert.deepEqual(renderer.getClearColor(new THREE.Color()), initial.color);
    assert.equal(renderer.getClearAlpha(), initial.alpha);
    assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
    assert.equal(renderer.toneMappingExposure, 1.08);
    assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace);
  }
  return { scene, camera, renderer, read, write, draws, clears, assertRestored };
}

await test('scene MSAA/depth resolve into an exact nonblended copy in the composer read buffer', () => {
  const r = rig();
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  pass.setSize(320, 180);
  pass.clearDepth = true;
  pass.render(r.renderer, r.write, r.read, 1 / 60, false);
  assert.equal(pass.needsSwap, false);
  assert.equal(pass.renderToScreen, false);
  assert.equal(r.draws.length, 2);
  const [beauty, copy] = r.draws;
  assert.equal(beauty.object, r.scene);
  assert.equal(beauty.view, r.camera);
  assert.notEqual(beauty.target, r.read);
  assert.equal(beauty.target.width, 320);
  assert.equal(beauty.target.height, 180);
  assert.equal(beauty.target.samples, 4);
  assert.equal(beauty.target.texture.type, THREE.HalfFloatType);
  assert.equal(beauty.target.depthBuffer, true);
  assert.equal(beauty.target.resolveDepthBuffer, false);
  assert.equal(copy.target, r.read);
  assert.equal(copy.target.samples, 0);
  assert.equal(copy.target.depthBuffer, false);
  const material = copy.object.material;
  assert.equal(material.uniforms.tDiffuse.value, beauty.target.texture);
  assert.equal(material.uniforms.opacity.value, 1);
  assert.equal(material.fragmentShader, CopyShader.fragmentShader);
  assert.equal(material.vertexShader, CopyShader.vertexShader);
  assert.equal(material.blending, THREE.NoBlending);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.toneMapped, false);
  assert(r.draws.every((draw) => draw.autoClear === false));
  assert(r.clears.every((clear) => clear.target === beauty.target));
  r.assertRestored();
  pass.dispose();
});

await test('sample changes rebuild attachments while zero-sample rendering still has scene depth', () => {
  const r = rig({ autoClear: false });
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  pass.setSize(320, 180);
  pass.render(r.renderer, r.write, r.read, 0, false);
  const original = r.draws[0].target;
  let retired = 0;
  original.addEventListener('dispose', () => retired++);
  pass.setSamples(4);
  assert.equal(retired, 0, 'An unchanged sample count does not reallocate');
  pass.setSamples(0);
  assert.equal(retired, 1);
  pass.render(r.renderer, r.write, r.read, 0, false);
  const replacement = r.draws[2].target;
  assert.notEqual(replacement, original);
  assert.deepEqual([replacement.width, replacement.height], [320, 180]);
  assert.equal(replacement.samples, 0);
  assert.equal(replacement.depthBuffer, true);
  assert.notEqual(replacement, r.read);
  pass.setSize(640, 360);
  assert.deepEqual([replacement.width, replacement.height], [640, 360]);
  pass.render(r.renderer, r.write, r.read, 0, false);
  assert.equal(r.draws[4].target, replacement);
  r.assertRestored();
  pass.dispose();
});

await test('standalone screen output performs tone mapping and colour encoding once', () => {
  const r = rig();
  const pass = new SceneRenderPass(r.scene, r.camera, 2);
  pass.renderToScreen = true;
  pass.render(r.renderer, r.write, r.read, 0, false);
  const [beauty, output] = r.draws;
  assert.equal(beauty.target.samples, 2);
  assert.equal(output.target, null);
  assert.equal(output.object.material.uniforms.tDiffuse.value, beauty.target.texture);
  assert.equal(output.object.material.uniforms.toneMappingExposure.value, 1.08);
  assert('ACES_FILMIC_TONE_MAPPING' in output.object.material.defines);
  assert('SRGB_TRANSFER' in output.object.material.defines);
  assert.equal(pass.renderToScreen, true);
  r.assertRestored();
  pass.dispose();
});

await test('failed scene/copy draws restore render target, clear state, override and output mode', () => {
  for (const failDraw of [1, 2]) {
    const r = rig({ failDraw });
    const originalOverride = new THREE.MeshBasicMaterial();
    r.scene.overrideMaterial = originalOverride;
    const pass = new SceneRenderPass(r.scene, r.camera, 4);
    pass.clearColor = new THREE.Color('#ff6600');
    pass.clearAlpha = 0.2;
    pass.overrideMaterial = new THREE.MeshNormalMaterial();
    assert.throws(
      () => pass.render(r.renderer, r.write, r.read, 0, false),
      /simulated GPU failure/,
    );
    assert.equal(r.scene.overrideMaterial, originalOverride);
    assert.equal(pass.renderToScreen, false);
    r.assertRestored();
    pass.dispose();
  }
});

await test('owned targets and copy/output materials are disposed once and cannot restart afterward', () => {
  const r = rig();
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  pass.render(r.renderer, r.write, r.read, 0, false);
  pass.renderToScreen = true;
  pass.render(r.renderer, r.write, r.read, 0, false);
  const resources = [r.draws[0].target, r.draws[1].object.material, r.draws[3].object.material];
  const counts = resources.map((resource) => {
    const counter = { value: 0 };
    resource.addEventListener('dispose', () => counter.value++);
    return counter;
  });
  pass.dispose();
  pass.dispose();
  pass.setSamples(0);
  pass.setSize(20, 10);
  pass.render(r.renderer, r.write, r.read, 0, false);
  assert.deepEqual(
    counts.map((counter) => counter.value),
    [1, 1, 1],
  );
  assert.equal(r.draws.length, 4);
  r.assertRestored();
});

await test('shader preparation binds the beauty target and restores it before compilation settles', async () => {
  const r = rig();
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  pass.setSize(320, 180);
  pass.render(r.renderer, r.write, r.read, 0, false);
  const beautyTarget = r.draws[0].target;
  const compiledMaterials = new Set([new THREE.MeshStandardMaterial()]);
  let resolveCompilation;
  const deferred = new Promise((resolve) => {
    resolveCompilation = resolve;
  });
  let calls = 0;
  r.renderer.compileAsync = function (scene, camera) {
    calls++;
    assert.equal(this, r.renderer);
    assert.equal(scene, r.scene);
    assert.equal(camera, r.camera);
    assert.equal(this.getRenderTarget(), beautyTarget);
    assert.equal(this.getActiveCubeFace(), 0);
    assert.equal(this.getActiveMipmapLevel(), 0);
    return deferred;
  };

  const compilation = pass.compileAsync(r.renderer);
  assert.equal(calls, 1);
  r.assertRestored();
  assert.equal(r.draws.length, 2, 'Preparation does not draw another frame');
  // A caller may render elsewhere while shaders are compiling. Settling must not rebind state.
  r.renderer.setRenderTarget(r.write, 3, 2);
  resolveCompilation(compiledMaterials);
  assert.equal(await compilation, compiledMaterials);
  assert.equal(r.renderer.getRenderTarget(), r.write);
  assert.equal(r.renderer.getActiveCubeFace(), 3);
  assert.equal(r.renderer.getActiveMipmapLevel(), 2);
  pass.dispose();
  for (const material of compiledMaterials) material.dispose();
});

await test('asynchronous shader preparation failure preserves the error and immediate target restoration', async () => {
  const r = rig();
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  const failure = new Error('shader compiler rejected');
  let rejectCompilation;
  r.renderer.compileAsync = () =>
    new Promise((_, reject) => {
      rejectCompilation = reject;
    });

  const compilation = pass.compileAsync(r.renderer);
  r.assertRestored();
  rejectCompilation(failure);
  await assert.rejects(compilation, (error) => error === failure);
  r.assertRestored();
  pass.dispose();
});

await test('synchronous shader compiler failure becomes a rejection after restoring renderer state', async () => {
  const r = rig({ autoClear: false });
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  const failure = new Error('shader compiler threw');
  r.renderer.compileAsync = () => {
    throw failure;
  };

  let compilation;
  assert.doesNotThrow(() => {
    compilation = pass.compileAsync(r.renderer);
  });
  r.assertRestored();
  await assert.rejects(compilation, (error) => error === failure);
  r.assertRestored();
  pass.dispose();
});

await test('disposed scene passes skip shader preparation without accessing the renderer', async () => {
  const r = rig();
  const pass = new SceneRenderPass(r.scene, r.camera, 4);
  pass.dispose();
  const unavailableRenderer = new Proxy(r.renderer, {
    get() {
      assert.fail('Disposed preparation must not access the renderer');
    },
  });
  assert.equal(await pass.compileAsync(unavailableRenderer), undefined);
  assert.equal(r.draws.length, 0);
  r.assertRestored();
});
