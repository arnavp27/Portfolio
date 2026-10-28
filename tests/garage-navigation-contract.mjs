import assert from 'node:assert/strict';
import {
  isWalkable,
  moveOnFloor,
  walkingPath,
  samplePath,
  destinations,
  clearLine,
  obstacles,
  courtyard,
} from '../src/lib/garage/navigation.ts';
import { computerPose } from '../src/lib/garage/interaction.ts';
const locations = [
  ...Object.values(destinations),
  { x: -7.6, z: 15.1 },
  { x: 8, z: 12 },
  { x: 2.8, z: 7.4 },
  { x: -0.2, z: 5.8 },
  { x: 1.8, z: 2 },
  { x: -1.2, z: -0.3 },
  { x: 0.5, z: 0.5 },
];
for (const id of ['kazam', 'projects'])
  for (const [w, h] of [
    [1280, 720],
    [390, 844],
    [518, 762],
  ]) {
    const p = computerPose(id, w, h).position;
    locations.push({ x: p.x, z: p.z });
  }
assert(courtyard.spawn.z > 10, 'Visitors begin outside, with the whole approach ahead');
assert(
  !clearLine({ x: -7.6, z: 15.1 }, { x: -1.8, z: 2.8 }),
  'No shortcut through the building wall',
);
assert(!isWalkable({ x: 0, z: 18.4 }), 'Traffic lanes stay outside the walkable pavement');
assert(!isWalkable({ x: 3, z: 10.8 }), 'The compound wall is solid');
assert(!isWalkable({ x: -10.7, z: 11.7 }), 'The food counter is solid');
const gate = moveOnFloor({ x: 0, z: 12 }, 0, -5.5);
assert(gate.z < 7, 'The open gate connects the street and forecourt');
const doorway = moveOnFloor({ x: 0, z: 4.5 }, 0, -2);
assert(doorway.z < 3, 'The open garage threshold is traversable');
let routes = 0;
for (const from of locations)
  for (const to of locations) {
    assert(isWalkable(from), JSON.stringify(from));
    const path = walkingPath(from, to);
    assert(path.length > 0, `Reachable: ${JSON.stringify({ from, to })}`);
    assert.deepEqual(path[0], from);
    assert.deepEqual(path.at(-1), to);
    for (let i = 0; i <= 100; i++)
      assert(isWalkable(samplePath(path, i / 100)), 'Guided walk crosses furniture');
    for (let i = 1; i < path.length; i++) assert(clearLine(path[i - 1], path[i]));
    routes++;
  }
let seed = 777;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
let p = { ...destinations.entrance };
for (let i = 0; i < 20000; i++) {
  p = moveOnFloor(p, (rand() - 0.5) * 5, (rand() - 0.5) * 5);
  assert(isWalkable(p), 'Long movement frame tunneled through a wall or object');
}
for (const b of obstacles) {
  assert(!isWalkable({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }), b.name);
}
console.log(
  `PASS: ${routes} courtyard/room/computer routes, phone framing endpoints, 20,000 collision steps, compound walls, gate, food counter, doorway, and furniture occupancy.`,
);
