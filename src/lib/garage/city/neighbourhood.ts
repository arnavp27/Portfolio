import * as THREE from 'three';
import { group, surface, type Point3, type SceneKit } from './types';
import type { CityMaterials } from './materials';
import type { Architecture } from './architecture';
import type { createGarden } from './garden';
import { backgroundHomes, neighbourhoodSign } from './detail-layout';

/** Public street furniture and deeper, low-rise neighbourhood layers. */
export function createNeighbourhoodDepth(
  kit: SceneKit,
  m: CityMaterials,
  a: Architecture,
  garden: ReturnType<typeof createGarden>,
) {
  const { root, box, cyl } = kit;
  const { x, z, title, subtitle } = neighbourhoodSign;
  const sign = group(root, [x, 0, z], -0.1);
  sign.name = 'koramangala-fifth-block-street-sign';
  cyl([0, 1.68, 0], 0.048, 0.065, 3.36, m.iron, sign);
  cyl([0, 0.12, 0], 0.11, 0.11, 0.24, m.stone, sign);
  for (const yaw of [0, Math.PI]) {
    const face = group(sign, [0, 2.85, 0], yaw);
    a.sign(face, [0, 0, 0.05], 2.38, 0.66, title, subtitle, '#183a37');
    // A narrow cap protects the reflective sign, as on a civic wayfinding post.
    box([0, 0.38, 0], [2.5, 0.045, 0.18], m.iron, face);
  }
  box([0, 2.85, 0], [2.42, 0.7, 0.07], m.iron, sign, [0, 0, 0], 0.018);

  for (const home of backgroundHomes) {
    const palette = [m.cream, m.sage, m.pink, m.stone];
    a.districtHouse(
      [home.x, 0, home.z],
      home.width,
      home.height,
      home.depth,
      palette[home.variant % palette.length],
      home.facing,
      home.variant,
    );
  }
  // Ground continues beneath the side passages, instead of terminating behind one facade.
  surface(kit, [0, -0.02, 55.0], 160, 38, m.sidewalk);
  surface(kit, [2, -0.02, -24], 96, 30, m.sidewalk);
  for (const x of [-33, -17, 3, 23, 42]) {
    box([x, 0.45, 41.1], [7.8, 0.9, 0.2], m.cream);
    for (const dx of [-2.9, 0, 2.9]) garden.pot(root, [x + dx, 0.04, 40.7], 1.35);
  }
  // Thin utility lines and antennas are inexpensive silhouettes above the roof terraces.
  function cable(points: Point3[]) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return kit.mesh(new THREE.TubeGeometry(curve, 16, 0.012, 3), m.rubber, [0, 0, 0]);
  }
  for (const z of [41.5, -20.5])
    for (let x = -35; x < 36; x += 24) {
      cyl([x, 3.2, z], 0.07, 0.1, 6.4, m.stone);
      cable([
        [x, 6.2, z],
        [x + 12, 5.75, z + 0.08],
        [x + 24, 6.2, z],
      ]);
    }
  // A few tall crowns overlap row boundaries; the depth remains architecture, not a backdrop.
  garden.tree([-19, 0, 43], 10.0, 743);
  garden.tree([24, 0, 43], 10.5, 765);
  garden.tree([12, 0, -20], 8.4, 787);
}

