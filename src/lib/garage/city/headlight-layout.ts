import { cityLayout, type TrafficPosition } from './layout.ts';

/** Keep the expensive lights bounded, independently of the amount of street traffic. */
export const headlightTuning = {
  activeVehicles: 3,
  range: 18,
  coneAngle: 0.16,
  targetDistance: 8,
  fadeStart: 30,
  fadeEnd: 46,
  roadHeight: -0.018,
  projectionLength: 15,
  projectionWidth: 4.6,
} as const;

const profiles = {
  car: { front: 1.79, height: 0.68, spacing: 1.08, intensity: 78 },
  auto: { front: 1.07, height: 0.69, spacing: 0.74, intensity: 60 },
  bus: { front: 3.93, height: 0.79, spacing: 1.66, intensity: 94 },
} as const;

export function headlightProfile(kind: string) {
  return profiles[kind as keyof typeof profiles] ?? profiles.car;
}

/** Vehicle meshes face +Z locally; on this road they turn ±90° to follow their lane. */
export function headlightPose(vehicle: TrafficPosition, side: -1 | 1) {
  const profile = headlightProfile(vehicle.kind),
    direction = Math.sign(vehicle.speed) || 1;
  const x = vehicle.x + direction * profile.front;
  const z = vehicle.z - (direction * side * profile.spacing) / 2;
  return {
    source: { x, y: profile.height + 0.015, z },
    target: { x: x + direction * headlightTuning.targetDistance, y: headlightTuning.roadHeight, z },
    intensity: profile.intensity,
  };
}

export function headlightGain(distance: number) {
  const t = Math.max(
    0,
    Math.min(
      1,
      (distance - headlightTuning.fadeStart) /
        (headlightTuning.fadeEnd - headlightTuning.fadeStart),
    ),
  );
  return 1 - t * t * (3 - 2 * t);
}

export function nearestHeadlightVehicles(
  traffic: readonly TrafficPosition[],
  observer: { x: number; z: number },
) {
  return traffic
    .map((vehicle, index) => ({
      index,
      distance: Math.hypot(vehicle.x - observer.x, vehicle.z - observer.z),
    }))
    .filter((vehicle) => vehicle.distance < headlightTuning.fadeEnd)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, headlightTuning.activeVehicles);
}

/** Shader projection is clipped to the road so it cannot paint over a sidewalk or house. */
export const headlightRoadBounds = {
  near: cityLayout.curbZ + 0.03,
  far: cityLayout.roadFarZ - 0.03,
};
