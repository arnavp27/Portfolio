export type ComputerId = 'kazam' | 'projects';
export type ComputerPhase = 'room' | 'approaching' | 'using' | 'leaving';
export type ComputerState = { id: ComputerId | null; phase: ComputerPhase };
type Point = [number, number, number];
export const computers: Record<
  ComputerId,
  { position: Point; width: number; title: string; subtitle: string }
> = {
  kazam: {
    position: [-1.25, 1.36, 0.57],
    width: 1.18,
    title: 'KAZAM',
    subtitle: 'WORK NOTES / ARNAV PATIL',
  },
  projects: {
    position: [0, 1.36, -2.49],
    width: 1.26,
    title: "ARNAV'S PC",
    subtitle: 'PROJECTS / EXPERIMENTS / GOOD IDEAS',
  },
};
export function screenDimensions(id: ComputerId) {
  const pc = computers[id];
  return {
    center: [pc.position[0], pc.position[1] + 0.005, pc.position[2] + 0.108] as Point,
    width: pc.width * 0.78,
    height: pc.width * 0.69 * 0.72,
  };
}