/** Everything here is beyond the room's rear wall and outside navigation bounds. */
export function createRearCourtyard(
  scene: THREE.Scene,
  kit: SceneKit,
  m: CityMaterials,
  a: Architecture,
  garden: ReturnType<typeof createGarden>,
) {
  const { root, box, cyl, beam } = kit;
  const yard = group(root);
  yard.name = 'rear-courtyard';
  surface(kit, [0, -0.012, -7.1], 18, 9, m.paving, yard);
  box([0, 0.55, -7.9], [17, 1.1, 0.22], m.cream, yard);
  box([0, 1.12, -7.9], [17.2, 0.1, 0.32], m.stone, yard);
  for (const x of [-8.3, 8.3]) box([x, 0.62, -5.5], [0.2, 1.24, 4.6], m.cream, yard);
  const back = a.townHouse([-0.65, 0, -14], 8.2, 6.2, 5.2, m.sage, 0, 1);
  const neighbour = a.townHouse([8.6, 0, -16.2], 7.1, 8.4, 6.1, m.cream, 0, 3);
  for (const x of [-2.3, -1.6, 1.5, 2.2]) garden.pot(back, [x, 3.37, 3.15], 0.8);
  for (const x of [-2.2, 0.2, 2.2]) garden.pot(neighbour, [x, 6.17, 3.85], 0.9);
  garden.vine(back, [-3.75, 5.8, 2.85], 3.8, false, 601);
  garden.tree([-5.6, 0, -8.6], 7.4, 126);
  garden.tree([6.4, 0, -9.1], 7.8, 166);
  for (let i = 0; i < 6; i++) garden.pot(yard, [-2.8 + i * 1.1, 0, -5.4], 1.2);

  // A little sheltered sitting corner gives the view from the desk a near/middle/far scale.
  const pergola = group(yard, [4.7, 0, -5.7]);
  for (const x of [-1.3, 1.3])
    for (const z of [-1.1, 1.1]) box([x, 1.24, z], [0.1, 2.48, 0.1], m.wood, pergola);
  for (const x of [-1.3, 1.3]) box([x, 2.51, 0], [0.15, 0.14, 2.55], m.wood, pergola);
  for (let i = 0; i < 8; i++) box([-1.4 + i * 0.4, 2.57, 0], [0.075, 0.12, 2.65], m.wood, pergola);
  for (let i = 0; i < 4; i++) box([0, 0.5, -0.76 + i * 0.11], [2.1, 0.065, 0.085], m.wood, pergola);
  for (const x of [-0.85, 0.85])
    for (const z of [-0.7, -0.38]) box([x, 0.24, z], [0.055, 0.48, 0.055], m.iron, pergola);
  for (const y of [0.75, 0.91]) box([0, y, -0.87], [2.15, 0.1, 0.045], m.wood, pergola);
  for (const x of [-1.17, 1.18]) garden.pot(pergola, [x, 0, 0.85], 1.6);
  garden.vine(pergola, [1.25, 2.59, -0.9], 2.2, true, 615);

  // Terracotta troughs, stepping stones, a water tap and hose make it a lived-in courtyard.
  for (const x of [-6.8, -5.8]) {
    box([x, 0.23, -5.3], [0.72, 0.46, 0.43], m.clay, yard, [0, 0, 0], 0.035);
    box([x, 0.47, -5.3], [0.62, 0.025, 0.34], m.soil, yard);
    garden.pot(yard, [x, 0.14, -5.3], 1.1, true);
  }
  for (let i = 0; i < 6; i++)
    box(
      [-2.2 + i * 0.63, 0.012, -6.6],
      [0.48, 0.05, 0.41],
      m.stone,
      yard,
      [0, i % 2 ? 0.05 : -0.07, 0],
      0.025,
    );
  box([-7.7, 0.52, -6.95], [0.15, 1.04, 0.15], m.stone, yard);
  beam([-7.7, 0.85, -6.85], [-7.7, 0.85, -6.65], 0.018, m.steel, yard);
  cyl([-7.7, 0.905, -6.73], 0.06, 0.06, 0.018, m.steel, yard);
  const hose = kit.mesh(
    new THREE.TorusGeometry(0.26, 0.018, 6, 24),
    m.rubber,
    [-7.7, 0.58, -6.84],
    yard,
  );
  hose.rotation.z = 0.2;

  // Rooftop laundry sits in front of the farther facade, without filling the entire window.
  const laundry = group(back, [0.4, 6.5, 0.2]);
  for (const x of [-1.2, 1.2]) cyl([x, 0.58, 0], 0.018, 0.018, 1.16, m.iron, laundry);
  beam([-1.2, 1.08, 0], [1.2, 1.08, 0], 0.008, m.rubber, laundry);
  for (let i = 0; i < 3; i++) {
    box(
      [-0.72 + i * 0.69, 0.77, 0],
      [0.48, 0.56, 0.012],
      i === 0 ? m.curtain : i === 1 ? m.sage : m.pink,
      laundry,
      [0, 0.08 * (i - 1), 0.035 * (i - 1)],
    );
    for (const dx of [-0.17, 0.17])
      box([-0.72 + i * 0.69 + dx, 1.05, 0.015], [0.024, 0.075, 0.03], m.wood, laundry);
  }
  for (const x of [-3.9, 0.1, 4.1]) {
    cyl([x, 1.18, -7.79], 0.025, 0.025, 2.36, m.iron, yard);
    a.lantern(yard, [x, 2.28, -7.75], 0.72);
  }
  const courtyardLight = new THREE.PointLight('#e8c08c', 5.0, 8, 2);
  courtyardLight.position.set(0.1, 2.25, -7.65);
  scene.add(courtyardLight);
}
