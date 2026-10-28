import assert from 'node:assert/strict';
import { createPointerCapture } from '../src/lib/garage/pointer-capture.ts';

function harness({ legacy = false, throwing = false, asynchronousRelease = false } = {}) {
  let locked = false,
    allowed = true,
    requests = 0,
    releases = 0,
    nextTimer = 0;
  const events = [],
    attempts = [],
    timers = new Map();
  const host = {
    isLocked: () => locked,
    request() {
      requests++;
      if (throwing) throw new Error('Capture unavailable');
      if (legacy) return;
      return new Promise((resolve, reject) => attempts.push({ resolve, reject }));
    },
    release() {
      releases++;
      if (!asynchronousRelease) locked = false;
    },
  };
  const control = createPointerCapture(host, {
    isAllowed: () => allowed,
    onChange: (state) => events.push(state),
    timeoutMs: 100,
    timers: {
      setTimeout(callback) {
        const id = ++nextTimer;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
  });
  return {
    control,
    attempts,
    events,
    get state() {
      return events.at(-1) ?? { locked: false, status: 'idle' };
    },
    get counts() {
      return { requests, releases, timers: timers.size };
    },
    setAllowed(value) {
      allowed = value;
    },
    setLocked(value) {
      locked = value;
    },
    grant() {
      locked = true;
      control.sync();
    },
    expire() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

{
  const h = harness();
  h.control.request();
  assert.deepEqual(h.state, { locked: false, status: 'requesting' });
  for (let i = 0; i < 10; i++) h.control.request();
  assert.equal(h.counts.requests, 1, 'Repeated clicks serialize one outstanding browser request');
  h.grant();
  assert.deepEqual(h.state, { locked: true, status: 'locked' });
  assert.equal(h.counts.timers, 0);
  h.attempts[0].resolve();
  await flush();
  h.control.request();
  assert.equal(h.counts.requests, 1, 'Already captured input does not request capture again');
  h.control.fail();
  assert.deepEqual(
    h.state,
    { locked: true, status: 'locked' },
    'A stale native error cannot override actual capture',
  );
  h.setLocked(false);
  h.control.sync();
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.attempts[0].reject(new Error('Permission denied'));
  await flush();
  assert.deepEqual(h.state, { locked: false, status: 'unavailable' });
  assert.equal(h.counts.timers, 0);
  h.control.request();
  assert.equal(h.counts.requests, 2, 'A new genuine gesture can retry after rejection');
  h.grant();
  h.attempts[1].resolve();
  await flush();
  assert(h.state.locked);
  h.control.dispose();
}
{
  // Previously: request A rejects after B succeeds; its catch unconditionally set
  // locked=false and routed captured mouse events through bounded clientX/Y.
  const h = harness();
  h.control.request();
  h.expire();
  assert.equal(h.state.status, 'unavailable');
  h.control.request();
  h.grant();
  h.attempts[1].resolve();
  await flush();
  const before = h.events.length;
  h.attempts[0].reject(new Error('Late rejection from expired request'));
  await flush();
  assert.deepEqual(
    h.state,
    { locked: true, status: 'locked' },
    'Older rejection never freezes a newer captured session',
  );
  assert.equal(h.events.length, before, 'Stale rejection cannot publish a false unlocked state');
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.expire();
  h.control.request();
  h.control.fail();
  assert.equal(
    h.state.status,
    'requesting',
    'An uncorrelated native error waits for the current promise outcome',
  );
  h.attempts[0].reject(new Error('Late failure'));
  await flush();
  assert.equal(
    h.state.status,
    'requesting',
    'An old rejection cannot clear a newer pending attempt',
  );
  assert.equal(h.counts.timers, 1);
  h.attempts[1].reject(new Error('Denied'));
  await flush();
  assert.equal(h.state.status, 'unavailable');
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.control.cancel();
  h.grant();
  assert.equal(
    h.counts.releases,
    1,
    'Cancelled capture intent rejects a late grant even if room input is still allowed',
  );
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  h.attempts[0].resolve();
  await flush();
  h.control.dispose();
}
for (const legacy of [false, true]) {
  const h = harness({ legacy });
  h.control.request();
  h.control.cancel();
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  h.control.request();
  assert.equal(
    h.counts.requests,
    1,
    'Cancellation does not overlap an outstanding browser request',
  );
  h.setAllowed(false);
  h.control.cancel();
  h.grant();
  assert.equal(h.counts.releases, 1, 'A late grant after pause is immediately released');
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  assert.equal(h.counts.timers, 0);
  if (!legacy) {
    h.attempts[0].resolve();
    await flush();
  }
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.setAllowed(false);
  // Changing phase to a computer or guided mode can precede an explicit cancel.
  h.setLocked(true);
  h.attempts[0].resolve();
  await flush();
  assert.equal(h.counts.releases, 1);
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  h.control.dispose();
}
{
  const h = harness({ legacy: true });
  h.control.request();
  h.expire();
  assert.deepEqual(h.state, { locked: false, status: 'unavailable' });
  h.control.request();
  assert.equal(
    h.counts.requests,
    2,
    'A void-returning API without native events cannot hang capture forever',
  );
  h.control.fail();
  assert.equal(h.counts.timers, 1, 'A retry cannot identify which native request failed');
  assert.equal(h.state.status, 'requesting');
  h.expire();
  assert.equal(h.counts.timers, 0);
  assert.equal(h.state.status, 'unavailable', 'The ambiguous retry still has a bounded wait');
  h.control.dispose();
}
{
  const h = harness({ legacy: true });
  h.control.request();
  h.control.fail();
  assert.equal(h.counts.timers, 0);
  assert.equal(h.state.status, 'unavailable', 'An initial legacy native error fails promptly');
  h.control.dispose();
}
{
  const h = harness({ throwing: true });
  assert.doesNotThrow(() => h.control.request());
  assert.deepEqual(h.state, { locked: false, status: 'unavailable' });
  assert.equal(h.counts.timers, 0);
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.attempts[0].resolve();
  await flush();
  assert.equal(
    h.state.status,
    'requesting',
    'A premature resolved promise still waits for native capture',
  );
  h.grant();
  assert.equal(h.state.status, 'locked');
  h.control.cancel();
  assert.equal(h.counts.releases, 1);
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.control.dispose();
  assert.equal(h.counts.timers, 0);
  const before = h.events.length;
  h.setLocked(true);
  h.attempts[0].resolve();
  await flush();
  assert.equal(
    h.counts.releases,
    1,
    'Disposal releases a late promise grant without leaking pointer capture',
  );
  assert.equal(h.events.length, before, 'No state callback fires after disposal');
  h.control.request();
  assert.equal(h.counts.requests, 1);
  h.control.dispose();
  assert.equal(h.counts.releases, 1);
}
{
  const h = harness({ legacy: true });
  h.control.request();
  h.control.dispose();
  h.grant();
  assert.equal(h.counts.releases, 1, 'Forwarded late native grants are safe after disposal too');
}
for (const legacy of [false, true]) {
  const h = harness({ legacy });
  h.control.request();
  h.control.cancel();
  h.control.request();
  assert.equal(h.counts.requests, 1, 'A quick resume reuses the outstanding request');
  assert.deepEqual(
    h.state,
    { locked: false, status: 'requesting' },
    'Resuming while capture is pending restores the requesting state',
  );
  h.grant();
  assert.deepEqual(
    h.state,
    { locked: true, status: 'locked' },
    'A native grant can fulfil current capture intent after a quick resume',
  );
  if (!legacy) {
    h.attempts[0].resolve();
    await flush();
  }
  h.control.dispose();
}
{
  const h = harness({ legacy: true });
  h.control.request();
  h.expire();
  h.control.request();
  h.control.fail();
  assert.deepEqual(
    h.state,
    { locked: false, status: 'requesting' },
    'An unidentifiable legacy error from an expired request cannot cancel its retry',
  );
  assert.equal(h.counts.timers, 1, 'The ambiguous retry retains its bounded wait');
  h.grant();
  assert.deepEqual(h.state, { locked: true, status: 'locked' });
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.grant();
  h.setLocked(false);
  h.control.sync();
  h.control.fail();
  assert.deepEqual(
    h.state,
    { locked: false, status: 'idle' },
    'A late native error without an outstanding request is irrelevant',
  );
  h.attempts[0].resolve();
  await flush();
  h.control.dispose();
}
for (const cancelFirst of [false, true]) {
  const h = harness();
  h.control.request();
  if (cancelFirst) h.control.cancel();
  h.expire();
  h.control.request();
  assert.equal(h.counts.requests, 2);
  // Promise A arrives after retry B. Actual capture of this host, rather than
  // the promise's age, determines whether the current user intent succeeded.
  h.setLocked(true);
  h.attempts[0].resolve();
  await flush();
  assert.deepEqual(h.state, { locked: true, status: 'locked' });
  assert.equal(h.counts.releases, 0);
  assert.equal(h.counts.timers, 0);
  h.attempts[1].reject(new Error('Retry rejected after earlier native grant'));
  await flush();
  assert.deepEqual(h.state, { locked: true, status: 'locked' });
  h.control.dispose();
}
{
  const h = harness();
  h.control.request();
  h.control.cancel();
  h.expire();
  h.control.request();
  h.attempts[0].reject(new Error('Cancelled attempt rejected after retry'));
  await flush();
  assert.deepEqual(h.state, { locked: false, status: 'requesting' });
  assert.equal(h.counts.timers, 1);
  h.control.cancel();
  h.setLocked(true);
  h.attempts[1].resolve();
  await flush();
  assert.equal(h.counts.releases, 1, 'Cancelled retry releases a later grant');
  assert.deepEqual(h.state, { locked: false, status: 'idle' });
  assert.equal(h.counts.timers, 0);
  h.control.dispose();
}
for (const legacy of [false, true]) {
  const h = harness({ legacy, asynchronousRelease: true });
  h.control.request();
  h.grant();
  h.control.cancel();
  assert.equal(h.counts.releases, 1);
  h.control.request();
  assert.equal(h.counts.requests, 1, 'A queued release cannot overlap a new native request');
  assert.deepEqual(
    h.state,
    { locked: true, status: 'unavailable' },
    'A lock whose release is in flight cannot fulfil a new resume intent',
  );
  h.control.sync();
  if (!legacy) {
    h.attempts[0].resolve();
    await flush();
  }
  assert.deepEqual(
    h.state,
    { locked: true, status: 'unavailable' },
    'A late native event or promise cannot certify a lock already being released',
  );
  h.setLocked(false);
  h.control.sync();
  assert.equal(h.counts.requests, 1, 'Completing a release never requests capture automatically');
  h.control.request();
  assert.equal(h.counts.requests, 2, 'A new gesture after release can request capture');
  h.grant();
  assert.deepEqual(h.state, { locked: true, status: 'locked' });
  if (!legacy) {
    h.attempts[1].resolve();
    await flush();
  }
  h.control.dispose();
  h.setLocked(false);
  h.control.sync();
}
{
  const h = harness({ asynchronousRelease: true });
  h.control.request();
  h.grant();
  h.control.cancel();
  // Native ownership is already gone, but its event was delayed or omitted.
  h.setLocked(false);
  h.control.request();
  assert.equal(h.counts.requests, 2);
  h.grant();
  assert.deepEqual(
    h.state,
    { locked: true, status: 'locked' },
    'Actual unlocked ownership clears an old release guard even without its event',
  );
  h.attempts[0].resolve();
  h.attempts[1].resolve();
  await flush();
  h.control.dispose();
  h.setLocked(false);
  h.control.sync();
}
{
  const h = harness({ asynchronousRelease: true });
  h.control.request();
  h.expire();
  h.control.request();
  h.grant();
  h.attempts[1].resolve();
  await flush();
  h.control.cancel();
  h.control.dispose();
  const before = h.events.length;
  assert.equal(h.counts.releases, 1);
  // Disposal can remove the native listener before the asynchronous exit event.
  h.setLocked(false);
  // The independently expired request then receives a late native grant.
  h.setLocked(true);
  h.attempts[0].resolve();
  await flush();
  assert.equal(
    h.counts.releases,
    2,
    'A stale release guard cannot leak a later promise grant after disposal',
  );
  assert.equal(h.events.length, before, 'Late cleanup still publishes nothing after disposal');
  h.setLocked(false);
  h.control.sync();
}
console.log(
  'PASS: pointer capture serialization, native truth, denied/unsupported capture, stale promises, bounded legacy requests, late grants, cancellation, and disposal.',
);
