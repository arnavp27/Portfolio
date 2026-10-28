import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import ts from 'typescript';
import { computers } from '../src/lib/garage/computers.ts';
import { createGaragePower } from '../src/lib/garage/power.ts';
import { random } from '../src/lib/graphics/textures.ts';

function production(name, dependencies = {}) {
  const url = new URL(`../src/lib/garage/${name}.ts`, import.meta.url);
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  Function(
    'exports',
    'require',
    outputText,
  )(exports, (name) => {
    assert(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return exports;
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Execute the whole world builder with actual Three geometry and controlled network/font
// boundaries. This catches waterfall requests as well as cleanup of late-arriving assets.
function roomRig({ assemblyError, scene = new THREE.Scene() } = {}) {
  const requests = [],
    tracked = [];
  const track = (resource) => {
    const entry = { resource, disposed: 0 };
    resource.addEventListener('dispose', () => entry.disposed++);
    tracked.push(entry);
    return resource;
  };
  const request = (kind, url, value) => {
    const job = { ...deferred(), kind, url, value };
    requests.push(job);
    return job;
  };
  class TextureLoader {
    load(url, resolve, _progress, reject) {
      const texture = track(new THREE.Texture());
      request('texture', url, texture).promise.then(() => resolve(texture), reject);
      return texture;
    }
  }
  class GLTFLoader {
    async loadAsync(url) {
      const model = new THREE.Group();
      const map = track(new THREE.Texture());
      model.add(
        new THREE.Mesh(
          track(new THREE.BoxGeometry(1, 1, 1)),
          track(new THREE.MeshStandardMaterial({ map })),
        ),
      );
      const value = { scene: model };
      await request('model', url, value).promise;
      return value;
    }
  }
  const savedDocument = globalThis.document;
  globalThis.document = {
    fonts: { load: (font) => request('font', font, []).promise },
  };
  const modules = {
    three: { ...THREE, TextureLoader },
    'three/addons/loaders/GLTFLoader.js': { GLTFLoader },
    'three/addons/geometries/RoundedBoxGeometry.js': { RoundedBoxGeometry },
    'three/addons/utils/BufferGeometryUtils.js': { mergeGeometries },
    '../graphics/textures': { random, canvasTexture: () => track(new THREE.Texture()) },
    './computers': { computers },
    './power': { createGaragePower },
    './foliage': {
      createFoliage() {
        if (assemblyError) throw assemblyError;
        return { plant() {}, vine() {} };
      },
    },
    './environment': {
      buildCourtyard(_scene, _kit, materials) {
        assert(materials, 'Courtyard assembly consumes its already-loaded materials');
        return { traffic: [], vehicleCount: 12, pedestrianCount: 16, animate() {} };
      },
    },
    './city/materials': {
      async createCityMaterials(kit) {
        const texture = track(new THREE.Texture());
        await request('city', 'surfaces', {}).promise;
        kit.maps.add(texture);
        return {};
      },
    },
  };
  Object.defineProperty(modules, './loading', { get: () => production('loading') });
  const { buildCameraRoom } = production('world', modules);
  const existing = scene.children[0] ?? new THREE.Group();
  if (!existing.parent) scene.add(existing);
  const promise = buildCameraRoom(scene);
  // Always observe failures immediately, even while assertions inspect pending requests.
  let settled = false;
  const outcome = promise
    .then(
      (world) => ({ world }),
      (error) => ({ error }),
    )
    .then((value) => {
      settled = true;
      return value;
    });
  return {
    requests,
    tracked,
    scene,
    existing,
    outcome,
    get settled() {
      return settled;
    },
    restore() {
      globalThis.document = savedDocument;
    },
    resolveAll() {
      for (const job of requests) job.resolve(job.value);
    },
  };
}

await test('all independent scene asset groups start before any network request finishes', async () => {
  const rig = roomRig();
  try {
    assert.equal(rig.requests.filter((job) => job.kind === 'model').length, 4);
    assert.equal(rig.requests.filter((job) => job.kind === 'city').length, 1);
    assert.equal(rig.requests.filter((job) => job.kind === 'font').length, 3);
    assert.equal(rig.requests.filter((job) => job.url.includes('/textures/')).length, 9);
    assert.equal(rig.requests.filter((job) => job.url.includes('/assets/images/')).length, 3);
    const lastFont = rig.requests.find((job) => job.kind === 'font');
    for (const job of rig.requests) if (job !== lastFont) job.resolve(job.value);
    await flush();
    assert.equal(rig.settled, false, 'Scene text must wait for the actual fonts');
    lastFont.resolve(lastFont.value);
    const { world, error } = await rig.outcome;
    assert.ifError(error);
    assert(world.pickables.length > 0);
    assert.equal(world.vehicleCount, 12);
    assert.equal(world.pedestrianCount, 16);
    assert.equal(world.isComputerOn('kazam'), true);
    world.dispose();
    assert.deepEqual(rig.scene.children, [rig.existing], 'Only owned scene objects are removed');
    assert(
      rig.tracked.every(({ disposed }) => disposed === 1),
      'Loaded assets are disposed once',
    );
    world.dispose();
    assert(
      rig.tracked.every(({ disposed }) => disposed === 1),
      'Disposal is idempotent',
    );
  } finally {
    rig.restore();
  }
});

await test('a failed load surfaces immediately and still releases late assets', async () => {
  const rig = roomRig();
  try {
    const failure = new Error('Texture unavailable');
    const failed = rig.requests.find((job) => job.url.includes('wood_floor_worn-Diffuse'));
    failed.reject(failure);
    await flush();
    assert.equal(rig.settled, true, 'A stalled sibling cannot delay the failed-load recovery');
    const late = rig.requests.find((job) => job.kind === 'model');
    assert(late, 'Furniture starts in parallel with the failed texture');
    for (const job of rig.requests) if (job !== late) job.resolve(job.value);
    await flush();
    assert.equal(rig.settled, true, 'Recovery stays visible while a late model is still pending');
    late.resolve(late.value);
    await flush();
    const { error } = await rig.outcome;
    assert.equal(error, failure);
    assert.deepEqual(rig.scene.children, [rig.existing]);
    assert(
      rig.tracked
        .filter(({ resource }) => resource !== failed.value)
        .every(({ disposed }) => disposed === 1),
      'Every successfully loaded asset is released after another request fails',
    );
  } finally {
    rig.restore();
  }
});

await test('assembly failure releases completed assets and removes its partial scene', async () => {
  const failure = new Error('Cannot create scene detail');
  const rig = roomRig({ assemblyError: failure });
  try {
    rig.resolveAll();
    const { error } = await rig.outcome;
    assert.equal(error, failure);
    assert.deepEqual(rig.scene.children, [rig.existing]);
    assert(rig.tracked.every(({ disposed }) => disposed === 1));
  } finally {
    rig.restore();
  }
});

await test('all city texture channels start together and late failures stay observed', async () => {
  const requests = [];
  class TextureLoader {
    loadAsync(url) {
      const job = { ...deferred(), url, texture: new THREE.Texture() };
      requests.push(job);
      return job.promise;
    }
  }
  const { createCityMaterials } = production('city/materials', {
    three: { ...THREE, TextureLoader },
    '../loading': production('loading'),
  });
  const kit = {
    maps: new Set(),
    mats: new Set(),
    mat: (color) => new THREE.MeshStandardMaterial({ color }),
  };
  let settled = false;
  const result = createCityMaterials(kit).then(
    () => {
      settled = true;
    },
    (error) => {
      settled = true;
      return error;
    },
  );
  assert.equal(requests.length, 21);
  const failure = new Error('First channel unavailable');
  requests[0].reject(failure);
  await flush();
  assert.equal(settled, true, 'The first failed city texture rejects promptly');
  requests[1].reject(new Error('Another channel unavailable'));
  for (const job of requests.slice(2, -1)) job.resolve(job.texture);
  await flush();
  assert.equal(settled, true, 'Late requests do not change the original error');
  requests.at(-1).resolve(requests.at(-1).texture);
  await flush();
  assert.equal(await result, failure);
  assert.equal(kit.maps.size, 19, 'Successful late textures remain registered for cleanup');
  assert.equal(kit.mats.size, 0, 'Incomplete surface sets are not used to assemble materials');
  for (const texture of kit.maps) texture.dispose();
});

await test('stalled scene assets time out and dispose any assets arriving afterward', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rig = roomRig();
  try {
    const stalled = rig.requests.find((job) => job.kind === 'model');
    for (const job of rig.requests) if (job !== stalled) job.resolve(job.value);
    await flush();
    t.mock.timers.tick(89_999);
    await flush();
    assert.equal(rig.settled, false);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(rig.settled, true, 'Startup cannot wait indefinitely for an asset');
    assert.match((await rig.outcome).error.message, /timed out/i);
    assert.deepEqual(rig.scene.children, [rig.existing]);
    stalled.resolve(stalled.value);
    await flush();
    assert(rig.tracked.every(({ disposed }) => disposed === 1));
  } finally {
    rig.restore();
  }
});

await test('late work from a failed attempt cannot remove or dispose a successful retry', async () => {
  const old = roomRig();
  let retry;
  try {
    const failed = old.requests.find((job) => job.url.includes('wood_floor_worn-Diffuse'));
    failed.reject(new Error('First attempt failed'));
    await flush();
    assert.equal(old.settled, true);
    retry = roomRig({ scene: old.scene });
    retry.resolveAll();
    const { world, error } = await retry.outcome;
    assert.ifError(error);
    const retryObjects = [...retry.scene.children];
    old.resolveAll();
    await flush();
    assert.deepEqual(retry.scene.children, retryObjects);
    assert(retry.tracked.every(({ disposed }) => disposed === 0));
    assert(
      old.tracked
        .filter(({ resource }) => resource !== failed.value)
        .every(({ disposed }) => disposed === 1),
    );
    world.dispose();
    assert.deepEqual(retry.scene.children, [retry.existing]);
  } finally {
    retry?.restore();
    old.restore();
  }
});
