import assert from 'node:assert/strict';
import { productionSource } from './helpers/production-source.mjs';
import { createPointerCapture } from '../src/lib/garage/pointer-capture.ts';
import {
  createEscapeController,
  createJumpMotion,
  beginJump,
  acceptsMovement,
  lookMode,
  mouseSensitivity,
} from '../src/lib/garage/player-controls.ts';

// Execute the production handlers together with the real capture coordinator.
// Only browser requests, native capture events, timers and scene/DOM effects are fake.
const source = productionSource(new URL('../src/lib/garage/explorer.ts', import.meta.url));
for (const [event, handler] of [
  ['mousemove', 'mouseMove'],
  ['pointerdown', 'down'],
  ['pointermove', 'move'],
  ['pointerlockchange', 'onLock'],
  ['pointerlockerror', 'onLockError'],
  ['keydown', 'keyDown'],
  ['keyup', 'keyUp'],
])
  source.assertListener('mountExplorer', event, handler);
source.assertCall('mountExplorer.leaveComputer', 'resume');
const code = source.declarations('mountExplorer', [
  'inputState',
  'clearInput',
  'onCapture',
  'capture',
  'unlock',
  'pause',
  'resume',
  'onLock',
  'onLockError',
  'mouseMove',
  'down',
  'move',
  'keyDown',
  'keyUp',
  'leaveComputer',
]);
const makeHarness = Function(
  'createPointerCapture',
  'createEscapeController',
  'createJumpMotion',
  'beginJump',
  'acceptsMovement',
  'lookMode',
  'mouseSensitivity',
  `
 let entered=true,paused=true,guided=false,locked=false,phase='room',playRequested=false;
 let disposed=false,windowFocused=true,captureStatus='idle',yaw=0,pitch=0,auto=null,target=null,drag=null;
 let running=false,computer='projects',leaveTime=0,transitionTime=1.7,path=[];
 let requests=0,releases=0,interactions=0,pointerCaptures=0,clock=100,nextTimer=0,deferredRelease=false;
 const attempts=[],timers=new Map(),keys=new Set(),escape=createEscapeController(),jump=createJumpMotion();
 const finePointer={matches:true},velocity={set:()=>{}},performance={now:()=>clock},width=1280,height=720;
 const document={pointerLockElement:null,hidden:false,exitPointerLock(){releases++;if(!deferredRelease)this.pointerLockElement=null;}};
 const container={
  focus:()=>{},style:{},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
  setPointerCapture:()=>pointerCaptures++,
  requestPointerLock(){requests++;return new Promise((resolve,reject)=>attempts.push({resolve,reject}));},
 };
 const options={sound:{start:()=>Promise.resolve(),play:()=>{}}};
 const T={MathUtils:{clamp:(value,min,max)=>Math.min(max,Math.max(min,value))}};
 const emit=()=>{},wake=()=>{},interact=()=>interactions++,actionHit=()=>null;
 const destinations={projects:{x:0,z:0}},computerPose=()=>({position:{x:0,z:0}}),walkingPath=()=>[];
 const setPhase=next=>{phase=next;};
 const realCapture=createPointerCapture;
 createPointerCapture=(host,options)=>realCapture(host,{
  ...options,timers:{setTimeout(callback){const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}},
 });
 ${code}
 return {
  resume,pause,mouseMove,down,move,keyDown,keyUp,leaveComputer,
  grant(){document.pointerLockElement=container;onLock();},
  clearNative(){document.pointerLockElement=null;},
  lose(){document.pointerLockElement=null;onLock();},
  deferRelease(value){deferredRelease=value;},
  reject(index=attempts.length-1){attempts[index].reject(new Error('Capture denied'));},
  resolve(index=attempts.length-1){attempts[index].resolve();},
  expire(){const callbacks=[...timers.values()];timers.clear();for(const callback of callbacks)callback();},
  set(state){if('phase'in state)phase=state.phase;if('guided'in state)guided=state.guided;if('paused'in state)paused=state.paused;if('entered'in state)entered=state.entered;},
  tick(){clock+=100;},
  state:()=>({entered,paused,guided,locked,phase,playRequested,captureStatus,yaw,pitch,requests,releases,interactions,pointerCaptures,drag,keys:[...keys],timers:timers.size,nativeLocked:document.pointerLockElement===container}),
  dispose(){disposed=true;capture.dispose();},
 };
`,
);
const harness = () =>
  makeHarness(
    createPointerCapture,
    createEscapeController,
    createJumpMotion,
    beginJump,
    acceptsMovement,
    lookMode,
    mouseSensitivity,
  );
