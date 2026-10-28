import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type Point3 = [number, number, number];
export interface SceneKit {
  root: THREE.Group;
  mats: Set<THREE.Material>;
  geos: Set<THREE.BufferGeometry>;
  maps: Set<THREE.Texture>;
  mat(color: string, roughness?: number, metalness?: number): THREE.MeshStandardMaterial;
  texture(
    width: number,
    height: number,
    paint: (c: CanvasRenderingContext2D) => void,
  ): THREE.Texture;
  mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Point3,
    parent?: THREE.Object3D,
    rotation?: Point3,
  ): THREE.Mesh;
  box(
    position: Point3,
    size: Point3,
    material: THREE.Material,
    parent?: THREE.Object3D,
    rotation?: Point3,
    bevel?: number,
  ): THREE.Mesh;
  cyl(
    position: Point3,
    top: number,
    bottom: number,
    height: number,
    material: THREE.Material,
    parent?: THREE.Object3D,
    rotation?: Point3,
  ): THREE.Mesh;
  plane(
    position: Point3,
    width: number,
    height: number,
    material: THREE.Material,
    parent?: THREE.Object3D,
    rotation?: Point3,
  ): THREE.Mesh;
  beam(
    a: Point3,
    b: Point3,
    radius: number,
    material: THREE.Material,
    parent?: THREE.Object3D,
  ): THREE.Mesh;
}

export function group(parent: THREE.Object3D, position: Point3 = [0, 0, 0], yaw = 0) {
  const object = new THREE.Group();
  object.position.set(...position);
  object.rotation.y = yaw;
  parent.add(object);
  return object;
}

/** Architectural UVs stay at a constant metre scale, even on a broad facade. */
export function architecturalKit(base: SceneKit): SceneKit {
  const cylinder: SceneKit['cyl'] = (
    position,
    top,
    bottom,
    height,
    material,
    parent = base.root,
    rotation = [0, 0, 0],
  ) => {
    const geometry = new THREE.CylinderGeometry(top, bottom, height, 16);
    const uv = geometry.getAttribute('uv'),
      normals = geometry.getAttribute('normal'),
      vertices = geometry.getAttribute('position');
    const circumference = Math.PI * (top + bottom);
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(normals.getY(i)) > 0.9) uv.setXY(i, vertices.getX(i) / 2, vertices.getZ(i) / 2);
      else uv.setXY(i, (uv.getX(i) * circumference) / 2, (uv.getY(i) * height) / 2);
    }
    return base.mesh(geometry, material, position, parent, rotation);
  };
  return {
    ...base,
    cyl: cylinder,
    beam(a, b, radius, material, parent = base.root) {
      const av = new THREE.Vector3(...a),
        bv = new THREE.Vector3(...b),
        direction = bv.clone().sub(av);
      const object = cylinder(
        av.clone().add(bv).multiplyScalar(0.5).toArray() as Point3,
        radius,
        radius,
        direction.length(),
        material,
        parent,
      );
      object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      return object;
    },
    box(position, size, material, parent = base.root, rotation = [0, 0, 0], bevel = 0) {
      const geometry = bevel
        ? new RoundedBoxGeometry(...size, 1, bevel)
        : new THREE.BoxGeometry(...size);
      const vertices = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i),
          y = vertices.getY(i),
          z = vertices.getZ(i);
        uv.setXY(
          i,
          (Math.abs(normals.getX(i)) > 0.5 ? z : x) / 2,
          (Math.abs(normals.getY(i)) > 0.5 ? z : y) / 2,
        );
      }
      return base.mesh(geometry, material, position, parent, rotation);
    },
  };
}

export function surface(
  kit: SceneKit,
  position: Point3,
  width: number,
  depth: number,
  material: THREE.Material,
  parent = kit.root,
) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (uv.getX(i) * width) / 2, (uv.getY(i) * depth) / 2);
  return kit.mesh(geometry, material, position, parent, [-Math.PI / 2, 0, 0]);
}
