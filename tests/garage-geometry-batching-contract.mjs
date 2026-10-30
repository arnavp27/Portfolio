import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  cloneBatchGeometry,
  pruneEmptyStaticGroups,
  releaseUnusedGeometries,
} from '../src/lib/garage/geometry-batching.ts';
import { DisposableSet } from '../src/lib/garage/loading.ts';

function legacyClone(source, transform) {
  return (source.index ? source.toNonIndexed() : source.clone()).applyMatrix4(transform);
}

function sameAttributes(actual, expected) {
  assert.deepEqual(Object.keys(actual.attributes), Object.keys(expected.attributes));
  for (const name of Object.keys(expected.attributes)) {
    const a = actual.getAttribute(name),
      b = expected.getAttribute(name);
    assert.equal(a.itemSize, b.itemSize, `${name} item size`);
    assert.equal(a.normalized, b.normalized, `${name} normalization`);
    assert.deepEqual(a.array, b.array, `${name} values in triangle order`);
  }
}

function byteLength(geometry) {
  return (
    Object.values(geometry.attributes).reduce(
      (total, attribute) => total + attribute.array.byteLength,
      0,
    ) + (geometry.index?.array.byteLength ?? 0)
  );
}

await test('mixed batches retain triangle order, transformed normals, UV seams and material ranges', () => {
  // The box contains coincident positions with different normals/UVs; the cylinder
  // shares vertices along curved faces. The plane represents an unindexed import.
  const sources = [
    new THREE.BoxGeometry(2, 3, 4),
    new THREE.CylinderGeometry(0.4, 0.7, 2, 16),
    new THREE.PlaneGeometry(2, 3, 2, 2).toNonIndexed(),
  ];
  const snapshots = sources.map((source) => source.clone());
  const transforms = [
    new THREE.Matrix4().compose(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, -0.3)),
      new THREE.Vector3(1.3, 0.6, 2),
    ),
    new THREE.Matrix4().makeRotationZ(0.7).setPosition(-2, 1, 4),
    new THREE.Matrix4().makeScale(-2, 1, 0.5).setPosition(3, -1, 2),
  ];
  const legacyParts = sources.map((source, index) => legacyClone(source, transforms[index]));
  const indexedParts = sources.map((source, index) =>
    cloneBatchGeometry(source, transforms[index]),
  );
  const legacy = mergeGeometries(legacyParts, true);
  const indexed = mergeGeometries(indexedParts, true);
  assert(legacy && indexed);
  const expanded = indexed.toNonIndexed();
  sameAttributes(expanded, legacy);
  assert.deepEqual(indexed.groups, legacy.groups, 'Each material range covers the same triangles');
  assert.equal(indexed.index.count, legacy.getAttribute('position').count);
  assert.deepEqual(indexedParts[0].index.array, sources[0].index.array, 'Authored indices survive');
  for (let i = 0; i < sources.length; i++) {
    sameAttributes(sources[i], snapshots[i]);
    assert.deepEqual(sources[i].index?.array, snapshots[i].index?.array, 'Source remains reusable');
  }

  const oldVertices = legacy.getAttribute('position').count,
    newVertices = indexed.getAttribute('position').count,
    oldBytes = byteLength(legacy),
    newBytes = byteLength(indexed);
  assert(newVertices < oldVertices, 'Shared vertices survive instead of expanding every triangle');
  assert(newBytes < oldBytes, 'Index storage is included in the memory reduction');
  console.log(
    `Batch fixture: ${oldVertices} → ${newVertices} vertices; ${oldBytes} → ${newBytes} bytes; identical expanded attributes.`,
  );
  for (const geometry of [
    ...sources,
    ...snapshots,
    ...legacyParts,
    ...indexedParts,
    legacy,
    indexed,
    expanded,
  ])
    geometry.dispose();
});

await test('missing authored normals retain the existing flat-normal fallback', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
  );
  source.setIndex([0, 1, 2, 0, 3, 1]);
  const transform = new THREE.Matrix4().makeScale(2, 1, 0.5).setPosition(1, 2, 3);
  const legacy = legacyClone(source, transform);
  const indexed = cloneBatchGeometry(source, transform);
  // This is the room builder's existing fallback, applied after transformation.
  legacy.computeVertexNormals();
  indexed.computeVertexNormals();
  const expanded = indexed.toNonIndexed();
  sameAttributes(expanded, legacy);
  assert.notDeepEqual(
    Array.from(expanded.getAttribute('normal').array.slice(0, 3)),
    Array.from(expanded.getAttribute('normal').array.slice(9, 12)),
    'The two faces remain flat rather than averaging their shared corners',
  );
  assert.equal(source.getAttribute('normal'), undefined);
  assert.deepEqual(Array.from(source.index.array), [0, 1, 2, 0, 3, 1]);
  for (const geometry of [source, legacy, indexed, expanded]) geometry.dispose();
});