const key = (value, options = {}) => ({
  key: value,
  repeat: false,
  defaultPrevented: false,
  target: { closest: () => false },
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...options,
});
const mouse = (movementX, movementY = 0, clientX = 400) => ({
  movementX,
  movementY,
  clientX,
  clientY: 300,
  pointerId: 1,
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

{
  const h = harness();
  h.resume();
  assert.equal(h.state().captureStatus, 'requesting');
  assert(h.state().paused, 'Desktop play waits for actual capture');
  h.mouseMove(mouse(80));
  h.keyDown(key('w'));
  h.down(mouse(0));
  assert.equal(h.state().yaw, 0);
  assert.deepEqual(h.state().keys, []);
  assert.equal(h.state().interactions, 0);
  h.reject();
  await flush();
  assert(h.state().paused);
  assert.equal(h.state().captureStatus, 'unavailable');
  assert.equal(h.state().playRequested, false);
  h.mouseMove(mouse(100));
  h.down(mouse(0));
  assert.equal(h.state().yaw, 0, 'Denied capture never starts bounded free-look');
  assert.equal(h.state().interactions, 0, 'Denied capture cannot activate a world object');
  h.resume();
  assert.equal(h.state().requests, 2);
  h.grant();
  h.resolve();
  await flush();
  assert(h.state().locked && !h.state().paused);
  h.mouseMove(mouse(40));
  assert.equal(h.state().yaw, -40 * mouseSensitivity);
  h.mouseMove(mouse(0, 0, 799));
  h.mouseMove(mouse(0, 0, -100));
  assert.equal(
    h.state().yaw,
    -40 * mouseSensitivity,
    'Client coordinates never steer captured input',
  );
  h.down(mouse(0));
  assert.equal(h.state().interactions, 1);
  h.keyDown(key('w'));
  assert.deepEqual(h.state().keys, ['w']);
  h.pause();
  assert.deepEqual(h.state().keys, []);
  assert.equal(h.state().playRequested, false);
  h.dispose();
}

{
  const h = harness();
  h.resume();
  h.keyDown(key('Escape'));
  assert(h.state().paused && !h.state().playRequested, 'Escape cancels a pending capture');
  h.keyDown(key('Escape', { repeat: true }));
  assert.equal(h.state().requests, 1, 'Held Escape must not retry the cancelled request');
  h.grant();
  h.resolve();
  await flush();
  assert.equal(h.state().releases, 1, 'A cancelled request releases a late browser grant');
  assert(h.state().paused && !h.state().locked);
  h.keyUp(key('Escape'));
  h.tick();
  h.keyDown(key('Escape'));
  assert.equal(h.state().requests, 2, 'A new Escape can resume after cancellation settles');
  assert(h.state().paused, 'Retry still waits for native capture');
  h.grant();
  assert(!h.state().paused);
  h.dispose();
}

{
  const h = harness();
  h.resume();
  h.grant();
  h.resolve();
  await flush();
  assert(h.state().locked && !h.state().paused);
  h.deferRelease(true);
  h.pause();
  assert(
    h.state().nativeLocked,
    'exitPointerLock may leave native ownership visible until its event',
  );
  assert.equal(h.state().releases, 1);
  h.resume();
  assert.equal(h.state().captureStatus, 'unavailable');
  assert(
    h.state().locked && h.state().nativeLocked,
    'Capture still reports the native release in flight',
  );
  assert(
    h.state().paused && !h.state().playRequested,
    'A departing lock cannot confirm resumed play',
  );
  h.mouseMove(mouse(80));
  h.keyDown(key('w'));
  h.down(mouse(0));
  assert.equal(h.state().yaw, 0, 'The asynchronous release window cannot accept mouse look');
  assert.deepEqual(h.state().keys, []);
  assert.equal(h.state().interactions, 0);
  assert.equal(h.state().requests, 1, 'Resuming cannot overlap the outstanding native release');
  h.lose();
  assert(h.state().paused && !h.state().locked);
  assert.equal(h.state().requests, 1, 'Release completion must not automatically request capture');
  h.resume();
  assert.equal(h.state().requests, 2, 'A fresh explicit resume retries after release completion');
  assert(h.state().paused);
  h.grant();
  h.resolve();
  await flush();
  assert(h.state().locked && !h.state().paused);
  h.mouseMove(mouse(40));
  assert.equal(h.state().yaw, -40 * mouseSensitivity);
  h.deferRelease(false);
  h.dispose();
}

{
  const h = harness();
  h.resume();
  h.grant();
  h.resolve();
  await flush();
  h.deferRelease(true);
  h.pause();
  h.clearNative();
  assert(
    h.state().locked && !h.state().nativeLocked,
    'Native ownership can clear before its change event arrives',
  );
  h.resume();
  assert.equal(h.state().requests, 2, 'A fresh resume after native release must reach the browser');
  assert.equal(h.state().captureStatus, 'requesting');
  assert(
    h.state().paused && h.state().playRequested,
    'Publishing the refreshed lock state must preserve new capture intent',
  );
  h.grant();
  h.resolve();
  await flush();
  assert(h.state().locked && !h.state().paused, 'The fresh request can resume play after capture');
  h.mouseMove(mouse(40));
  assert.equal(h.state().yaw, -40 * mouseSensitivity);
  h.deferRelease(false);
  h.dispose();
}

for (const phase of ['room', 'leaving']) {
  for (const order of ['key-first', 'native-first']) {
    const h = harness();
    h.set({ phase });
    h.resume();
    h.grant();
    if (order === 'key-first') {
      h.keyDown(key('Escape'));
      h.lose();
    } else {
      h.lose();
      h.keyDown(key('Escape'));
    }
    assert(h.state().paused, phase + ': one Escape must leave the game paused in ' + order);
    assert.equal(h.state().requests, 1);
    assert.deepEqual(h.state().keys, []);
    h.keyUp(key('Escape'));
    h.tick();
    h.keyDown(key('Escape'));
    assert.equal(h.state().requests, 2, 'The next Escape requests capture once');
    h.grant();
    assert(!h.state().paused);
    h.dispose();
  }
}

{
  const h = harness();
  h.set({ phase: 'using', paused: false });
  h.keyDown(key('Escape'));
  assert.equal(h.state().phase, 'leaving');
  assert.equal(h.state().requests, 1, 'Leaving either CRT uses the normal capture resume path');
  assert(h.state().paused);
  h.reject();
  await flush();
  h.mouseMove(mouse(60));
  assert.equal(h.state().yaw, 0);
  h.keyUp(key('Escape'));
  h.tick();
  h.keyDown(key('Escape'));
  assert.equal(h.state().requests, 2, 'A failed computer-return capture is recoverable');
  h.grant();
  assert(!h.state().paused);
  h.dispose();
}

{
  const h = harness();
  h.resume();
  h.expire();
  assert(
    h.state().paused && !h.state().playRequested,
    'A capture timeout cannot start exploration',
  );
  h.dispose();
}

{
  const h = harness();
  h.set({ guided: true });
  h.resume();
  assert(!h.state().paused);
  assert.equal(h.state().requests, 0, 'Guided controls never require pointer lock');
  h.mouseMove(mouse(60));
  assert.equal(h.state().yaw, 0, 'Relative desktop events do not steer guided mode');
  h.down({ clientX: 100, clientY: 100, pointerId: 1 });
  assert.equal(h.state().pointerCaptures, 1);
  assert(h.state().drag, 'Guided pointerdown starts an explicit drag');
  h.move({ clientX: 140, clientY: 100, pointerId: 1 });
  assert.equal(h.state().yaw, -40 * 0.003);
  h.keyDown(key('w'));
  assert.deepEqual(h.state().keys, ['w']);
  h.dispose();
}

console.log(
  'PASS: captured-only relative look, rejection/cancellation/timeout recovery, asynchronous release recovery, native Escape ordering, CRT return capture, and guided drag controls.',
);
