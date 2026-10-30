import assert from 'node:assert/strict';
import * as T from 'three';
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
source.assertCall('mountExplorer.draw', 'finishComputerReturn');
const code = source.declarations('mountExplorer', [
  'inputState',
  'clearInput',
  'resetJump',
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
  'finishComputerReturn',
  'prepareComputerReturn',
  'leaveComputer',
  'useComputer',
  'walkTo',
]);
const makeHarness = Function(
  'createPointerCapture',
  'createEscapeController',
  'createJumpMotion',
  'beginJump',
  'acceptsMovement',
  'lookMode',
  'mouseSensitivity',
  'T',
  `
 let entered=true,paused=true,guided=false,locked=false,phase='room',playRequested=false;
 let disposed=false,windowFocused=true,captureStatus='idle',yaw=0,pitch=0,auto=null,target=null,drag=null;
 let running=false,computer='projects',leaveTime=0,transitionTime=1.7,path=[];
 let ready=true,focus=1,booted=false,autoAmount=0,autoDuration=1,autoLook=null;
 let throwCapture=false,pauseNotices=0,requests=0,releases=0,interactions=0,pointerCaptures=0,focuses=0,clock=100,nextTimer=0,deferredRelease=false;
 const attempts=[],timers=new Map(),keys=new Set(),escape=createEscapeController(),jump=createJumpMotion();
 const finePointer={matches:true},velocity={set:()=>{}},performance={now:()=>clock},width=1280,height=720;
 const document={pointerLockElement:null,hidden:false,exitPointerLock(){releases++;if(!deferredRelease)this.pointerLockElement=null;}};
 const container={
  focus:()=>focuses++,style:{},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
  setPointerCapture:()=>pointerCaptures++,
  requestPointerLock(){requests++;if(throwCapture)throw new Error('Unavailable');return new Promise((resolve,reject)=>attempts.push({resolve,reject}));},
 };
 const options={sound:{start:()=>Promise.resolve(),play:()=>{}},onPause:()=>pauseNotices++};
 const eyeHeight=1.62,world={isComputerOn:()=>true};
 const player=new T.Vector3(3,eyeHeight,4),view=new T.Vector3(3,eyeHeight,2);
 const fromPosition=new T.Vector3(1,eyeHeight,2),fromTarget=new T.Vector3(1,eyeHeight,0);
 const emit=()=>{},wake=()=>{},interact=()=>interactions++,actionHit=()=>null;
 const destinations={projects:{x:0,z:2},kazam:{x:-1,z:2},courtyard:{x:0,z:10}};
 const computerPose=id=>({position:new T.Vector3(destinations[id].x,eyeHeight,1.5),target:new T.Vector3(destinations[id].x,eyeHeight,0)});
 const walkingPath=(from,to)=>[{x:from.x,z:from.z},{x:to.x,z:to.z}];
 const setPhase=next=>{phase=next;};
 const realCapture=createPointerCapture;
 createPointerCapture=(host,options)=>realCapture(host,{
  ...options,timers:{setTimeout(callback){const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}},
 });
 ${code}
 return {
  resume,pause,mouseMove,down,move,keyDown,keyUp,leaveComputer,useComputer,walkTo,
  grant(){document.pointerLockElement=container;onLock();},
  clearNative(){document.pointerLockElement=null;},
  lose(){document.pointerLockElement=null;onLock();},
  deferRelease(value){deferredRelease=value;},
  reject(index=attempts.length-1){attempts[index].reject(new Error('Capture denied'));},
  resolve(index=attempts.length-1){attempts[index].resolve();},
  expire(){const callbacks=[...timers.values()];timers.clear();for(const callback of callbacks)callback();},
  set(state){if('throwCapture'in state)throwCapture=state.throwCapture;if('phase'in state)phase=state.phase;if('guided'in state)guided=state.guided;if('paused'in state)paused=state.paused;if('entered'in state)entered=state.entered;if('computer'in state)computer=state.computer;if('focus'in state)focus=state.focus;},
  tick(){clock+=100;},
  state:()=>({pauseNotices,focus,computer,pathLength:path.length,player:player.toArray(),view:view.toArray(),standing:fromPosition.toArray(),auto:!!auto,entered,paused,guided,locked,phase,playRequested,captureStatus,yaw,pitch,requests,releases,focuses,interactions,pointerCaptures,drag,keys:[...keys],timers:timers.size,nativeLocked:document.pointerLockElement===container}),
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
    T,
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
  h.set({ throwCapture: true });
  assert.equal(h.resume(), false, 'Synchronous capture rejection must block fullscreen entry');
  assert(h.state().paused && !h.state().playRequested);
  assert.equal(h.state().pauseNotices, 1, 'Failure also cancels any previous fullscreen intent');
  h.set({ throwCapture: false });
  assert.equal(
    h.resume(),
    true,
    'An accepted fresh request can start fullscreen in the same gesture',
  );
  h.dispose();
}

{
  const h = harness();
  h.set({ throwCapture: true });
  assert.equal(h.walkTo('courtyard'), false);
  assert.equal(h.state().focuses, 0, 'A denied menu shortcut preserves menu focus');
  assert(h.state().paused && !h.state().playRequested);
  h.dispose();
}

{
  const h = harness();
  h.resume();
  assert.equal(h.state().captureStatus, 'requesting');
  assert.equal(
    h.state().focuses,
    0,
    'A pending desktop resume must not steal focus from its button',
  );
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
  assert.equal(h.state().requests, 1, 'Escape does not resume desktop gameplay');
  h.resume();
  assert.equal(h.state().requests, 2, 'The menu action can resume after cancellation settles');
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
    assert.equal(h.state().phase, 'room', 'Pausing a CRT return must release menu destinations');
    if (phase === 'leaving') assert.deepEqual(h.state().player, h.state().standing);
    assert.equal(h.state().requests, 1);
    assert.deepEqual(h.state().keys, []);
    h.keyUp(key('Escape'));
    h.tick();
    h.keyDown(key('Escape'));
    assert.equal(h.state().requests, 1, 'Another Escape leaves the menu paused');
    assert(h.state().pauseNotices > 0, 'Pause tells the UI to leave fullscreen');
    h.resume();
    assert.equal(h.state().requests, 2, 'The menu action requests capture once');
    h.grant();
    assert(!h.state().paused);
    h.dispose();
  }
}

{
  const h = harness();
  h.set({ phase: 'using', paused: false });
  h.leaveComputer();
  assert.equal(h.state().phase, 'leaving');
  assert.equal(h.state().requests, 1, 'Leaving either CRT uses the normal capture resume path');
  assert(h.state().paused);
  h.reject();
  await flush();
  assert.equal(h.state().phase, 'room', 'Denied CRT return must release the menu destinations');
  assert(h.state().paused, 'Returning to the room must not enable uncaptured gameplay');
  assert.equal(h.state().captureStatus, 'unavailable');
  assert.equal(h.state().requests, 1, 'Settling a denied return must not retry capture');
  const returnYaw = h.state().yaw;
  h.mouseMove(mouse(60));
  assert.equal(h.state().yaw, returnYaw);
  h.keyUp(key('Escape'));
  h.tick();
  h.resume();
  assert.equal(h.state().requests, 2, 'A new resume from the existing menu requests capture once');
  h.grant();
  assert(!h.state().paused);
  h.dispose();
}

// Pausing from any CRT phase must leave the same resumable room state. This is
// also the fullscreen-exit path, which can run before a computer handles Escape.
for (const id of ['kazam', 'projects']) {
  for (const phase of ['approaching', 'using', 'leaving']) {
    const h = harness();
    const origin = h.state().player;
    const originView = h.state().view;
    h.useComputer(id);
    h.set({ phase, focus: phase === 'approaching' ? 0.4 : 1 });
    if (phase === 'leaving') {
      h.set({ phase: 'using' });
      h.leaveComputer();
    }
    const requestsBeforePause = h.state().requests;
    const expectedPosition = phase === 'approaching' ? origin : [id === 'kazam' ? -1 : 0, 1.62, 2];
    h.pause();
    const state = h.state();
    assert.equal(state.phase, 'room', id + ' ' + phase + ': pause releases the computer phase');
    assert.equal(state.computer, null);
    assert.equal(state.pathLength, 0);
    assert.equal(state.focus, 0);
    assert(state.paused && !state.playRequested && !state.locked);
    assert.deepEqual(
      state.player,
      expectedPosition,
      phase + ': pause settles at the safe standing position',
    );
    assert.equal(state.requests, requestsBeforePause, 'Pause never requests capture');
    if (phase === 'approaching') assert.deepEqual(state.view, originView);
    else {
      assert.deepEqual(state.view, [id === 'kazam' ? -1 : 0, 1.62, 0]);
      assert(Math.abs(state.yaw) < 0.001 && Math.abs(state.pitch) < 0.001);
    }
    h.pause();
    assert.deepEqual(
      h.state().player,
      expectedPosition,
      'Repeated pause preserves the settled position',
    );
    assert.equal(h.state().requests, requestsBeforePause);
    if (phase === 'leaving') {
      h.grant();
      assert(h.state().paused && !h.state().locked, 'A late return capture cannot undo pause');
    }
    h.resume();
    assert.equal(h.state().requests, requestsBeforePause + 1, 'Back to the garage remains usable');
    h.grant();
    assert(!h.state().paused && h.state().locked);
    h.dispose();
  }
}

// A rejected explicit resume keeps the desktop paused and the existing
// menu button usable. A new click/Enter can request capture without another screen.
{
  const h = harness();
  h.resume();
  h.reject();
  await flush();
  assert.equal(h.state().focuses, 0, 'Failed capture preserves menu/retry focus');
  assert.equal(h.state().captureStatus, 'unavailable');
  assert.equal(h.state().requests, 1, 'Failure cannot create an automatic capture retry');
  h.resume();
  assert.equal(h.state().requests, 2, 'The existing Resume button can retry directly');
  h.grant();
  assert.equal(h.state().focuses, 1, 'Only confirmed capture focuses the desktop canvas');
  assert(!h.state().paused && h.state().locked);
  h.dispose();
}

// Execute the real menu handlers after both rejection and bounded capture failure.
// Desktop gameplay remains capture-gated, but a failed return cannot trap the menu.
for (const failure of ['reject', 'timeout']) {
  for (const destination of ['kazam', 'projects', 'courtyard']) {
    const h = harness();
    h.set({
      phase: 'using',
      paused: false,
      computer: destination === 'kazam' ? 'projects' : 'kazam',
    });
    h.leaveComputer();
    const standing = h.state().standing;
    if (failure === 'reject') h.reject();
    else h.expire();
    await flush();
    assert.equal(h.state().phase, 'room');
    assert.equal(h.state().computer, null);
    assert.equal(h.state().focus, 0);
    assert.equal(h.state().pathLength, 0);
    assert.deepEqual(h.state().player, standing, 'A failed return settles beside the correct desk');
    assert(h.state().paused && !h.state().playRequested);
    assert.equal(h.state().captureStatus, 'unavailable');
    assert.equal(h.state().requests, 1);
    assert.equal(lookMode(h.state()), 'inactive');
    if (destination === 'courtyard') {
      h.walkTo(destination);
      assert(h.state().auto, 'Walk outside can schedule a route after a denied CRT return');
      assert(h.state().paused, 'Walking still waits for actual capture');
      assert.equal(h.state().requests, 2, 'Only the new menu gesture requests capture again');
    } else {
      h.useComputer(destination);
      assert.equal(h.state().phase, 'approaching', 'Either computer remains usable from the menu');
      assert.equal(h.state().computer, destination);
      assert.equal(h.state().requests, 1, 'Opening a computer does not request gameplay capture');
    }
    h.dispose();
  }
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
  'PASS: captured-only relative look, rejection/cancellation/timeout recovery, asynchronous release recovery, native Escape ordering, denied CRT return/menu recovery, and guided drag controls.',
);
