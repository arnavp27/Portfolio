import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
/** Short, unarmed first-person gesture. It stays clear of the readable screen. */
export function createHands(camera: T.PerspectiveCamera) {
  const root = new T.Group();
  camera.add(root);
  root.visible = false;
  const geometry: T.BufferGeometry[] = [],
    materials: T.Material[] = [];
  const material = (color: string) => {
    const m = new T.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    materials.push(m);
    return m;
  };
  const skin = material('#ab805d'),
    knuckle = material('#ba906b'),
    sleeve = material('#3f4a3a'),
    cuff = material('#252d29');
  function part(
    parent: T.Object3D,
    size: [number, number, number],
    p: [number, number, number],
    m: T.Material,
    r = 0,
  ) {
    const g = new RoundedBoxGeometry(...size, 1, 0.005);
    geometry.push(g);
    const mesh = new T.Mesh(g, m);
    mesh.position.set(...p);
    mesh.rotation.y = r;
    parent.add(mesh);
    return mesh;
  }
  const fingers: T.Group[] = [];
  const hand = (side: number) => {
    const group = new T.Group();
    root.add(group);
    part(group, [0.12, 0.082, 0.33], [0, -0.02, 0.22], sleeve);
    part(group, [0.105, 0.063, 0.056], [0, -0.005, 0.065], cuff);
    part(group, [0.089, 0.035, 0.1], [0, 0, 0], skin);
    for (let i = 0; i < 4; i++) {
      const finger = new T.Group();
      finger.position.set(-0.033 + i * 0.022, 0, -0.047);
      group.add(finger);
      const length = [0.066, 0.078, 0.074, 0.056][i];
      part(finger, [0.019, 0.025, length], [0, -0.002, -length / 2], i % 2 ? knuckle : skin);
      fingers.push(finger);
    }
    part(group, [0.032, 0.029, 0.06], [side * 0.055, -0.012, -0.004], skin, side * -0.5);
    return group;
  };
  const left = hand(-1),
    right = hand(1);
  return {
    animate: (progress: number, reduced: boolean) => {
      const gesture = reduced
        ? 0
        : Math.sin(Math.PI * T.MathUtils.clamp((progress - 0.26) / 0.7, 0, 1));
      root.visible = gesture > 0.003;
      left.position.set(-0.28, -0.56 + gesture * 0.35, -0.64);
      left.rotation.set(0.16 + gesture * 0.12, -0.2, 0.12);
      right.position.set(0.34, -0.56 + gesture * 0.35, -0.64);
      right.rotation.set(0.14 + gesture * 0.15, 0.12, -0.17);
      fingers.forEach(
        (f, i) => (f.rotation.x = -0.12 - Math.sin(progress * 35 + i * 0.8) * 0.12 * gesture),
      );
    },
    dispose: () => {
      root.removeFromParent();
      geometry.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
