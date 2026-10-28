import * as THREE from 'three';
import { architecturalKit, type SceneKit } from './city/types';
import { createCityMaterials } from './city/materials';
import { createArchitecture } from './city/architecture';
import { createStreet } from './city/street';
import { createStreetActors } from './city/actors';

/** An inhabited Koramangala avenue, assembled from metre-scaled, reusable scene systems. */
export async function buildCourtyard(scene: THREE.Scene, base: SceneKit) {
  await Promise.all([
    document.fonts.load('32px Kannada'),
    document.fonts.load('32px Plex'),
    document.fonts.load('32px Pixel'),
  ]);
  const kit = architecturalKit(base),
    materials = await createCityMaterials(kit),
    architecture = createArchitecture(kit, materials);
  const street = createStreet(scene, kit, materials, architecture),
    actors = createStreetActors(kit, materials);
  return {
    traffic: actors.traffic,
    vehicleCount: actors.vehicleCount,
    pedestrianCount: actors.pedestrianCount,
    animate(time: number, observer?: { x: number; z: number }) {
      street.animate(time);
      actors.animate(time, observer);
    },
  };
}
