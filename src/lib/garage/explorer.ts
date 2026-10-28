import * as T from 'three';
import { createGarageRendering } from './rendering';
import { defaultGraphics, normalizeGraphics, type GraphicsSettings } from './graphics-settings';
import { buildCameraRoom, type RoomAction } from './world';
import { loadTogether } from './loading';
import { createHands } from './hands';
import {
  screenDimensions,
  type ComputerId,
  type ComputerPhase,
  type ComputerState,
} from './computers';
import { computerPose, computerFov, ease, screenTransform } from './interaction';
import { walkingPath, samplePath, type FloorPoint, destinations, courtyard } from './navigation';
import type { GarageSound } from './sound';
import {
  createPointerCapture,
  type PointerCaptureState,
  type PointerCaptureStatus,
} from './pointer-capture';
import { createGarageRenderer, type GarageFailure } from './startup';
import {
  createEscapeController,
  mouseSensitivity,
  lookMode,
  acceptsMovement,
  stepPlanarMotion,
  createJumpMotion,
  beginJump,
  stepJumpMotion,
  eyeHeight,
  walkSpeed,
} from './player-controls';
export type ExplorerPower = { lights: boolean; computers: Record<ComputerId, boolean> };
export type ExplorerState = {
  entered: boolean;
  paused: boolean;
  locked: boolean;
  guided: boolean;
  capture: PointerCaptureStatus;
  target: RoomAction | null;
  power: ExplorerPower;
};
export type ExplorerControls = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  useComputer: (id: ComputerId) => void;
  leaveComputer: () => void;
  interact: () => void;
  walkTo: (id: keyof typeof destinations) => void;
  setReduced: (value: boolean) => void;
  setGraphics: (settings: GraphicsSettings) => void;
  dispose: () => void;
};
type Options = {
  surface: HTMLElement;
  sound: GarageSound;
  onReady: () => void;
  onError: (failure: GarageFailure) => void;
  onState: (state: ExplorerState) => void;
  onComputerState: (state: ComputerState) => void;
  onInspect: () => void;
};
export function mountExplorer(container: HTMLElement, options: Options): ExplorerControls {
  // Geometry is antialiased in the postprocessing buffers, not the default framebuffer.
  const renderer = createGarageRenderer(
    () =>
      new T.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' }),
  );
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor('#101b2f');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);
  const scene = new T.Scene();
  scene.fog = new T.FogExp2('#142033', 0.0095);
  const camera = new T.PerspectiveCamera(65, 1, 0.04, 180);
  scene.add(camera);
  const hands = createHands(camera);
  const graphics = createGarageRendering(renderer, scene, camera, container);
  let graphicsSettings = { ...defaultGraphics };
  let world: Awaited<ReturnType<typeof buildCameraRoom>> | undefined,
    width = 1,
    height = 1,
    raf = 0,
    lastTime = 0,
    elapsed = 0,
    ready = false,
    disposed = false,
    reduced = false,
    entered = false,
    paused = false,
    guided = false,
    locked = false,
    target: RoomAction | null = null,
    lastState = '';
  let phase: ComputerPhase = 'room',
    computer: ComputerId | null = null,
    focus = 0,
    transitionTime = 1.7,
    leaveTime = 1.2,
    booted = false;
  const player = new T.Vector3(courtyard.spawn.x, eyeHeight, courtyard.spawn.z),
    velocity = new T.Vector2(),
    view = new T.Vector3(),
    forward = new T.Vector3(),
    fromPosition = new T.Vector3(),
    fromTarget = new T.Vector3();
  let yaw = courtyard.spawn.yaw,
    pitch = courtyard.spawn.pitch,
    running = false,
    walkingDistance = 0,
    lastStep = 0,
    drag: { x: number; y: number; distance: number } | null = null;
  let path: FloorPoint[] = [],
    auto: FloorPoint[] | null = null,
    autoAmount = 0,
    autoDuration = 1,
    autoLook: T.Vector3 | null = null;
  const escape = createEscapeController(),
    jump = createJumpMotion(),
    finePointer = matchMedia('(pointer: fine)');
  // Play intent is independent of browser capture. Pending requests keep the menu
  // open; only a native grant can resume desktop gameplay.
  let playRequested = false,
    captureStatus: PointerCaptureStatus = 'idle',
    windowFocused = true;
  const inputState = () => ({ entered, paused, guided, locked, phase });
  const keys = new Set<string>(),
    pointer = new T.Vector2(),
    ray = new T.Raycaster(),
    surface = options.surface;
  function powerState(): ExplorerPower {
    return world?.getPowerState() ?? { lights: true, computers: { kazam: true, projects: true } };
  }
  function emit() {
    const mode = lookMode(inputState()),
      power = powerState(),
      state = {
        entered,
        paused,
        locked,
        guided,
        capture: captureStatus,
        target,
        power,
      };
    const json = JSON.stringify(state);
    if (json !== lastState) {
      lastState = json;
      options.onState(state);
    }
    container.dataset.playState = !entered ? 'entry' : paused ? 'paused' : phase;
    container.dataset.controlMode = guided ? 'guided' : mode;
    container.dataset.interactionTarget = target || '';
    container.dataset.garageLights = String(power.lights);
    container.dataset.kazamPower = String(power.computers.kazam);
    container.dataset.projectsPower = String(power.computers.projects);
    container.dataset.moveMode = running ? 'run' : 'walk';
    container.dataset.playerRunning = String(running && velocity.length() > walkSpeed + 0.05);
    container.dataset.playerGrounded = String(jump.grounded);
    container.dataset.jumpHeight = jump.height.toFixed(3);
    container.dataset.mouseCapture = captureStatus;
    if (mode === 'mouse-look') container.style.cursor = 'none';
    else if (mode === 'inactive') container.style.cursor = 'auto';
  }
  function setPhase(next: ComputerPhase) {
    phase = next;
    container.dataset.computerPhase = next;
    container.dataset.computerId = computer || '';
    options.onComputerState({ id: computer, phase });
    options.sound.setReading(next === 'using');
    emit();
  }
  function clearInput() {
    keys.clear();
    velocity.set(0, 0);
    drag = null;
  }
  function resetJump() {
    Object.assign(jump, createJumpMotion());
  }
  function onCapture(state: PointerCaptureState) {
    const wasPlaying = !paused && locked && captureStatus === 'locked' && playRequested;
    locked = state.locked;
    captureStatus = state.status;
    if (wasPlaying && !locked) {
      // Native Escape can release capture before its keydown reaches the page.
      // Record it before pausing so that one press cannot immediately resume.
      escape.lockLost(inputState(), performance.now());
      pause();
      return;
    }
    if (locked && state.status === 'locked' && playRequested) {
      paused = false;
      clearInput();
      container.focus({ preventScroll: true });
    } else if (state.status === 'unavailable' && playRequested) {
      playRequested = false;
      paused = true;
      clearInput();
      target = null;
      finishComputerReturn();
      // Retain the failure status for the menu's click-to-retry message. A late
      // grant is rejected by isAllowed because play intent is now false.
    }
    emit();
    wake();
  }
  const capture = createPointerCapture(
    {
      isLocked: () => document.pointerLockElement === container,
      request: () => {
        if (!container.requestPointerLock) throw new Error('Pointer lock unavailable');
        return container.requestPointerLock();
      },
      release: () => document.exitPointerLock(),
    },
    {
      isAllowed: () =>
        !disposed &&
        playRequested &&
        windowFocused &&
        !document.hidden &&
        entered &&
        !guided &&
        finePointer.matches &&
        (phase === 'room' || phase === 'leaving'),
      onChange: onCapture,
    },
  );
  function unlock() {
    playRequested = false;
    capture.cancel();
  }
  function pause() {
    if (!entered) return;
    paused = true;
    clearInput();
    auto = null;
    target = null;
    // This must cancel even when already paused and awaiting capture.
    unlock();
    finishComputerReturn();
    emit();
    wake();
  }
  function resume() {
    if (!entered || (phase !== 'room' && phase !== 'leaving')) return;
    clearInput();
    container.focus({ preventScroll: true });
    void options.sound.start();
    if (guided) {
      unlock();
      paused = false;
    } else {
      playRequested = true;
      paused = true;
      capture.request();
      // An already confirmed capture emits no new event.
      if (playRequested && locked && captureStatus === 'locked') paused = false;
    }
    emit();
    wake();
  }
  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    graphics.resize(width, height);
    if (computer) {
      const to = computerPose(computer, width, height).position;
      const next = walkingPath({ x: fromPosition.x, z: fromPosition.z }, { x: to.x, z: to.z });
      if (next.length) path = next;
    }
    wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener('resize', resize);
  let densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  function densityChanged() {
    densityQuery.removeEventListener('change', densityChanged);
    densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    densityQuery.addEventListener('change', densityChanged);
    resize();
  }
  densityQuery.addEventListener('change', densityChanged);
  resize();
  let pendingWorld: typeof world;
  let startupFailed = false;
  const startupAbort = new AbortController();
  function disposeWorld() {
    startupAbort.abort();
    pendingWorld?.dispose();
    pendingWorld = undefined;
    world?.dispose();
    world = undefined;
  }
  loadTogether(
    [
      buildCameraRoom(scene).then((result) => {
        // Own the room as soon as it arrives, even while its lighting is pending.
        if (disposed || startupFailed) result.dispose();
        else pendingWorld = result;
        return result;
      }),
      graphics.ready,
    ],
    90_000,
    startupAbort.signal,
  )
    .then(([result]) => {
      if (disposed || startupFailed) return;
      pendingWorld = undefined;
      world = result;
      graphics.prepare();
      world.setRain(graphicsSettings.rain);
      renderer.shadowMap.needsUpdate = true;
      wake();
    })
    .catch((error) => {
      if (disposed) return;
      startupFailed = true;
      disposeWorld();
      console.error('Garage load failed', error);
      options.onError('load');
    });
  function actionHit(x = 0, y = 0, limit = 2.65) {
    if (!world || phase !== 'room' || paused || !entered) return null;
    pointer.set(x, y);
    ray.setFromCamera(pointer, camera);
    ray.far = limit;
    const hit = ray.intersectObjects(world.pickables, false)[0];
    if (!hit || hit.distance > limit) return null;
    let node: T.Object3D | null = hit.object;
    while (node) {
      if (node.userData.action) {
        const action = node.userData.action as RoomAction;
        if ((action === 'kazam' || action === 'projects') && !world.isComputerOn(action))
          return null;
        return action;
      }
      node = node.parent;
    }
    return null;
  }
  function applyPower(action: 'computer-power' | 'kazam-power' | 'projects-power') {
    if (!world) return;
    world.interact(action);
    const power = world.getPowerState();
    for (const id of ['kazam', 'projects'] as ComputerId[])
      options.sound.setComputerPower(id, power.computers[id]);
    const on =
      action === 'computer-power'
        ? power.computers.kazam || power.computers.projects
        : power.computers[action === 'kazam-power' ? 'kazam' : 'projects'];
    options.sound.play(on ? 'power-on' : 'power-off');
    if (computer && !world.isComputerOn(computer) && phase !== 'room') leaveComputer();
    renderer.shadowMap.needsUpdate = true;
    emit();
    wake();
  }
  function interact(action = target) {
    if (!action || phase !== 'room' || paused) return;
    if (action === 'kazam' || action === 'projects') {
      useComputer(action);
      return;
    }
    if (action === 'solar') {
      pause();
      options.onInspect();
      return;
    }
    if (action === 'computer-power' || action === 'kazam-power' || action === 'projects-power') {
      applyPower(action);
      return;
    }
    if (action === 'kazam-keyboard' || action === 'projects-keyboard') {
      const id = action === 'kazam-keyboard' ? 'kazam' : 'projects';
      if (world?.isComputerOn(id)) {
        world.interact(action);
        options.sound.play('alien');
      }
      wake();
      return;
    }
    world?.interact(action);
    options.sound.play(action === 'car' ? 'car' : 'switch');
    renderer.shadowMap.needsUpdate = true;
    emit();
    wake();
  }
  function useComputer(id: ComputerId) {
    if (!ready || phase !== 'room' || !world?.isComputerOn(id)) return;
    const to = computerPose(id, width, height).position,
      next = walkingPath({ x: player.x, z: player.z }, { x: to.x, z: to.z });
    if (!next.length) return;
    paused = false;
    clearInput();
    resetJump();
    auto = null;
    target = null;
    computer = id;
    focus = 0;
    booted = false;
    fromPosition.copy(player);
    fromTarget.copy(view);
    path = next;
    transitionTime = Math.max(
      1.5,
      path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0) / 1.65,
    );
    setPhase('approaching');
    unlock();
    options.sound.play('chair');
    wake();
  }
  function finishComputerReturn() {
    if (phase !== 'leaving') return;
    // A paused or denied return must still release the computer phase so menu
    // destinations remain usable. Input stays governed by pause and capture.
    focus = 0;
    computer = null;
    path = [];
    player.copy(fromPosition);
    view.copy(fromTarget);
    setPhase('room');
  }
  function leaveComputer() {
    if (phase === 'room' || phase === 'leaving') return;
    leaveTime = Math.max(1.2, transitionTime * 0.85);
    // Once seated, step back beside that desk; do not retrace a long walk to the courtyard.
    if (phase === 'using' && computer) {
      const standing = destinations[computer],
        to = computerPose(computer, width, height),
        next = walkingPath(standing, { x: to.position.x, z: to.position.z });
      if (next.length) {
        path = next;
        fromPosition.set(standing.x, eyeHeight, standing.z);
        fromTarget.copy(to.target);
        const direction = fromTarget.clone().sub(fromPosition).normalize();
        yaw = Math.atan2(-direction.x, -direction.z);
        pitch = Math.asin(direction.y);
        leaveTime = 1.2;
      }
    }
    options.sound.play('chair');
    setPhase('leaving');
    resume();
  }
  function walkTo(id: keyof typeof destinations) {
    if (!ready || phase !== 'room') return;
    if (!entered) return;
    clearInput();
    resetJump();
    target = null;
    container.focus({ preventScroll: true });
    const goal = destinations[id],
      next = walkingPath({ x: player.x, z: player.z }, goal);
    if (!next.length) {
      emit();
      return;
    }
    auto = next;
    autoAmount = 0;
    autoDuration = Math.max(
      0.6,
      next.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - next[i].x, p.z - next[i].z), 0) / 1.25,
    );
    autoLook =
      id === 'courtyard'
        ? new T.Vector3(-10.7, 2.05, 12.0)
        : id === 'entrance'
          ? new T.Vector3(0, 1.7, 2)
          : id === 'solar'
            ? new T.Vector3(2.5, 1.7, 0.5)
            : new T.Vector3(...screenDimensions(id).center);
    resume();
  }
  const onLock = () => capture.sync();
  const onLockError = () => capture.fail();
  const mouseMove = (e: MouseEvent) => {
    if (lookMode(inputState()) !== 'mouse-look') return;
    yaw -= e.movementX * mouseSensitivity;
    pitch = T.MathUtils.clamp(pitch - e.movementY * mouseSensitivity, -1.1, 1.05);
    auto = null;
    wake();
  };
  const down = (e: PointerEvent) => {
    const mode = lookMode(inputState());
    if (mode === 'inactive') return;
    container.focus({ preventScroll: true });
    if (mode === 'mouse-look') {
      interact();
      return;
    }
    // Dragging is only for the touch-guided experience, never desktop fallback.
    drag = { x: e.clientX, y: e.clientY, distance: 0 };
    container.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (lookMode(inputState()) !== 'drag-look') return;
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      drag.distance += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * 0.003;
      pitch = T.MathUtils.clamp(pitch - dy * 0.003, -1.1, 1.05);
      drag.x = e.clientX;
      drag.y = e.clientY;
      auto = null;
      wake();
    } else {
      const r = container.getBoundingClientRect();
      const hit = actionHit(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        1 - ((e.clientY - r.top) / r.height) * 2,
        7,
      );
      container.style.cursor = hit ? 'pointer' : 'grab';
    }
  };
  const up = (e: PointerEvent) => {
    if (!drag) return;
    const small = drag.distance < 7;
    drag = null;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    if (small) {
      const r = container.getBoundingClientRect(),
        x = ((e.clientX - r.left) / r.width) * 2 - 1,
        y = 1 - ((e.clientY - r.top) / r.height) * 2;
      const hit = actionHit(x, y, 7);
      if (hit) interact(hit);
      else if (guided) {
        pointer.set(x, y);
        ray.setFromCamera(pointer, camera);
        const floor = ray.ray.intersectPlane(
          new T.Plane(new T.Vector3(0, 1, 0), 0),
          new T.Vector3(),
        );
        if (floor) {
          const next = walkingPath(player, { x: floor.x, z: floor.z });
          if (next.length) {
            resetJump();
            auto = next;
            autoAmount = 0;
            autoDuration = Math.max(0.6, player.distanceTo(floor) / 1.2);
            autoLook = null;
          }
        }
      }
    }
    wake();
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      const action = escape.keyDown(inputState(), performance.now(), e.repeat);
      if (!action) return;
      e.preventDefault();
      if (captureStatus === 'requesting') pause();
      else if (action === 'leave-computer') leaveComputer();
      else if (action === 'pause') pause();
      else resume();
      return;
    }
    const ui = !!(e.target as HTMLElement)?.closest?.(
      'input,textarea,select,[contenteditable=true],button,a[href],[role=button]',
    );
    if (!acceptsMovement(inputState(), ui, e.metaKey || e.ctrlKey || e.altKey)) return;
    const k = e.key.toLowerCase();
    if (
      ![
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'e',
        'shift',
        ' ',
      ].includes(k)
    )
      return;
    e.preventDefault();
    if (k === 'e') {
      if (!e.repeat) interact();
    } else if (k === ' ') {
      if (!e.repeat && !auto) beginJump(jump);
    } else if (k === 'shift') {
      if (!e.repeat) running = !running;
    } else {
      keys.add(k);
      auto = null;
    }
    wake();
  };
  const keyUp = (e: KeyboardEvent) => {
    if (e.key === 'Escape') escape.keyUp();
    keys.delete(e.key.toLowerCase());
  };
  const onFocus = () => {
    windowFocused = true;
  };
  const blur = () => {
    windowFocused = false;
    clearInput();
    escape.reset();
    if (entered && (phase === 'room' || phase === 'leaving')) pause();
    else unlock();
  };
  const visibility = () => {
    clearInput();
    if (document.hidden) {
      if (entered && (phase === 'room' || phase === 'leaving')) pause();
      else unlock();
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      lastTime = 0;
      wake();
    }
  };
  container.addEventListener('pointerdown', down);
  container.addEventListener('pointermove', move);
  container.addEventListener('pointerup', up);
  container.addEventListener('pointercancel', clearInput);
  document.addEventListener('mousemove', mouseMove);
  document.addEventListener('pointerlockchange', onLock);
  document.addEventListener('pointerlockerror', onLockError);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', visibility);
  const lost = (e: Event) => {
    e.preventDefault();
    pause();
    options.onError('context-lost');
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  function positionDesktop() {
    const visible = computer && focus > 0.66 && phase !== 'room';
    surface.style.visibility = visible ? 'visible' : 'hidden';
    surface.style.pointerEvents = phase === 'using' ? 'auto' : 'none';
    if (!visible || !computer) return;
    const screen = screenDimensions(computer),
      [x, y, z] = screen.center;
    const corners = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ].map(([sx, sy]) => {
      const p = new T.Vector3(x + (sx * screen.width) / 2, y + (sy * screen.height) / 2, z).project(
        camera,
      );
      return { x: (p.x * 0.5 + 0.5) * width, y: (-0.5 * p.y + 0.5) * height };
    });
    const w = width < 640 ? 360 : 960,
      h = (w * screen.height) / screen.width;
    surface.style.width = `${w}px`;
    surface.style.height = `${h}px`;
    surface.dataset.compact = String(width < 640);
    const matrix = screenTransform(corners, w, h);
    if (matrix) surface.style.transform = `matrix3d(${matrix.join(',')})`;
    surface.style.opacity = String(Math.min(1, (focus - 0.66) / 0.11));
    container.dataset.screenQuad = JSON.stringify(
      corners.map((p) => [+p.x.toFixed(1), +p.y.toFixed(1)]),
    );
  }
  function draw(now: number) {
    raf = 0;
    if (disposed || document.hidden || !world) return;
    const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 1 / 60);
    lastTime = now;
    if (!paused && !reduced) elapsed += dt;
    if (acceptsMovement(inputState())) {
      const previous = player.clone();
      if (auto) {
        autoAmount = reduced ? 1 : Math.min(1, autoAmount + dt / autoDuration);
        const p = samplePath(auto, ease(autoAmount));
        player.x = p.x;
        player.z = p.z;
        if (autoLook) {
          const d = autoLook.clone().sub(player).normalize(),
            ay = Math.atan2(-d.x, -d.z);
          yaw = reduced
            ? ay
            : yaw + Math.atan2(Math.sin(ay - yaw), Math.cos(ay - yaw)) * (1 - Math.exp(-4 * dt));
          pitch = reduced ? Math.asin(d.y) : T.MathUtils.damp(pitch, Math.asin(d.y), 4, dt);
        }
        if (autoAmount >= 1) auto = null;
      } else {
        const front =
            Number(keys.has('w') || keys.has('arrowup')) -
            Number(keys.has('s') || keys.has('arrowdown')),
          side = Number(keys.has('d')) - Number(keys.has('a'));
        if (keys.has('arrowleft')) yaw += dt * 1.3;
        if (keys.has('arrowright')) yaw -= dt * 1.3;
        const next = stepPlanarMotion(
          { x: player.x, z: player.z, vx: velocity.x, vz: velocity.y },
          { forward: front, side, yaw, sprint: running },
          dt,
        );
        velocity.set(next.vx, next.vz);
        player.x = next.x;
        player.z = next.z;
      }
      const landed = stepJumpMotion(jump, dt),
        distance = Math.hypot(previous.x - player.x, previous.z - player.z);
      walkingDistance += distance;
      if (landed) {
        lastStep = walkingDistance;
        options.sound.play('step');
      } else if (jump.grounded && walkingDistance - lastStep > (running ? 0.84 : 0.62)) {
        lastStep = walkingDistance;
        options.sound.play('step');
      }
    }
    camera.position.copy(player);
    if (phase === 'room') {
      camera.position.y += jump.height + (reduced ? 0 : jump.landing);
      if (!reduced && jump.grounded && velocity.length() > 0.12)
        camera.position.y +=
          Math.sin(walkingDistance * (running ? 11 : 10)) * (running ? 0.012 : 0.008);
    }
    forward.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    view.copy(camera.position).add(forward);
    camera.fov = width / height < 0.9 ? 74 : 65;
    if (computer && path.length) {
      if (!paused && phase === 'approaching')
        focus = reduced ? 1 : Math.min(1, focus + dt / transitionTime);
      if (!paused && phase === 'leaving') focus = reduced ? 0 : Math.max(0, focus - dt / leaveTime);
      const blend = ease(focus),
        p = samplePath(path, blend),
        to = computerPose(computer, width, height);
      camera.position.set(p.x, T.MathUtils.lerp(fromPosition.y, to.position.y, blend), p.z);
      view.copy(fromTarget).lerp(to.target, blend);
      camera.fov = T.MathUtils.lerp(width / height < 0.9 ? 74 : 65, computerFov, blend);
      if (!booted && focus > 0.63 && phase === 'approaching') {
        booted = true;
        options.sound.play('boot');
      }
      if (phase === 'approaching' && focus === 1) {
        setPhase('using');
        options.sound.play('ready');
      }
      if (!paused && phase === 'leaving' && focus === 0) finishComputerReturn();
    }
    camera.updateProjectionMatrix();
    camera.lookAt(view);
    camera.updateMatrixWorld();
    if (phase === 'room') {
      target = actionHit();
    } else target = null;
    hands.animate(phase === 'approaching' ? focus : 0, reduced);
    world.animate(elapsed, camera.position);
    graphics.render();
    positionDesktop();
    const acoustics = options.sound.update(
      camera.position,
      view.clone().sub(camera.position).normalize(),
      world.traffic,
    );
    container.dataset.cityAudioZone = acoustics.zone;
    container.dataset.cityAudioGain = acoustics.gain.toFixed(3);
    container.dataset.vehicleCount = String(world.vehicleCount);
    container.dataset.pedestrianCount = String(world.pedestrianCount);
    emit();
    container.dataset.cameraPosition = camera.position
      .toArray()
      .map((v) => v.toFixed(3))
      .join(',');
    container.dataset.cameraTarget = view
      .toArray()
      .map((v) => v.toFixed(3))
      .join(',');
    container.dataset.scene = 'walkable-room';
    if (!ready) {
      ready = true;
      options.onReady();
    }
    if (
      !paused &&
      (phase === 'approaching' ||
        phase === 'leaving' ||
        (phase !== 'using' &&
          (!reduced ||
            keys.size ||
            auto ||
            velocity.length() > 0.001 ||
            !jump.grounded ||
            Math.abs(jump.landing) > 0.00001)))
    )
      raf = requestAnimationFrame(draw);
    else lastTime = 0;
  }
  function wake() {
    if (!raf && !disposed && world && !document.hidden) raf = requestAnimationFrame(draw);
  }
  function setGraphics(next: GraphicsSettings) {
    graphicsSettings = normalizeGraphics(next);
    graphics.setSettings(graphicsSettings);
    renderer.domElement.style.imageRendering = graphicsSettings.pixelated ? 'pixelated' : 'auto';
    renderer.domElement.style.filter =
      graphicsSettings.contrast === 1 && graphicsSettings.saturation === 1
        ? 'none'
        : `contrast(${graphicsSettings.contrast}) saturate(${graphicsSettings.saturation})`;
    world?.setRain(graphicsSettings.rain);
    container.dataset.graphicsSettings = JSON.stringify(graphicsSettings);
    wake();
  }
  return {
    setGraphics,
    start: () => {
      if (!ready) return;
      entered = true;
      guided = !finePointer.matches;
      resume();
    },
    resume,
    pause,
    useComputer,
    leaveComputer,
    interact: () => interact(),
    walkTo,
    setReduced: (v) => {
      reduced = v;
      wake();
    },
    dispose: () => {
      disposed = true;
      capture.dispose();
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      densityQuery.removeEventListener('change', densityChanged);
      clearInput();
      container.removeEventListener('pointerdown', down);
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerup', up);
      container.removeEventListener('pointercancel', clearInput);
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('pointerlockchange', onLock);
      document.removeEventListener('pointerlockerror', onLockError);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      hands.dispose();
      disposeWorld();
      graphics.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      surface.style.visibility = 'hidden';
    },
  };
}
