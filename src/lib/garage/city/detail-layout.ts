/** The courtyard stops at the actual doorway, never covering the indoor wood floor. */
export const courtyardPaving = { x: 3, width: 14.3, minZ: 3.2, maxZ: 10.75 };

/** Outside the walkable pavement edge: a public sign, clearly separate from the compound. */
export const neighbourhoodSign = { x: 13.35, z: 15.7, title: '5TH BLOCK', subtitle: 'KORAMANGALA' };

export interface BackgroundHome {
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  variant: number;
  facing: number;
}

/** Offset rows put real roofs and lit windows behind the gaps in the shopfronts. */
export const backgroundHomes: BackgroundHome[] = [
  ...[-49, -35, -20, -5, 11, 26, 42, 57].map((x, i) => ({
    x,
    z: 47 + (i % 3) * 1.3,
    width: 10 + (i % 3),
    height: 8.5 + (i % 3) * 1.25,
    depth: 8.5,
    variant: i,
    facing: Math.PI,
  })),
  ...[-44, -27, -10, 7, 24, 42, 60].map((x, i) => ({
    x,
    z: 63 + (i % 2) * 3,
    width: 13 + (i % 3),
    height: 9.0 + (i % 3) * 1.4,
    depth: 10,
    variant: i + 8,
    facing: Math.PI,
  })),
  ...[-29, -15, -0.5, 14, 29, 45].map((x, i) => ({
    x,
    z: -27 - (i % 2) * 2,
    width: 10 + (i % 3),
    height: 8.3 + (i % 3) * 1.2,
    depth: 8,
    variant: i + 15,
    facing: 0,
  })),
];
