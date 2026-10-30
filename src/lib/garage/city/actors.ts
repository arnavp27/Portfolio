import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { group, type SceneKit } from './types';
import type { CityMaterials } from './materials';
import { trafficPosition, pedestrianPosition, type TrafficPosition } from './layout';
import { createTrafficHeadlights } from './headlights';
import { cloneBatchGeometry } from '../geometry-batching';

/** Rigid vehicle bodies are batched once; animated people use shared instanced body parts. */
export function createStreetActors(kit: SceneKit, m: CityMaterials) {
  const { box, cyl, beam } = kit;
  const vehicleRoots: THREE.Group[] = [];
  const traffic: TrafficPosition[] = [];
  const shadowTexture = kit.texture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, '#00000088');
    g.addColorStop(1, '#00000000');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  kit.mats.add(shadowMat);
  const tail = m.lit('#b84e37', 0.8);
  const paintColors = ['#a95740', '#769d93', '#d0c5a6', '#467186', '#a3a6a4', '#394d5d'];
  const vehiclePaints = paintColors.map((c) => kit.mat(c, 0.48, 0.15));
  const yellow = kit.mat('#c4a54c', 0.65),
    green = kit.mat('#346751', 0.62),
    blue = kit.mat('#387c97', 0.64);
  const wheelGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.17, 12);
  kit.geos.add(wheelGeometry);
  const hubGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8);
  kit.geos.add(hubGeometry);
  function wheel(parent: THREE.Group, x: number, z: number, r = 0.29) {
    const w = kit.mesh(wheelGeometry, m.rubber, [x, r, z], parent, [0, 0, Math.PI / 2]);
    w.scale.set(r / 0.29, 1, r / 0.29);
    const hub = kit.mesh(hubGeometry, m.steel, [x, r, z], parent, [0, 0, Math.PI / 2]);
    hub.scale.set(r / 0.29, 1, r / 0.29);
  }
  function shadow(parent: THREE.Group, w: number, d: number) {
    const s = kit.plane([0, 0.018, 0], w, d, shadowMat, parent, [-Math.PI / 2, 0, 0]);
    s.castShadow = false;
  }
  // Local forward is +Z. A shaped cabin has raked windows instead of stacked cubes.
  function car(parent: THREE.Group, index: number) {
    const p = vehiclePaints[index % vehiclePaints.length];
    box([0, 0.57, 0], [1.62, 0.42, 3.5], p, parent, [0, 0, 0], 0.12);
    box([0, 0.81, 0.89], [1.56, 0.12, 1.43], p, parent, [0.025, 0, 0], 0.04);
    box([0, 1.34, -0.23], [1.35, 0.11, 1.46], p, parent, [0, 0, 0], 0.05);
    box([0, 1.06, 0.68], [1.3, 0.57, 0.025], m.glass, parent, [-0.5, 0, 0]);
    box([0, 1.07, -1.08], [1.3, 0.54, 0.03], m.glass, parent, [0.43, 0, 0]);
    for (const side of [-1, 1]) {
      const x = side * 0.71;
      box([x, 1.08, -0.24], [0.025, 0.47, 1.55], m.glass, parent);
      beam([side * 0.79, 0.81, 0.86], [side * 0.65, 1.36, 0.48], 0.032, p, parent);
      beam([side * 0.79, 0.81, -1.21], [side * 0.65, 1.36, -0.94], 0.035, p, parent);
      box([x, 1.08, -0.25], [0.048, 0.51, 0.047], p, parent);
      box([side * 0.81, 0.79, -0.3], [0.035, 0.028, 2.05], m.iron, parent);
      for (const z of [-0.65, 0.23])
        box([side * 0.832, 0.81, z], [0.021, 0.025, 0.12], m.steel, parent);
      box([side * 0.85, 1.01, 0.55], [0.18, 0.09, 0.19], p, parent, [0, 0, 0], 0.02);
      wheel(parent, side * 0.76, -1.1);
      wheel(parent, side * 0.76, 1.12);
      box([side * 0.54, 0.68, 1.765], [0.39, 0.16, 0.025], m.bulb, parent);
      box([side * 0.59, 0.67, -1.765], [0.28, 0.15, 0.025], tail, parent);
    }
    box([0, 0.46, 1.79], [1.48, 0.09, 0.1], m.iron, parent);
    box([0, 0.64, 1.78], [0.55, 0.12, 0.025], m.iron, parent);
    box([0, 0.49, -1.79], [1.45, 0.085, 0.08], m.iron, parent);
    box([0, 0.6, -1.81], [0.28, 0.09, 0.01], m.paint, parent);
    shadow(parent, 2.1, 4.1);
  }
  function auto(parent: THREE.Group) {
    box([0, 0.54, -0.27], [1.23, 0.45, 1.56], green, parent, [0, 0, 0], 0.06);
    box([0, 0.72, 0.76], [1.09, 0.58, 0.46], green, parent, [0, 0, 0], 0.06);
    box([0, 1.64, -0.06], [1.33, 0.15, 2.09], yellow, parent, [0, 0, 0], 0.07);
    box([0, 1.22, -1.03], [1.24, 0.75, 0.065], yellow, parent);
    box([0, 1.29, -1.07], [0.77, 0.28, 0.02], m.glass, parent);
    box([0, 1.18, 0.99], [1.06, 0.51, 0.035], m.glass, parent, [-0.17, 0, 0]);
    for (const side of [-1, 1]) {
      beam([side * 0.58, 0.73, 0.9], [side * 0.58, 1.6, 0.84], 0.028, m.iron, parent);
      box([side * 0.59, 1.36, -0.71], [0.055, 0.48, 0.58], yellow, parent);
      box([side * 0.6, 0.52, -0.4], [0.035, 0.17, 1.1], yellow, parent);
      box([side * 0.69, 1.2, 0.9], [0.1, 0.12, 0.06], m.iron, parent);
      wheel(parent, side * 0.59, -0.72, 0.25);
      cyl([side * 0.37, 0.69, 1.03], 0.067, 0.067, 0.025, m.bulb, parent, [Math.PI / 2, 0, 0]);
    }
    box([0, 0.87, -0.58], [0.98, 0.14, 0.5], m.rubber, parent);
    box([0, 1.1, -0.86], [0.98, 0.39, 0.08], m.rubber, parent);
    wheel(parent, 0, 0.87, 0.25);
    box([0, 0.83, 0.35], [0.65, 0.12, 0.36], m.rubber, parent);
    beam([0, 0.88, 0.62], [0, 1.12, 0.7], 0.02, m.iron, parent);
    beam([-0.23, 1.12, 0.7], [0.23, 1.12, 0.7], 0.018, m.iron, parent);
    // The driver is visible through the open sides.
    cyl([0, 1.14, 0.25], 0.18, 0.14, 0.42, kit.mat('#d8c5a2'), parent);
    const head = kit.mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      kit.mat('#9b6748'),
      [0, 1.47, 0.26],
      parent,
    );
    head.scale.y = 1.16;
    box([0, 0.37, 1.05], [1.13, 0.07, 0.08], m.iron, parent);
    shadow(parent, 1.8, 2.8);
  }
  function bus(parent: THREE.Group) {
    box([0, 1.43, 0], [2.32, 2.23, 7.7], blue, parent, [0, 0, 0], 0.14);
    box([0, 2.61, 0], [2.3, 0.13, 7.65], m.paint, parent, [0, 0, 0], 0.05);
    box([0, 1.87, 3.86], [2.1, 0.95, 0.035], m.glass, parent, [-0.08, 0, 0]);
    box([0, 2.44, 3.88], [1.62, 0.18, 0.025], m.dark, parent);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++)
        box([side * 1.17, 1.93, -2.9 + i * 0.83], [0.02, 0.88, 0.69], m.glass, parent);
      box([side * 1.18, 1.19, 0], [0.025, 0.19, 7.5], m.paint, parent);
      wheel(parent, side * 1.08, -2.4, 0.43);
      wheel(parent, side * 1.08, 2.4, 0.43);
      box([side * 0.83, 0.79, 3.88], [0.4, 0.22, 0.04], m.bulb, parent);
    }
    box([0, 0.56, 3.9], [2.16, 0.12, 0.1], m.iron, parent);
    box([0, 0.91, 3.9], [0.8, 0.3, 0.035], m.iron, parent);
    shadow(parent, 2.8, 8.2);
  }
  function batchRigid(parent: THREE.Group) {
    parent.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const old: THREE.Mesh[] = [];
    parent.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      const g = cloneBatchGeometry(o.geometry, o.matrixWorld);
      const list = buckets.get(o.material) || [];
      list.push(g);
      buckets.set(o.material, list);
      old.push(o);
    });
    old.forEach((o) => o.removeFromParent());
    for (const [material, parts] of buckets) {
      const geometry = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      if (!geometry) continue;
      kit.geos.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  for (let i = 0; i < 12; i++) {
    const g = group(kit.root);
    g.name = `street-vehicle-${i}`;
    g.userData.dynamic = true;
    const p = trafficPosition(0, i);
    if (p.kind === 'bus') bus(g);
    else if (p.kind === 'auto') auto(g);
    else car(g, i);
    batchRigid(g);
    vehicleRoots.push(g);
    traffic.push(p);
  }
  const headlights = createTrafficHeadlights(kit, traffic);

  const count = 16,
    personMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      flatShading: true,
    });
  kit.mats.add(personMaterial);
  const torso = new THREE.BoxGeometry(0.4, 0.48, 0.22);
  const tv = torso.getAttribute('position');
  for (let i = 0; i < tv.count; i++) if (tv.getY(i) < 0) tv.setX(i, tv.getX(i) * 0.78);
  const partGeometry: Record<string, THREE.BufferGeometry> = {
    torso,
    head: new THREE.SphereGeometry(0.12, 8, 5),
    hair: new THREE.SphereGeometry(0.123, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
    upperArm: new THREE.CylinderGeometry(0.07, 0.058, 0.27, 6),
    forearm: new THREE.CylinderGeometry(0.058, 0.042, 0.26, 6),
    hand: new THREE.SphereGeometry(0.049, 6, 4),
    thigh: new THREE.CylinderGeometry(0.086, 0.066, 0.4, 6),
    shin: new THREE.CylinderGeometry(0.066, 0.049, 0.4, 6),
    shoe: new THREE.BoxGeometry(0.13, 0.1, 0.24),
    bag: new THREE.BoxGeometry(0.29, 0.34, 0.12),
    collar: new THREE.BoxGeometry(0.14, 0.055, 0.045),
    nose: new THREE.BoxGeometry(0.045, 0.055, 0.05),
    eye: new THREE.BoxGeometry(0.018, 0.014, 0.01),
    shadow: new THREE.PlaneGeometry(0.6, 0.6),
  };
  const parts = new Map<string, THREE.InstancedMesh>();
  for (const [name, geometry] of Object.entries(partGeometry)) {
    kit.geos.add(geometry);
    const limbs = ['upperArm', 'forearm', 'hand', 'thigh', 'shin', 'shoe', 'eye'].includes(name);
    const mesh = new THREE.InstancedMesh(
      geometry,
      name === 'shadow' ? shadowMat : personMaterial,
      count * (limbs ? 2 : 1),
    );
    mesh.userData.dynamic = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    kit.root.add(mesh);
    parts.set(name, mesh);
  }
  const shirt = ['#c2c9bb', '#7b9da8', '#b29c80', '#955c48', '#798b69', '#c0bbab'];
  const skin = ['#a77b56', '#8c5f40', '#ba926d'];
  const temp = new THREE.Object3D(),
    local = new THREE.Object3D(),
    matrix = new THREE.Matrix4();
  let colorsInitialized = false;
  // Reuse the transform objects; scalar coordinates avoid temporary tuples for every body part.
  function place(
    name: string,
    index: number,
    color: string,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    local.position.set(x, y, z);
    local.rotation.set(rx, ry, rz);
    local.scale.set(sx, sy, sz);
    local.updateMatrix();
    matrix.multiplyMatrices(temp.matrix, local.matrix);
    const mesh = parts.get(name)!;
    mesh.setMatrixAt(index, matrix);
    if (name !== 'shadow' && !colorsInitialized) mesh.setColorAt(index, new THREE.Color(color));
  }
  function animatePeople(time: number, observer?: { x: number; z: number }) {
    for (let i = 0; i < count; i++) {
      const p =
        i < 14
          ? pedestrianPosition(time, i)
          : {
              x: i === 14 ? -10.4 : -12.3,
              z: i === 14 ? 11.25 : 13.2,
              speed: 0,
              direction: i === 14 ? 0 : 2,
            };
      const phase = time * (p.speed > 1.5 ? 9 : 5.8) + i * 2.3,
        swing = p.speed ? Math.sin(phase) * (p.speed > 1.5 ? 0.65 : 0.42) : 0;
      temp.position.set(p.x, 0.04 + (p.speed ? Math.abs(Math.sin(phase)) * 0.023 : 0), p.z);
      // Yield a little around the visitor instead of walking straight through them.
      if (
        observer &&
        i < 14 &&
        Math.abs(p.x - observer.x) < 1.2 &&
        Math.abs(p.z - observer.z) < 0.7
      )
        temp.position.z += p.z < 15.5 ? -0.7 : 0.7;
      temp.rotation.set(
        0,
        p.direction === 0 ? 0 : p.direction === 2 ? Math.PI : (p.direction * Math.PI) / 2,
        0,
      );
      temp.scale.setScalar(0.96 + (i % 4) * 0.025);
      temp.updateMatrix();
      const sk = skin[i % 3],
        sh = i === 14 ? '#d1c6aa' : shirt[i % 6],
        tr = i % 3 ? '#39454a' : '#655b4c',
        bagScale = i % 3 === 0 ? 0.01 : 1;
      place('torso', i, sh, 0, 1.2, 0, p.speed > 1.5 ? 0.11 : 0);
      place('head', i, sk, 0, 1.59, 0.006, 0, Math.sin(time * 0.4 + i) * 0.08, 0, 0.92, 1.18, 0.95);
      place('hair', i, i % 4 ? '#292823' : '#665844', 0, 1.62, 0, 0, 0, 0, 0.99, 1.08, 1.01);
      place('nose', i, sk, 0, 1.6, 0.115);
      place('collar', i, i === 14 ? '#e2d5ba' : '#ddd2b7', 0, 1.425, 0.116);
      place('bag', i, '#3f4140', 0, 1.22, -0.18, 0.07, 0, 0, bagScale, bagScale, bagScale);
      for (let side = -1; side <= 1; side += 2) {
        const n = i * 2 + (side > 0 ? 1 : 0),
          leg = swing * side,
          knee = Math.max(0, -leg) * 0.8;
        place('eye', n, '#382e25', side * 0.046, 1.615, 0.11);
        const kneeY = 0.9 - Math.cos(leg) * 0.4,
          kneeZ = -Math.sin(leg) * 0.4;
        place('thigh', n, tr, side * 0.102, 0.9 - Math.cos(leg) * 0.2, -Math.sin(leg) * 0.2, leg);
        place(
          'shin',
          n,
          tr,
          side * 0.102,
          kneeY - Math.cos(leg - knee) * 0.2,
          kneeZ - Math.sin(leg - knee) * 0.2,
          leg - knee,
        );
        place(
          'shoe',
          n,
          '#33332f',
          side * 0.102,
          kneeY - Math.cos(leg - knee) * 0.4 - 0.05,
          kneeZ - Math.sin(leg - knee) * 0.4 + 0.055,
        );
        const arm = i === 14 ? -0.92 : -leg * 0.8,
          elbowY = 1.39 - Math.cos(arm) * 0.27,
          elbowZ = -Math.sin(arm) * 0.27;
        place(
          'upperArm',
          n,
          sh,
          side * 0.247,
          1.39 - Math.cos(arm) * 0.135,
          -Math.sin(arm) * 0.135,
          arm,
          0,
          side * 0.07,
        );
        place(
          'forearm',
          n,
          sk,
          side * 0.256,
          elbowY - Math.cos(arm - (i === 14 ? 0.7 : 0.18)) * 0.13,
          elbowZ - Math.sin(arm - (i === 14 ? 0.7 : 0.18)) * 0.13,
          arm - (i === 14 ? 0.7 : 0.18),
        );
        place(
          'hand',
          n,
          sk,
          side * 0.258,
          elbowY - Math.cos(arm - (i === 14 ? 0.7 : 0.18)) * 0.26,
          elbowZ - Math.sin(arm - (i === 14 ? 0.7 : 0.18)) * 0.26,
          0,
          0,
          0,
          1,
          0.95,
          0.85,
        );
      }
      place('shadow', i, '#ffffff', 0, 0.003, 0, -Math.PI / 2);
    }
    for (const mesh of parts.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor && !colorsInitialized) mesh.instanceColor.needsUpdate = true;
    }
    colorsInitialized = true;
  }
  function animate(time: number, observer?: { x: number; z: number }) {
    for (let i = 0; i < vehicleRoots.length; i++) {
      const p = trafficPosition(time, i);
      traffic[i] = p;
      const g = vehicleRoots[i];
      g.position.set(p.x, 0.015, p.z);
      g.rotation.y = p.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    headlights.animate(time, traffic, observer);
    animatePeople(time, observer);
  }
  animate(0);
  return { animate, traffic, vehicleCount: vehicleRoots.length, pedestrianCount: count };
}
