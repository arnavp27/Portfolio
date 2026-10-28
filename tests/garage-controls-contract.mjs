import assert from 'node:assert/strict';
import {
  createEscapeController,
  lookMode,
  acceptsMovement,
  stepPlanarMotion,
  createJumpMotion,
  beginJump,
  stepJumpMotion,
  walkSpeed,
  runSpeed,
  mouseSensitivity,
} from '../src/lib/garage/player-controls.ts';
import { isWalkable } from '../src/lib/garage/navigation.ts';
const initial = () => ({
  entered: true,
  paused: false,
  guided: false,
  locked: true,
  phase: 'room',
});
function harness() {
  const state = initial(),
    esc = createEscapeController();
  let captures = 0;
  const apply = (intent) => {
    if (intent === 'pause') state.paused = true;
    if (intent === 'resume') state.paused = false;
    if (intent === 'leave-computer') {
      state.phase = 'leaving';
      captures++;
    }
    return intent;
  };
  return {
    state,
    esc,
    get captures() {
      return captures;
    },
    key: (at, repeat = false) => apply(esc.keyDown(state, at, repeat)),
    release: () => esc.keyUp(),
    unlock: (at) => {
      state.locked = false;
      return apply(esc.lockLost(state, at));
    },
  };
}
for (const order of ['key-first', 'lock-first']) {
  const h = harness();
  if (order === 'key-first') {
    assert.equal(h.key(100), 'pause');
    h.unlock(101);
  } else {
    assert.equal(h.unlock(100), 'pause');
    assert.equal(h.key(101), null);
  }
  assert(h.state.paused, `${order}: one Escape pauses once`);
  assert.equal(h.key(130, true), null);
  assert(h.state.paused, 'Holding Escape cannot oscillate the menu');
  h.release();
  assert.equal(h.key(200), 'resume');
  assert(!h.state.paused, `${order}: the next Escape closes the menu`);
}
{
  const h = harness();
  h.unlock(100);
  h.release();
  assert.equal(h.key(180), 'resume', 'Native unlock without keydown still allows the next Escape');
  h.release();
  h.state.phase = 'using';
  h.state.paused = false;
  h.state.locked = false;
  assert.equal(h.key(1000), 'leave-computer');
  assert.equal(h.captures, 1, 'Exiting a PC requests mouse capture in that user gesture');
  h.state.paused = true;
  assert.equal(
    h.unlock(1001),
    null,
    'An already-paused return waiting for capture does not pause again',
  );
  h.release();
  assert.equal(h.key(1200), 'resume', 'Escape can retry a paused return from a computer');
  h.release();
  assert.equal(h.key(1300), null, 'Escape during an active return does not restart it');
  h.release();
  h.state.phase = 'room';
  assert.equal(lookMode(h.state), 'inactive', 'Desktop mouse look requires actual capture');
  h.state.locked = true;
  assert.equal(lookMode(h.state), 'mouse-look');
  h.state.locked = false;
  h.state.guided = true;
  assert.equal(lookMode(h.state), 'drag-look');
  h.state.locked = true;
  assert.equal(lookMode(h.state), 'drag-look', 'Guided mode consistently uses drag input');
  h.state.guided = false;
  h.state.locked = false;
  assert.equal(lookMode(h.state), 'inactive');
}
for (const order of ['key-first', 'lock-first']) {
  const h = harness();
  h.state.phase = 'leaving';
  if (order === 'key-first') {
    assert.equal(h.key(100), null);
    assert.equal(h.unlock(101), 'pause');
  } else {
    assert.equal(h.unlock(100), 'pause');
    assert.equal(h.key(101), null);
  }
  assert(h.state.paused, 'Losing capture while returning pauses the camera transition');
  h.release();
  assert.equal(h.key(200), 'resume', 'The next Escape retries the paused return');
}
for (const phase of ['approaching', 'using', 'leaving'])
  assert(!acceptsMovement({ ...initial(), phase }));
