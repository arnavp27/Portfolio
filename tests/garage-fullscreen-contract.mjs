import assert from 'node:assert/strict';
import { createGarageFullscreen } from '../src/lib/garage/fullscreen.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function harness({ throwing = false, deferredExit = false } = {}) {
  const requests = [],
    exits = [];
  let callbacks = 0;
  const doc = new EventTarget();
  doc.fullscreenEnabled = true;
  doc.fullscreenElement = null;
  const element = {
    ownerDocument: doc,
    requestFullscreen(options) {
      if (throwing) throw new Error('Fullscreen denied synchronously');
      const attempt = deferred();
      requests.push({ ...attempt, options });
      return attempt.promise;
    },
  };
  const change = (target) => {
    doc.fullscreenElement = target;
    doc.dispatchEvent(new Event('fullscreenchange'));
  };
  doc.exitFullscreen = () => {
    const attempt = deferred();
    exits.push(attempt);
    if (!deferredExit) {
      change(null);
      attempt.resolve();
    }
    return attempt.promise;
  };
  const control = createGarageFullscreen(element, () => {
    callbacks++;
  });
  return {
    control,
    doc,
    element,
    requests,
    exits,
    change,
    get callbacks() {
      return callbacks;
    },
    async grant(index = requests.length - 1, event = true) {
      if (event) change(element);
      else doc.fullscreenElement = element;
      requests[index].resolve();
      await flush();
    },
  };
}

