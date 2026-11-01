import assert from 'node:assert/strict';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  keyboardNoteIds,
  keyboardNotes,
  keyboardNoteAction,
} from '../src/lib/garage/keyboard-notes.ts';
import { productionSource } from './helpers/production-source.mjs';

// Construct the actual physical keyboards without loading the rest of the city.
const world = productionSource(new URL('../src/lib/garage/world.ts', import.meta.url));
const build = Function(
  'T',
  'RoundedBoxGeometry',
  'keyboardNoteIds',
  'keyboardNotes',
  'keyboardNoteAction',
  `
    const root = new T.Group(), geos = new Set(), keyboardKeys = {};
    const materials = new Map();
    const mat = color => {
      if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({color}));
      return materials.get(color);
    };
    const noteLabels = Object.fromEntries(keyboardNoteIds.map(note => [note, mat('#29342e')]));
    ${world.declarations('assembleCameraRoom', ['mesh', 'box', 'plane', 'group', 'keyboard'])}
    keyboard([-1.22, .9, 1.09], 'kazam');
    keyboard([0, .895, -2.04], 'projects', .68);
    root.updateMatrixWorld(true);
    return {root, geos, materials, keyboardKeys};
  `,
);
const scene = build(T, RoundedBoxGeometry, keyboardNoteIds, keyboardNotes, keyboardNoteAction);
const pickables = [];
scene.root.traverse((object) => {
  if (object.isMesh) pickables.push(object);
});
function actionOf(object) {
  for (let parent = object; parent; parent = parent.parent)
    if (parent.userData.action) return parent.userData.action;
  return null;
}
const ray = new T.Raycaster();
for (const [id, eye] of [
  ['kazam', new T.Vector3(-1.2, 1.64, 2.05)],
  ['projects', new T.Vector3(0, 1.64, -0.91)],
]) {
  const keyboard = scene.root.children.find((group) => group.userData.action === `${id}-keyboard`);
  assert(keyboard);
  assert(
    !keyboard.userData.dynamic,
    'Ordinary keyboard pieces remain eligible for static batching',
  );
  assert.equal(keyboard.children.filter((child) => !child.userData.dynamic).length, 37);
  assert.equal(keyboard.children.filter((child) => child.userData.dynamic).length, 4);
  for (const note of keyboardNoteIds) {
    const key = scene.keyboardKeys[id][note].mesh;
    assert.equal(key.userData.action, `${id}-note-${note}`);
    assert(key.userData.dynamic, 'Each playable key retains its transform after static batching');
    const center = key.getWorldPosition(new T.Vector3());
    // Both the center and either side of the larger cap can be selected from standing height.
    for (const offset of [-0.035, 0, 0.035]) {
      const aim = center.clone().add(new T.Vector3(offset, 0.0093, 0));
      ray.set(eye, aim.sub(eye).normalize());
      const hit = ray.intersectObjects(pickables, false)[0];
      assert(hit, `Note ${note} on ${id} must be reachable by the room raycaster`);
      assert.equal(actionOf(hit.object), `${id}-note-${note}`);
      assert(hit.distance < 2.65, 'Keys are usable within the normal interaction distance');
    }
    const label = key.children[0];
    assert(label?.isMesh, 'The key has a visible numbered legend');
    assert(!label.castShadow, 'Printed legends do not create separate shadows');
    const before = label.getWorldPosition(new T.Vector3());
    key.position.y -= 0.008;
    scene.root.updateMatrixWorld(true);
    const after = label.getWorldPosition(new T.Vector3());
    assert(Math.abs(before.y - after.y - 0.008) < 1e-9, 'The legend travels with the pressed cap');
    key.position.y += 0.008;
    scene.root.updateMatrixWorld(true);
  }
}
for (const geometry of scene.geos) geometry.dispose();
for (const material of scene.materials.values()) material.dispose();
console.log(
  'PASS: both physical keyboards have four distinct reachable note caps, attached legends, and batchable ordinary keys.',
);
