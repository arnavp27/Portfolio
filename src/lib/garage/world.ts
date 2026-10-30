import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, random } from '../graphics/textures';
import { computers, type ComputerId } from './computers';
import { createGaragePower } from './power';
import { clearFoliageConstructionCache, createFoliage } from './foliage';
import { buildCourtyard } from './environment';
import { createCityMaterials } from './city/materials';
import { DisposableSet, loadTogether } from './loading';
import {
  cloneBatchGeometry,
  pruneEmptyStaticGroups,
  releaseUnusedGeometries,
} from './geometry-batching';
type P = [number, number, number];
export type RoomAction =
  | 'kazam'
  | 'projects'
  | 'lamp'
  | 'car'
  | 'solar'
  | 'garage-lights'
  | 'computer-power'
  | 'kazam-power'
  | 'projects-power'
  | 'kazam-keyboard'
  | 'projects-keyboard';

export async function buildCameraRoom(scene: T.Scene) {
  const resources = createRoomResources(scene);
  try {
    return await assembleCameraRoom(scene, resources);
  } catch (error) {
    resources.dispose();
    throw error;
  }
}

function createRoomResources(scene: T.Scene) {
  const existing = new Set(scene.children);
  const root = new T.Group();
  scene.add(root);
  const maps = new DisposableSet<T.Texture>(),
    mats = new DisposableSet<T.Material>(),
    geos = new DisposableSet<T.BufferGeometry>();
  let disposed = false;
  return {
    root,
    maps,
    mats,
    geos,
    dispose() {
      if (disposed) return;
      disposed = true;
      geos.dispose();
      mats.dispose();
      maps.dispose();
      for (const object of [...scene.children]) {
        if (existing.has(object)) continue;
        object.traverse((child) => {
          if (child instanceof T.Light && 'shadow' in child)
            (child as T.SpotLight).shadow?.dispose();
        });
        object.removeFromParent();
      }
    },
  };
}

