import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import ts from 'typescript';
import { random } from '../src/lib/graphics/textures.ts';
import { group } from '../src/lib/garage/city/types.ts';

const exports = {};
const { outputText } = ts.transpileModule(
  readFileSync(new URL('../src/lib/garage/foliage.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
);
const dependencies = {
  three: THREE,
  'three/addons/utils/BufferGeometryUtils.js': { mergeGeometries },
  '../graphics/textures': { random },
  './city/types': { group },
};
Function(
  'exports',
  'require',
  outputText,
)(exports, (name) => {
  assert(name in dependencies, `Unexpected dependency: ${name}`);
  return dependencies[name];
});
const { createFoliage, clearFoliageConstructionCache } = exports;

await test('foliage construction cache eviction drops reuse without disposing retained plant resources', () => {
  const root = new THREE.Group();
  const geos = new Set(),
    mats = new Set(),
    maps = new Set();
  const kit = {
    root,
    geos,
    mats,
    maps,
    texture() {
      const texture = new THREE.Texture();
      maps.add(texture);
      return texture;
    },
    mat(color, roughness = 1) {
      const material = new THREE.MeshStandardMaterial({ color, roughness });
      mats.add(material);
      return material;
    },
    mesh(geometry, material, position, parent = root) {
      geos.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    },
  };
  const first = createFoliage(kit);
  const originalGeos = [...geos],
    originalMats = [...mats],
    originalMaps = [...maps];
  const originalResources = [...originalGeos, ...originalMats, ...originalMaps];
  let disposed = 0;
  for (const resource of originalResources) resource.addEventListener('dispose', () => disposed++);
  createFoliage(kit);
  assert.deepEqual([...geos], originalGeos, 'Construction shares one geometry cache');
  assert.deepEqual([...mats], originalMats);
  assert.deepEqual([...maps], originalMaps);
  first.plant(root, [1, 2, 3]);
  const live = [];
  root.traverse((object) => {
    if (object.geometry) live.push([object, object.geometry, object.material]);
  });
  assert(live.length > 0);
  assert.equal(clearFoliageConstructionCache(geos), true);
  assert.equal(clearFoliageConstructionCache(geos), false, 'Repeated eviction is harmless');
  assert.equal(disposed, 0, 'Cache eviction does not dispose world-owned resources');
  for (const [object, geometry, material] of live) {
    assert.equal(object.geometry, geometry);
    assert.equal(object.material, material);
    assert(geos.has(geometry));
    assert(mats.has(material));
  }
  createFoliage(kit);
  assert.equal(
    geos.size,
    originalGeos.length * 2,
    'A later construction cannot reuse the evicted cache',
  );
  assert.equal(mats.size, originalMats.length * 2);
  assert.equal(maps.size, originalMaps.length * 2);
  assert.equal(disposed, 0);
  assert.equal(clearFoliageConstructionCache(geos), true);
  for (const resource of [...geos, ...mats, ...maps]) resource.dispose();
  assert.equal(
    disposed,
    originalResources.length,
    'Ownership remains available for normal teardown',
  );
});