{
  const h = harness();
  const result = h.control.enter();
  assert.equal(h.requests.length, 1, 'Fullscreen is requested inside the entry gesture');
  assert.deepEqual(
    h.requests[0].options,
    { navigationUI: 'hide' },
    'No keyboard capture is requested: Escape remains browser-owned',
  );
  assert.equal(h.control.enter(), result, 'Repeated entry shares the outstanding request');
  await h.grant();
  assert.equal(await result, true);
  assert.equal(await h.control.enter(), true);
  assert.equal(h.requests.length, 1, 'An active owned session is reused');
  h.change(null);
  h.change(null);
  assert.equal(h.callbacks, 1, 'Native fullscreen exit notifies pause exactly once');
  h.control.dispose();
  h.change(h.element);
  assert.equal(h.callbacks, 1, 'Disposal removes the native event listener');
}
{
  const h = harness();
  const result = h.control.enter();
  h.requests[0].reject(new Error('User denied fullscreen'));
  assert.equal(await result, false);
  assert.equal(h.exits.length, 0);
  assert.equal(h.callbacks, 0);
  const retry = h.control.enter();
  await h.grant();
  assert.equal(await retry, true, 'A later entry gesture can retry denial');
  h.control.dispose();
  assert.equal(h.exits.length, 1);
  assert.equal(h.callbacks, 0, 'Disposal does not publish state');
  assert.equal(await h.control.enter(), false);
}
{
  const h = harness({ throwing: true });
  assert.equal(await h.control.enter(), false, 'A synchronous error is a safe fallback');
  h.control.dispose();
}
for (const unsupported of ['disabled', 'missing']) {
  const h = harness();
  if (unsupported === 'disabled') h.doc.fullscreenEnabled = false;
  else delete h.element.requestFullscreen;
  assert.equal(await h.control.enter(), false);
  assert.equal(h.requests.length, 0);
  h.control.dispose();
}
{
  const h = harness({ deferredExit: true });
  const result = h.control.enter();
  await h.grant();
  assert.equal(await result, true);
  h.control.exit();
  h.control.exit();
  assert.equal(h.exits.length, 1, 'Repeated exit serializes the native release');
  assert.equal(await h.control.enter(), false, 'An in-flight exit cannot certify a new entry');
  h.change(null);
  h.exits[0].resolve();
  await flush();
  assert.equal(h.callbacks, 1);
  const again = h.control.enter();
  await h.grant();
  assert.equal(await again, true, 'A fresh gesture can enter after exit completes');
  h.control.dispose();
}
for (const dispose of [false, true]) {
  const h = harness();
  const result = h.control.enter();
  if (dispose) h.control.dispose();
  else {
    h.control.exit();
    assert.equal(
      h.control.enter(),
      result,
      'Cancelled requests remain serialized until the browser settles them',
    );
  }
  await h.grant();
  assert.equal(await result, false);
  assert.equal(h.exits.length, 1, 'A late grant after cancellation is released once');
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.callbacks, dispose ? 0 : 1);
  h.control.dispose();
}
{
  const h = harness();
  const result = h.control.enter();
  h.control.exit();
  h.requests[0].reject(new Error('Native request cancelled'));
  assert.equal(await result, false);
  assert.equal(h.exits.length, 0);
  assert.equal(h.callbacks, 0);
  h.control.dispose();
}
{
  const h = harness();
  const result = h.control.enter();
  h.control.dispose();
  await h.grant(0, false);
  assert.equal(await result, false);
  assert.equal(h.exits.length, 1, 'Promise cleanup handles a late grant without a native event');
  assert.equal(h.callbacks, 0);
}
{
  const h = harness();
  const result = h.control.enter();
  h.change(h.element);
  h.change(null);
  h.requests[0].resolve();
  assert.equal(await result, false, 'Promise completion cannot resurrect a native exit');
  assert.equal(h.callbacks, 1);
  h.control.dispose();
}
{
  const h = harness();
  const other = {};
  h.change(other);
  assert.equal(await h.control.enter(), false);
  h.control.exit();
  h.control.dispose();
  assert.equal(h.requests.length, 0, 'Another fullscreen element is never replaced');
  assert.equal(h.exits.length, 0);
  assert.equal(h.callbacks, 0);
}
{
  const h = harness();
  const result = h.control.enter();
  await h.grant();
  assert.equal(await result, true);
  h.change({});
  h.control.exit();
  h.control.dispose();
  assert.equal(h.exits.length, 0, 'Exit does not release a replacement fullscreen element');
  assert.equal(h.callbacks, 1);
}
{
  const h = harness();
  const stale = h.control.enter();
  h.control.dispose();
  const successor = createGarageFullscreen(h.element, () => {});
  const fresh = successor.enter();
  await h.grant();
  assert.equal(await fresh, true);
  h.requests[0].resolve();
  assert.equal(await stale, false);
  assert.equal(
    h.exits.length,
    0,
    'A disposed controller cannot release a newer owner on the same element',
  );
  successor.dispose();
}
{
  const h = harness();
  const result = h.control.enter();
  h.control.dispose();
  const other = {};
  h.change(other);
  h.requests[0].resolve();
  assert.equal(await result, false);
  assert.equal(h.doc.fullscreenElement, other);
  assert.equal(h.exits.length, 0, 'Late settlement never exits another element');
  assert.equal(h.callbacks, 0);
}
{
  const h = harness({ deferredExit: true });
  const result = h.control.enter();
  await h.grant();
  assert.equal(await result, true);
  h.control.exit();
  h.doc.fullscreenElement = null;
  h.exits[0].resolve();
  await flush();
  assert.equal(
    h.callbacks,
    1,
    'Exit completion observes native loss even when its event has not arrived yet',
  );
  h.change(null);
  assert.equal(h.callbacks, 1);
  h.control.dispose();
}
{
  const h = harness({ deferredExit: true });
  const result = h.control.enter();
  await h.grant();
  assert.equal(await result, true);
  h.control.exit();
  h.exits[0].reject(new Error('Exit temporarily unavailable'));
  await flush();
  assert.equal(h.callbacks, 0, 'A rejected exit never pretends fullscreen was lost');
  h.control.exit();
  assert.equal(h.exits.length, 2, 'Another explicit exit may retry a failed release');
  h.change(null);
  h.exits[1].resolve();
  await flush();
  assert.equal(h.callbacks, 1);
  h.control.dispose();
}
console.log(
  'PASS: fullscreen gesture timing, native Escape ownership, entry/exit serialization, cancellation, late grants, and ownership-safe disposal.',
);