async function assembleCameraRoom(
  scene: T.Scene,
  resources: ReturnType<typeof createRoomResources>,
) {
  const { root, maps, mats, geos } = resources;
  const materialsByColor = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string, roughness = 0.9, metalness = 0) => {
    const key = color + '/' + roughness + '/' + metalness;
    let m = materialsByColor.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness, metalness });
      mats.add(m);
      materialsByColor.set(key, m);
    }
    return m;
  };
  const texture = (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    const t = canvasTexture(w, h, paint);
    t.anisotropy = 8;
    maps.add(t);
    return t;
  };
  const image = (url: string) =>
    new Promise<T.Texture>((resolve, reject) => {
      new T.TextureLoader().load(
        url,
        (t) => {
          t.colorSpace = T.SRGBColorSpace;
          t.anisotropy = 8;
          maps.add(t);
          resolve(t);
        },
        undefined,
        reject,
      );
    });
  const pbr = async (name: string, repeat: [number, number] = [1, 1]) => {
    const ts = await loadTogether(
      ['Diffuse', 'nor_gl', 'Rough'].map((channel) =>
        image(`/assets/garage/textures/${name}-${channel}.jpg`),
      ),
    );
    ts.forEach((t, i) => {
      if (i) t.colorSpace = T.NoColorSpace;
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(...repeat);
    });
    const m = new T.MeshStandardMaterial({
      map: ts[0],
      normalMap: ts[1],
      roughnessMap: ts[2],
      roughness: 0.9,
      normalScale: new T.Vector2(0.35, 0.35),
    });
    mats.add(m);
    return m;
  };
  const loader = new GLTFLoader();
  async function loadModel(id: string) {
    const gltf = await loader.loadAsync(`/assets/garage/models/${id}/${id}.gltf`);
    gltf.scene.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      geos.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        mats.add(material);
        const standard = material as T.MeshStandardMaterial;
        standard.roughness = Math.max(0.5, standard.roughness);
        for (const value of Object.values(material))
          if (value instanceof T.Texture) {
            value.anisotropy = 8;
            maps.add(value);
          }
      }
    });
    return gltf.scene;
  }
  // Downloads are independent; keep assembly below in its authored order once all are ready.
  // Resource ownership remains active after a failure so late arrivals are safely released.
  const [[floorPbr, wallPbr, tablePbr], outdoorMaterials, models, photos] = await loadTogether(
    [
      loadTogether([
        pbr('wood_floor_worn', [2.2, 2.8]),
        pbr('yellow_plaster', [2, 1]),
        pbr('wood_table_worn'),
      ]),
      createCityMaterials({ maps, mats, mat }),
      loadTogether([
        loadModel('metal_office_desk'),
        loadModel('GreenChair_01'),
        loadModel('desk_lamp_arm_01'),
        loadModel('wooden_bookshelf_worn'),
      ]),
      loadTogether(
        ['sdi-presenting', 'sdi-finals', 'sdi-jury'].map((name) =>
          image(`/assets/images/${name}.webp`),
        ),
      ),
      loadTogether([
        document.fonts.load('32px Kannada'),
        document.fonts.load('32px Plex'),
        document.fonts.load('32px Pixel'),
      ]),
    ],
    90_000,
  );
  const wood = tablePbr;
  wood.color.set('#b6a891');
  const plaster = wallPbr;
  plaster.color.set('#c6b393');
  const dark = mat('#18242b'),
    red = mat('#733328'),
    brass = mat('#a1763c', 0.5, 0.45),
    metal = mat('#323f40', 0.6, 0.6),
    paper = mat('#c2b390'),
    clay = mat('#945a39'),
    black = mat('#0e1519');
  const emissive = (color: string, intensity = 1) => {
    const m = new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      toneMapped: false,
    });
    mats.add(m);
    return m;
  };
  const bulb = emissive('#ffcd79', 2);
  function mesh(
    g: T.BufferGeometry,
    m: T.Material,
    p: P,
    parent: T.Object3D = root,
    r: P = [0, 0, 0],
  ) {
    const o = new T.Mesh(g, m);
    geos.add(g);
    o.position.set(...p);
    o.rotation.set(...r);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  const box = (p: P, s: P, m: T.Material, parent: T.Object3D = root, r: P = [0, 0, 0], bevel = 0) =>
    mesh(bevel ? new RoundedBoxGeometry(...s, 1, bevel) : new T.BoxGeometry(...s), m, p, parent, r);
  const cyl = (
    p: P,
    top: number,
    bottom: number,
    height: number,
    m: T.Material,
    parent: T.Object3D = root,
    r: P = [0, 0, 0],
  ) => mesh(new T.CylinderGeometry(top, bottom, height, 16), m, p, parent, r);
  const plane = (
    p: P,
    w: number,
    h: number,
    m: T.Material,
    parent: T.Object3D = root,
    r: P = [0, 0, 0],
  ) => mesh(new T.PlaneGeometry(w, h), m, p, parent, r);
  const group = (p: P = [0, 0, 0], rotation = 0, action?: RoomAction) => {
    const g = new T.Group();
    g.position.set(...p);
    g.rotation.y = rotation;
    if (action) g.userData.action = action;
    root.add(g);
    return g;
  };
  function beam(a: P, b: P, r: number, m: T.Material, parent: T.Object3D = root) {
    const av = new T.Vector3(...a),
      bv = new T.Vector3(...b),
      v = bv.clone().sub(av),
      o = cyl(av.add(bv).multiplyScalar(0.5).toArray() as P, r, r, v.length(), m, parent);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
    return o;
  }
  function wire(points: P[], radius = 0.009, parent: T.Object3D = root) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    return mesh(new T.TubeGeometry(curve, 24, radius, 5, false), black, [0, 0, 0], parent);
  }
  function desktopTexture(title: string, work: boolean) {
    return texture(512, 326, (c) => {
      c.fillStyle = work ? '#37483d' : '#315959';
      c.fillRect(0, 0, 512, 326);
      c.textAlign = 'center';
      c.fillStyle = work ? '#8b9d7966' : '#8bb4a766';
      c.font = '38px Pixel,monospace';
      c.fillText(title, 303, 162);
      c.font = '9px Plex,monospace';
      c.fillText(work ? 'WORK NOTES / ARNAV PATIL' : 'PROJECTS & EXPERIMENTS', 303, 187);
      for (let i = 0; i < (work ? 3 : 4); i++) {
        const y = 18 + i * 67;
        c.fillStyle = '#b2944f';
        c.fillRect(25, y + 8, 26, 18);
        c.fillStyle = '#ead28d';
        c.fillRect(25, y + 4, 12, 6);
        c.fillRect(27, y + 11, 26, 15);
        c.fillStyle = '#e3e7cb';
        c.font = '8px Plex,monospace';
        c.fillText(
          (work
            ? ['My work', 'readme.txt', 'Contact']
            : ['Projects', 'Open source', 'readme.txt', 'Contact'])[i],
          39,
          y + 40,
        );
      }
      c.fillStyle = '#c4c8b6';
      c.fillRect(0, 304, 512, 22);
      c.fillStyle = '#e8ead5';
      c.fillRect(3, 307, 48, 15);
      c.textAlign = 'left';
      c.fillStyle = '#304238';
      c.font = '10px Plex,monospace';
      c.fillText('Start', 11, 319);
      c.fillRect(477, 313, 4, 4);
    });
  }
  function print(
    p: P,
    w: number,
    h: number,
    map: T.Texture,
    parent: T.Object3D = root,
    r: P = [0, 0, 0],
    glow = 0.05,
  ) {
    const m = new T.MeshStandardMaterial({
      map,
      emissive: '#fff',
      emissiveMap: map,
      emissiveIntensity: glow,
      roughness: 1,
    });
    mats.add(m);
    return plane(p, w, h, m, parent, r);
  }
  const power = createGaragePower();
  const foliage = createFoliage({
    root,
    mat,
    texture,
    mesh,
    box,
    cyl,
    plane,
    beam,
    mats,
    geos,
    maps,
  });
  // The geometry stays in place for the entire route. Camera movement reveals its sides.
  const rand = random(212);
  box([0, -0.08, 0.05], [5.35, 0.15, 6.5], dark);
  plane([0, 0.001, 0.05], 5.2, 6.3, floorPbr, root, [-Math.PI / 2, 0, 0]);
  box([-2.67, 1.6, 0.05], [0.15, 3.2, 6.4], plaster);
  box([2.67, 1.6, 0.05], [0.15, 3.2, 6.4], plaster);
  box([0, 0.6, -3.13], [5.5, 1.2, 0.18], plaster);
  box([0, 3.08, -3.13], [5.5, 0.25, 0.18], plaster);
  box([-2.13, 2.1, -3.13], [1.24, 1.8, 0.18], plaster);
  box([2.13, 2.1, -3.13], [1.24, 1.8, 0.18], plaster);
  box([0, 3.27, 0.05], [5.5, 0.15, 6.5], mat('#3e3d32'));
  for (const x of [-2.5, 0, 2.5]) box([x, 3.13, 0.05], [0.14, 0.2, 6.4], wood);
  for (const z of [-2.9, -0.1, 2.9]) box([0, 3.1, z], [5.3, 0.16, 0.15], wood);
  for (const x of [-2.57, 2.57]) box([x, 0.12, 0.1], [0.07, 0.24, 6.2], dark);
  box([0, 0.12, -3], [5.1, 0.24, 0.06], dark);
  for (const x of [-2.55, 2.55]) {
    box([x, 1.6, 3.2], [0.28, 3.2, 0.28], red);
    box([x + (x < 0 ? -0.29 : 0.29), 1.6, 3.21], [0.32, 3.2, 0.22], plaster);
  }
  box([0, 3.18, 3.23], [5.5, 0.5, 0.28], red);
  for (let i = 0; i < 7; i++) box([0, 2.91 + i * 0.042, 3.21], [4.95, 0.03, 0.11], red);
  print(
    [0, 3.22, 4.82],
    3.1,
    0.27,
    texture(1240, 108, (c) => {
      c.fillStyle = '#1b3335';
      c.fillRect(0, 0, 1240, 108);
      c.strokeStyle = '#8c966d';
      c.lineWidth = 2;
      c.strokeRect(5, 5, 1230, 98);
      c.fillStyle = '#e0cf9c';
      c.textAlign = 'center';
      c.font = '500 48px Plex,monospace';
      c.fillText('ARNAV PATIL’S GARAGE', 620, 72);
    }),
    root,
    [0, 0, 0],
    0.1,
  );
  box([0, -0.02, 3.4], [5.4, 0.14, 0.5], mat('#797767'));
  // The real window opens onto a neighbouring courtyard and balcony.
  const indoorObjects = new Set(root.children);
  const outdoors = buildCourtyard(
    scene,
    {
      root,
      mat,
      texture,
      mesh,
      box,
      cyl,
      plane,
      beam,
      mats,
      geos,
      maps,
    },
    outdoorMaterials,
  );
  for (const child of root.children)
    if (!indoorObjects.has(child))
      child.traverse((o) => {
        o.userData.outdoor = true;
      });
  for (const x of [-1.55, -0.52, 0.52, 1.55]) box([x, 2.11, -3.025], [0.055, 1.88, 0.12], dark);
  for (const y of [1.2, 2.13, 3.02]) box([0, y, -3.02], [3.15, 0.055, 0.12], dark);
  box([0, 1.19, -2.96], [3.3, 0.07, 0.26], wood);
  // Rug: individually drawn motifs, rendered on a floor surface with real depth.
  const rugMap = texture(512, 768, (c) => {
    const r = random(55);
    c.fillStyle = '#5b342b';
    c.fillRect(0, 0, 512, 768);
    c.strokeStyle = '#bc874b';
    c.lineWidth = 15;
    c.strokeRect(18, 18, 476, 732);
    c.lineWidth = 3;
    c.strokeRect(40, 40, 432, 688);
    for (let y = 70; y < 730; y += 45)
      for (let x = 70; x < 470; x += 45) {
        c.fillStyle = (x + y) % 3 ? '#9c7240' : '#294652';
        c.beginPath();
        c.moveTo(x, y - 14);
        c.lineTo(x + 11, y);
        c.lineTo(x, y + 14);
        c.lineTo(x - 11, y);
        c.fill();
      }
    for (let i = 0; i < 15000; i++) {
      c.fillStyle = r() > 0.5 ? '#211e2570' : '#ddc39530';
      c.fillRect(r() * 512, r() * 768, 2, 1);
    }
  });
  const rugMat = new T.MeshStandardMaterial({ map: rugMap, roughness: 1 });
  mats.add(rugMat);
  plane([0.45, 0.002, 0.02], 1.65, 3.8, rugMat, root, [-Math.PI / 2, 0, 0]);
  // Reusable real 3D furniture. Dimensions are normalized once, not guessed per camera.
  function model(g: T.Group, p: P, height: number, rotation = 0) {
    const bounds = new T.Box3().setFromObject(g),
      size = bounds.getSize(new T.Vector3()),
      center = bounds.getCenter(new T.Vector3());
    g.position.sub(center);
    g.position.y += size.y / 2;
    const outer = group(p, rotation);
    outer.scale.setScalar(height / size.y);
    outer.add(g);
    return outer;
  }
  const desk = model(models[0], [-1.35, 0, 0.83], 0.81),
    chair = model(models[1], [-1.93, 0, 1.95], 1.04, Math.PI + 0.72),
    deskLamp = model(models[2], [-2.11, 0.85, 0.59], 1.0, Math.PI + 0.3),
    bookcase = model(models[3], [2.32, 0, -1.62], 1.95, -Math.PI / 2);
  desk.name = 'work-desk';
  chair.name = 'foreground-chair';
  deskLamp.name = 'articulated-lamp';
  bookcase.name = 'bookshelf';
  deskLamp.userData.action = 'lamp';
  deskLamp.userData.dynamic = true;
  box([-1.35, 0.84, 0.83], [2.13, 0.07, 1.0], wood, root, [0, 0, 0], 0.015);
  const bench = group([0, 0, -2.4]);
  box([0, 0.82, 0], [3.5, 0.1, 0.85], wood, bench);
  for (const x of [-1.55, 1.55])
    for (const z of [-0.3, 0.3]) box([x, 0.4, z], [0.08, 0.8, 0.08], metal, bench);
  box([0, 0.2, 0], [3.25, 0.075, 0.65], wood, bench);
  type Screen = {
    material: T.MeshBasicMaterial;
    map: T.Texture;
    led: T.MeshStandardMaterial;
    boot: number;
  };
  const screens = {} as Record<ComputerId, Screen>;
  const towerLeds = {} as Record<ComputerId, T.MeshStandardMaterial>;
  const keyboardKeys = {} as Record<ComputerId, { mesh: T.Mesh; rest: number; until: number }>;
  const powerButtons = {} as Record<ComputerId, T.Mesh>;
  function crt(p: P, width: number, title: string, id: ComputerId) {
    const g = group(p, 0, id),
      h = width * 0.69;
    box([0, 0, -0.14], [width, h, 0.43], mat('#a2977d'), g, [0, 0, 0], 0.045);
    box([0, 0, 0.083], [width * 0.84, h * 0.8, 0.04], dark, g, [0, 0, 0], 0.018);
    const screenMap = desktopTexture(title, id === 'kazam');
    screenMap.magFilter = T.NearestFilter;
    const screenMaterial = new T.MeshBasicMaterial({ map: screenMap, toneMapped: false });
    mats.add(screenMaterial);
    plane([0, 0.005, 0.107], width * 0.78, h * 0.72, screenMaterial, g);
    box([0, -h * 0.5 - 0.08, -0.12], [width * 0.56, 0.16, 0.29], metal, g);
    box([0, -h * 0.5 - 0.17, -0.02], [width * 0.66, 0.035, 0.37], dark, g);
    for (let i = 0; i < 9; i++)
      box([width * 0.505, -h * 0.3 + i * 0.028, -0.12], [0.005, 0.012, 0.19], black, g);
    const led = emissive('#79b98a', 0.5);
    cyl([width * 0.39, -h * 0.4, 0.112], 0.011, 0.011, 0.012, led, g, [Math.PI / 2, 0, 0]);
    screens[id] = { material: screenMaterial, map: screenMap, led, boot: 0 };
    return g;
  }
  for (const id of ['kazam', 'projects'] as const) {
    const pc = computers[id];
    crt(pc.position, pc.width, pc.title, id);
  }
  function keyboard(p: P, id: ComputerId, width = 0.65) {
    const g = group(p, 0, `${id}-keyboard`);
    box([0, 0, 0], [width, 0.045, 0.24], mat('#948b76'), g, [0, 0, 0], 0.01);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 12; i++) {
        const key = box(
          [-width * 0.45 + i * width * 0.079, 0.027, -0.085 + j * 0.05],
          [width * 0.065, 0.012, 0.037],
          mat(i % 4 === 0 ? '#777768' : '#c5bba0'),
          g,
        );
        if (j === 3 && i === 5) {
          key.userData.dynamic = true;
          keyboardKeys[id] = { mesh: key, rest: key.position.y, until: 0 };
        }
      }
  }
  keyboard([-1.22, 0.9, 1.09], 'kazam');
  keyboard([0, 0.895, -2.04], 'projects', 0.68);
  // Each tower has its own physical power button; the case itself is not a monitor shortcut.
  function tower(p: P, id: ComputerId) {
    const g = group(p);
    box([0, 0, 0], [0.28, 0.48, 0.48], mat('#8c8b74'), g, [0, 0, 0], 0.015);
    box([0, 0.15, 0.245], [0.21, 0.07, 0.012], dark, g);
    box([0, 0.05, 0.248], [0.18, 0.022, 0.014], black, g);
    for (let i = 0; i < 5; i++) box([0, -0.07 + i * 0.015, 0.249], [0.19, 0.005, 0.009], dark, g);
    const buttonY = id === 'kazam' ? -0.13 : -0.166;
    const button = cyl([0, buttonY, 0.254], 0.034, 0.034, 0.014, mat('#b7b398'), g, [
      Math.PI / 2,
      0,
      0,
    ]);
    button.userData.action = `${id}-power`;
    button.userData.dynamic = true;
    powerButtons[id] = button;
    // Recessed ring, large enough to find at normal walking distance.
    const ring = mesh(new T.TorusGeometry(0.041, 0.006, 6, 20), dark, [0, buttonY, 0.248], g);
    ring.userData.action = `${id}-power`;
    const led = emissive('#86b57e', 0.4);
    towerLeds[id] = led;
    cyl([0.086, -0.166, 0.252], 0.009, 0.009, 0.011, led, g, [Math.PI / 2, 0, 0]);
    return g;
  }
  tower([0.99, 1.1, -2.47], 'projects');
  tower([-1.04, 0.27, 1.04], 'kazam');
  wire(
    [
      [-1.04, 0.23, 0.79],
      [-1.08, 0.09, 0.6],
      [-1.25, 0.07, 0.3],
      [-1.3, 1.3, 0.32],
    ],
    0.006,
  );
  const mouse = box(
    [0.51, 0.9, -2.03],
    [0.105, 0.055, 0.16],
    mat('#b0aa90'),
    root,
    [0, 0.12, 0],
    0.025,
  );
  mouse.name = 'personal-mouse';
  box([0.51, 0.93, -2.065], [0.004, 0.003, 0.07], dark);
  wire(
    [
      [0.51, 0.89, -2.1],
      [0.58, 0.88, -2.31],
      [0.71, 0.88, -2.42],
    ],
    0.005,
  );
  for (let i = 0; i < 3; i++) {
    box(
      [-0.98, 0.89 + i * 0.018, -2.16],
      [0.15, 0.014, 0.15],
      mat(i % 2 ? '#576554' : '#324753'),
      root,
      [0, i * 0.12, 0],
    );
    box([-0.98, 0.9 + i * 0.018, -2.12], [0.11, 0.002, 0.06], paper, root, [0, i * 0.12, 0]);
  }

  wire([
    [-1.15, 0.86, 1.2],
    [-0.6, 0.86, 1.08],
    [-0.37, 0.64, 1.08],
    [-0.4, 0.12, 0.77],
    [-0.7, 0.01, 0.6],
  ]);
  wire([
    [-1.3, 1.3, 0.32],
    [-1.55, 1.1, 0.1],
    [-1.55, 0.4, 0.2],
    [-1.6, 0.1, 0.4],
  ]);
  // A handful of desk-sized objects make distance and occlusion easy to read.
  cyl([-1.99, 0.99, 1.04], 0.065, 0.06, 0.24, mat('#9b998a', 0.28, 0.8));
  cyl([-1.99, 1.112, 1.04], 0.057, 0.057, 0.005, mat('#302821'));
  for (let i = 0; i < 3; i++)
    box(
      [-1.65, 0.9 + i * 0.028, 1.14],
      [0.31, 0.024, 0.23],
      mat(i % 2 ? '#684a2b' : '#263f47'),
      root,
      [0, 0.14, 0],
    );
  const car = group([-0.55, 0.92, 1.01], -0.08, 'car');
  car.userData.dynamic = true;
  box([0, 0.035, 0], [0.28, 0.06, 0.12], mat('#a53e27', 0.4), car, [0, 0, 0], 0.012);
  box([-0.01, 0.085, 0], [0.13, 0.055, 0.105], red, car, [0, 0, 0], 0.013);
  box([0.04, 0.095, 0], [0.04, 0.035, 0.107], mat('#739295'), car, [0, 0, 0.22]);
  for (const x of [-0.09, 0.09])
    for (const z of [-0.07, 0.07])
      cyl([x, 0.025, z], 0.033, 0.033, 0.024, black, car, [Math.PI / 2, 0, 0]);
  function books(p: P, count: number, parent: T.Object3D = root, seed = 0) {
    const palette = ['#273c43', '#796046', '#943f2c', '#615d45', '#b3996a'];
    for (let i = 0; i < count; i++) {
      const h = 0.2 + (i % 4) * 0.035;
      box(
        [p[0] + i * 0.067, p[1] + h / 2, p[2]],
        [0.058, h, 0.18],
        mat(palette[(i + seed) % 5]),
        parent,
        [0, 0, i === count - 1 ? -0.12 : 0],
      );
      box([p[0] + i * 0.067, p[1] + h * 0.72, p[2] + 0.091], [0.04, 0.006, 0.003], brass, parent);
    }
  }
  function plant(p: P, scale = 1) {
    const g = group(p);
    g.scale.setScalar(scale);
    cyl([0, 0.12, 0], 0.13, 0.09, 0.24, clay, g);
    cyl([0, 0.24, 0], 0.12, 0.12, 0.012, mat('#2a251e'), g);
    foliage.plant(g, [0, 0.25, 0], {
      height: 0.4,
      radius: 0.22,
      seed: Math.round((p[0] + 5) * 17 + p[2] * 11),
      species: p[1] > 1 ? 'pothos' : p[0] > 0 ? 'rubber' : 'calathea',
    });
  }
  plant([-2.3, 0, 2.85], 1.5);
  plant([2.35, 0, 2.83], 1.4);
  plant([1.34, 0.88, -2.54], 0.85);
  plant([1.18, 1.24, -2.96], 0.6);
  for (const [y, z] of [
    [2.1, 0.9],
    [2.62, 0.9],
    [2.2, -1.55],
  ]) {
    box([-2.43, y, z], [0.34, 0.055, 1.5], wood);
    const shelf = group([-2.35, y + 0.035, z + 0.45], Math.PI / 2);
    books([0, 0, 0], 8, shelf);
  }
  // Ivy: articulated stems and leaf meshes are in world space, not screen-space cutouts.
  for (const [i, [x, z]] of [
    [-2.43, 0.4],
    [-2.43, -0.6],
    [1.4, -2.95],
    [2.4, -1.25],
  ].entries())
    foliage.vine(root, [x, 2.98, z], 1.23, { seed: 31 + i, spread: 0.13, leafSize: 0.13 });
  const tools = group([-2.568, 1.65, 0.3], Math.PI / 2);
  box([0, 0, 0], [1.0, 0.7, 0.024], mat('#785c3a'), tools);
  for (let x = -0.44; x <= 0.44; x += 0.06)
    for (let y = -0.28; y <= 0.28; y += 0.06)
      cyl([x, y, 0.016], 0.007, 0.007, 0.006, black, tools, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) {
    box([-0.37 + i * 0.145, 0.03, 0.04], [0.02, 0.28 + (i % 2) * 0.08, 0.02], metal, tools);
    box(
      [-0.37 + i * 0.145, -0.11, 0.04],
      [0.034, 0.13, 0.028],
      mat(i % 2 ? '#8b5d2f' : '#824832'),
      tools,
    );
  }
  // A framed print and paper notes stay attached to the actual walls.
  const lake = texture(384, 512, (c) => {
    c.fillStyle = '#bac2a0';
    c.fillRect(0, 0, 384, 512);
    c.strokeStyle = '#e7dcc0';
    c.lineWidth = 9;
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.moveTo(-20, 70 + i * 47);
      c.lineTo(400, 120 + i * 43);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(15 + i * 78, 90);
      c.lineTo(-35 + i * 81, 425);
      c.stroke();
    }
    c.fillStyle = '#587e7c';
    for (const [x, y, rx, ry] of [
      [96, 185, 37, 60],
      [267, 309, 28, 49],
      [185, 234, 18, 31],
    ]) {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#354f48';
    c.fillRect(0, 0, 384, 73);
    c.fillRect(0, 438, 384, 74);
    c.textAlign = 'center';
    c.fillStyle = '#e4d6ad';
    c.font = '35px Pixel,monospace';
    c.fillText('BENGALURU', 192, 48);
    c.font = '12px Plex,monospace';
    c.fillText('12.97° N / 77.59° E', 192, 482);
  });
  const picture = group([-2.57, 2.21, 2.03], Math.PI / 2);
  box([0, 0, 0], [0.6, 0.85, 0.045], wood, picture);
  print([0, 0, 0.024], 0.52, 0.77, lake, picture);
  const cork = group([2.565, 1.95, 0.5], -Math.PI / 2, 'solar');
  box([0, 0, 0], [1.45, 1.1, 0.07], wood, cork);
  box([0, 0, 0.04], [1.34, 0.99, 0.015], mat('#86613c'), cork);
  for (let i = 0; i < 5; i++) {
    box(
      [-0.47 + (i % 3) * 0.46, 0.19 - Math.floor(i / 3) * 0.44, 0.06],
      [0.32, 0.36, 0.002],
      paper,
      cork,
      [0, 0, (i - 2) * 0.035],
    );
    cyl(
      [-0.47 + (i % 3) * 0.46, 0.34 - Math.floor(i / 3) * 0.44, 0.066],
      0.012,
      0.012,
      0.008,
      red,
      cork,
      [Math.PI / 2, 0, 0],
    );
  }

  photos.forEach((photo, i) =>
    print([-0.46 + i * 0.46, 0.2, 0.069], 0.31, 0.25, photo, cork, [0, 0, (i - 1) * 0.035]),
  );
  const making = group([2.35, 0, 0.68], -Math.PI / 2, 'solar');
  box([0, 0.83, 0], [1.3, 0.07, 0.48], wood, making);
  for (const x of [-0.54, 0.54]) box([x, 0.4, 0], [0.08, 0.8, 0.34], metal, making);
  for (let i = 0; i < 3; i++) {
    cyl([-0.28 + i * 0.23, 0.98, 0], 0.08, 0.08, 0.22, clay, making);
    cyl([-0.28 + i * 0.23, 1.092, 0], 0.052, 0.052, 0.004, mat('#563728'), making);
  }
  const noteMap = texture(256, 256, (c) => {
    c.fillStyle = '#c8bd98';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#776b51';
    c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(61 + i * 66, 118, 24, 10, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeRect(37 + i * 66, 118, 48, 65);
    }
    c.fillStyle = '#5c5744';
    c.font = '18px Plex,monospace';
    c.fillText('MATERIAL STUDIES', 27, 40);
    c.font = '12px Plex,monospace';
    c.fillText('clay / airflow / form', 29, 219);
  });
  print([-0.47, -0.25, 0.069], 0.3, 0.3, noteMap, cork, [0, 0, -0.035]);
  const awardMap = texture(256, 256, (c) => {
    c.fillStyle = '#c8bd98';
    c.fillRect(0, 0, 256, 256);
    c.textAlign = 'center';
    c.fillStyle = '#4e634a';
    c.font = '36px Pixel,monospace';
    c.fillText('RUNNER-UP', 128, 111);
    c.font = '16px Plex,monospace';
    c.fillText('SDI 2025', 128, 151);
    c.strokeStyle = '#7d805d';
    c.strokeRect(18, 27, 220, 202);
  });
  print([-0.01, -0.25, 0.069], 0.3, 0.3, awardMap, cork, [0, 0, 0.035]);
  // Wooden crates, bound notebooks, small tins and shelves: near/far detail throughout.
  for (let i = 0; i < 5; i++) {
    const x = -1.4 + i * 0.59;
    box([x, 0.38, -2.4], [0.47, 0.31, 0.5], mat(i % 2 ? '#504c38' : '#5a3b29'));
    box([x, 0.43, -2.142], [0.11, 0.028, 0.02], brass);
  }
  for (const [level, y] of [0.103, 0.373, 0.633, 0.913, 1.213, 1.573].entries()) {
    const shelf = group([2.16, y, -2.13], -Math.PI / 2);
    shelf.scale.y = 0.72;
    books([0, 0, 0], [4, 7, 3, 6, 5, 8][level], shelf, level);
    if (level === 2 || level === 4) cyl([0.83, 0.11, 0], 0.07, 0.07, 0.22, brass, shelf);
    else if (level < 2) {
      box([0.78, 0.11, 0], [0.31, 0.22, 0.22], mat(level ? '#546b60' : '#6c5540'), shelf);
      box([0.78, 0.12, 0.112], [0.13, 0.07, 0.004], paper, shelf);
    } else if (level === 3) {
      for (let i = 0; i < 4; i++)
        box(
          [0.78, 0.025 + i * 0.035, 0],
          [0.3, 0.028, 0.19],
          mat(i % 2 ? '#465863' : '#9b825c'),
          shelf,
          [0, 0.06 * i, 0],
        );
    } else {
      box([0.88, 0.08, 0], [0.22, 0.16, 0.12], dark, shelf);
      cyl([0.88, 0.08, 0.075], 0.05, 0.05, 0.04, metal, shelf, [Math.PI / 2, 0, 0]);
    }
  }
  plant([2.3, 1.955, -1.65], 0.65);
  books([1.35, 0.88, -2.68], 4);
  books([-1.6, 0.27, -2.42], 6);
  for (let i = 0; i < 3; i++) {
    box([-2.31, 0.15 + i * 0.28, 2.36], [0.42, 0.26, 0.45], wood);
    box([-2.31, 0.15 + i * 0.28, 2.59], [0.15, 0.035, 0.017], metal);
  }
  const stool = group([1.4, 0, -1.29]);
  cyl([0, 0.57, 0], 0.23, 0.23, 0.06, wood, stool);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    beam(
      [Math.cos(a) * 0.14, 0.55, Math.sin(a) * 0.14],
      [Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2],
      0.022,
      metal,
      stool,
    );
  }
  // Wall clock, switch plates and desk tools read as objects in the same room.
  const clock = group([2.57, 2.52, 2.02], -Math.PI / 2);
  cyl([0, 0, 0], 0.22, 0.22, 0.055, metal, clock, [Math.PI / 2, 0, 0]);
  const clockMap = texture(256, 256, (c) => {
    c.fillStyle = '#d8cfb0';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#46524b';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      c.lineWidth = i % 3 ? 3 : 6;
      c.beginPath();
      c.moveTo(128 + Math.sin(a) * 91, 128 - Math.cos(a) * 91);
      c.lineTo(128 + Math.sin(a) * 104, 128 - Math.cos(a) * 104);
      c.stroke();
    }
    const now = new Date(),
      parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(now)
        .split(':')
        .map(Number);
    for (const [a, len, width] of [
      [(((parts[0] % 12) + parts[1] / 60) * Math.PI) / 6, 55, 7],
      [(parts[1] * Math.PI) / 30, 80, 4],
    ]) {
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(128, 128);
      c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
      c.stroke();
    }
    c.fillStyle = '#805744';
    c.fillRect(124, 124, 8, 8);
  });
  const clockMat = new T.MeshStandardMaterial({ map: clockMap, roughness: 1 });
  mats.add(clockMat);
  mesh(new T.CircleGeometry(0.195, 32), clockMat, [0, 0, 0.03], clock);
  const rockers = {} as Record<'lights' | 'computers', T.Mesh>;
  for (const x of [-2.58, 2.58]) {
    const key = x < 0 ? 'lights' : 'computers',
      g = group(
        [x, 1.3, 2.35],
        x < 0 ? Math.PI / 2 : -Math.PI / 2,
        x < 0 ? 'garage-lights' : 'computer-power',
      );
    g.userData.dynamic = true;
    box([0, 0, 0], [0.12, 0.19, 0.025], paper, g, [0, 0, 0], 0.008);
    rockers[key] = box(
      [0, 0, 0.022],
      [0.064, 0.092, 0.015],
      mat('#8e9380'),
      g,
      [0.13, 0, 0],
      0.004,
    );
    for (const y of [-0.074, 0.074])
      cyl([0, y, 0.015], 0.005, 0.005, 0.005, metal, g, [Math.PI / 2, 0, 0]);
  }

  box([0.51, 0.871, -2.03], [0.3, 0.008, 0.28], mat('#3a5352'));
  cyl([-0.61, 0.97, -2.65], 0.05, 0.045, 0.2, mat('#648277'));
  for (let i = 0; i < 4; i++)
    beam(
      [-0.64 + i * 0.019, 0.95, -2.65],
      [-0.64 + i * 0.019, 1.14 + (i % 2) * 0.035, -2.65],
      0.006,
      mat(i % 2 ? '#bda369' : '#b56945'),
    );
  // Warm task lights and a cool window bounce reveal the furniture instead of crushing it to black.
  const windowFill = new T.PointLight('#7d9bc8', 1.4, 6, 1.8);
  windowFill.position.set(0, 2.4, -2.85);
  scene.add(windowFill);
  // Lighting: warm local lamps, blue window light and restrained fill.
  scene.add(new T.HemisphereLight('#819fc9', '#252936', 0.52));
  const moon = new T.DirectionalLight('#9cb9e5', 0.72);
  moon.position.set(-15, 24, 10);
  moon.target.position.set(0, 0, 8);
  scene.add(moon.target);
  moon.castShadow = true;
  moon.shadow.mapSize.set(4096, 4096);
  Object.assign(moon.shadow.camera, {
    left: -17,
    right: 17,
    top: 18,
    bottom: -18,
    near: 0.5,
    far: 68,
  });
  moon.shadow.normalBias = 0.025;
  moon.shadow.radius = 3;
  moon.shadow.bias = -0.0001;
  scene.add(moon);
  const roomLights: { light: T.Light; power: number; task: boolean }[] = [];
  const warmSpot = (p: P, target: P, power: number, angle: number, task = false) => {
    const l = new T.SpotLight('#ffc982', power, 10, angle, 0.65, 1.5);
    l.position.set(...p);
    l.target.position.set(...target);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.025;
    scene.add(l, l.target);
    roomLights.push({ light: l, power, task });
    return l;
  };
  // Aim the light from the actual imported shade onto the front of the desk.
  deskLamp.updateWorldMatrix(true, true);
  const shadeBounds = new T.Box3();
  const lampBulbs: T.MeshStandardMaterial[] = [];
  deskLamp.traverse((o) => {
    if (o instanceof T.Mesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m instanceof T.MeshStandardMaterial && m.emissive.getHex() !== 0) {
          lampBulbs.push(m);
          shadeBounds.expandByObject(o);
        }
  });
  const shade = shadeBounds.isEmpty()
    ? new T.Vector3(-2.05, 1.72, 0.8)
    : shadeBounds.getCenter(new T.Vector3());
  shade.y -= 0.045;
  shade.z += 0.025;
  warmSpot(shade.toArray() as P, [-1.55, 0.86, 1.17], 7.5, 1.0, true);
  warmSpot([0.2, 2.7, -1.94], [0, 0.7, -2.1], 18, 1.05);
  warmSpot([1.8, 2.63, 1.55], [2.5, 1.7, 0.5], 12, 0.8);
  const glow = new T.PointLight('#ffcd94', 1.0, 3, 2);
  glow.position.copy(shade);
  scene.add(glow);
  roomLights.push({ light: glow, power: 1, task: true });
  const lampEmission = lampBulbs.map((m) => m.emissiveIntensity);
  let lampOn = true;
  function syncPower() {
    const state = power.snapshot();
    for (const item of roomLights)
      item.light.intensity = state.lights && (!item.task || lampOn) ? item.power : 0;
    bulb.emissiveIntensity = state.lights ? 2 : 0;
    bulb.color.set(state.lights ? '#ffcd79' : '#625d50');
    lampBulbs.forEach(
      (m, i) => (m.emissiveIntensity = state.lights && lampOn ? lampEmission[i] : 0),
    );
    rockers.lights.rotation.x = state.lights ? 0.13 : -0.13;
    rockers.computers.rotation.x = state.computers.kazam || state.computers.projects ? 0.13 : -0.13;
    for (const id of ['kazam', 'projects'] as const) {
      const on = state.computers[id],
        screen = screens[id];
      screen.material.map = on ? screen.map : null;
      screen.material.color.set(on ? '#ffffff' : '#070c0d');
      screen.material.needsUpdate = true;
      for (const led of [screen.led, towerLeds[id]]) {
        led.color.set(on ? '#86b57e' : '#26322a');
        led.emissiveIntensity = on ? 0.45 : 0;
      }
      powerButtons[id].position.z = on ? 0.251 : 0.257;
    }
  }
  for (const [x, z] of [
    [0.2, -1.94],
    [1.8, 1.55],
  ]) {
    cyl([x, 3.0, z], 0.009, 0.009, 0.5, metal);
    cyl([x, 2.72, z], 0.08, 0.22, 0.18, dark);
    cyl([x, 2.625, z], 0.19, 0.19, 0.008, bulb);
  }
  // Consolidate static handmade pieces by material; imported models keep their mesh detail.
  root.updateMatrixWorld(true);
  const originals: T.Mesh[] = [];
  const buckets = new Map<
    string,
    { material: T.Material; action?: RoomAction; outdoor: boolean; geometries: T.BufferGeometry[] }
  >();
  root.traverse((o) => {
    if (!(o instanceof T.Mesh) || o instanceof T.SkinnedMesh || Array.isArray(o.material)) return;
    let parent: T.Object3D | null = o,
      action: RoomAction | undefined;
    while (parent) {
      if (parent.userData.dynamic) return;
      if (parent.userData.action) action = parent.userData.action;
      parent = parent.parent;
    }
    const outdoor = !!o.userData.outdoor;
    // Keep distant houses in separate batches so their geometry can leave the camera frustum.
    const location = new T.Vector3().setFromMatrixPosition(o.matrixWorld);
    const district = outdoor
      ? Math.floor(location.x / 16) + ':' + Math.floor(location.z / 16)
      : 'room';
    const key = o.material.uuid + '/' + (action || '') + '/' + district;
    if (!buckets.has(key))
      buckets.set(key, { material: o.material, action, outdoor, geometries: [] });
    const g = cloneBatchGeometry(o.geometry, o.matrixWorld);
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv'))
      g.setAttribute(
        'uv',
        new T.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
      );
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    buckets.get(key)!.geometries.push(g);
    originals.push(o);
  });
  for (const o of originals) o.removeFromParent();
  pruneEmptyStaticGroups(root, scene);
  const batch = new T.Group();
  root.add(batch);
  buckets.forEach((b) => {
    const geometry = mergeGeometries(b.geometries);
    b.geometries.forEach((g) => g.dispose());
    if (!geometry) return;
    geos.add(geometry);
    const m = new T.Mesh(geometry, b.material);
    m.castShadow = !(b.material instanceof T.MeshBasicMaterial);
    m.receiveShadow = true;
    m.userData.outdoor = b.outdoor;
    if (b.action) m.userData.action = b.action;
    batch.add(m);
  });
  const pickables: T.Object3D[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh && !o.userData.outdoor) pickables.push(o);
  });
  const rainGeometry = new T.BufferGeometry(),
    rainData = new Float32Array(220 * 6),
    rainOffsets = new Float32Array(220 * 2);
  for (let i = 0; i < 220; i++) {
    const x = rand() * 40 - 20,
      y = rand() * 5,
      z = i < 160 ? 11.3 + rand() * 17 : -4.0 - rand() * 7;
    rainData.set([x, y, z, x - 0.015, y + 0.12, z], i * 6);
    rainOffsets[i * 2 + 1] = 0.12;
  }
  rainGeometry.setAttribute('position', new T.BufferAttribute(rainData, 3));
  rainGeometry.setAttribute('segmentOffset', new T.BufferAttribute(rainOffsets, 1));
  geos.add(rainGeometry);
  const rainMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader:
      'uniform float time; attribute float segmentOffset; void main(){vec3 p=position;p.y=mod(p.y-segmentOffset-time*2.5,5.0)+segmentOffset;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
    fragmentShader: 'void main(){gl_FragColor=vec4(.65,.78,.9,.13);}',
  });
  mats.add(rainMat);
  const rain = new T.LineSegments(rainGeometry, rainMat);
  rain.frustumCulled = false;
  root.add(rain);
  // Assembly is complete: keep only geometries reachable by the finished scene.
  clearFoliageConstructionCache(geos);
  releaseUnusedGeometries(scene, geos);
  let carKick = 0,
    lastAnimation = 0;
  syncPower();
  return {
    pickables,
    traffic: outdoors.traffic,
    vehicleCount: outdoors.vehicleCount,
    pedestrianCount: outdoors.pedestrianCount,
    setRain: (visible: boolean) => {
      rain.visible = visible;
    },
    isComputerOn: (id: ComputerId) => power.snapshot().computers[id],
    getPowerState: power.snapshot,
    interact: (action: RoomAction) => {
      const before = power.snapshot();
      if (action === 'lamp') lampOn = !lampOn;
      if (action === 'garage-lights') power.toggleLights();
      if (action === 'computer-power') power.toggleComputers();
      for (const id of ['kazam', 'projects'] as const) {
        if (action === `${id}-power`) power.toggleComputer(id);
        if (action === `${id}-keyboard`) keyboardKeys[id].until = lastAnimation + 0.17;
      }
      if (action === 'car') carKick = 1;
      const after = power.snapshot();
      for (const id of ['kazam', 'projects'] as const)
        if (!before.computers[id] && after.computers[id]) screens[id].boot = lastAnimation + 1.15;
      syncPower();
      return after;
    },
    animate: (time: number, observer?: { x: number; z: number }) => {
      const dt = Math.min(0.05, Math.max(0, time - lastAnimation));
      lastAnimation = time;
      outdoors.animate(time, observer);
      rainMat.uniforms.time.value = time;
      carKick = Math.max(0, carKick - dt * 0.75);
      car.position.x = -0.55 + Math.sin((1 - carKick) * Math.PI) * 0.18;
      for (const id of ['kazam', 'projects'] as const) {
        const key = keyboardKeys[id];
        key.mesh.position.y = key.rest - (time < key.until ? 0.008 : 0);
        if (power.snapshot().computers[id]) {
          const screen = screens[id],
            remaining = screen.boot - time;
          screen.material.color.setScalar(
            remaining > 0 ? 0.12 + (Math.sin(time * 49) * 0.5 + 0.5) * 0.19 : 1,
          );
        }
      }
    },
    dispose: resources.dispose,
  };
}
