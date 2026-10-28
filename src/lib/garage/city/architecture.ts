import * as THREE from 'three';
import { group, type SceneKit, type Point3 } from './types';
import type { CityMaterials } from './materials';
import { createWindowGlass } from './windows';

export function createArchitecture(kit: SceneKit, materials: CityMaterials) {
  const { box, plane, beam, cyl, root } = kit;
  const m = materials;
  const warmWindow = createWindowGlass(kit, true),
    coolWindow = createWindowGlass(kit, false);
  const gableMaterial = m.cream.clone();
  gableMaterial.side = THREE.DoubleSide;
  kit.mats.add(gableMaterial);

  function sign(
    parent: THREE.Object3D,
    position: Point3,
    width: number,
    height: number,
    title: string,
    subtitle = '',
    color = '#233d39',
    kannada = false,
  ) {
    // Match the bitmap to the physical plaque; narrow signs no longer squash their lettering.
    const pixelWidth = width < 0.6 ? 512 : 1536;
    const pixelHeight = Math.round((pixelWidth * height) / width);
    const map = kit.texture(pixelWidth, pixelHeight, (c) => {
      const w = pixelWidth,
        h = pixelHeight,
        pad = Math.max(8, h * 0.07);
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#aa9366';
      c.lineWidth = Math.max(2, h * 0.009);
      c.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#f0e7cf';
      let fontSize = h * (subtitle ? (kannada ? 0.42 : 0.32) : 0.46);
      c.font = `${fontSize}px ${kannada ? 'Kannada' : 'Plex'},monospace`;
      while (c.measureText(title).width > w * 0.88) {
        fontSize -= 1;
        c.font = `${fontSize}px ${kannada ? 'Kannada' : 'Plex'},monospace`;
      }
      c.fillText(title, w / 2, h * (subtitle ? 0.4 : 0.51));
      if (subtitle) {
        c.font = `${h * 0.17}px Plex,monospace`;
        c.fillStyle = '#c5bc9d';
        c.fillText(subtitle, w / 2, h * 0.75, w * 0.88);
      }
      for (const x of [pad * 1.9, w - pad * 1.9])
        for (const y of [pad * 1.9, h - pad * 1.9]) {
          c.fillStyle = '#8b805f';
          c.beginPath();
          c.arc(x, y, h * 0.011, 0, Math.PI * 2);
          c.fill();
        }
    });
    map.magFilter = THREE.LinearFilter;
    map.anisotropy = 8;
    const material = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.52,
      metalness: 0.12,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity: 0.045,
    });
    kit.mats.add(material);
    box(
      [position[0], position[1], position[2] - 0.045],
      [width + 0.06, height + 0.06, 0.06],
      m.gold,
      parent,
      [0, 0, 0],
      0.01,
    );
    return plane(position, width, height, material, parent);
  }

  function window(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    width = 1.35,
    height = 1.85,
    shutters = true,
    warm = true,
  ) {
    const unit = group(parent, [x, y, z]);
    box([0, 0, -0.035], [width + 0.2, height + 0.22, 0.12], m.stone, unit, [0, 0, 0], 0.02);
    for (const dx of [-1, 1])
      box(
        [dx * (width / 2 + 0.06), 0, 0.04],
        [0.08, height + 0.16, 0.18],
        m.cream,
        unit,
        [0, 0, 0],
        0.012,
      );
    box([0, 0, 0.035], [width, height, 0.08], m.wood, unit);
    plane([0, 0, 0.085], width - 0.13, height - 0.13, warm ? warmWindow : coolWindow, unit);
    for (const dx of [-0.48, 0, 0.48])
      box([dx * width, 0, 0.125], [0.045, height, 0.045], m.wood, unit);
    for (const dy of [-0.47, -0.12, 0.23, 0.47])
      box([0, dy * height, 0.125], [width, 0.035, 0.045], m.wood, unit);
    box([0, -height / 2 - 0.12, 0.14], [width + 0.32, 0.1, 0.4], m.stone, unit, [0, 0, 0], 0.018);
    box([0, height / 2 + 0.13, 0.13], [width + 0.34, 0.13, 0.32], m.stone, unit, [0, 0, 0], 0.018);
    if (shutters)
      for (const side of [-1, 1]) {
        const shutter = group(unit, [side * (width * 0.5 + 0.27), 0, 0.06], side * -0.16);
        box([0, 0, 0], [0.4, height, 0.065], m.wood, shutter);
        for (let j = 0; j < 13; j++)
          box(
            [0, -height * 0.44 + j * height * 0.073, 0.046],
            [0.34, 0.075, 0.02],
            m.iron,
            shutter,
            [0.22, 0, 0],
          );
      }
    return unit;
  }

  function balcony(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    width: number,
    depth = 1.1,
  ) {
    box([x, y, z - depth / 2], [width, 0.16, depth], m.stone, parent);
    for (const side of [-1, 1]) {
      const px = x + side * (width / 2 - 0.13);
      box([px, y + 0.53, z], [0.13, 1.1, 0.13], m.wood, parent);
      box([px, y + 0.52, z - depth / 2], [0.055, 0.9, depth], m.wood, parent);
    }
    for (let i = 0; i < Math.floor(width / 0.22); i++) {
      const px = x - width / 2 + 0.19 + i * 0.22;
      cyl([px, y + 0.48, z], 0.027, 0.04, 0.9, m.wood, parent);
      box([px, y + 0.48, z], [0.075, 0.14, 0.075], m.wood, parent);
    }
    for (const dy of [0.12, 0.98]) box([x, y + dy, z], [width, 0.075, 0.095], m.wood, parent);
  }

  function roof(
    parent: THREE.Object3D,
    position: Point3,
    width: number,
    depth: number,
    rise: number,
  ) {
    const g = group(parent, position);
    const half = depth / 2,
      slope = Math.atan2(rise, half),
      length = Math.hypot(half, rise);
    for (const side of [-1, 1]) {
      box([0, -rise / 2, (side * half) / 2], [width, 0.11, length], m.roof, g, [
        side * slope,
        0,
        0,
      ]);
      box([0, -rise, side * half], [width + 0.07, 0.2, 0.13], m.wood, g);
      // Individual curved leading tiles catch light at the eaves and make the silhouette read.
      for (let x = -width / 2 + 0.1; x < width / 2; x += 0.2) {
        cyl([x, -rise + 0.04, side * (half - 0.2)], 0.078, 0.078, 0.53, m.roof, g, [
          Math.PI / 2 + side * slope,
          0,
          0,
        ]);
      }
    }
    cyl([0, 0.025, 0], 0.14, 0.14, width + 0.18, m.roof, g, [0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-half, -rise);
      shape.lineTo(half, -rise);
      shape.lineTo(0, 0);
      shape.closePath();
      kit.mesh(new THREE.ShapeGeometry(shape), gableMaterial, [(side * width) / 2, 0, 0], g, [
        0,
        (side * Math.PI) / 2,
        0,
      ]);
      beam([(side * width) / 2, -0.05, 0], [(side * width) / 2, -rise, half], 0.055, m.wood, g);
      beam([(side * width) / 2, -0.05, 0], [(side * width) / 2, -rise, -half], 0.055, m.wood, g);
    }
    return g;
  }

  function lantern(parent: THREE.Object3D, position: Point3, scale = 1) {
    const g = group(parent, position);
    g.scale.setScalar(scale);
    box([0, 0, -0.1], [0.1, 0.32, 0.1], m.iron, g);
    box([0, 0, 0.05], [0.16, 0.23, 0.16], m.bulb, g);
    for (const x of [-0.09, 0.09])
      for (const z of [-0.04, 0.14]) box([x, 0, z], [0.018, 0.28, 0.018], m.iron, g);
    cyl([0, 0.185, 0.05], 0, 0.16, 0.12, m.iron, g);
    box([0, -0.15, 0.05], [0.23, 0.035, 0.23], m.iron, g);
    return g;
  }

  function heroHouse() {
    const house = group(root);
    house.name = 'arnav-house';
    // Existing workshop occupies the left ground-floor bay; the home extends right and above.
    box([6, 1.68, -0.08], [6.3, 3.36, 7.0], m.cream, house);
    box([2.8, 3.47, -0.12], [12.3, 0.2, 7.55], m.stone, house);
    box([2.8, 4.94, -0.6], [12.0, 2.8, 5.8], m.cream, house);
    box([6, 0.35, 3.47], [6.3, 0.7, 0.16], m.brick, house);
    box([6.5, 1.3, 3.51], [1.25, 2.6, 0.15], m.wood, house);
    for (const x of [6.2, 6.8])
      for (const y of [0.58, 1.3, 2.05]) box([x, y, 3.6], [0.46, 0.55, 0.035], m.iron, house);
    cyl([6.87, 1.2, 3.65], 0.025, 0.025, 0.12, m.gold, house, [Math.PI / 2, 0, 0]);
    window(house, 4.35, 1.85, 3.51, 1.2, 1.55, false);
    window(house, 8.05, 1.85, 3.51, 1.1, 1.55, false);
    for (const x of [-2.0, 0.35, 3.0, 5.65, 8.0]) window(house, x, 4.94, 2.34, 1.3, 1.94);
    balcony(house, 2.8, 3.52, 4.12, 12.1, 1.82);
    for (const x of [-3.15, 1.1, 5.1, 8.75]) {
      box([x, 4.97, 4.08], [0.18, 2.9, 0.18], m.wood, house);
      box([x, 3.68, 4.08], [0.34, 0.29, 0.34], m.stone, house);
      box([x, 6.27, 4.08], [0.38, 0.17, 0.38], m.wood, house);
      for (const side of [-1, 1])
        beam([x, 5.86, 4.08], [x + side * 0.46, 6.36, 4.08], 0.035, m.wood, house);
    }
    roof(house, [2.8, 8.05, 0.2], 13.4, 9.15, 1.45);
    for (const x of [-3.08, 2.98, 8.88]) {
      box([x, 1.61, 3.95], [0.22, 3.22, 0.22], m.stone, house);
      box([x, 0.19, 3.95], [0.4, 0.38, 0.4], m.stone, house);
      lantern(house, [x, 2.38, 4.1], 1.05);
    }
    box([2.8, 3.25, 3.99], [12.4, 0.2, 1.22], m.wood, house);
    // A broad sloping tile awning unifies the garage opening and house entry.
    box([2.8, 3.38, 4.08], [12.6, 0.13, 1.37], m.roof, house, [0.13, 0, 0]);
    box([2.8, 3.21, 4.74], [12.65, 0.14, 0.14], m.wood, house);
    for (const x of [-3.4, 9.0]) cyl([x, 1.6, 3.5], 0.035, 0.035, 3.2, m.iron, house);
    // Deep cornices, sill courses and carved door panels catch light at walking distance.
    for (const y of [0.14, 3.35, 6.35])
      box([6, y, 3.48], [6.2, 0.09, 0.18], m.stone, house, [0, 0, 0], 0.015);
    for (const x of [5.76, 7.24])
      box([x, 1.36, 3.62], [0.13, 2.78, 0.19], m.wood, house, [0, 0, 0], 0.018);
    box([6.5, 2.77, 3.62], [1.61, 0.14, 0.22], m.wood, house, [0, 0, 0], 0.022);
    box([6.5, 0.035, 3.78], [1.67, 0.08, 0.75], m.stone, house, [0, 0, 0], 0.015);
    for (const x of [6.2, 6.8])
      for (const y of [0.58, 1.3, 2.05])
        box([x, y, 3.625], [0.39, 0.46, 0.035], m.wood, house, [0, 0, 0], 0.02);
    return house;
  }

  function townHouse(
    position: Point3,
    width: number,
    height: number,
    depth: number,
    color: THREE.Material,
    yaw = 0,
    variant = 0,
  ) {
    const g = group(root, position, yaw);
    const front = depth / 2;
    box([0, height / 2, 0], [width, height, depth], color, g);
    box([0, 0.35, front + 0.03], [width, 0.7, 0.08], m.brick, g);
    box([0, height + 0.12, 0], [width + 0.3, 0.23, depth + 0.3], m.stone, g);
    box([0, height + 0.5, front], [width, 0.7, 0.17], color, g);
    for (const side of [-1, 1]) {
      box([side * (width / 2 - 0.08), height + 0.48, 0], [0.16, 0.7, depth], color, g);
      box([side * (width / 2 - 0.08), height + 0.86, 0], [0.24, 0.08, depth + 0.2], m.stone, g);
      const elevation = group(g, [side * (width / 2 + 0.03), 0, 0], (side * Math.PI) / 2);
      for (let level = 0; level < Math.floor(height / 2.8); level++)
        for (const z of [-depth * 0.26, depth * 0.26])
          window(elevation, z, 1.5 + level * 2.8, 0, 1.1, 1.5, false, level % 2 === 0);
      cyl([side * (width / 2 - 0.16), height / 2, front - 0.2], 0.026, 0.026, height, m.iron, g);
    }
    box([0, height + 0.48, -front], [width, 0.7, 0.17], color, g);
    box([0, height + 0.86, front], [width + 0.2, 0.08, 0.24], m.stone, g);
    const levels = Math.floor(height / 2.8);
    for (let i = 0; i < levels; i++) {
      const y = 1.5 + i * 2.8;
      for (const x of [-width * 0.26, width * 0.26])
        window(g, x, y, front + 0.06, 1.2, 1.6, false, (i + variant) % 3 !== 1);
      if (i > 0) balcony(g, 0, y - 1.0, front + 0.75, width - 0.55, 0.78);
    }
    box([0, 1.15, front + 0.07], [0.98, 2.3, 0.12], m.wood, g);
    cyl([-width * 0.24, height + 0.6, -0.6], 0.56, 0.56, 1.05, m.rubber, g);
    for (let i = 0; i < 6; i++)
      cyl([-width * 0.24, height + 0.2 + i * 0.15, -0.6], 0.574, 0.574, 0.04, m.iron, g);
    if (variant % 2 === 0) roof(g, [0, height + 1.0, 0], width + 0.5, depth + 0.6, 0.8);
    return g;
  }

  /** Background homes use the same material palette with simpler silhouettes and glazing. */
  function districtHouse(
    position: Point3,
    width: number,
    height: number,
    depth: number,
    color: THREE.Material,
    yaw = 0,
    variant = 0,
  ) {
    const g = group(root, position, yaw),
      front = depth / 2;
    g.name = 'neighbourhood-home';
    box([0, height / 2, 0], [width, height, depth], color, g);
    box([0, 0.3, front + 0.015], [width, 0.6, 0.035], m.stone, g);
    for (const y of [height * 0.33, height * 0.66, height])
      box([0, y, front + 0.08], [width + 0.14, 0.1, 0.22], m.stone, g);
    box([0, height + 0.24, 0], [width + 0.22, 0.15, depth + 0.22], m.stone, g);
    for (const side of [-1, 1]) {
      box([0, height + 0.56, side * front], [width, 0.62, 0.16], color, g);
      box([(side * width) / 2, height + 0.56, 0], [0.16, 0.62, depth], color, g);
    }
    const levels = Math.floor(height / 2.8),
      columns = Math.max(2, Math.floor(width / 3));
    function flatWindow(parent: THREE.Object3D, x: number, y: number, z: number, index: number) {
      box([x, y, z], [1.31, 1.65, 0.09], m.wood, parent);
      plane(
        [x, y, z + 0.051],
        1.17,
        1.48,
        (index + variant) % 4 === 0 ? warmWindow : coolWindow,
        parent,
      );
      box([x, y, z + 0.07], [0.043, 1.55, 0.035], m.iron, parent);
      box([x, y - 0.14, z + 0.071], [1.22, 0.043, 0.035], m.iron, parent);
      box([x, y - 0.88, z + 0.09], [1.47, 0.1, 0.26], m.stone, parent);
    }
    for (let level = 0; level < levels; level++)
      for (let col = 0; col < columns; col++) {
        flatWindow(
          g,
          (col - (columns - 1) / 2) * (width / (columns + 0.3)),
          1.5 + level * 2.8,
          front + 0.06,
          col + level * 3,
        );
      }
    // A side window prevents the gaps between streets from reading as blank slabs.
    for (const side of [-1, 1]) {
      const elevation = group(g, [side * (width / 2 + 0.035), 0, 0], (side * Math.PI) / 2);
      for (let level = 0; level < levels; level++)
        flatWindow(elevation, 0, 1.5 + level * 2.8, 0, level + side);
    }
    const terrace = group(g, [-width * 0.26, height + 0.32, -0.7]);
    cyl([0, 0.55, 0], 0.65, 0.65, 1.1, m.rubber, terrace);
    for (const y of [0.08, 0.28, 0.48, 0.68, 0.88, 1.07])
      cyl([0, y, 0], 0.665, 0.665, 0.035, m.iron, terrace);
    box([width * 0.27, height + 0.68, -0.6], [width * 0.24, 1.1, 2.0], color, g);
    box([width * 0.27, height + 1.27, -0.6], [width * 0.27, 0.13, 2.2], m.stone, g);
    if (variant % 3 === 0) {
      const solar = box(
        [width * 0.23, height + 1.48, -0.45],
        [width * 0.24, 0.07, 1.45],
        m.glass,
        g,
        [0.28, 0, 0],
      );
      solar.castShadow = false;
      for (const x of [-0.32, 0, 0.32])
        box(
          [width * 0.23 + x, height + 1.49, -0.45],
          [0.015, 0.035, 1.45],
          m.steel,
          g,
          [0.28, 0, 0],
        );
    }
    if (variant % 2 === 0) {
      const aerial = group(g, [width * 0.25, height + 1.37, depth * 0.18]);
      cyl([0, 0.65, 0], 0.018, 0.018, 1.3, m.iron, aerial);
      beam([-0.45, 1.03, 0], [0.45, 1.03, 0], 0.012, m.iron, aerial);
      beam([-0.3, 0.9, -0.2], [0.3, 0.9, -0.2], 0.012, m.iron, aerial);
    }
    return g;
  }
  return { sign, lantern, heroHouse, townHouse, districtHouse };
}
export type Architecture = ReturnType<typeof createArchitecture>;
