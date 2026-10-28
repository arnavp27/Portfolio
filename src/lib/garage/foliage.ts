import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../graphics/textures';
import { group, type Point3, type SceneKit } from './city/types';

export type PlantSpecies = 'calathea' | 'rubber' | 'pothos';
export interface PlantOptions {
  /** Height and radius of the foliage above the supplied soil origin, in metres. */
  height?: number;
  radius?: number;
  seed?: number;
  species?: PlantSpecies;
}
export interface VineOptions {
  seed?: number;
  spread?: number;
  leafSize?: number;
  flowers?: boolean;
}

type LeafForm = PlantSpecies | 'tree';
const up = new THREE.Vector3(0, 1, 0);
const resources = new WeakMap<Set<THREE.BufferGeometry>, ReturnType<typeof makeResources>>();

/** A cupped blade, not an alpha card: width, tip curl and the central fold are geometry. */
function blade(form: LeafForm, rows = 9, columns = 5) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    const heart = form === 'pothos';
    const breadth = form === 'rubber' ? 0.43 : heart ? 0.53 : form === 'tree' ? 0.24 : 0.34;
    const profile = Math.pow(
      Math.max(0.0005, Math.sin(Math.PI * (heart ? Math.pow(t, 0.67) : t))),
      form === 'rubber' ? 0.65 : 0.83,
    );
    for (let col = 0; col < columns; col++) {
      const u = (col / (columns - 1)) * 2 - 1;
      const ripple = form === 'calathea' ? 1 + 0.028 * Math.sin(t * Math.PI * 12) : 1;
      const x = u * profile * breadth * ripple;
      const y = t - (heart ? 0.13 * u * u * Math.exp(-t * t * 18) : 0);
      const fold = Math.sin(Math.PI * t) * (0.035 * (1 - Math.abs(u)) - 0.085 * u * u);
      const curl = (form === 'calathea' ? 0.15 : 0.09) * t * t - 0.21 * t * t * t;
      positions.push(x, y, fold + curl);
      uvs.push((u + 1) / 2, t);
      if (row && col) {
        const i = row * columns + col;
        indices.push(i - columns - 1, i - columns, i, i - columns - 1, i, i - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function paintBlade(c: CanvasRenderingContext2D, form: PlantSpecies, bump: boolean) {
  const w = 256,
    h = 512,
    rng = random(form === 'calathea' ? 602 : form === 'rubber' ? 33 : 27);
  const shades =
    form === 'calathea'
      ? ['#304e37', '#81a360', '#29482f']
      : form === 'rubber'
        ? ['#2a4e37', '#7d9b5d', '#36573b']
        : ['#4e7540', '#a2b46e', '#406335'];
  if (bump) {
    c.fillStyle = '#787878';
    c.fillRect(0, 0, w, h);
  } else {
    const wash = c.createLinearGradient(0, 0, w, 0);
    wash.addColorStop(0, shades[0]);
    wash.addColorStop(0.48, shades[1]);
    wash.addColorStop(1, shades[2]);
    c.fillStyle = wash;
    c.fillRect(0, 0, w, h);
    // Broad, asymmetric variation survives the game's reduced render resolution.
    if (form === 'pothos')
      for (let i = 0; i < 9; i++) {
        c.fillStyle = i % 2 ? '#c8c58262' : '#2c553e55';
        const x = 70 + rng() * 120,
          y = rng() * h;
        c.beginPath();
        c.ellipse(x, y, 12 + rng() * 22, 35 + rng() * 38, -0.35 + rng() * 0.7, 0, Math.PI * 2);
        c.fill();
      }
  }
  for (let i = 0; i < 10; i++) {
    const y = 72 + i * 39;
    for (const side of [-1, 1]) {
      if (form === 'calathea' && !bump) {
        c.fillStyle = i % 2 ? '#b5c68a9c' : '#182f2468';
        c.beginPath();
        c.moveTo(128, y + 18);
        c.bezierCurveTo(128 + side * 39, y + 5, 128 + side * 80, y - 20, 128 + side * 116, y - 27);
        c.bezierCurveTo(128 + side * 77, y + 4, 128 + side * 36, y + 24, 128, y + 33);
        c.fill();
      }
      c.strokeStyle = bump ? '#a4a4a4' : form === 'rubber' ? '#adbc7e80' : '#c1cc8d68';
      c.lineWidth = bump ? 2.8 : 1.7;
      c.beginPath();
      c.moveTo(128, y + 18);
      c.bezierCurveTo(128 + side * 40, y + 3, 128 + side * 74, y - 13, 128 + side * 122, y - 30);
      c.stroke();
      if (!bump)
        for (let j = 0; j < 3; j++) {
          c.strokeStyle = '#d1d59e24';
          c.lineWidth = 0.8;
          c.beginPath();
          c.moveTo(128 + side * (23 + j * 24), y + 4 - j * 10);
          c.lineTo(128 + side * (44 + j * 25), y - 19 - j * 9);
          c.stroke();
        }
    }
  }
  c.strokeStyle = bump ? '#d8d8d8' : '#c5c995b0';
  c.lineWidth = bump ? 5 : 3.5;
  c.beginPath();
  c.moveTo(128, 512);
  c.bezierCurveTo(127, 340, 130, 112, 128, 0);
  c.stroke();
  if (!bump)
    for (let i = 0; i < 800; i++) {
      c.fillStyle = rng() > 0.5 ? '#e0dfad0a' : '#132c2109';
      c.fillRect(rng() * w, rng() * h, 1, 1 + rng() * 3);
    }
}

/** Align the blade's length to the stem and its face toward a natural light-catching plane. */
function leafMatrix(
  base: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  width = 1,
  twist = 0,
  normal = up,
) {
  const y = direction.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, normal);
  if (x.lengthSq() < 0.001) x.set(1, 0, 0);
  else x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(up, twist));
  return new THREE.Matrix4().compose(base, q, new THREE.Vector3(length * width, length, length));
}

function makeResources(kit: SceneKit) {
  const geometries = {
    calathea: blade('calathea'),
    rubber: blade('rubber'),
    pothos: blade('pothos'),
    tree: blade('tree', 5, 3),
  };
  const materials = {} as Record<PlantSpecies, THREE.MeshStandardMaterial>;
  for (const form of ['calathea', 'rubber', 'pothos'] as const) {
    const map = kit.texture(256, 512, (c) => paintBlade(c, form, false));
    const bumpMap = kit.texture(256, 512, (c) => paintBlade(c, form, true));
    for (const texture of [map, bumpMap]) {
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    bumpMap.colorSpace = THREE.NoColorSpace;
    const material = new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.016,
      roughness: form === 'rubber' ? 0.46 : 0.68,
      side: THREE.DoubleSide,
      color: '#e1e8d2',
    });
    materials[form] = material;
    kit.mats.add(material);
  }
  // The canopy uses a light version of the rubber-leaf paint with readable midribs.
  const canopy = ['#b9c89b', '#94b487', '#d1ce9b'].map((color) => {
    const material = new THREE.MeshStandardMaterial({
      map: materials.rubber.map,
      color,
      side: THREE.DoubleSide,
      roughness: 0.76,
    });
    kit.mats.add(material);
    return material;
  });
  const stemMaterial = kit.mat('#546b3d', 0.85);
  const stemGeometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  const bractMaterials = ['#a95572', '#c77c8b', '#d5a28d'].map((color) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      roughness: 0.83,
    });
    kit.mats.add(material);
    return material;
  });
  // Eleven actual tapered leaves per spray; a complete shape replaces a noisy alpha cloud.
  const sprays = Array.from({ length: 3 }, (_, variant) => {
    const parts: THREE.BufferGeometry[] = [];
    const rng = random(121 + variant);
    for (let pair = 0; pair < 5; pair++)
      for (const side of [-1, 1]) {
        const y = 0.12 + pair * 0.19;
        const base = new THREE.Vector3(side * 0.015, y, 0.025 * Math.sin(y * 3));
        const direction = new THREE.Vector3(
          side * (0.65 + rng() * 0.15),
          0.4 + rng() * 0.22,
          (rng() - 0.5) * 0.18,
        );
        const length = 0.42 - pair * 0.032 + rng() * 0.045;
        const copy = geometries.tree
          .clone()
          .applyMatrix4(
            leafMatrix(
              base,
              direction,
              length,
              0.95,
              (rng() - 0.5) * 0.5,
              new THREE.Vector3(0, 0, 1),
            ),
          );
        parts.push(copy);
      }
    parts.push(
      geometries.tree
        .clone()
        .applyMatrix4(
          leafMatrix(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 1, -0.08),
            0.3,
            0.9,
            0,
            new THREE.Vector3(0, 0, 1),
          ),
        ),
    );
    const geometry = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    return geometry;
  });
  [...Object.values(geometries), stemGeometry, ...sprays].forEach((geometry) =>
    kit.geos.add(geometry),
  );
  return { geometries, materials, canopy, stemMaterial, stemGeometry, bractMaterials, sprays };
}

