/** One metre-based plan shared by geometry, navigation, actors and acoustics. */
export const cityLayout = {
  gateZ: 10.8,
  gateHalfWidth: 2.0,
  propertyMinX: -4.2,
  propertyMaxX: 10.2,
  pavementNear: 11.15,
  curbZ: 16.4,
  roadFarZ: 24.4,
  lanes: [18.4, 22.4] as const,
  roadHalfLength: 104,
  cafe: { x: -10.7, z: 10.5 },
  spawn: { x: -0.35, z: 15.0, yaw: -0.15, pitch: 0.13 },
  beds: [
    { name: 'left garden', minX: -3.95, maxX: -3.1, minZ: 4.7, maxZ: 9.9 },
    { name: 'front garden', minX: 3.6, maxX: 9.75, minZ: 8.2, maxZ: 10.25 },
  ],
};

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cross the actual compound boundary, then the sheltered workshop threshold. */
export function cityAcousticsAt(position: { x: number; z: number }) {
  const inProperty = smooth(-4.5, -3.9, position.x) * (1 - smooth(9.9, 10.5, position.x));
  const courtyard =
    (1 - smooth(cityLayout.gateZ - 0.6, cityLayout.gateZ + 0.6, position.z)) * inProperty;
  const indoors = (1 - smooth(3.1, 4.6, position.z)) * inProperty;
  return {
    gain: (1 - courtyard * 0.72) * (1 - indoors * 0.77),
    cutoff: 9500 - courtyard * 7500 - indoors * 1400,
    zone: indoors > 0.8 ? 'workshop' : courtyard > 0.5 ? 'courtyard' : 'street',
  };
}

export interface TrafficPosition {
  x: number;
  y: number;
  z: number;
  speed: number;
  kind: string;
}
export function trafficPosition(time: number, index: number): TrafficPosition {
  const direction = index % 2 ? -1 : 1;
  const speed = 5.4;
  const length = cityLayout.roadHalfLength * 2;
  const spacing = length / 6;
  const offset = Math.floor(index / 2) * spacing + (direction < 0 ? 12 : 0);
  const x = (((((time * speed + offset) % length) + length) % length) - length / 2) * direction;
  return {
    x,
    y: 0.75,
    z: cityLayout.lanes[index % 2],
    speed: speed * direction,
    kind: index === 5 ? 'bus' : index % 3 === 0 ? 'auto' : 'car',
  };
}

export function pedestrianPosition(time: number, index: number) {
  const direction = index % 3 === 0 ? -1 : 1;
  const speed = index === 6 ? 1.9 : 0.82 + (index % 4) * 0.11;
  const length = 160;
  const x =
    (((((time * speed + index * 11.37) % length) + length) % length) - length / 2) * direction;
  return {
    x,
    z: index % 2 ? 26.1 + (index % 3) * 0.32 : 14.35 + (index % 3) * 0.38,
    speed,
    direction,
  };
}
