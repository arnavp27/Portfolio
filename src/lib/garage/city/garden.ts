import * as THREE from 'three';
import { random } from '../../graphics/textures';
import { createFoliage, type PlantSpecies } from '../foliage';
import { group, type SceneKit, type Point3 } from './types';
import type { CityMaterials } from './materials';

export function createGarden(kit: SceneKit, m: CityMaterials) {
  const foliage = createFoliage(kit);
  const crown = foliage.canopy;

  function tree(position: Point3, height: number, seed: number) {
    const g = group(kit.root, position),
      rand = random(seed);
    g.name = 'rain-tree';
    const trunk = kit.cyl([0, height * 0.23, 0], 0.2, 0.39, height * 0.46, m.bark, g);
    trunk.rotation.z = 0.055;
    // A visible branching structure supports airy compound leaves instead of opaque clusters.
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.399,
        reach = height * (0.27 + rand() * 0.17);
      const tip: Point3 = [
        Math.cos(angle) * reach,
        height * (0.64 + rand() * 0.18),
        Math.sin(angle) * reach,
      ];
      const elbow: Point3 = [tip[0] * 0.38, height * 0.49, tip[2] * 0.38];
      kit.beam([0, height * 0.28, 0], elbow, 0.13, m.bark, g);
      kit.beam(elbow, tip, 0.075, m.bark, g);
      for (let j = 0; j < 3; j++) {
        const end: Point3 = [
          tip[0] + (rand() - 0.5) * 2.4,
          tip[1] + rand() * 1.05,
          tip[2] + (rand() - 0.5) * 2.4,
        ];
        kit.beam(tip, end, 0.032, m.bark, g);
        crown(g, end, height * 0.13, rand);
      }
    }
    return g;
  }
  function pot(parent: THREE.Object3D, position: Point3, scale = 1, planted = false) {
    const g = group(parent, position);
    g.scale.setScalar(scale);
    if (!planted) {
      kit.cyl([0, 0.18, 0], 0.19, 0.13, 0.36, m.clay, g);
      kit.cyl([0, 0.355, 0], 0.205, 0.205, 0.055, m.clay, g);
      kit.cyl([0, 0.37, 0], 0.175, 0.175, 0.009, m.soil, g);
    }
    const seed = Math.abs(Math.round(position[0] * 31 + position[2] * 53 + position[1] * 17));
    const species: PlantSpecies = planted
      ? 'calathea'
      : seed % 3 === 0
        ? 'rubber'
        : seed % 3 === 1
          ? 'calathea'
          : 'pothos';
    foliage.plant(g, [0, planted ? 0.24 / scale : 0.37, 0], {
      height: 0.6,
      radius: 0.32,
      seed,
      species,
    });
    return g;
  }
  function vine(
    parent: THREE.Object3D,
    position: Point3,
    length: number,
    flowers = false,
    seed = 7,
  ) {
    return foliage.vine(parent, position, length, { flowers, seed, spread: 0.23, leafSize: 0.23 });
  }
  return { tree, pot, vine };
}