await test('large unindexed batches use indices that cannot wrap at the 16-bit boundary', () => {
  const count = 65538;
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  const indexed = cloneBatchGeometry(source, new THREE.Matrix4());
  assert(indexed.index.array instanceof Uint32Array);
  assert.equal(indexed.index.count, count);
  assert.equal(indexed.index.getX(65535), 65535);
  assert.equal(indexed.index.getX(count - 1), count - 1);
  assert.equal(source.index, null);
  sameAttributes(indexed, source);
  source.dispose();
  indexed.dispose();
});

await test('sequential indices preserve Three primitive-restart behavior at the 16-bit boundary', () => {
  for (const [count, Constructor] of [
    [65535, Uint16Array],
    [65536, Uint32Array],
  ]) {
    const source = new THREE.BufferGeometry();
    source.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3),
    );
    const previous = source.clone().setIndex(Array.from({ length: count }, (_, index) => index));
    const actual = cloneBatchGeometry(source, new THREE.Matrix4());
    assert(actual.index.array instanceof Constructor);
    assert.deepEqual(
      actual.index.array,
      previous.index.array,
      'The replacement index has identical type and bytes',
    );
    for (const geometry of [source, previous, actual]) geometry.dispose();
  }
});

await test('pruning retires empty group trees without changing live drawable ancestry or transforms', () => {
  const scene = new THREE.Scene(),
    root = new THREE.Group();
  scene.add(root);
  root.position.set(2, 3, -4);
  root.rotation.y = 0.42;
  const empty = new THREE.Group(),
    middle = new THREE.Group(),
    leaf = new THREE.Group();
  root.add(empty);
  empty.add(middle);
  middle.add(leaf);
  const live = new THREE.Group(),
    unused = new THREE.Group();
  const geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material),
    marker = new THREE.Object3D();
  live.position.set(-3, 1, 2);
  live.rotation.z = -0.3;
  live.scale.set(2, 0.5, 1.3);
  mesh.position.set(0.2, 0.7, -0.6);
  root.add(live, marker);
  live.add(mesh, unused);
  scene.updateMatrixWorld(true);
  const matrix = mesh.matrixWorld.clone();
  const localMatrix = live.matrix.clone();
  assert.equal(pruneEmptyStaticGroups(root, scene), 4);
  assert.equal(root.parent, scene);
  assert.equal(live.parent, root);
  assert.equal(mesh.parent, live);
  assert.equal(marker.parent, root, 'Non-Group placeholders are retained');
  for (const group of [empty, middle, leaf, unused]) assert.equal(group.parent, null);
  scene.updateMatrixWorld(true);
  assert.deepEqual(mesh.matrixWorld, matrix);
  assert.deepEqual(live.matrix, localMatrix);
  assert.equal(live.matrixAutoUpdate, true);
  assert.equal(root.matrixWorldAutoUpdate, true);
  assert.equal(pruneEmptyStaticGroups(root, scene), 0, 'Repeated pruning is a no-op');
  geometry.dispose();
  material.dispose();
});

await test('pruning preserves action and dynamic branches including ancestry outside its root', () => {
  for (const flag of ['action', 'dynamic']) {
    const root = new THREE.Group(),
      protectedBranch = new THREE.Group(),
      descendant = new THREE.Group();
    protectedBranch.userData[flag] = flag === 'action' ? 'lamp' : true;
    root.add(protectedBranch);
    protectedBranch.add(descendant);
    assert.equal(pruneEmptyStaticGroups(root), 0);
    assert.equal(protectedBranch.parent, root);
    assert.equal(descendant.parent, protectedBranch);
    assert.equal(
      pruneEmptyStaticGroups(descendant),
      0,
      'Protected ancestry outside root is honored',
    );
    const nested = new THREE.Group();
    descendant.add(nested);
    assert.equal(pruneEmptyStaticGroups(descendant), 0);
    assert.equal(nested.parent, descendant);
  }
});

