export type PointerCaptureStatus = 'idle' | 'requesting' | 'locked' | 'unavailable';
export type PointerCaptureState = { locked: boolean; status: PointerCaptureStatus };
/** The caller forwards native lock-change/error events to sync()/fail(). Modern
 * promise requests also report late grants after disposal. A void-returning
 * legacy host requires its late native event to be forwarded to release a grant. */
export type PointerCaptureHost = {
  isLocked: () => boolean;
  request: () => void | Promise<void>;
  release: () => void;
};
type CaptureTimers = {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};
type CaptureOptions = {
  isAllowed: () => boolean;
  onChange: (state: PointerCaptureState) => void;
  timeoutMs?: number;
  timers?: CaptureTimers;
};

/** Pointer-lock promises and native events can arrive in either order. The host's
 * actual capture is authoritative; a rejected older request cannot turn it off. */
export function createPointerCapture(host: PointerCaptureHost, options: CaptureOptions) {
  const timers = options.timers ?? {
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle: unknown) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const timeoutMs = options.timeoutMs ?? 1500;
  type Attempt = { timer: unknown; active: boolean; hasPromise: boolean };
  let pending: Attempt | null = null,
    wanted = false,
    disposed = false,
    releasing = false,
    ambiguousNativeErrors = false;
  let state: PointerCaptureState = { locked: false, status: 'idle' };
  const allowed = () => !disposed && wanted && options.isAllowed();

  function publish(status: PointerCaptureStatus) {
    if (disposed) return;
    const next = { locked: host.isLocked(), status };
    if (next.locked === state.locked && next.status === state.status) return;
    state = next;
    options.onChange(next);
  }
  function finish(attempt: Attempt | null = pending) {
    if (!attempt) return;
    if (attempt.active) {
      attempt.active = false;
      timers.clearTimeout(attempt.timer);
    }
    if (pending === attempt) pending = null;
  }
  function releaseUnwanted() {
    if (!host.isLocked()) {
      releasing = false;
      return;
    }
    if (allowed() || releasing) return;
    releasing = true;
    try {
      host.release();
    } catch {
      releasing = false;
    }
    if (!host.isLocked()) releasing = false;
  }
  function sync() {
    if (host.isLocked()) {
      // exitPointerLock can complete asynchronously. Its still-visible lock is
      // committed to release, so it cannot satisfy a newer resume gesture.
      if (releasing) {
        publish(allowed() ? 'unavailable' : 'idle');
        return;
      }
      finish();
      releaseUnwanted();
      publish(host.isLocked() && allowed() && !releasing ? 'locked' : 'idle');
      return;
    }
    releasing = false;
    publish(
      allowed() && pending
        ? 'requesting'
        : allowed() && state.status === 'unavailable'
          ? 'unavailable'
          : 'idle',
    );
  }
  function failAttempt(attempt: Attempt | null) {
    // Native capture may have succeeded despite an earlier rejected promise.
    if (host.isLocked()) {
      sync();
      return;
    }
    if (attempt !== pending) return;
    finish(attempt);
    publish(allowed() ? 'unavailable' : 'idle');
  }
  function request() {
    if (disposed) return;
    if (!options.isAllowed()) {
      cancel();
      return;
    }
    wanted = true;
    if (host.isLocked()) {
      sync();
      return;
    }
    // Native ownership may clear before its event reaches us. A fresh gesture
    // can then retry safely; no timer or release completion starts a request.
    releasing = false;
    if (pending) {
      // A cancelled request may still be pending in the browser. Reuse it, but
      // make the renewed intent visible to the menu while native capture waits.
      publish('requesting');
      return;
    }
    const attempt: Attempt = { timer: undefined, active: true, hasPromise: false };
    pending = attempt;
    // Older implementations return void. A missing event must not leave capture
    // permanently pending and prevent the next genuine click from trying again.
    attempt.timer = timers.setTimeout(() => {
      if (pending === attempt && !host.isLocked()) ambiguousNativeErrors = true;
      failAttempt(attempt);
    }, timeoutMs);
    publish('requesting');
    if (!allowed()) {
      finish(attempt);
      sync();
      return;
    }
    try {
      const result = host.request();
      attempt.hasPromise = !!result;
      if (result)
        void Promise.resolve(result).then(
          () => {
            // Even a cancelled/disposed attempt can acquire capture late. Its
            // promise may be the only observation after native listeners detach;
            // do not mistake this grant for an earlier exit still in flight.
            if (host.isLocked()) {
              if (!allowed()) releasing = false;
              sync();
            }
            // A promise resolving before the native event retains its bounded wait.
          },
          () => failAttempt(attempt),
        );
      if (host.isLocked()) sync();
    } catch {
      failAttempt(attempt);
    }
  }
  function fail() {
    if (host.isLocked()) {
      sync();
      return;
    }
    // Native errors carry no request identity. A settled/expired request can
    // deliver one after a retry started. Promises identify their own failure;
    // ambiguous legacy retries use the bounded timer rather than guessing.
    if (!pending || pending.hasPromise || ambiguousNativeErrors) return;
    failAttempt(pending);
  }
  function cancel() {
    wanted = false;
    releaseUnwanted();
    // Preserve the outstanding attempt until it settles or times out. Repeated
    // pause/resume actions must not create concurrent browser requests.
    publish('idle');
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    wanted = false;
    finish();
    releaseUnwanted();
  }
  return { request, sync, fail, cancel, dispose };
}
