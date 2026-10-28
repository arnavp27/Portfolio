import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityLayout, trafficPosition } from '../src/lib/garage/city/layout.ts';
import {
  headlightPose,
  headlightProfile,
  headlightTuning,
  headlightGain,
  nearestHeadlightVehicles,
  headlightRoadBounds,
} from '../src/lib/garage/city/headlight-layout.ts';
import {
  backgroundHomes,
  neighbourhoodSign,
  courtyardPaving,
} from '../src/lib/garage/city/detail-layout.ts';
import {
  floorBounds,
  obstacles,
  destinations,
  walkingPath,
  clearLine,
} from '../src/lib/garage/navigation.ts';
import { createTrafficHeadlights } from '../src/lib/garage/city/headlights.ts';

// Exercise the actual Three.js rig without WebGL: sources, targets and road pools move together.
const kit = {
  root: new THREE.Group(),
  mats: new Set(),
  geos: new Set(),
  mesh(geometry, material, position, parent = this.root, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  },
};
const initialTraffic = Array.from({ length: 12 }, (_, i) => trafficPosition(0, i));
const headlightRig = createTrafficHeadlights(kit, initialTraffic);
for (let time = 0; time < 1; time += 0.05)
  headlightRig.animate(time, initialTraffic, cityLayout.spawn);
kit.root.updateMatrixWorld(true);
const actualLights = [];
kit.root.traverse((object) => {
  if (object.isSpotLight) actualLights.push(object);
});
assert.equal(
  actualLights.length,
  6,
  'The actual renderer keeps six lights, never one new pair per car',
);
assert(
  actualLights.some((light) => light.intensity > 30),
  'Nearby vehicles really illuminate PBR surfaces',
);
assert(
  actualLights.every((light) => !light.castShadow),
  'Moving headlights add no shadow render passes',
);
for (let i = 0; i < initialTraffic.length; i++) {
  const vehicle = initialTraffic[i],
    profile = headlightProfile(vehicle.kind),
    direction = Math.sign(vehicle.speed);
  const pool = kit.root.getObjectByName(`road-headlight-pool-${i}`);
  const near = new THREE.Vector3(0, headlightTuning.projectionLength / 2, 0).applyMatrix4(
    pool.matrixWorld,
  );
  const far = new THREE.Vector3(0, -headlightTuning.projectionLength / 2, 0).applyMatrix4(
    pool.matrixWorld,
  );
  assert(
    Math.abs(near.x - (vehicle.x + direction * profile.front)) < 1e-7,
    'The bright start of the pool stays at the actual front bumper',
  );
  assert.equal(
    Math.sign(far.x - near.x),
    direction,
    'Both road-pool directions match their moving vehicles',
  );
  assert(
    pool.userData.dynamic || pool.parent.userData.dynamic,
    'Road pools remain animated instead of entering the static merge',
  );
}
assert.equal(kit.geos.size, 1, 'All road pools reuse one geometry');
assert.equal(
  kit.mats.size,
  initialTraffic.length,
  'Every allocated pool material is registered for disposal',
);
for (const material of kit.mats) material.dispose();
for (const geometry of kit.geos) geometry.dispose();

for (let time = 0; time < 180; time += 0.25) {
  const traffic = Array.from({ length: 12 }, (_, i) => trafficPosition(time, i));
  for (const observer of [
    cityLayout.spawn,
    { x: -8, z: 15.3 },
    destinations.kazam,
    destinations.projects,
  ]) {
    const selected = nearestHeadlightVehicles(traffic, observer);
    assert(selected.length <= 3, 'At most three vehicles receive expensive paired spotlights');
    assert.equal(new Set(selected.map((item) => item.index)).size, selected.length);
    assert(selected.every((item) => item.distance < headlightTuning.fadeEnd));
    for (let i = 1; i < selected.length; i++)
      assert(selected[i].distance >= selected[i - 1].distance);
  }
  for (const vehicle of traffic) {
    const profile = headlightProfile(vehicle.kind),
      direction = Math.sign(vehicle.speed);
    const left = headlightPose(vehicle, -1),
      right = headlightPose(vehicle, 1);
    assert(
      Math.abs(Math.abs(left.source.z - right.source.z) - profile.spacing) < 1e-8,
      'Pairs match the model’s actual lamp spacing',
    );
    for (const pose of [left, right]) {
      assert.equal(
        Math.sign(pose.target.x - pose.source.x),
        direction,
        'Every beam points in the vehicle’s actual direction, also after wrapping',
      );
      assert(Math.abs(pose.source.x - (vehicle.x + direction * profile.front)) < 1e-8);
      assert(pose.target.y < pose.source.y, 'Low beams point down onto the road');
      assert(pose.target.z > cityLayout.curbZ && pose.target.z < cityLayout.roadFarZ);
      const lateralReach = headlightTuning.range * Math.sin(headlightTuning.coneAngle);
      assert(pose.source.z - lateralReach > 11.06, 'No cone can sweep into the garage compound');
      assert(pose.source.z + lateralReach < 29, 'No cone can sweep into the opposite houses');
    }
  }
}
assert(
  headlightRoadBounds.near > cityLayout.curbZ && headlightRoadBounds.far < cityLayout.roadFarZ,
  'Projected pools stop at the curbs',
);
let previous = 1;
for (let distance = 0; distance < 60; distance += 0.05) {
  const gain = headlightGain(distance);
  assert(gain >= 0 && gain <= previous + 1e-8);
  assert(previous - gain < 0.006, 'Light assignment fades smoothly at distance');
  previous = gain;
}
assert.equal(headlightGain(46), 0);

assert.equal(
  courtyardPaving.minZ,
  3.2,
  'Exterior paving begins exactly at the doorway, never over the wood floor',
);
assert(courtyardPaving.maxZ <= cityLayout.gateZ);
assert(
  neighbourhoodSign.x - 0.12 > floorBounds.maxX,
  'The sign post stays outside the walking path',
);
assert(
  neighbourhoodSign.z > cityLayout.pavementNear && neighbourhoodSign.z < cityLayout.curbZ,
  'The neighbourhood sign belongs to the public pavement',
);
assert.equal(neighbourhoodSign.title, '5TH BLOCK');
assert.equal(neighbourhoodSign.subtitle, 'KORAMANGALA');

assert(
  backgroundHomes.filter((home) => home.z > 40).length >= 12,
  'More than one row closes the shopfront gaps',
);
assert(
  backgroundHomes.filter((home) => home.z < -20).length >= 4,
  'The rear view continues into the neighbourhood',
);
assert(
  new Set(backgroundHomes.map((home) => home.z)).size > 5,
  'Buildings occupy staggered depths, not one flat facade wall',
);
for (const home of backgroundHomes) {
  assert(home.height <= 12, 'The background remains a low-rise Bangalore neighbourhood');
  assert(
    home.z - home.depth / 2 > floorBounds.maxZ || home.z + home.depth / 2 < floorBounds.minZ,
    'Background buildings cannot obstruct the navigation area',
  );
}
for (const destination of Object.values(destinations)) {
  const path = walkingPath(cityLayout.spawn, destination);
  assert(path.length > 0);
  for (let i = 1; i < path.length; i++) assert(clearLine(path[i - 1], path[i]));
}
assert(
  obstacles.every((block) => !block.name.includes('sign')),
  'No hidden sign collider has been introduced into the route',
);
console.log(
  'PASS: moving paired headlights follow both lanes for 3 minutes, lighting budget/curb clipping and smooth distance fades, no interior light spill, corrected floor threshold, public sign placement, layered low-rise district, and all destinations remain reachable.',
);