assert(!acceptsMovement({ ...initial(), paused: true }));
assert(!acceptsMovement({ ...initial(), entered: false }));
assert(!acceptsMovement(initial(), true));
assert(!acceptsMovement(initial(), false, true));
assert(acceptsMovement(initial()));
assert(!acceptsMovement({ ...initial(), locked: false }), 'Uncaptured desktop input cannot move');
assert(acceptsMovement({ ...initial(), locked: false, guided: true }));
assert.equal(lookMode({ ...initial(), paused: true }), 'inactive');
assert.equal(lookMode({ ...initial(), entered: false }), 'inactive');
for (const phase of ['approaching', 'using', 'leaving'])
  assert.equal(lookMode({ ...initial(), phase }), 'inactive');
console.log(
  'PASS: Escape event ordering, repeat suppression, capture-required movement, guided input, and UI/phase guards.',
);

const traverse = (sprint, forward = 1, side = 0, hz = 60) => {
  let s = { x: 0, z: 10, vx: 0, vz: 0 };
  for (let i = 0; i < hz; i++) s = stepPlanarMotion(s, { forward, side, yaw: 0, sprint }, 1 / hz);
  return s;
};
const walk = traverse(false),
  run = traverse(true);
assert(
  Math.abs((10 - run.z) / (10 - walk.z) - 2) < 1e-8,
  'Shift produces exactly twice the walk target speed',
);
assert(Math.abs(Math.hypot(walk.vx, walk.vz) - walkSpeed) < 0.001);
assert(Math.abs(Math.hypot(run.vx, run.vz) - runSpeed) < 0.001);
const diagonal = traverse(true, 1, 1);
assert(
  Math.abs(Math.hypot(diagonal.vx, diagonal.vz) - runSpeed) < 0.001,
  'Diagonal running is not faster',
);
for (const hz of [30, 60, 144]) {
  const flight = createJumpMotion();
  assert(beginJump(flight));
  assert(!beginJump(flight), 'Jump cannot double-trigger in the air');
  let max = 0,
    landings = 0;
  for (let i = 0; i < hz * 2; i++) {
    if (stepJumpMotion(flight, 1 / hz)) landings++;
    max = Math.max(max, flight.height);
    assert(flight.height >= 0);
    assert(flight.landing >= -0.05, 'Landing remains a small camera dip');
  }
  assert(Math.abs(max - 0.5666667) < 0.002);
  assert.equal(landings, 1);
  assert(flight.grounded && flight.height === 0 && Math.abs(flight.landing) < 0.0001);
  assert(beginJump(flight), 'A new press after landing can jump again');
  // Run straight at the work desk while repeatedly jumping. XZ collision stays in force.
  let s = { x: -1.2, z: 1.95, vx: 0, vz: 0 };
  const jump = createJumpMotion();
  for (let i = 0; i < hz * 3; i++) {
    if (jump.grounded) beginJump(jump);
    stepJumpMotion(jump, 1 / hz);
    s = stepPlanarMotion(s, { forward: 1, side: 0, yaw: 0, sprint: true }, 1 / hz);
    assert(isWalkable(s));
    assert(s.z >= 1.55, 'Jumping cannot pass through or climb onto the work desk');
  }
}
console.log(
  'PASS: sprint speed, normalized diagonal movement, grounded-only jump, consistent flight/landing at 30/60/144 Hz, and airborne desk collision.',
);

// Execute the event handlers used by mountExplorer with a tiny DOM boundary. This
// catches wiring regressions (including calling leaveComputer without capture),
// rather than only testing the state helpers in isolation.
const { productionSource } = await import('./helpers/production-source.mjs');
const explorer = productionSource(new URL('../src/lib/garage/explorer.ts', import.meta.url));
const handler = (name) => explorer.declarations('mountExplorer', [name]);
for (const [event, name] of [
  ['keydown', 'keyDown'],
  ['keyup', 'keyUp'],
  ['mousemove', 'mouseMove'],
])
  explorer.assertListener('mountExplorer', event, name);
