type Loaded<Jobs extends readonly unknown[]> = {
  -readonly [Index in keyof Jobs]: Awaited<Jobs[Index]>;
};

/** Report the first failure promptly while observing all other in-flight rejections. */
export function loadTogether<const Jobs extends readonly unknown[]>(
  jobs: Jobs,
  timeoutMs = 0,
  signal?: AbortSignal,
): Promise<Loaded<Jobs>> {
  const batch = Promise.all(jobs);
  if (!timeoutMs && !signal) return batch;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(signal?.reason ?? new Error('Garage loading was cancelled.'));
    };
    if (timeoutMs)
      timer = setTimeout(() => {
        finish();
        reject(new Error('Garage asset loading timed out. Please try again.'));
      }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    batch.then(
      (values) => {
        finish();
        resolve(values);
      },
      (error) => {
        finish();
        reject(error);
      },
    );
    if (signal?.aborted) abort();
  });
}

/** Own resources even after a failed load: late arrivals are released instead of retained. */
export class DisposableSet<Resource extends { dispose(): void }> extends Set<Resource> {
  private closed = false;
  private released = new WeakSet<Resource>();

  override add(resource: Resource) {
    if (!this.closed) return super.add(resource);
    if (!this.released.has(resource)) {
      this.released.add(resource);
      resource.dispose();
    }
    return this;
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const resource of this) {
      this.released.add(resource);
      resource.dispose();
    }
    this.clear();
  }
}
