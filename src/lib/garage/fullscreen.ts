type FullscreenAttempt = {
  wanted: boolean;
  entered: boolean;
  exiting: boolean;
};
// A stale controller must never exit fullscreen acquired by its replacement.
const owners = new WeakMap<Document, FullscreenAttempt>();

/** Call enter() synchronously after requesting pointer lock in the same user
 * gesture: fullscreen consumes activation. Escape remains browser-owned. */
export function createGarageFullscreen(element: HTMLElement, onExit: () => void) {
  const doc = element.ownerDocument;
  let disposed = false,
    current: FullscreenAttempt | null = null,
    pending: Promise<boolean> | null = null;
  const owns = (attempt: FullscreenAttempt) => owners.get(doc) === attempt;

  function release(attempt: FullscreenAttempt) {
    if (!owns(attempt) || doc.fullscreenElement !== element || attempt.exiting) return;
    attempt.exiting = true;
    try {
      void doc.exitFullscreen().then(
        () => observe(attempt),
        () => {
          attempt.exiting = false;
        },
      );
    } catch {
      attempt.exiting = false;
    }
  }
  function observe(attempt: FullscreenAttempt) {
    if (!owns(attempt)) return;
    if (doc.fullscreenElement === element) {
      attempt.entered = true;
      if (disposed || !attempt.wanted) release(attempt);
      return;
    }
    if (attempt.entered) {
      attempt.entered = false;
      attempt.wanted = false;
      if (!disposed) onExit();
    }
    if (!pending && owns(attempt)) owners.delete(doc);
  }
  const onFullscreenChange = () => {
    if (current) observe(current);
  };
  doc.addEventListener('fullscreenchange', onFullscreenChange);

  function enter(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    // Cancellation does not overlap a request still being processed by the
    // browser. A later gesture may retry after that request has settled.
    if (pending) return pending;
    if (current?.wanted && owns(current) && doc.fullscreenElement === element && !current.exiting)
      return Promise.resolve(true);
    if (doc.fullscreenElement || doc.fullscreenEnabled === false || !element.requestFullscreen)
      return Promise.resolve(false);

    const attempt: FullscreenAttempt = { wanted: true, entered: false, exiting: false };
    current = attempt;
    owners.set(doc, attempt);
    let complete!: (value: boolean) => void;
    const result = new Promise<boolean>((resolve) => {
      complete = resolve;
    });
    pending = result;
    const finish = (granted: boolean) => {
      observe(attempt);
      const success =
        granted &&
        !disposed &&
        attempt.wanted &&
        owns(attempt) &&
        doc.fullscreenElement === element &&
        !attempt.exiting;
      if (!success) {
        attempt.wanted = false;
        release(attempt);
      }
      pending = null;
      observe(attempt);
      complete(success);
    };
    try {
      // No await before this call: retain the original click/Enter activation.
      const request = element.requestFullscreen({ navigationUI: 'hide' });
      void Promise.resolve(request).then(
        () => finish(true),
        () => finish(false),
      );
    } catch {
      finish(false);
    }
    return result;
  }
  function exit() {
    if (!current) return;
    current.wanted = false;
    observe(current);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    doc.removeEventListener('fullscreenchange', onFullscreenChange);
    exit();
    // The pending promise retains its lease to release a late native grant.
  }
  return { enter, exit, dispose };
}
