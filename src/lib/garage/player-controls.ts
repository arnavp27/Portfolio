import { moveOnFloor, type FloorPoint } from './navigation.ts';
import type { ComputerPhase } from './computers.ts';

export type RoomInputState = {
  entered: boolean;
  paused: boolean;
  guided: boolean;
  locked: boolean;
  phase: ComputerPhase;
};
export type EscapeIntent = 'pause' | 'resume' | 'leave-computer' | null;
export const walkSpeed = 1.45;
export const runSpeed = 2.9;
export const eyeHeight = 1.64;
export const mouseSensitivity = 0.0022;

/** Escape can arrive before or after the browser releases pointer lock. One physical
 * press must produce one transition, regardless of that event order. */
export function createEscapeController() {
  let held = false,
    releaseAt = -Infinity,
    awaitingKey = false;
  return {
    keyDown(state: RoomInputState, now: number, repeat = false): EscapeIntent {
      if (repeat || held) return null;
      held = true;
      if (awaitingKey && now - releaseAt < 250) {
        awaitingKey = false;
        return null;
      }
      awaitingKey = false;
      if (!state.entered) return null;
      if (state.phase === 'leaving') return state.paused ? 'resume' : null;
      if (state.phase !== 'room') return 'leave-computer';
      return state.paused ? 'resume' : 'pause';
    },
    keyUp() {
      held = false;
      awaitingKey = false;
    },
    lockLost(state: RoomInputState, now: number): EscapeIntent {
      if (
        !state.entered ||
        state.paused ||
        state.guided ||
        (state.phase !== 'room' && state.phase !== 'leaving')
      )
        return null;
      releaseAt = now;
      awaitingKey = !held;
      return 'pause';
    },
    reset() {
      held = false;
      awaitingKey = false;
      releaseAt = -Infinity;
    },
  };
}

export function lookMode(state: RoomInputState) {
  if (!state.entered || state.paused || state.phase !== 'room') return 'inactive';
  if (state.guided) return 'drag-look';
  return state.locked ? 'mouse-look' : 'inactive';
}

export function acceptsMovement(state: RoomInputState, uiTarget = false, modified = false) {
  return (
    state.entered &&
    !state.paused &&
    state.phase === 'room' &&
    (state.locked || state.guided) &&
    !uiTarget &&
    !modified
  );
}

export type PlanarMotion = FloorPoint & { vx: number; vz: number };
export type WalkInput = { forward: number; side: number; yaw: number; sprint: boolean };
/** Height never changes floor collisions: a hop cannot bypass a desk, wall or gate. */
export function stepPlanarMotion(
  state: PlanarMotion,
  input: WalkInput,
  delta: number,
): PlanarMotion {
  const dt = Math.min(0.05, Math.max(0, delta)),
    norm = Math.max(1, Math.hypot(input.forward, input.side));
  const speed = input.sprint ? runSpeed : walkSpeed,
    damping = input.forward || input.side ? 12 : 17;
  const dx =
    ((-Math.sin(input.yaw) * input.forward + Math.cos(input.yaw) * input.side) / norm) * speed;
  const dz =
    ((-Math.cos(input.yaw) * input.forward - Math.sin(input.yaw) * input.side) / norm) * speed;
  const blend = 1 - Math.exp(-damping * dt),
    vx = state.vx + (dx - state.vx) * blend,
    vz = state.vz + (dz - state.vz) * blend;
  const next = moveOnFloor(state, vx * dt, vz * dt);
  return { ...next, vx, vz };
}

export type JumpMotion = {
  height: number;
  speed: number;
  landing: number;
  landingSpeed: number;
  grounded: boolean;
};
export const createJumpMotion = (): JumpMotion => ({
  height: 0,
  speed: 0,
  landing: 0,
  landingSpeed: 0,
  grounded: true,
});
export function beginJump(state: JumpMotion) {
  if (!state.grounded) return false;
  state.height = 0;
  state.speed = 3.4;
  state.grounded = false;
  state.landing = 0;
  state.landingSpeed = 0;
  return true;
}
/** Analytic flight and a critically damped landing avoid frame-rate dependent hops. */
export function stepJumpMotion(state: JumpMotion, delta: number) {
  const dt = Math.min(0.05, Math.max(0, delta));
  let landed = false;
  if (!state.grounded) {
    state.height += state.speed * dt - 0.5 * 10.2 * dt * dt;
    state.speed -= 10.2 * dt;
    if (state.height <= 0) {
      state.height = 0;
      state.grounded = true;
      state.landingSpeed = -Math.min(4, Math.abs(state.speed)) * 0.7;
      state.speed = 0;
      landed = true;
    }
  }
  const omega = 25,
    term = state.landingSpeed + omega * state.landing,
    decay = Math.exp(-omega * dt);
  state.landing = (state.landing + term * dt) * decay;
  state.landingSpeed = (state.landingSpeed - term * omega * dt) * decay;
  if (Math.abs(state.landing) < 0.00001 && Math.abs(state.landingSpeed) < 0.0001) {
    state.landing = 0;
    state.landingSpeed = 0;
  }
  return landed;
}
