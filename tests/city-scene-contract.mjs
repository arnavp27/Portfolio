import assert from 'node:assert/strict';
import {
  cityLayout,
  cityAcousticsAt,
  trafficPosition,
  pedestrianPosition,
} from '../src/lib/garage/city/layout.ts';
import { isWalkable, walkingPath, clearLine } from '../src/lib/garage/navigation.ts';
// Cars share a speed and fixed spacing in each lane, including at the periodic seam.
for (let t = 0; t < 180; t += 0.125) {
  const traffic = Array.from({ length: 12 }, (_, i) => trafficPosition(t, i));
  for (const car of traffic) {
    assert(Number.isFinite(car.x));
    assert(Math.abs(car.x) <= cityLayout.roadHalfLength);
    assert(cityLayout.lanes.includes(car.z));
    assert(!isWalkable(car), 'The player cannot walk into live traffic');
  }
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      if (traffic[i].z === traffic[j].z) {
        const dx = Math.abs(traffic[i].x - traffic[j].x);
        assert(Math.min(dx, 208 - dx) > 30, 'No overlapping vehicles, even when wrapping');
      }
  for (let i = 0; i < 14; i++) {
    const p = pedestrianPosition(t, i);
    assert(p.z < cityLayout.curbZ || p.z > cityLayout.roadFarZ, 'Commuters stay on pavements');
  }
}
const street = cityAcousticsAt({ x: 0, z: 12.5 }),
  court = cityAcousticsAt({ x: 0, z: 8 }),
  room = cityAcousticsAt({ x: 0, z: 1 });
assert.equal(street.zone, 'street');
assert.equal(court.zone, 'courtyard');
assert.equal(room.zone, 'workshop');
assert.equal(street.gain, 1);
assert(court.gain < 0.3 && court.gain > 0.25);
assert(room.gain < 0.07);
assert(room.cutoff < court.cutoff && court.cutoff < street.cutoff);
let previous = street;
for (let z = 12.5; z > 1; z -= 0.02) {
  const p = cityAcousticsAt({ x: 0, z });
  assert(p.gain <= previous.gain + 1e-8);
  assert(Math.abs(p.gain - previous.gain) < 0.02, 'No abrupt jump or click at a threshold');
  assert(p.cutoff >= 500);
  previous = p;
}
assert.equal(
  cityAcousticsAt({ x: -7, z: 8 }).gain,
  1,
  'Standing outside the compound does not mute the city',
);
const route = walkingPath(cityLayout.spawn, { x: 0, z: 4.8 });
assert(route.length > 1);
for (let i = 1; i < route.length; i++) assert(clearLine(route[i - 1], route[i]));
console.log(
  'PASS: 3 minutes of traffic separation and pavement routes, smooth gate/room acoustic attenuation, and an unobstructed street-to-workshop route.',
);
