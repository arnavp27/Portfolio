import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { computerPose, computerFov, ease, screenTransform } from '../src/lib/garage/interaction.ts';
import { screenDimensions } from '../src/lib/garage/computers.ts';
import { destinations, walkingPath, samplePath, clearLine } from '../src/lib/garage/navigation.ts';
import { eyeHeight } from '../src/lib/garage/player-controls.ts';
for (const id of ['kazam', 'projects'])
  for (const [width, height] of [
    [1880, 1040],
    [1280, 720],
    [518, 762],
    [390, 844],
  ]) {
    const screen = screenDimensions(id),
      pose = computerPose(id, width, height),
      cam = new PerspectiveCamera(computerFov, width / height, 0.04, 50);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld();
    const [x, y, z] = screen.center;
    const points = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ].map(([a, b]) => {
      const p = new Vector3(x + (a * screen.width) / 2, y + (b * screen.height) / 2, z).project(
        cam,
      );
      assert(
        p.z < 1 && Math.abs(p.x) < 0.901 && Math.abs(p.y) < 0.691,
        'Readable screen fits the viewport',
      );
      return { x: (p.x * 0.5 + 0.5) * width, y: (-0.5 * p.y + 0.5) * height };
    });
    const w = width < 640 ? 360 : 960,
      h = (w * screen.height) / screen.width,
      m = screenTransform(points, w, h);
    assert(m?.every(Number.isFinite));
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ].forEach(([u, v], i) => {
      const d = m[3] * u + m[7] * v + m[15],
        px = (m[0] * u + m[4] * v + m[12]) / d,
        py = (m[1] * u + m[5] * v + m[13]) / d;
      assert(
        Math.abs(px - points[i].x) < 1e-6 && Math.abs(py - points[i].y) < 1e-6,
        'DOM screen and 3D glass corners line up',
      );
    });
    const from = destinations[id],
      path = walkingPath(from, pose.position);
    assert(path.length >= 2, 'The real walking route reaches the computer');
    assert.deepEqual(samplePath(path, 0), from);
    const endpoint = samplePath(path, 1);
    assert(Math.hypot(endpoint.x - pose.position.x, endpoint.z - pose.position.z) < 1e-9);
    for (let i = 1; i < path.length; i++)
      assert(clearLine(path[i - 1], path[i]), 'Each approach segment clears room colliders');
    let previous = from;
    for (let i = 0; i <= 1000; i++) {
      const point = samplePath(path, ease(i / 1000));
      assert(Object.values(point).every(Number.isFinite));
      assert(
        Math.hypot(point.x - previous.x, point.z - previous.z) < 0.04,
        'Approach is continuous',
      );
      const y = eyeHeight + (pose.position.y - eyeHeight) * ease(i / 1000);
      assert(y > 1.3 && y < 1.7, 'Camera remains at seated/standing eye height');
      previous = point;
    }
  }
const skew = [
    { x: 100, y: 120 },
    { x: 740, y: 80 },
    { x: 800, y: 540 },
    { x: 60, y: 500 },
  ],
  m = screenTransform(skew, 960, 612);
[
  [0, 0],
  [960, 0],
  [960, 612],
  [0, 612],
].forEach(([u, v], i) => {
  const d = m[3] * u + m[7] * v + 1;
  assert(Math.abs((m[0] * u + m[4] * v + m[12]) / d - skew[i].x) < 1e-6);
  assert(Math.abs((m[1] * u + m[5] * v + m[13]) / d - skew[i].y) < 1e-6);
});
console.log(
  'PASS: both computer approaches, reversible endpoints, collider clearance, perspective-aligned HTML, and readable screen bounds at four viewport sizes.',
);
import { createHands } from '../src/lib/garage/hands.ts';
const handCamera = new PerspectiveCamera(43, 16 / 9, 0.04, 50),
  hands = createHands(handCamera);
hands.animate(0.6, false);
handCamera.updateMatrixWorld(true);
assert(handCamera.children[0].visible, 'Hands appear during the keyboard gesture');
for (const hand of handCamera.children[0].children) {
  const p = hand.getWorldPosition(new Vector3()).project(handCamera);
  assert(
    Math.abs(p.x) < 0.95 && p.y > -0.95 && p.y < 0 && p.z < 1,
    'Hands stay in the lower part of the visible frame',
  );
}
hands.animate(0.6, true);
assert(!handCamera.children[0].visible, 'Reduced motion skips the hand gesture');
hands.animate(1, false);
assert(!handCamera.children[0].visible, 'Hands retract for reading');
hands.dispose();
console.log(
  'PASS: first-person hands are visible during approach and retract for reading / reduced motion.',
);
