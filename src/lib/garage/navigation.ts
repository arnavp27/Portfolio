import { cityLayout } from './city/layout.ts';
/** Floor plan in metres. All movement, including guided walks, shares these colliders. */
export type FloorPoint = { x: number; z: number };
export type Block = { name: string; minX: number; maxX: number; minZ: number; maxZ: number };
export const playerRadius = 0.19;
export const courtyard = { spawn: cityLayout.spawn, beds: cityLayout.beds };
export const floorBounds = { minX: -14, maxX: 13, minZ: -2.89, maxZ: 16.25 };
export const obstacles: Block[] = [
  { name: 'left building wall', minX: -14, maxX: -2.59, minZ: -3.1, maxZ: 3.5 },
  { name: 'right building wall', minX: 2.59, maxX: 13, minZ: -3.1, maxZ: 3.6 },
  { name: 'left compound wall', minX: -4.34, maxX: -4.08, minZ: 3.4, maxZ: 10.95 },
  { name: 'right compound wall', minX: 10.08, maxX: 10.34, minZ: 3.4, maxZ: 10.95 },
  { name: 'left compound entrance', minX: -4.3, maxX: -1.77, minZ: 10.54, maxZ: 11.06 },
  { name: 'right compound entrance', minX: 1.77, maxX: 10.3, minZ: 10.54, maxZ: 11.06 },
  { name: 'left open gate', minX: -1.99, maxX: -1.89, minZ: 8.95, maxZ: 10.8 },
  { name: 'right open gate', minX: 1.89, maxX: 1.99, minZ: 8.95, maxZ: 10.8 },
  { name: 'left door jamb', minX: -2.69, maxX: -2.41, minZ: 3.06, maxZ: 3.34 },
  { name: 'right door jamb', minX: 2.41, maxX: 2.69, minZ: 3.06, maxZ: 3.34 },
  { name: 'left porch column', minX: -3.28, maxX: -2.88, minZ: 3.75, maxZ: 4.15 },
  { name: 'right porch column', minX: 2.78, maxX: 3.18, minZ: 3.75, maxZ: 4.15 },
  { name: 'house porch column', minX: 8.68, maxX: 9.08, minZ: 3.75, maxZ: 4.15 },
  { name: 'left porch pot', minX: -3.06, maxX: -2.54, minZ: 4.59, maxZ: 5.11 },
  { name: 'right porch pot', minX: 2.39, maxX: 2.91, minZ: 4.59, maxZ: 5.11 },
  { name: 'house porch pot', minX: 8.24, maxX: 8.76, minZ: 4.59, maxZ: 5.11 },
  ...courtyard.beds,
  { name: 'breakfast counter', minX: -13.35, maxX: -8.05, minZ: 8.2, maxZ: 12.84 },
  { name: 'rain tree', minX: -6.6, maxX: -5.2, minZ: 9.2, maxZ: 10.6 },
  { name: 'street lamp', minX: -10.14, maxX: -9.86, minZ: 15.66, maxZ: 15.94 },
  { name: 'work desk', minX: -2.43, maxX: -0.285, minZ: 0.31, maxZ: 1.36 },
  { name: 'desk chair', minX: -2.22, maxX: -1.62, minZ: 1.65, maxZ: 2.26 },
  { name: 'personal bench', minX: -1.78, maxX: 1.78, minZ: -2.87, maxZ: -1.97 },
  { name: 'bookshelf', minX: 1.97, maxX: 2.61, minZ: -2.32, maxZ: -0.83 },
  { name: 'stool', minX: 1.15, maxX: 1.65, minZ: -1.54, maxZ: -1.04 },
  { name: 'left crates', minX: -2.55, maxX: -2.06, minZ: 2.1, maxZ: 2.62 },
  { name: 'left plant', minX: -2.58, maxX: -1.99, minZ: 2.63, maxZ: 3.12 },
  { name: 'right plant', minX: 2.1, maxX: 2.59, minZ: 2.61, maxZ: 3.14 },
  { name: 'making shelf', minX: 2.08, maxX: 2.61, minZ: 0.02, maxZ: 1.34 },
];
export const destinations = {
  kazam: { x: -1.2, z: 2.05 },
  projects: { x: 0.12, z: -0.91 },
  solar: { x: 1.45, z: 1.2 },
  entrance: { x: courtyard.spawn.x, z: courtyard.spawn.z },
  courtyard: { x: -8.0, z: 15.3 },
};
export function isWalkable(p: FloorPoint, r = playerRadius) {
  if (
    p.x < floorBounds.minX + r ||
    p.x > floorBounds.maxX - r ||
    p.z < floorBounds.minZ + r ||
    p.z > floorBounds.maxZ - r
  )
    return false;
  return !obstacles.some(
    (b) => p.x > b.minX - r && p.x < b.maxX + r && p.z > b.minZ - r && p.z < b.maxZ + r,
  );
}
/** Small steps + axis sliding prevent tunnelling while allowing movement along furniture. */
export function moveOnFloor(from: FloorPoint, dx: number, dz: number): FloorPoint {
  let p = { ...from };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.06));
  for (let n = 0; n < steps; n++) {
    const x = { x: p.x + dx / steps, z: p.z };
    if (isWalkable(x)) p = x;
    const z = { x: p.x, z: p.z + dz / steps };
    if (isWalkable(z)) p = z;
  }
  return p;
}
export function clearLine(a: FloorPoint, b: FloorPoint) {
  if (!isWalkable(a) || !isWalkable(b)) return false;
  // Exact segment / expanded-box test; sampling can miss a tiny corner intersection.
  for (const box of obstacles) {
    let enter = 0,
      exit = 1;
    let misses = false;
    for (const [v, d, min, max] of [
      [a.x, b.x - a.x, box.minX - playerRadius, box.maxX + playerRadius],
      [a.z, b.z - a.z, box.minZ - playerRadius, box.maxZ + playerRadius],
    ]) {
      if (Math.abs(d) < 1e-10) {
        if (v <= min || v >= max) {
          misses = true;
          break;
        }
      } else {
        let t0 = (min - v) / d,
          t1 = (max - v) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        enter = Math.max(enter, t0);
        exit = Math.min(exit, t1);
        if (enter >= exit) {
          misses = true;
          break;
        }
      }
    }
    if (!misses && enter < exit && exit > 0 && enter < 1) return false;
  }
  return true;
}
let navigationGrid: { nodes: FloorPoint[]; grid: Map<string, number> } | null = null;
/** A* over this small room, followed by line-of-sight smoothing. Never walks through props. */
export function walkingPath(from: FloorPoint, to: FloorPoint): FloorPoint[] {
  if (!isWalkable(from) || !isWalkable(to)) return [];
  if (clearLine(from, to)) return [{ ...from }, { ...to }];
  const step = 0.16,
    minX = floorBounds.minX + playerRadius,
    minZ = floorBounds.minZ + playerRadius;
  const nodes: FloorPoint[] = navigationGrid?.nodes ?? [];
  const grid = navigationGrid?.grid ?? new Map<string, number>();
  if (!navigationGrid)
    for (let z = 0; minZ + z * step <= floorBounds.maxZ - playerRadius; z++)
      for (let x = 0; minX + x * step <= floorBounds.maxX - playerRadius; x++) {
        const p = { x: minX + x * step, z: minZ + z * step };
        if (isWalkable(p)) {
          grid.set(`${x},${z}`, nodes.length);
          nodes.push(p);
        }
      }
  navigationGrid = { nodes, grid };
  const nearest = (p: FloorPoint) =>
    nodes.reduce(
      (best, n, i) =>
        Math.hypot(n.x - p.x, n.z - p.z) < best.d && clearLine(p, n)
          ? { i, d: Math.hypot(n.x - p.x, n.z - p.z) }
          : best,
      { i: -1, d: Infinity },
    ).i;
  const start = nearest(from),
    end = nearest(to);
  if (start < 0 || end < 0) return [];
  const g = new Map<number, number>([[start, 0]]),
    parent = new Map<number, number>(),
    open = new Set([start]),
    closed = new Set<number>();
  const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.z - b.z);
  while (open.size) {
    let current = -1,
      score = Infinity;
    for (const i of open) {
      const f = g.get(i)! + distance(nodes[i], nodes[end]);
      if (f < score) {
        score = f;
        current = i;
      }
    }
    if (current === end) {
      const path = [to, nodes[end]];
      let n = end;
      while (n !== start) {
        n = parent.get(n)!;
        path.push(nodes[n]);
      }
      path.push(from);
      path.reverse();
      const smooth = [path[0]];
      let i = 0;
      while (i < path.length - 1) {
        let j = path.length - 1;
        while (j > i + 1 && !clearLine(path[i], path[j])) j--;
        smooth.push(path[j]);
        i = j;
      }
      return smooth;
    }
    open.delete(current);
    closed.add(current);
    const p = nodes[current],
      cx = Math.round((p.x - minX) / step),
      cz = Math.round((p.z - minZ) / step);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const next = grid.get(`${cx + dx},${cz + dz}`);
      if (next === undefined || closed.has(next) || !clearLine(p, nodes[next])) continue;
      const cost = g.get(current)! + distance(p, nodes[next]);
      if (cost < (g.get(next) ?? Infinity)) {
        g.set(next, cost);
        parent.set(next, current);
        open.add(next);
      }
    }
  }
  return [];
}
export function samplePath(path: FloorPoint[], amount: number) {
  if (!path.length) return { x: 0, z: 0 };
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
  let d = Math.max(0, Math.min(1, amount)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) {
      const t = lengths[i] ? d / lengths[i] : 1;
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        z: path[i].z + (path[i + 1].z - path[i].z) * t,
      };
    }
    d -= lengths[i];
  }
  return { ...path.at(-1)! };
}