/** Shared between indoor and exterior plants; all resources use the world's existing disposal sets. */
export function createFoliage(kit: SceneKit) {
  let shared = resources.get(kit.geos);
  if (!shared) {
    shared = makeResources(kit);
    resources.set(kit.geos, shared);
  }
  const r = shared;
  function stem(parent: THREE.Object3D, start: Point3, end: Point3, radius = 0.004) {
    const a = new THREE.Vector3(...start),
      b = new THREE.Vector3(...end),
      direction = b.clone().sub(a);
    const object = kit.mesh(
      r.stemGeometry,
      r.stemMaterial,
      a.clone().add(b).multiplyScalar(0.5).toArray() as Point3,
      parent,
    );
    object.scale.set(radius, direction.length(), radius);
    object.quaternion.setFromUnitVectors(up, direction.normalize());
    return object;
  }
  function leaf(
    parent: THREE.Object3D,
    base: Point3,
    direction: Point3,
    length: number,
    form: PlantSpecies,
    width = 1,
    twist = 0,
    facing: Point3 = [0, 1, 0],
  ) {
    const object = kit.mesh(r.geometries[form], r.materials[form], [0, 0, 0], parent);
    leafMatrix(
      new THREE.Vector3(...base),
      new THREE.Vector3(...direction),
      length,
      width,
      twist,
      new THREE.Vector3(...facing),
    ).decompose(object.position, object.quaternion, object.scale);
    return object;
  }
  function plant(parent: THREE.Object3D, position: Point3, options: PlantOptions = {}) {
    const { height = 0.48, radius = 0.27, seed = 17, species = 'calathea' } = options;
    const rng = random(seed),
      g = group(parent, position),
      count = species === 'rubber' ? 10 : 13;
    g.name = `${species}-plant`;
    if (species === 'rubber') {
      stem(g, [0, 0, 0], [0.035, height * 0.78, -0.025], 0.009);
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399 + seed,
          t = i / count;
        const base: Point3 = [t * 0.035, height * (0.1 + t * 0.65), -t * 0.025];
        const petiole: Point3 = [
          base[0] + Math.cos(angle) * radius * 0.16,
          base[1] + height * 0.07,
          base[2] + Math.sin(angle) * radius * 0.16,
        ];
        stem(g, base, petiole, 0.0035);
        leaf(
          g,
          petiole,
          [Math.cos(angle), 0.12 + t * 0.45, Math.sin(angle)],
          radius * (1.1 - t * 0.3),
          species,
          1,
          (rng() - 0.5) * 0.5,
        );
      }
    } else {
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399 + seed * 0.17;
        const center = i >= count - 3;
        const rise = height * (center ? 0.46 + rng() * 0.12 : 0.18 + rng() * 0.3);
        const reach = radius * (center ? 0.08 : 0.22 + rng() * 0.14);
        const start: Point3 = [Math.cos(angle) * 0.024, 0, Math.sin(angle) * 0.024];
        const elbow: Point3 = [
          Math.cos(angle) * reach * 0.36,
          rise * 0.6,
          Math.sin(angle) * reach * 0.36,
        ];
        const petiole: Point3 = [Math.cos(angle) * reach, rise, Math.sin(angle) * reach];
        stem(g, start, elbow, 0.0045);
        stem(g, elbow, petiole, 0.0038);
        const tilt = center ? 1.65 : 0.05 + rng() * 0.5;
        leaf(
          g,
          petiole,
          [Math.cos(angle), tilt, Math.sin(angle)],
          radius * (center ? 0.78 : 0.72 + rng() * 0.14),
          species,
          0.85 + rng() * 0.15,
          (rng() - 0.5) * 0.5,
        );
      }
    }
    return g;
  }
  function vine(
    parent: THREE.Object3D,
    position: Point3,
    length: number,
    options: VineOptions = {},
  ) {
    const { seed = 7, spread = 0.15, leafSize = 0.19, flowers = false } = options;
    const rng = random(seed),
      g = group(parent, position),
      steps = Math.max(2, Math.ceil(length / 0.13));
    g.name = flowers ? 'bougainvillea-vine' : 'pothos-vine';
    let last: Point3 = [0, 0, 0];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const next: Point3 = [
        Math.sin(i * 0.54) * spread * 0.45,
        -length * t,
        Math.sin(i * 0.37) * 0.055,
      ];
      if (i) stem(g, last, next, 0.005);
      const side = i % 2 ? 1 : -1;
      const petiole: Point3 = [next[0] + side * spread * 0.38, next[1] - 0.018, next[2] + 0.04];
      stem(g, next, petiole, 0.0025);
      leaf(
        g,
        petiole,
        [side * 0.65, -0.72 + rng() * 0.2, 0.05 + rng() * 0.15],
        leafSize * (0.82 + rng() * 0.35),
        'pothos',
        0.9,
        (rng() - 0.5) * 0.7,
        [0, 0, 1],
      );
      if (flowers && i % 3 === 1) {
        const center: Point3 = [next[0] - side * 0.07, next[1] + 0.02, next[2] + 0.1];
        stem(g, next, center, 0.0025);
        for (let petal = 0; petal < 3; petal++) {
          const angle = (petal * Math.PI * 2) / 3 + i;
          const flower = kit.mesh(
            r.geometries.pothos,
            r.bractMaterials[(i + petal) % 3],
            [0, 0, 0],
            g,
          );
          leafMatrix(
            new THREE.Vector3(...center),
            new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.35),
            0.1,
            0.7,
            0.15,
            new THREE.Vector3(0, 0, 1),
          ).decompose(flower.position, flower.quaternion, flower.scale);
        }
      }
      last = next;
    }
    return g;
  }
  function canopy(parent: THREE.Object3D, position: Point3, radius: number, rng: () => number) {
    const g = group(parent, position);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.399 + rng() * 0.4,
        lift = 0.15 + rng() * 0.4;
      const length = radius * (0.9 + rng() * 0.3);
      const direction = new THREE.Vector3(Math.cos(angle), lift, Math.sin(angle)).normalize();
      const start = new THREE.Vector3(
        (rng() - 0.5) * radius * 0.35,
        (rng() - 0.5) * radius * 0.2,
        (rng() - 0.5) * radius * 0.35,
      );
      const spray = kit.mesh(r.sprays[i % 3], r.canopy[i % 3], [0, 0, 0], g);
      const matrix = leafMatrix(start, direction, length, 1, (rng() - 0.5) * 0.75);
      matrix.decompose(spray.position, spray.quaternion, spray.scale);
      const end = new THREE.Vector3(0, 0.96, 0).applyMatrix4(matrix);
      stem(g, start.toArray() as Point3, end.toArray() as Point3, 0.006);
    }
    return g;
  }
  return { plant, vine, canopy };
}
