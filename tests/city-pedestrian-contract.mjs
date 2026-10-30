import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pedestrianPosition } from '../src/lib/garage/city/layout.ts';
import { productionSource } from './helpers/production-source.mjs';

// Run the production animation against real instance buffers without a WebGL context.
const source = productionSource(new URL('../src/lib/garage/city/actors.ts', import.meta.url));
source.assertCall('createStreetActors', 'animate');
source.assertCall('createStreetActors.animate', 'animatePeople');
const limbs = new Set(['upperArm', 'forearm', 'hand', 'thigh', 'shin', 'shoe', 'eye']);
const geometry = new THREE.BufferGeometry(),
  material = new THREE.MeshBasicMaterial();
const parts = new Map(
  [
    'torso',
    'head',
    'hair',
    'upperArm',
    'forearm',
    'hand',
    'thigh',
    'shin',
    'shoe',
    'bag',
    'collar',
    'nose',
    'eye',
    'shadow',
  ].map((name) => [name, new THREE.InstancedMesh(geometry, material, limbs.has(name) ? 32 : 16)]),
);
const animate = Function(
  'THREE',
  'pedestrianPosition',
  'parts',
  `${source.declarations('createStreetActors', [
    'count',
    'shirt',
    'skin',
    'temp',
    'local',
    'matrix',
    'colorsInitialized',
    'place',
    'animatePeople',
  ])}\nreturn animatePeople;`,
)(THREE, pedestrianPosition, parts);
const close = (actual, expected, label) =>
  assert(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} != ${expected}`);
function expectPose(name, index, expected) {
  const actual = new THREE.Matrix4();
  parts.get(name).getMatrixAt(index, actual);
  actual.elements.forEach((value, i) =>
    close(value, expected[i], `${name}[${index}] matrix component ${i}`),
  );
}
animate(0);
const colors = new Map([...parts].map(([name, mesh]) => [name, mesh.instanceColor?.array.slice()]));
const colorVersions = new Map(
  [...parts].map(([name, mesh]) => [name, mesh.instanceColor?.version]),
);
const matrixVersions = new Map(
  [...parts].map(([name, mesh]) => [name, mesh.instanceMatrix.version]),
);
const counterShirt = new THREE.Color();
parts.get('torso').getColorAt(14, counterShirt);
const expectedShirt = new THREE.Color('#d1c6aa');
for (const channel of ['r', 'g', 'b'])
  close(counterShirt[channel], expectedShirt[channel], `Counter shirt ${channel}`);
assert.equal(parts.get('shadow').instanceColor, null, 'Shadows keep their shared material');

// Authored walking, jogging and counter poses, recorded before the allocation cleanup.
// The complete matrices cover position, handedness, animation phase and nonuniform scale.
animate(2.5);
expectPose(
  'head',
  6,
  [
    0.04881527, 0, 0.92791688, 0, 0, 1.1918, 0, 0, -0.958175, 0, 0.05040707, 0, 7.02394009,
    1.66856182, 14.35000038, 1,
  ],
);
expectPose(
  'shoe',
  0,
  [
    0, 0, 0.95999998, 0, 0, 0.95999998, 0, 0, -0.95999998, 0, 0, 0, 77.50090027, 0.23071124,
    14.25207996, 1,
  ],
);
expectPose(
  'shoe',
  1,
  [
    0, 0, 0.95999998, 0, 0, 0.95999998, 0, 0, -0.95999998, 0, 0, 0, 78.19107056, 0.16795042,
    14.44791985, 1,
  ],
);
expectPose(
  'forearm',
  28,
  [
    1.00999999, 0, 0, 0, 0, -0.04967566, -1.00877762, 0, 0, 1.00877762, -0.04967566, 0, -10.6585598,
    1.28515065, 11.59810162, 1,
  ],
);
animate(17.3);
expectPose(
  'torso',
  6,
  [
    0, 0, 1.00999999, 0, -0.11087608, 1.00389564, 0, 0, -1.00389564, -0.11087608, 0, 0,
    -21.09000015, 1.25534618, 14.35000038, 1,
  ],
);
expectPose(
  'hand',
  28,
  [
    1.00999999, 0, 0, 0, 0, 0.95950001, 0, 0, 0, 0, 0.8585, 0, -10.66057968, 1.29160857,
    11.72924232, 1,
  ],
);
expectPose(
  'bag',
  0,
  [
    0, 0, 0.0096, 0, -0.00067145, 0.00957649, 0, 0, -0.00957649, -0.00067145, 0, 0, 65.98680115,
    1.21556556, 14.35000038, 1,
  ],
);
expectPose(
  'torso',
  15,
  [
    -1.03499997, 0, 0, 0, 0, 1.03499997, 0, 0, 0, 0, -1.03499997, 0, -12.30000019, 1.28199995,
    13.19999981, 1,
  ],
);
for (const [name, mesh] of parts) {
  assert.equal(
    mesh.instanceMatrix.version,
    matrixVersions.get(name) + 2,
    `${name} uploads each new pose`,
  );
  assert.equal(
    mesh.instanceColor?.version,
    colorVersions.get(name),
    `${name} colors are uploaded only once`,
  );
  assert.deepEqual(mesh.instanceColor?.array, colors.get(name), `${name} colors survive animation`);
}

// Visitor avoidance translates the whole person equally on either pavement without
// changing their gait, and never moves the counter staff or an unrelated pedestrian.
const time = 12.25;
for (const index of [0, 1, 6, 14]) {
  const observer = index < 14 ? pedestrianPosition(time, index) : { x: -10.4, z: 11.25 };
  animate(time);
  const before = new Map(
    [...parts].map(([name, mesh]) => [name, mesh.instanceMatrix.array.slice()]),
  );
  animate(time, observer);
  for (const [name, mesh] of parts) {
    for (let i = 0; i < mesh.count; i++) {
      const person = limbs.has(name) ? Math.floor(i / 2) : i;
      const shift = index < 14 && person === index ? (observer.z < 15.5 ? -0.7 : 0.7) : 0;
      for (let component = 0; component < 16; component++) {
        const offset = i * 16 + component;
        close(
          mesh.instanceMatrix.array[offset],
          before.get(name)[offset] + (component === 14 ? shift : 0),
          `${name}[${i}] avoids visitor ${index}`,
        );
      }
    }
  }
}
geometry.dispose();
material.dispose();
console.log(
  'PASS: real pedestrian instance poses, walking/jogging phases, counter poses, colors, uploads and visitor avoidance.',
);