const eventHarness = Function(
  'createEscapeController',
  'lookMode',
  'acceptsMovement',
  'createJumpMotion',
  'beginJump',
  'mouseSensitivity',
  `
 let entered=true,paused=false,guided=false,locked=true,phase='room',yaw=0,pitch=0,auto=null,captures=0,interactions=0,running=false,captureStatus='locked';
 const keys=new Set(),jump=createJumpMotion(),escape=createEscapeController();
 const container={contains:node=>node==='canvas',getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})},inputState=()=>({entered,paused,guided,locked,phase});
 const T={MathUtils:{clamp:(value,min,max)=>Math.min(max,Math.max(min,value))}};
 const wake=()=>{},pause=()=>{paused=true;},resume=()=>{paused=false;},leaveComputer=()=>{phase='leaving';captures++;},interact=()=>interactions++;
 ${handler('keyDown')}
 ${handler('keyUp')}
 ${handler('mouseMove')}
 return {keyDown,keyUp,mouseMove,jump,set:s=>{if('phase'in s)phase=s.phase;if('paused'in s)paused=s.paused;if('guided'in s)guided=s.guided;if('locked'in s)locked=s.locked;},get:()=>({paused,phase,yaw,captures,interactions,running,keys:[...keys]})};
`,
);
const live = eventHarness(
  createEscapeController,
  lookMode,
  acceptsMovement,
  createJumpMotion,
  beginJump,
  mouseSensitivity,
);
const key = (key, options = {}) => ({
  key,
  repeat: false,
  defaultPrevented: false,
  target: { closest: () => false },
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...options,
});
live.keyDown(key('Escape'));
live.keyUp(key('Escape'));
assert(live.get().paused);
live.keyDown(key('Escape'));
live.keyUp(key('Escape'));
assert(!live.get().paused, 'Actual Escape handler closes the menu');
live.set({ phase: 'using' });
live.keyDown(key('Escape'));
live.keyUp(key('Escape'));
assert.equal(live.get().captures, 1);
live.set({ phase: 'room', locked: false });
live.mouseMove({ target: 'canvas', clientX: 100, clientY: 100, movementX: 0, movementY: 0 });
live.mouseMove({ target: 'canvas', clientX: 180, clientY: 100, movementX: 80, movementY: 0 });
assert.equal(live.get().yaw, 0, 'Unlocked mouse events cannot rotate the desktop camera');
live.keyDown(key('w'));
assert(!live.get().keys.includes('w'), 'Uncaptured keyboard input cannot start movement');
live.set({ locked: true });
live.mouseMove({ target: 'canvas', clientX: 180, clientY: 100, movementX: 80, movementY: 0 });
assert.equal(live.get().yaw, -80 * mouseSensitivity, 'Captured input uses relative movement');
live.keyDown(key(' '));
assert(!live.jump.grounded);
Object.assign(live.jump, createJumpMotion());
live.keyDown(key(' ', { repeat: true }));
assert(live.jump.grounded, 'Holding Space cannot jump again after landing');
live.keyDown(key('w', { target: { closest: () => true } }));
assert(!live.get().keys.includes('w'), 'Actual handler respects focused UI');
live.keyDown(key('w'));
live.keyDown(key('Shift'));
assert.equal(live.get().running, true, 'One Shift press enables run mode');
live.keyUp(key('Shift'));
assert.equal(live.get().running, true, 'Releasing Shift keeps the selected run mode');
for (let i = 0; i < 10; i++) live.keyDown(key('Shift', { repeat: true }));
assert.equal(live.get().running, true, 'Held Shift repeats must not toggle the mode');
live.keyDown(key('Shift'));
assert.equal(live.get().running, false, 'The next press switches back to walking');
live.keyUp(key('Shift'));
live.keyDown(key('Shift'));
assert.equal(live.get().running, true);
// Even if the OS swallowed a release, the next non-repeat press must still work.
live.keyDown(key('Shift'));
assert.equal(live.get().running, false, 'A missing keyup cannot leave run mode stuck');
for (const state of [
  { paused: true },
  { paused: false, phase: 'using' },
  { phase: 'approaching' },
]) {
  live.set(state);
  live.keyDown(key('Shift'));
  assert.equal(live.get().running, false, 'Menus and computers do not toggle running');
}
live.set({ paused: false, phase: 'room' });
live.keyDown(key('Shift', { target: { closest: () => true } }));
assert.equal(live.get().running, false, 'Typing in UI must not toggle running');
assert(live.get().keys.includes('w'));
live.keyDown(key('e'));
live.keyDown(key('e', { repeat: true }));
assert.equal(live.get().interactions, 1, 'Held E only interacts once');
live.set({ phase: 'approaching' });
Object.assign(live.jump, createJumpMotion());
live.keyDown(key(' '));
assert(live.jump.grounded, 'Actual handler ignores jumping during a computer approach');
console.log(
  'PASS: production Escape/mouse/key handlers, capture-on-exit call site, relative look, focused UI, held Space/E, and approach jump suppression.',
);

