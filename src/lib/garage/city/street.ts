import * as THREE from 'three';
import { random } from '../../graphics/textures';
import { group, surface, type SceneKit, type Point3 } from './types';
import type { CityMaterials } from './materials';
import type { Architecture } from './architecture';
import { createGarden } from './garden';
import { cityLayout as layout } from './layout';
import { courtyardPaving } from './detail-layout';
import { createNeighbourhoodDepth, createRearCourtyard } from './neighbourhood';

export function createStreet(scene: THREE.Scene, kit: SceneKit, m: CityMaterials, a: Architecture) {
  const { box, cyl, beam, root } = kit,
    randomValue = random(870),
    garden = createGarden(kit, m);
  const roadLength = layout.roadHalfLength * 2;
  box([0, -0.24, 15], [roadLength, 0.42, 100], m.stone);
  surface(kit, [0, -0.018, 20.4], roadLength, 8, m.asphalt);
  surface(kit, [0, 0.015, 13.75], roadLength, 5.3, m.sidewalk);
  surface(kit, [0, 0.015, 26.5], roadLength, 4.2, m.sidewalk);
  surface(
    kit,
    [courtyardPaving.x, 0.026, (courtyardPaving.minZ + courtyardPaving.maxZ) / 2],
    courtyardPaving.width,
    courtyardPaving.maxZ - courtyardPaving.minZ,
    m.paving,
  );
  surface(kit, [-8.8, 0.018, 6.9], 9.0, 8.4, m.sidewalk);
  // A road continues in both directions; perspective and fog, rather than a wall, close the distance.
  for (const z of [16.4, 24.4]) {
    box([0, 0.04, z], [roadLength, 0.13, 0.2], m.stone);
    box([0, -0.006, z + (z < 20 ? 0.35 : -0.35)], [roadLength, 0.008, 0.065], m.paint);
  }
  for (let x = -100; x < 104; x += 6) box([x, -0.005, 20.4], [2.5, 0.009, 0.1], m.paint);
  for (let i = 0; i < 9; i++) box([-18, -0.004, 16.9 + i * 0.83], [2.6, 0.009, 0.48], m.paint);
  for (const x of [-36, -12, 13, 37])
    for (const z of [16.2, 24.6]) {
      box([x, 0.035, z], [0.7, 0.015, 0.3], m.iron);
      for (let i = 0; i < 11; i++)
        box([x - 0.3 + i * 0.06, 0.046, z], [0.023, 0.008, 0.24], m.dark);
    }
  // A low, planted compound leaves the house's silhouette visible from the street.
  for (const x of [layout.propertyMinX, layout.propertyMaxX]) {
    box([x, 0.74, 6.9], [0.24, 1.48, 7.8], m.cream);
    box([x, 1.51, 6.9], [0.34, 0.1, 7.87], m.stone);
  }
  for (const [start, end] of [
    [-4.2, -2],
    [2, 10.2],
  ]) {
    const x = (start + end) / 2,
      w = end - start;
    box([x, 0.63, 10.8], [w, 1.26, 0.29], m.cream);
    box([x, 1.29, 10.8], [w + 0.1, 0.1, 0.39], m.stone);
    for (let px = start + 0.25; px < end - 0.1; px += 0.26)
      box([px, 1.53, 10.8], [0.023, 0.42, 0.025], m.iron);
    box([x, 1.75, 10.8], [w, 0.045, 0.045], m.iron);
  }
  for (const x of [-2, 2]) {
    box([x, 1.1, 10.8], [0.46, 2.2, 0.5], m.cream, root, [0, 0, 0], 0.025);
    box([x, 2.22, 10.8], [0.6, 0.12, 0.64], m.stone, root, [0, 0, 0], 0.025);
    box([x, 0.17, 10.8], [0.54, 0.34, 0.58], m.stone, root, [0, 0, 0], 0.02);
    box([x, 2.07, 10.8], [0.51, 0.06, 0.55], m.stone, root, [0, 0, 0], 0.01);
    a.lantern(root, [x, 2.5, 10.8], 1.3);
    const side = x < 0 ? -1 : 1,
      g = group(root, [x - side * 0.06, 0, 10.72], side < 0 ? Math.PI / 2 : -Math.PI / 2),
      direction = -side;
    box([direction * 0.85, 0.43, 0], [1.7, 0.62, 0.08], m.iron, g);
    for (const y of [0.12, 0.78, 1.84])
      box([direction * 0.85, y, 0], [1.75, 0.055, 0.08], m.iron, g);
    for (let i = 0; i < 10; i++)
      box([direction * i * 0.185, 0.99, 0], [0.033, 1.7, 0.04], m.iron, g);
    beam([0, 0.82, 0], [direction * 1.7, 1.78, 0], 0.018, m.iron, g);
    box([direction * 1.55, 1.2, 0.06], [0.11, 0.035, 0.05], m.gold, g);
  }
  a.sign(
    root,
    [3.56, 0.83, 10.96],
    2.18,
    0.64,
    'ARNAV’S GARAGE',
    'TINKERING AFTER HOURS',
    '#29433a',
  );
  a.sign(root, [-2, 1.55, 11.065], 0.34, 0.25, 'AP');
  // The gate plaque names the garage; neighbourhood wayfinding lives on the public pavement.
  box([3.56, 1.48, 11.16], [0.72, 0.055, 0.18], m.iron);
  box([3.56, 1.448, 11.22], [0.57, 0.012, 0.07], m.bulb);
  const plaqueLight = new THREE.SpotLight('#ffe0b2', 3.2, 3, 0.98, 0.65, 2);
  plaqueLight.position.set(3.56, 1.44, 11.4);
  plaqueLight.target.position.set(3.56, 0.8, 10.96);
  scene.add(plaqueLight, plaqueLight.target);
  for (const b of layout.beds) {
    const x = (b.minX + b.maxX) / 2,
      z = (b.minZ + b.maxZ) / 2,
      w = b.maxX - b.minX,
      d = b.maxZ - b.minZ;
    box([x, 0.11, z], [w, 0.22, d], m.brick);
    box([x, 0.23, z], [w - 0.12, 0.02, d - 0.12], m.soil);
    for (let ix = 0; ix < Math.max(1, Math.floor(w / 0.75)); ix++)
      for (let iz = 0; iz < Math.max(1, Math.floor(d / 0.75)); iz++)
        garden.pot(
          root,
          [b.minX + 0.4 + ix * 0.75, 0.0, b.minZ + 0.4 + iz * 0.75],
          0.75 + randomValue() * 0.35,
          true,
        );
  }

  const house = a.heroHouse();
  for (const x of [-2.8, 2.65, 8.5]) garden.pot(root, [x, 0, 4.85], 1.6);
  for (const x of [-2.7, -1.9, 3.2, 4, 7.4, 8.2]) garden.pot(house, [x, 3.61, 3.75], 0.85);
  garden.vine(house, [8.84, 6.2, 4.2], 5.8, true, 41);
  garden.vine(house, [-3.0, 5.9, 4.2], 3.2, false, 39);
  garden.vine(root, [9.9, 2.4, 10.9], 2.1, true, 51);
  const porchLight = new THREE.PointLight('#ffd4a0', 14, 10, 2);
  porchLight.position.set(0, 2.9, 4.3);
  scene.add(porchLight);
  const homeLight = new THREE.PointLight('#e9bd83', 8, 7, 1.8);
  homeLight.position.set(6.5, 2.7, 4.3);
  scene.add(homeLight);
  for (const x of [-2, 2]) {
    const gateLight = new THREE.PointLight('#ffd8a5', 6, 6, 2);
    gateLight.position.set(x, 2.5, 11.0);
    scene.add(gateLight);
  }
  const verandahLight = new THREE.PointLight('#ffcf8e', 7, 9, 2);
  verandahLight.position.set(2.8, 5.75, 3.45);
  scene.add(verandahLight);
  // Keep neighbours subordinate to the main home, with visible setbacks and mature trees.
  a.townHouse([17.3, 0, 1], 9.4, 6.0, 8, m.sage, 0, 1);
  a.townHouse([-20, 0, 4.8], 10.2, 6.2, 9, m.pink, 0, 3);
  a.townHouse([-10.6, 0, -6.5], 8.0, 5.7, 7, m.sage, 0, 1);
  const opposite = [
    [-24, 8.8, 6.2, 1],
    [-12.6, 8.2, 8.5, 1],
    [-1.6, 9, 6.0, 3],
    [10.3, 8.0, 8.6, 3],
    [21.6, 10, 6.1, 1],
  ];
  for (let i = 0; i < opposite.length; i++) {
    const [x, w, h, v] = opposite[i];
    const g = a.townHouse(
      [x, 0, 33],
      w,
      h,
      8,
      [m.sage, m.cream, m.brick, m.pink, m.cream][i],
      Math.PI,
      v,
    );
    a.sign(
      g,
      [0, 2.72, 4.15],
      w * 0.72,
      0.45,
      ['FILTER COFFEE', 'BOOKS & PAPER', 'THE CORNER STORE', 'BAKERY', 'CYCLE REPAIRS'][i],
      '',
      i % 2 ? '#635044' : '#364b43',
    );
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const x = side * (35 + i * 12);
      a.townHouse(
        [x, 0, 33.5],
        8.4,
        5.8 + (i % 3) * 2.8,
        9,
        [m.sage, m.pink, m.cream][i % 3],
        Math.PI,
        i,
      );
      a.townHouse([x, 0, 4.8], 8.7, 5.8 + (i % 2) * 2.7, 9, [m.cream, m.sage][i % 2], 0, i);
    }
  createNeighbourhoodDepth(kit, m, a, garden);
  garden.tree([-5.9, 0, 9.9], 10.5, 62);
  for (const [x, z, h, seed] of [
    [-19, 25.9, 10.8, 34],
    [7, 26.9, 9.3, 98],
    [25, 14, 10.5, 142],
    [-31, 14, 10.4, 192],
    [-43, 26, 11, 231],
    [43, 26, 11, 261],
    [-56, 14, 10, 291],
    [58, 14, 10, 321],
  ])
    garden.tree([x, 0, z], h, seed);
  for (const x of [-5.9, 25, -31]) {
    box([x, 0.14, x === -5.9 ? 9.9 : 14], [1.4, 0.28, 1.4], m.brick);
    box([x, 0.29, x === -5.9 ? 9.9 : 14], [1.25, 0.02, 1.25], m.soil);
  }
  // Power lines and the repeated lamps make the avenue's vanishing point legible.
  function cable(points: Point3[], radius = 0.014) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return kit.mesh(new THREE.TubeGeometry(curve, 20, radius, 4), m.rubber, [0, 0, 0]);
  }
  for (let x = -82; x <= 82; x += 24) {
    cyl([x, 3.25, 15.8], 0.075, 0.13, 6.5, m.stone);
    beam([x, 5.9, 15.8], [x, 6.45, 17.4], 0.06, m.iron);
    box([x, 6.43, 17.5], [0.3, 0.1, 0.75], m.iron);
    box([x, 6.37, 17.5], [0.23, 0.025, 0.59], m.bulb);
    // Light only the three nearby fixtures; distant lamps remain emissive geometry.
    if (Math.abs(x) <= 34) {
      const light = new THREE.SpotLight('#ffd5a2', 65, 31, 1.12, 0.75, 2);
      light.position.set(x, 6.3, 17.5);
      light.target.position.set(x, 0, 20.4);
      scene.add(light, light.target);
    }
    box([x, 5.9, 15.8], [1.2, 0.09, 0.08], m.iron);
    for (const dx of [-0.42, 0, 0.42]) {
      cyl([x + dx, 6.04, 15.8], 0.045, 0.045, 0.19, m.paint);
      if (x < 70)
        cable([
          [x + dx, 6.15, 15.8],
          [x + dx + 12, 5.25, 15.8],
          [x + dx + 24, 6.15, 15.8],
        ]);
    }
  }
  cable(
    [
      [-3.0, 3.0, 3.5],
      [-4.5, 4.5, 9.5],
      [-10, 6.1, 15.8],
    ],
    0.016,
  );
  createRearCourtyard(scene, kit, m, a, garden);
  // A fictional neighbourhood breakfast counter, modelled at arm's reach.
  const cafe = group(root, [layout.cafe.x, 0, layout.cafe.z]);
  cafe.name = 'idli-counter';
  box([0, 1.65, -2.18], [4.7, 3.3, 0.18], m.sage, cafe);
  for (const x of [-2.27, 2.27]) box([x, 1.65, -0.5], [0.16, 3.3, 3.5], m.sage, cafe);
  box([0, 3.25, -0.5], [4.7, 0.15, 3.5], m.cream, cafe);
  box([0, 0.02, -0.5], [4.7, 0.04, 3.5], m.stone, cafe);
  for (const y of [1.1, 1.9]) {
    box([0, y, -1.6], [3.8, 0.08, 0.6], m.wood, cafe);
    for (let j = 0; j < 7; j++)
      cyl([-1.4 + j * 0.45, y + 0.14, -1.6], 0.14, 0.14, 0.23, m.steel, cafe);
  }
  box([1.8, 1.28, -0.5], [0.63, 0.08, 1.7], m.steel, cafe);
  cyl([1.8, 1.7, -0.5], 0.22, 0.22, 0.76, m.steel, cafe);
  cyl([1.8, 2.1, -0.5], 0.11, 0.23, 0.12, m.steel, cafe);
  a.sign(cafe, [-1.25, 2.57, -2.06], 1.35, 0.55, 'COFFEE', 'HOT & STRONG', '#795a3c');
  box([0, 3.17, 1.37], [5.15, 0.17, 2.0], m.roof, cafe, [0.08, 0, 0]);
  box([0, 3.02, 2.37], [5.2, 0.24, 0.1], m.wood, cafe);
  for (let i = 0; i < 22; i++)
    box([-2.49 + i * 0.235, 2.87, 2.38], [0.12, 0.11, 0.04], i % 2 ? m.sage : m.paint, cafe);
  a.sign(
    cafe,
    [0, 3.36, 2.44],
    4.5,
    0.64,
    'ತಟ್ಟೆ ಇಡ್ಲಿ',
    'IDLI · DOSA · FILTER COFFEE',
    '#385144',
    true,
  );
  box([0, 0.57, 1.53], [4.14, 1.14, 0.91], m.brick, cafe);
  box([0, 1.17, 1.55], [4.3, 0.1, 1.02], m.steel, cafe);
  // Steel steam drum, domed lid, handles and cooker rings.
  cyl([-0.95, 1.49, 1.66], 0.34, 0.34, 0.53, m.steel, cafe);
  cyl([-0.95, 1.79, 1.66], 0.12, 0.36, 0.13, m.steel, cafe);
  cyl([-0.95, 1.89, 1.66], 0.075, 0.075, 0.06, m.iron, cafe);
  for (const x of [-1.33, -0.57]) box([x, 1.58, 1.66], [0.13, 0.055, 0.08], m.iron, cafe);
  for (const y of [1.27, 1.39, 1.51, 1.63])
    cyl([-0.95, y, 1.66], 0.348, 0.348, 0.015, m.steel, cafe);
  box([0.75, 1.28, 1.57], [1.1, 0.12, 0.71], m.iron, cafe);
  for (const x of [0.47, 1.02]) {
    cyl([x, 1.35, 1.57], 0.2, 0.2, 0.008, kit.mat('#ccad70'), cafe);
    cyl([x, 1.36, 1.57], 0.16, 0.16, 0.007, kit.mat('#dabb80'), cafe);
  }
  for (let i = 0; i < 5; i++) {
    cyl([-1.8 + i * 0.16, 1.3, 1.95], 0.055, 0.043, 0.16, m.steel, cafe);
    cyl([-1.8 + i * 0.16, 1.225, 1.95], 0.074, 0.074, 0.018, m.steel, cafe);
  }
  for (let i = 0; i < 3; i++) {
    cyl([1.65, 1.28 + i * 0.055, 1.77], 0.22, 0.22, 0.035, m.steel, cafe);
  }
  for (const x of [-1.65, 0, 1.55]) box([x, 2.68, 1.34], [0.75, 0.035, 0.06], m.bulb, cafe);
  for (const x of [-2.43, 2.43]) box([x, 1.5, 2.25], [0.065, 3, 0.065], m.iron, cafe);
  const cafeLight = new THREE.PointLight('#ffdaa0', 14, 9, 1.7);
  cafeLight.position.set(layout.cafe.x, 2.6, layout.cafe.z + 2);
  scene.add(cafeLight);
  garden.pot(cafe, [-2.65, 0, 1.7], 1.6);
  garden.pot(cafe, [2.6, 0, 1.7], 1.35);
  const steamMap = kit.texture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#e6dfc179');
    g.addColorStop(0.45, '#e6dfc13b');
    g.addColorStop(1, '#e6dfc100');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const steam: THREE.Sprite[] = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: steamMap,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    kit.mats.add(mat);
    const s = new THREE.Sprite(mat);
    s.userData.dynamic = true;
    cafe.add(s);
    steam.push(s);
  }
  // Subtle wet patches and leaf litter give the paving a human scale without making it a mirror.
  const wet = new THREE.MeshStandardMaterial({
    color: '#788a87',
    roughness: 0.28,
    metalness: 0.22,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  kit.mats.add(wet);
  for (const [x, z, sx, sz] of [
    [-0.5, 8.9, 1.1, 0.35],
    [-5, 15.7, 2, 0.25],
    [8.1, 15.7, 1.6, 0.2],
    [-12, 16.8, 1.3, 0.27],
    [4.5, 24, 2, 0.3],
  ]) {
    const p = kit.mesh(
      new THREE.CircleGeometry(1, 18),
      wet,
      [x, z > 16.4 && z < 24.4 ? -0.004 : 0.042, z],
      root,
      [-Math.PI / 2, 0, 0.24],
    );
    p.scale.set(sx, sz, 1);
    p.castShadow = false;
  }
  const petal = kit.mat('#b68b54');
  for (let i = 0; i < 100; i++) {
    const x = -9 + randomValue() * 20,
      z = 11.3 + randomValue() * 4.8;
    const leaf = kit.mesh(new THREE.PlaneGeometry(0.04, 0.07), petal, [x, 0.033, z], root, [
      -Math.PI / 2,
      0,
      randomValue() * 6,
    ]);
    leaf.castShadow = false;
  }
  return {
    animate(time: number) {
      steam.forEach((sprite, i) => {
        const phase = (time * 0.18 + i / 12) % 1;
        sprite.position.set(
          -0.95 + Math.sin(phase * 4 + i) * phase * 0.22,
          1.83 + phase * 1.36,
          1.66 + Math.cos(i) * phase * 0.13,
        );
        sprite.scale.setScalar(0.11 + phase * 0.61);
        sprite.material.opacity = Math.sin(phase * Math.PI) * 0.48;
      });
    },
  };
}
