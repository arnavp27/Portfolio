import type { ComputerId } from './computers';
export type GaragePowerState = { lights: boolean; computers: Record<ComputerId, boolean> };
/** Independent circuits. The shared switch turns off any running PCs, or starts both. */
export function createGaragePower() {
  const state: GaragePowerState = { lights: true, computers: { kazam: true, projects: true } };
  const snapshot = (): GaragePowerState => ({
    lights: state.lights,
    computers: { ...state.computers },
  });
  return {
    snapshot,
    toggleLights() {
      state.lights = !state.lights;
      return snapshot();
    },
    toggleComputer(id: ComputerId) {
      state.computers[id] = !state.computers[id];
      return snapshot();
    },
    toggleComputers() {
      const on = !(state.computers.kazam || state.computers.projects);
      state.computers.kazam = on;
      state.computers.projects = on;
      return snapshot();
    },
  };
}