await test('pruning preserves light targets referenced from inside and outside the world hierarchy', () => {
  const scene = new THREE.Scene(),
    root = new THREE.Group(),
    targetParent = new THREE.Group();
  const externalLight = new THREE.DirectionalLight(),
    internalLight = new THREE.SpotLight();
  const externalTarget = new THREE.Group(),
    internalTarget = new THREE.Group(),
    targetChild = new THREE.Group();
  const lightChild = new THREE.Group(),
    unused = new THREE.Group();
  externalLight.target = externalTarget;
  internalLight.target = internalTarget;
  scene.add(root, externalLight);
  root.add(targetParent, internalLight, internalTarget, unused);
  targetParent.add(externalTarget);
  externalTarget.add(targetChild);
  internalLight.add(lightChild);
  assert.equal(pruneEmptyStaticGroups(root, scene), 1);
  assert.equal(externalTarget.parent, targetParent, 'A light outside root retains its target');
  assert.equal(targetParent.parent, root);
  assert.equal(targetChild.parent, externalTarget, 'A target rig stays intact');
  assert.equal(internalTarget.parent, root);
  assert.equal(lightChild.parent, internalLight);
  assert.equal(internalLight.parent, root);
  assert.equal(externalLight.parent, scene);
  assert.equal(pruneEmptyStaticGroups(root, scene), 0);

  // The explicit light scope may not contain root, so root's own lights are scanned too.
  scene.remove(root);
  assert.equal(pruneEmptyStaticGroups(root, scene), 0);
  assert.equal(internalTarget.parent, root);
  const outsideTarget = new THREE.Group();
  externalLight.target = outsideTarget;
  assert.equal(pruneEmptyStaticGroups(root, scene), 3);
  assert.equal(externalLight.target, outsideTarget, 'Out-of-tree targets are never modified');
  assert.equal(outsideTarget.parent, null);
  assert.equal(internalTarget.parent, root);
});

await test('construction geometry release preserves every live geometry and retires owned sources once', () => {
  const scene = new THREE.Scene();
  const hidden = new THREE.Group();
  hidden.visible = false;
  scene.add(hidden);
  const owned = new DisposableSet();
  const counts = new Map();
  const makeGeometry = (registered = true) => {
    const geometry = new THREE.BoxGeometry();
    counts.set(geometry, 0);
    geometry.addEventListener('dispose', () => counts.set(geometry, counts.get(geometry) + 1));
    if (registered) owned.add(geometry);
    return geometry;
  };
  const material = new THREE.MeshBasicMaterial();
  const shared = makeGeometry();
  const visibleMesh = new THREE.Mesh(shared, material);
  const hiddenMesh = new THREE.Mesh(shared, material);
  scene.add(visibleMesh);
  hidden.add(hiddenMesh);
  const live = [shared];
  for (const Constructor of [THREE.LineSegments, THREE.Points, THREE.SkinnedMesh]) {
    const geometry = makeGeometry();
    live.push(geometry);
    hidden.add(new Constructor(geometry, material));
  }
  const instances = makeGeometry();
  live.push(instances);
  hidden.add(new THREE.InstancedMesh(instances, material, 2));
  const foreignLive = makeGeometry(false);
  hidden.add(new THREE.Mesh(foreignLive, material));
  const unused = [makeGeometry(), makeGeometry()];
  const detached = new THREE.Mesh(unused[0], material);
  const foreignUnused = makeGeometry(false);
  assert.equal(detached.parent, null);
  const positions = new Map(live.map((geometry) => [geometry, geometry.attributes.position]));

  assert.equal(releaseUnusedGeometries(scene, owned), 2);
  assert.deepEqual(new Set(owned), new Set(live));
  for (const geometry of unused) assert.equal(counts.get(geometry), 1);
  for (const geometry of [...live, foreignLive, foreignUnused])
    assert.equal(counts.get(geometry), 0);
  for (const geometry of live) assert.equal(geometry.attributes.position, positions.get(geometry));
  visibleMesh.removeFromParent();
  assert.equal(
    releaseUnusedGeometries(scene, owned),
    0,
    'The hidden shared mesh still owns its geometry',
  );
  assert.equal(owned.has(shared), true);
  owned.dispose();
  owned.dispose();
  assert.equal(owned.size, 0);
  for (const geometry of [...live, ...unused]) assert.equal(counts.get(geometry), 1);
  assert.equal(counts.get(foreignLive), 0, 'The helper never takes ownership of foreign geometry');
  assert.equal(counts.get(foreignUnused), 0);
  foreignLive.dispose();
  foreignUnused.dispose();
  material.dispose();
});
