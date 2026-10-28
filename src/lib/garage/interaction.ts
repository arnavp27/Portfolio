import { Vector3, MathUtils } from 'three';
import { screenDimensions, type ComputerId } from './computers.ts';
export const computerFov = 43;
export const ease = (v: number) => {
  const t = MathUtils.clamp(v, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export function computerPose(id: ComputerId, width: number, height: number) {
  const screen = screenDimensions(id),
    aspect = Math.max(0.2, width / Math.max(1, height));
  const halfAngle = Math.tan(MathUtils.degToRad(computerFov / 2));
  const distance = Math.max(
    screen.height / (2 * halfAngle * 0.68),
    screen.width / (2 * halfAngle * aspect * 0.89),
  );
  const target = new Vector3(...screen.center);
  return { position: target.clone().add(new Vector3(0, 0, distance)), target };
}
export type Corner = { x: number; y: number };
/** CSS homography maps a real DOM rectangle onto the four projected screen corners. */
export function screenTransform(corners: Corner[], width: number, height: number) {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 0.000001) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant,
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + h * p3.y;
  return [
    a / width,
    d / width,
    0,
    g / width,
    b / height,
    e / height,
    0,
    h / height,
    0,
    0,
    1,
    0,
    p0.x,
    p0.y,
    0,
    1,
  ];
}
