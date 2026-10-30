import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadTogether } from '../src/lib/garage/loading.ts';

// Execute the real explorer's startup expression and resource-disposal statements.
// DOM/listener teardown is outside this lifecycle boundary; loading and ownership are real.
const url = new URL('../src/lib/garage/explorer.ts', import.meta.url);
const source = ts.createSourceFile(
  url.pathname,
  readFileSync(url, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const mount = source.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name.text === 'mountExplorer',
);
const print = (node) => ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, source);
const compile = (nodes) =>
  ts.transpileModule(nodes.map(print).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const declarations = mount.body.statements.filter(
  (node) =>
    (ts.isFunctionDeclaration(node) && node.name.text === 'disposeWorld') ||
    (ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((item) =>
        ['pendingWorld', 'startupFailed', 'startupAbort'].includes(item.name.getText(source)),
      )),
);
const startup = mount.body.statements.find(
  (node) =>
    ts.isExpressionStatement(node) && node.getText(source).includes('buildCameraRoom(scene)'),
);
assert(startup, 'The actual explorer startup must be exercised');
const returned = mount.body.statements.findLast(ts.isReturnStatement).expression;
const dispose = returned.properties.find(
  (node) => node.name?.getText(source) === 'dispose',
).initializer;
const teardown = dispose.body.statements.filter((node) =>
  /^(disposed =|world\?\.dispose\(|disposeWorld\()/u.test(node.getText(source)),
);
assert(teardown.length >= 2, 'Exercise disposal intent and actual world cleanup');
const make = Function(
  'buildCameraRoom',
  'loadTogether',
  'graphics',
  `
 let world, disposed=false, wakes=0, prepared=0;
 const scene={}, graphicsSettings={rain:true},renderer={shadowMap:{needsUpdate:false}};
 const errors=[],options={onError:error=>errors.push(error)},console={error(){}};
 const wake=()=>wakes++;
 ${compile(declarations)}
 ${compile([startup])}
 return {dispose(){${compile(teardown)}}, state:()=>({world,disposed,wakes,errors})};
`,
);
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function rig({ compilePromise = Promise.resolve(), compileError } = {}) {
  const room = deferred(),
    hdr = deferred();
  const resource = {
    disposed: 0,
    rain: null,
    dispose() {
      this.disposed++;
    },
    setRain(rain) {
      this.rain = rain;
    },
  };
  const graphics = {
    ready: hdr.promise,
    prepared: 0,
    compilations: 0,
    compile() {
      this.compilations++;
      assert.equal(this.prepared, 1, 'Prepare lighting and settings before compiling');
      if (compileError) throw compileError;
      return compilePromise;
    },
    prepare() {
      this.prepared++;
    },
  };
  const controls = make(() => room.promise, loadTogether, graphics);
  return { room, hdr, resource, graphics, ...controls };
}

await test('the room starts only after geometry, authored lighting and shader prewarming are ready', async () => {
  const r = rig();
  r.room.resolve(r.resource);
  await flush();
  assert.equal(r.state().world, undefined);
  assert.equal(r.state().wakes, 0);
  r.hdr.resolve();
  await flush();
  assert.equal(r.state().world, r.resource);
  assert.equal(r.state().wakes, 1);
  assert.equal(r.graphics.prepared, 1);
  assert.equal(r.graphics.compilations, 1);
  assert.equal(r.resource.rain, true);
  r.dispose();
  assert.equal(r.resource.disposed, 1);
});
await test('dispose releases a completed world while HDR is still pending', async () => {
  const r = rig();
  r.room.resolve(r.resource);
  await flush();
  r.dispose();
  assert.equal(r.resource.disposed, 1);
  r.hdr.resolve();
  await flush();
  assert.equal(r.resource.disposed, 1);
  assert.equal(r.state().wakes, 0);
  assert.deepEqual(r.state().errors, []);
});
await test('dispose before either dependency releases a later world without waiting for HDR', async () => {
  const r = rig();
  r.dispose();
  r.room.resolve(r.resource);
  await flush();
  assert.equal(r.resource.disposed, 1);
  assert.equal(r.state().wakes, 0);
  r.hdr.resolve();
  await flush();
  assert.equal(r.resource.disposed, 1);
  assert.deepEqual(r.state().errors, []);
});
await test('stalled HDR reaches recovery at90 seconds and cannot revive the released room', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.room.resolve(r.resource);
  await flush();
  t.mock.timers.tick(89_999);
  await flush();
  assert.deepEqual(r.state().errors, []);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(r.state().errors, ['load']);
  assert.equal(r.resource.disposed, 1);
  r.hdr.resolve();
  await flush();
  assert.equal(r.state().wakes, 0);
  assert.equal(r.resource.disposed, 1);
  r.dispose();
  assert.equal(r.resource.disposed, 1);
});
await test('a world arriving after combined startup timeout is disposed immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  t.mock.timers.tick(90_000);
  await flush();
  assert.deepEqual(r.state().errors, ['load']);
  r.room.resolve(r.resource);
  await flush();
  assert.equal(r.resource.disposed, 1);
  r.hdr.resolve();
  await flush();
  assert.equal(r.state().wakes, 0);
});
await test('disposal cancels the readiness deadline and observes later dependency failures', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.dispose();
  t.mock.timers.tick(90_000);
  await flush();
  r.room.reject(new Error('Late world failure'));
  r.hdr.reject(new Error('Late HDR failure'));
  await flush();
  assert.deepEqual(r.state().errors, []);
  assert.equal(r.state().wakes, 0);
});