const { createGaragePower } = await import('../src/lib/garage/power.ts');
const interactionHarness = Function(
  'createGaragePower',
  `
 const circuit=createGaragePower(),calls=[],sounds=[],fans=[];
 let entered=true,paused=false,phase='room',ready=true,computer=null,target=null,focus=0,booted=false,auto=null,path=[],transitionTime=0,inspections=0;
 const width=1280,height=720,player={x:0,z:5},view={},fromPosition={copy:()=>{}},fromTarget={copy:()=>{}};
 const renderer={shadowMap:{needsUpdate:false}},pointer={set:()=>{}},camera={};let hit=null;
 const ray={far:0,setFromCamera:()=>{},intersectObjects:()=>hit?[hit]:[]};
 const world={pickables:[],getPowerState:()=>circuit.snapshot(),isComputerOn:id=>circuit.snapshot().computers[id],interact:action=>{
  calls.push(action);
  if(action==='garage-lights')circuit.toggleLights();
  else if(action==='computer-power')circuit.toggleComputers();
  else if(action==='kazam-power')circuit.toggleComputer('kazam');
  else if(action==='projects-power')circuit.toggleComputer('projects');
 }};
 const options={sound:{play:kind=>sounds.push(kind),setComputerPower:(id,on)=>fans.push([id,on])},onInspect:()=>inspections++};
 const computerPose=id=>({position:{x:id==='kazam'?-1.2:.12,z:id==='kazam'?2.05:-.91}});
 const walkingPath=(from,to)=>[{...from},{...to}],setPhase=next=>{phase=next},unlock=()=>{},clearInput=()=>{},resetJump=()=>{},emit=()=>{},wake=()=>{},pause=()=>{paused=true},leaveComputer=()=>{phase='leaving'};
 ${handler('actionHit')}
 ${handler('applyPower')}
 ${handler('interact')}
 ${handler('useComputer')}
 return {interact,useComputer,actionHit,clear:()=>{calls.length=0;sounds.length=0;fans.length=0;renderer.shadowMap.needsUpdate=false;},setHit:(action,parentAction=null,distance=1)=>{hit={distance,object:{userData:{action},parent:parentAction?{userData:{action:parentAction},parent:null}:null}};},set:s=>{if('paused'in s)paused=s.paused;if('phase'in s)phase=s.phase;},get:()=>({phase,computer,power:circuit.snapshot(),calls:[...calls],sounds:[...sounds],fans:[...fans],shadows:renderer.shadowMap.needsUpdate,inspections})};
`,
);
const makeInteraction = () => interactionHarness(createGaragePower);
for (const id of ['kazam', 'projects']) {
  const h = makeInteraction();
  h.setHit(id + '-keyboard', id);
  assert.equal(
    h.actionHit(),
    id + '-keyboard',
    'The keyboard child action takes priority over a monitor ancestor',
  );
  h.interact(h.actionHit());
  let result = h.get();
  assert.equal(result.phase, 'room');
  assert.equal(result.computer, null, 'A physical keyboard does not open a desktop');
  assert.deepEqual(
    result.calls,
    [id + '-keyboard'],
    'The powered keyboard dispatches its animation',
  );
  assert.deepEqual(result.sounds, ['alien']);
  assert.deepEqual(result.fans, []);
  h.clear();
  h.setHit(id);
  h.interact(h.actionHit());
  result = h.get();
  assert.equal(result.phase, 'approaching');
  assert.equal(result.computer, id, 'A monitor opens its own computer');
  assert.deepEqual(result.sounds, ['chair'], 'Opening the screen never plays the keyboard song');
  assert.deepEqual(result.calls, []);
}
for (const id of ['kazam', 'projects']) {
  const other = id === 'kazam' ? 'projects' : 'kazam',
    h = makeInteraction();
  h.setHit(id + '-power', id);
  assert.equal(h.actionHit(), id + '-power', 'The physical CPU button retains its specific action');
  h.interact(h.actionHit());
  let result = h.get();
  assert.equal(result.power.computers[id], false);
  assert.equal(result.power.computers[other], true);
  assert(result.power.lights, 'A CPU switch leaves the lighting circuit on');
  assert.deepEqual(result.calls, [id + '-power']);
  assert.deepEqual(result.sounds, ['power-off']);
  assert.deepEqual(
    result.fans,
    [
      ['kazam', id !== 'kazam'],
      ['projects', id !== 'projects'],
    ],
    'Both fan gain targets reflect the resulting independent PC states',
  );
  assert(result.shadows, 'Power changes refresh static lighting shadows');
  h.clear();
  h.setHit(id);
  assert.equal(h.actionHit(), null, 'A powered-off monitor is not offered as an interaction');
  h.interact(id);
  h.useComputer(id);
  result = h.get();
  assert.equal(result.phase, 'room');
  assert.equal(result.computer, null);
  assert.deepEqual(result.sounds, [], 'Direct shortcuts cannot start an unpowered computer');
  h.interact(id + '-keyboard');
  result = h.get();
  assert.deepEqual(result.calls, []);
  assert.deepEqual(result.sounds, [], 'A disconnected keyboard stays silent and does not animate');
  h.interact(id + '-power');
  result = h.get();
  assert.deepEqual(result.sounds, ['power-on']);
  assert(result.power.computers[id] && result.power.computers[other]);
  assert.deepEqual(result.fans, [
    ['kazam', true],
    ['projects', true],
  ]);
  assert.equal(result.phase, 'room', 'CPU power buttons never open the desktop');
}
{
  const h = makeInteraction();
  h.interact('computer-power');
  let result = h.get();
  assert.deepEqual(result.power, { lights: true, computers: { kazam: false, projects: false } });
  assert.deepEqual(result.calls, ['computer-power']);
  assert.deepEqual(result.sounds, ['power-off']);
  assert.deepEqual(result.fans, [
    ['kazam', false],
    ['projects', false],
  ]);
  h.clear();
  h.interact('garage-lights');
  result = h.get();
  assert.deepEqual(result.power, { lights: false, computers: { kazam: false, projects: false } });
  assert.deepEqual(result.calls, ['garage-lights']);
  assert.deepEqual(result.sounds, ['switch']);
  assert.deepEqual(result.fans, [], 'The light switch does not alter fan power');
  assert(result.shadows, 'The light circuit refreshes static shadow maps');
  h.clear();
  h.interact('computer-power');
  result = h.get();
  assert.deepEqual(result.power, { lights: false, computers: { kazam: true, projects: true } });
  assert.deepEqual(result.sounds, ['power-on']);
  assert.deepEqual(
    result.fans,
    [
      ['kazam', true],
      ['projects', true],
    ],
    'The computer circuit can run while room lamps are off',
  );
  h.clear();
  h.interact('garage-lights');
  result = h.get();
  assert.deepEqual(result.power, { lights: true, computers: { kazam: true, projects: true } });
  assert.deepEqual(result.sounds, ['switch']);
  h.interact('kazam-power');
  h.clear();
  h.interact('computer-power');
  result = h.get();
  assert.deepEqual(
    result.power.computers,
    { kazam: false, projects: false },
    'From mixed power, the master switch shuts both computers off',
  );
  assert.deepEqual(result.sounds, ['power-off']);
  for (const blocked of [
    { paused: true },
    { paused: false, phase: 'using' },
    { phase: 'approaching' },
  ]) {
    h.set(blocked);
    h.clear();
    for (const action of [
      'garage-lights',
      'computer-power',
      'kazam-power',
      'projects-power',
      'kazam-keyboard',
      'projects-keyboard',
      'kazam',
      'projects',
    ])
      h.interact(action);
    assert.deepEqual(h.get().calls, []);
    assert.deepEqual(
      h.get().sounds,
      [],
      'Room physical actions are suppressed in menus and computer transitions',
    );
  }
}
console.log(
  'PASS: physical keyboard versus monitor/CPU actions, child hit priority, powered-off guards, independent power circuits, fan sync, power SFX, shadow refresh, and phase gating.',
);
