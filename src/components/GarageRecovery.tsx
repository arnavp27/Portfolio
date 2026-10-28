import type { GarageFailure } from '../lib/garage/startup';

const messages: Record<GarageFailure, { title: string; description: string }> = {
  graphics: {
    title: '3D room unavailable.',
    description:
      'Your browser couldn’t start 3D graphics. Graphics acceleration may be off or unavailable.',
  },
  load: {
    title: 'The room didn’t load.',
    description:
      'Something interrupted the room while it was loading. Try again, or explore my projects below.',
  },
  'context-lost': {
    title: 'The room lost its graphics.',
    description:
      'Your browser stopped the 3D view. Try again to reopen the garage, or explore my projects below.',
  },
};

export default function GarageRecovery({
  failure,
  onRetry,
}: {
  failure: GarageFailure;
  onRetry: () => void;
}) {
  const message = messages[failure];
  return (
    <section className="garage-recovery" aria-labelledby="garage-recovery-title">
      <h2 id="garage-recovery-title" tabIndex={-1}>
        {message.title}
      </h2>
      <p className="garage-recovery-description">{message.description}</p>
      {failure === 'graphics' && (
        <>
          <ol className="garage-recovery-steps">
            <li>
              Open your browser settings and search for <strong>graphics acceleration</strong> or{' '}
              <strong>hardware acceleration</strong>.
            </li>
            <li>
              Enable <strong>Use graphics acceleration when available</strong>, then relaunch your
              browser.
            </li>
            <li>Come back here and try again.</li>
          </ol>
          <details className="garage-browser-help">
            <summary>Where is that setting?</summary>
            <dl>
              <div>
                <dt>Brave</dt>
                <dd>
                  Settings → System
                  <br />
                  <code>brave://settings/system</code>
                </dd>
              </div>
              <div>
                <dt>Chrome</dt>
                <dd>
                  Settings → System
                  <br />
                  <code>chrome://settings/system</code>
                </dd>
              </div>
              <div>
                <dt>Edge</dt>
                <dd>
                  Settings → System and performance
                  <br />
                  <code>edge://settings/system</code>
                </dd>
              </div>
              <div>
                <dt>Firefox</dt>
                <dd>
                  Settings → General (or Tabs and browsing) → Performance. Uncheck{' '}
                  <strong>Use recommended performance settings</strong>, then enable{' '}
                  <strong>Use hardware acceleration when available</strong>.
                </dd>
              </div>
            </dl>
            <p>
              Type the settings address into your address bar. If acceleration is already on, try an
              up-to-date browser with WebGL 2 support. On a phone or tablet, try updating your
              browser or using another browser.
            </p>
          </details>
        </>
      )}
      <button className="garage-enter garage-retry" onClick={onRetry}>
        Try again <span aria-hidden="true">↻</span>
      </button>
      <p className="garage-recovery-alternative">You can also read about my work here:</p>
    </section>
  );
}