await test('shader prewarming holds ownership without activating the world or scheduling a frame', async () => {
  const compilation = deferred();
  const r = rig({ compilePromise: compilation.promise });
  r.room.resolve(r.resource);
  r.hdr.resolve();
  await flush();
  assert.equal(r.graphics.prepared, 1);
  assert.equal(r.graphics.compilations, 1);
  assert.equal(r.state().world, undefined);
  assert.equal(r.state().wakes, 0);
  assert.equal(r.resource.rain, null);
  assert.equal(r.resource.disposed, 0);
  compilation.resolve();
  await flush();
  assert.equal(r.state().world, r.resource);
  assert.equal(r.state().wakes, 1);
  assert.equal(r.resource.rain, true);
  r.dispose();
  assert.equal(r.resource.disposed, 1);
});

await test('disposal during prewarming releases the pending world and cannot be undone by completion', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const compilation = deferred();
    const r = rig({ compilePromise: compilation.promise });
    r.room.resolve(r.resource);
    r.hdr.resolve();
    await flush();
    assert.equal(r.graphics.compilations, 1);
    r.dispose();
    assert.equal(r.resource.disposed, 1);
    compilation[outcome](new Error('Late compilation failure'));
    await flush();
    assert.equal(r.state().world, undefined);
    assert.equal(r.state().wakes, 0);
    assert.deepEqual(r.state().errors, []);
    assert.equal(r.resource.disposed, 1);
  }
});

await test('synchronous and asynchronous compilation failures recover and release the pending world once', async () => {
  for (const synchronous of [true, false]) {
    const compilation = deferred();
    const failure = new Error('Shader prewarm failed');
    const r = rig(
      synchronous ? { compileError: failure } : { compilePromise: compilation.promise },
    );
    r.room.resolve(r.resource);
    r.hdr.resolve();
    await flush();
    if (!synchronous) compilation.reject(failure);
    await flush();
    assert.equal(r.graphics.compilations, 1);
    assert.equal(r.state().world, undefined);
    assert.equal(r.state().wakes, 0);
    assert.deepEqual(r.state().errors, ['load']);
    assert.equal(r.resource.disposed, 1);
    r.dispose();
    assert.equal(r.resource.disposed, 1);
  }
});

await test('shader prewarming shares the original 90-second deadline and cannot revive after timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const compilation = deferred();
  const r = rig({ compilePromise: compilation.promise });
  t.mock.timers.tick(60_000);
  r.room.resolve(r.resource);
  r.hdr.resolve();
  await flush();
  assert.equal(r.graphics.compilations, 1);
  t.mock.timers.tick(29_999);
  await flush();
  assert.deepEqual(r.state().errors, []);
  assert.equal(r.resource.disposed, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(r.state().errors, ['load']);
  assert.equal(r.resource.disposed, 1);
  compilation.resolve();
  await flush();
  assert.equal(r.state().world, undefined);
  assert.equal(r.state().wakes, 0);
  assert.equal(r.resource.rain, null);
  assert.equal(r.resource.disposed, 1);
  r.dispose();
  assert.equal(r.resource.disposed, 1);
});
