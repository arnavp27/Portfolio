import { useEffect, useRef, useState } from 'react';
import GarageRecovery from './GarageRecovery';
import GraphicsPanel from './GraphicsPanel';
import {
  defaultGraphics,
  normalizeGraphics,
  GRAPHICS_STORAGE_KEY,
  type GraphicsSettings,
} from '../lib/garage/graphics-settings';
import { garageFailureFrom, type GarageFailure } from '../lib/garage/startup';
import ComputerDesktop, { type DesktopProject } from './ComputerDesktop';
import {
  createGarageSound,
  defaultSound,
  type GarageSound,
  type SoundSettings,
} from '../lib/garage/sound';
import type { ExplorerControls, ExplorerState } from '../lib/garage/explorer';
import type { ComputerState, ComputerId } from '../lib/garage/computers';
import '../styles/scene.css';
import '../styles/garage.css';
type Props = { projects: DesktopProject[]; articles: { id: string; title: string }[] };
const initial: ExplorerState = {
  entered: false,
  paused: false,
  locked: false,
  guided: false,
  capture: 'idle',
  target: null,
  power: { lights: true, computers: { kazam: true, projects: true } },
};
function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? (
        <path d="m17 9 5 6m0-6-5 6" />
      ) : (
        <>
          <path d="M17 8q5 4 0 8" />
          <path d="M20 5q7 7 0 14" />
        </>
      )}
    </svg>
  );
}
// A native pointer-lock grant can arrive before React commits its new state.
// Never let deferred UI focus take the keyboard back from captured gameplay.
function focusUiElement(element: HTMLElement | null | undefined) {
  if (
    !element?.isConnected ||
    document.pointerLockElement ||
    !element.getClientRects().length ||
    element.matches(':disabled') ||
    element.closest('[hidden],[inert]') ||
    getComputedStyle(element).visibility !== 'visible'
  )
    return;
  element.focus({ preventScroll: true });
}

export default function Garage({ projects, articles }: Props) {
  const root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    controls = useRef<ExplorerControls | null>(null),
    sound = useRef<GarageSound | null>(null),
    previous = useRef('room'),
    graphicsRef = useRef<GraphicsSettings>({ ...defaultGraphics });
  const [game, setGame] = useState(initial),
    [computer, setComputer] = useState<ComputerState>({ id: null, phase: 'room' }),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState<GarageFailure | null>(null),
    [inspect, setInspect] = useState(false),
    [graphicsOpen, setGraphicsOpen] = useState(false),
    [graphicsSettings, setGraphicsSettings] = useState<GraphicsSettings>({ ...defaultGraphics }),
    [graphicsPreview, setGraphicsPreview] = useState<GraphicsSettings | null>(null),
    [settings, setSettings] = useState<SoundSettings>(defaultSound),
    [reduced, setReduced] = useState(false),
    [time, setTime] = useState('BENGALURU'),
    [hint, setHint] = useState(false),
    [audioState, setAudioState] = useState('idle');
  const using = computer.phase !== 'room',
    menu = game.entered && game.paused && !inspect && !graphicsOpen,
    entry = !game.entered,
    capturePending = game.capture === 'requesting',
    computerBlocked = game.paused || inspect || graphicsOpen;
  const effectiveGraphics = graphicsPreview ?? graphicsSettings;
  const solar = projects.find((p) => p.scene === 'solar');
  useEffect(() => {
    let cancelled = false,
      mounted: ExplorerControls | undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    let preferences = { ...defaultSound },
      motion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      const saved = JSON.parse(localStorage.getItem('garage-sound') || 'null');
      if (saved)
        preferences = {
          muted: !!saved.muted,
          music: Math.max(0, Math.min(1, Number(saved.music) || 0)),
          effects: Math.max(0, Math.min(1, Number(saved.effects) || 0)),
        };
      motion = localStorage.getItem('workshop-reduced') === 'true' || motion;
    } catch {}
    try {
      graphicsRef.current = normalizeGraphics(
        JSON.parse(localStorage.getItem(GRAPHICS_STORAGE_KEY) || 'null'),
      );
    } catch {
      graphicsRef.current = { ...defaultGraphics };
    }
    setGraphicsSettings(graphicsRef.current);
    setSettings(preferences);
    setReduced(motion);
    const audio = createGarageSound(setAudioState);
    audio.setSettings(preferences);
    sound.current = audio;
    const clock = () =>
      setTime(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date()) + ' · BENGALURU',
      );
    clock();
    const clockTimer = setInterval(clock, 30000);
    const fail = (failure: GarageFailure) => {
      if (cancelled) return;
      setFailed(failure);
      setReady(true);
      setComputer({ id: null, phase: 'room' });
      setInspect(false);
      setGraphicsOpen(false);
      setGraphicsPreview(null);
    };
    void (async () => {
      try {
        await document.fonts.ready;
        const { mountExplorer } = await import('../lib/garage/explorer');
        if (cancelled || !canvas.current || !surface.current) return;
        mounted = mountExplorer(canvas.current, {
          surface: surface.current,
          sound: audio,
          onReady: () => setReady(true),
          onError: fail,
          onState: setGame,
          onComputerState: setComputer,
          onInspect: () => setInspect(true),
        });
        controls.current = mounted;
        mounted.setReduced(motion);
        mounted.setGraphics(graphicsRef.current);
      } catch (error) {
        console.error('Garage could not start', error);
        fail(garageFailureFrom(error));
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(clockTimer);
      mounted?.dispose();
      audio.dispose();
      controls.current = null;
      sound.current = null;
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    sound.current?.setSettings(settings);
    try {
      localStorage.setItem('garage-sound', JSON.stringify(settings));
    } catch {}
  }, [settings]);
  useEffect(() => {
    controls.current?.setGraphics(effectiveGraphics);
  }, [effectiveGraphics]);
  useEffect(() => {
    if (!graphicsOpen || failed) return;
    const frame = requestAnimationFrame(() =>
      focusUiElement(root.current?.querySelector<HTMLElement>('.garage-graphics-panel button')),
    );
    return () => cancelAnimationFrame(frame);
  }, [graphicsOpen, failed]);
  useEffect(() => {
    controls.current?.setReduced(reduced);
  }, [reduced]);
  useEffect(() => {
    if (!game.entered) return;
    setHint(true);
    const timer = setTimeout(() => setHint(false), 7000);
    return () => clearTimeout(timer);
  }, [game.entered]);
  useEffect(() => {
    const before = previous.current;
    previous.current = computer.phase;
    if (computerBlocked || failed) return;
    if (computer.phase === 'room') {
      if (before !== 'room') canvas.current?.focus({ preventScroll: true });
      return;
    }
    if (computer.phase !== 'using' && computer.phase !== 'approaching') return;
    const phase = computer.phase;
    const frame = requestAnimationFrame(() => {
      // The element may still be mounted while its layer is hidden by a menu.
      if (root.current?.dataset.computerPhase !== phase || root.current?.dataset.paused === 'true')
        return;
      focusUiElement(
        phase === 'using'
          ? surface.current?.querySelector<HTMLElement>(
              '.computer-desktop:not([hidden]) .os-desktop-icon',
            )
          : root.current?.querySelector<HTMLElement>('.computer-step-away'),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [computer.phase, computerBlocked, failed]);
  useEffect(() => {
    if (!failed) return;
    const frame = requestAnimationFrame(() =>
      focusUiElement(root.current?.querySelector<HTMLElement>('#garage-recovery-title')),
    );
    return () => cancelAnimationFrame(frame);
  }, [failed]);
  useEffect(() => {
    if ((!menu && !inspect) || failed) return;
    const selector = inspect ? '.garage-inspect' : '.garage-pause';
    const frame = requestAnimationFrame(() =>
      focusUiElement(root.current?.querySelector<HTMLElement>(`${selector} button:not(:disabled)`)),
    );
    return () => cancelAnimationFrame(frame);
  }, [menu, inspect, failed]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && graphicsOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setGraphicsPreview(null);
        setGraphicsOpen(false);
        return;
      }
      if (e.key === 'Escape' && inspect) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setInspect(false);
        controls.current?.resume();
        return;
      }
      if (e.key !== 'Tab' || !(using || menu || inspect || entry || graphicsOpen)) return;
      const scope = graphicsOpen
        ? root.current?.querySelector('.garage-graphics-panel')
        : menu || inspect || entry
          ? root.current?.querySelector('.garage-modal')
          : root.current?.querySelector('.computer-layer');
      const items = [
        ...(scope?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
        ) || []),
      ].filter(
        (el) =>
          el.getClientRects().length && !el.matches(':disabled') && !el.closest('[hidden],[inert]'),
      );
      const first = items[0],
        last = items.at(-1);
      if (!first) return;
      if (
        e.shiftKey &&
        (document.activeElement === first || !scope?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !scope?.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [entry, menu, using, inspect, graphicsOpen]);
  const changeGraphics = (next: GraphicsSettings) => {
    const value = normalizeGraphics(next);
    graphicsRef.current = value;
    setGraphicsPreview(null);
    setGraphicsSettings(value);
    try {
      localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(value));
    } catch {}
  };
  const closeGraphics = () => {
    setGraphicsPreview(null);
    setGraphicsOpen(false);
  };
  const start = () => {
    controls.current?.start();
  };
  const mute = () => setSettings((s) => ({ ...s, muted: !s.muted }));
  const motion = () =>
    setReduced((v) => {
      try {
        localStorage.setItem('workshop-reduced', String(!v));
      } catch {}
      return !v;
    });
  const labels = {
    kazam: 'Use work computer',
    projects: 'Use personal computer',
    lamp: 'Switch desk lamp',
    car: 'Give it a push',
    solar: 'Look at photos',
    'garage-lights': game.power.lights ? 'Turn garage lights off' : 'Turn garage lights on',
    'computer-power':
      game.power.computers.kazam || game.power.computers.projects
        ? 'Turn computers off'
        : 'Turn computers on',
    'kazam-power': game.power.computers.kazam ? 'Turn work computer off' : 'Turn work computer on',
    'projects-power': game.power.computers.projects
      ? 'Turn personal computer off'
      : 'Turn personal computer on',
    'kazam-keyboard': 'Tap keyboard',
    'projects-keyboard': 'Tap keyboard',
  };
  const label = game.target ? labels[game.target] : '';
  const soundButton = (
    <button
      className="garage-sound-button garage-icon"
      onClick={() => {
        mute();
        if (game.entered && !menu && !using && !inspect && !graphicsOpen)
          canvas.current?.focus({ preventScroll: true });
      }}
      aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'}
      title={settings.muted ? 'Sound off' : 'Sound on'}
      aria-pressed={settings.muted}
    >
      <SoundIcon muted={settings.muted} />
    </button>
  );
  const solarHtml =
    solar && typeof document !== 'undefined'
      ? document.getElementById('case-' + solar.id)?.innerHTML || ''
      : '';
  return (
    <div
      ref={root}
      className={`garage ${ready ? 'scene-ready' : ''} ${reduced ? 'reduce-motion' : ''} ${failed ? 'scene-fallback' : ''}`}
      data-failure={failed || undefined}
      data-computer-active={using}
      data-computer-phase={computer.phase}
      data-guided={game.guided}
      data-paused={game.paused}
      data-audio-state={audioState}
      data-audio-muted={settings.muted}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button,a')) sound.current?.play('key');
      }}
    >
      <div className="workshop-stage">
        <div className="workshop-poster" aria-hidden="true" />
        <div
          className="workshop-canvas"
          ref={canvas}
          tabIndex={-1}
          aria-label="Walkable garage. WASD to move, mouse to look, Shift to toggle run or walk, Space to jump, E to interact."
        />
        <div
          className="garage-vignette"
          style={{ opacity: effectiveGraphics.vignette }}
          aria-hidden="true"
        />
        {!failed && !entry && !menu && !inspect && !using && !graphicsOpen && (
          <button
            className="garage-menu-button garage-icon"
            onClick={() => controls.current?.pause()}
            aria-label="Pause and open menu"
            title="Pause · Esc"
          >
            <span>Ⅱ</span>
          </button>
        )}
        {!failed && !entry && !menu && !inspect && !using && !graphicsOpen && soundButton}
        {!failed && !entry && !menu && !inspect && !using && !graphicsOpen && (
          <>
            {!game.guided && game.locked && !game.paused && computer.phase === 'room' && (
              <div
                className={`garage-reticle ${game.target ? 'has-target' : ''}`}
                aria-hidden="true"
              />
            )}
            {game.target && (
              <button
                className="garage-interact"
                onClick={() => {
                  canvas.current?.focus({ preventScroll: true });
                  controls.current?.interact();
                }}
              >
                <kbd>{game.guided ? '↗' : 'E'}</kbd>
                {label}
              </button>
            )}
            {hint && !game.target && (
              <div className="garage-controls-hint">
                {game.guided ? (
                  'Drag to look · tap a computer'
                ) : (
                  <>
                    <kbd>W A S D</kbd> walk <span>·</span> Mouse to look <span>·</span> <kbd>E</kbd>{' '}
                    use
                  </>
                )}
              </div>
            )}
            {game.guided && (
              <nav className="garage-guided" aria-label="Walk to a corner">
                <button onClick={() => controls.current?.walkTo('courtyard')}>Outside</button>
                <button onClick={() => controls.current?.walkTo('kazam')}>Work desk</button>
                <button onClick={() => controls.current?.walkTo('projects')}>Personal PC</button>
                <button onClick={() => controls.current?.walkTo('solar')}>Making</button>
              </nav>
            )}
          </>
        )}
        {graphicsOpen && !failed && (
          <GraphicsPanel
            settings={graphicsSettings}
            onChange={changeGraphics}
            onPreview={setGraphicsPreview}
            onClose={closeGraphics}
          />
        )}
        {(entry || menu || failed) && !inspect && !graphicsOpen && (
          <div
            className={`garage-modal ${entry ? 'garage-entry' : 'garage-pause'}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              failed ? 'Garage loading help' : entry ? 'Enter Arnav’s garage' : 'Garage menu'
            }
          >
            {soundButton}
            <div className="garage-menu-card">
              <p className="garage-eyebrow">
                {failed || entry ? 'ARNAV PATIL · KORAMANGALA' : 'PAUSED'}
              </p>
              {!failed && (
                <h2>
                  {entry ? (
                    <>
                      Come on
                      <br />
                      in.
                    </>
                  ) : (
                    'Paused.'
                  )}
                </h2>
              )}
              {entry && !failed && (
                <p className="garage-intro">AI / ML engineer. This is my garage.</p>
              )}
              {!ready ? (
                <div className="garage-loading" role="status">
                  <span />
                  Unlocking the garage…
                </div>
              ) : failed ? (
                <GarageRecovery failure={failed} onRetry={() => window.location.reload()} />
              ) : entry ? (
                <>
                  <button className="garage-enter" onClick={() => start()}>
                    Enter garage <span>↵</span>
                  </button>
                  <div className="garage-entry-keys">
                    <kbd>W A S D</kbd> walk <span>·</span>
                    <kbd>SHIFT</kbd> walk / run <span>·</span>
                    <kbd>SPACE</kbd> jump <span>·</span>
                    <kbd>E</kbd> use <span>·</span>
                    <kbd>ESC</kbd> pause
                  </div>
                  <p className="garage-entry-touch">Drag to look · tap to explore.</p>
                </>
              ) : (
                <>
                  <button
                    className="garage-enter"
                    disabled={capturePending}
                    onClick={() => controls.current?.resume()}
                  >
                    {capturePending ? 'Capturing mouse…' : 'Back to the garage'} <span>↵</span>
                  </button>
                  {!game.guided && (capturePending || game.capture === 'unavailable') && (
                    <p className="garage-capture-help" role="status">
                      {capturePending
                        ? 'Waiting for the browser to capture your mouse.'
                        : 'Mouse capture was not granted. Click Back to the garage to try again.'}
                    </p>
                  )}
                  <div className="garage-shortcuts">
                    <button
                      disabled={capturePending || using || !game.power.computers.kazam}
                      onClick={() => controls.current?.useComputer('kazam')}
                    >
                      Work computer <span>↗</span>
                    </button>
                    <button
                      disabled={capturePending || using || !game.power.computers.projects}
                      onClick={() => controls.current?.useComputer('projects')}
                    >
                      Personal computer <span>↗</span>
                    </button>
                    <button
                      disabled={capturePending}
                      onClick={() => {
                        controls.current?.pause();
                        setInspect(true);
                      }}
                    >
                      TerraTrunk / SDI <span>↗</span>
                    </button>
                    <button
                      disabled={capturePending || using}
                      onClick={() => controls.current?.walkTo('courtyard')}
                    >
                      Walk outside <span>↗</span>
                    </button>
                  </div>
                  <button
                    className="garage-graphics-open"
                    disabled={capturePending}
                    onClick={() => {
                      controls.current?.pause();
                      setGraphicsOpen(true);
                    }}
                  >
                    Graphics &amp; display <span>Adjust the look ↗</span>
                  </button>
                  <div className="garage-audio-settings">
                    <label>
                      Music
                      <input
                        aria-label="Music volume"
                        type="range"
                        min="0"
                        max="1"
                        step=".05"
                        value={settings.music}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, music: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label>
                      Environment & SFX
                      <input
                        aria-label="Sound effects volume"
                        type="range"
                        min="0"
                        max="1"
                        step=".05"
                        value={settings.effects}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, effects: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <button className="garage-motion" aria-pressed={reduced} onClick={motion}>
                      {reduced ? 'Reduced motion on' : 'Reduce motion'}
                    </button>
                  </div>
                </>
              )}
              {failed && (
                <div className="garage-shortcuts">
                  {projects.map((p) => (
                    <a key={p.id} href={`/work/${p.id}/`}>
                      {p.title} ↗
                    </a>
                  ))}
                </div>
              )}
              <div className="garage-contact-links">
                <a href="/resume/" target="_blank" rel="noreferrer">
                  Résumé ↗
                </a>
                <a href="mailto:thearnavpatil27@gmail.com">Say hello ↗</a>
              </div>
            </div>
          </div>
        )}
        {inspect && (
          <div
            className="garage-modal garage-inspect"
            role="dialog"
            aria-modal="true"
            aria-label="TerraTrunk competition photos"
          >
            {soundButton}
            <article className="garage-scrapbook">
              <header>
                <span>TEAM GAIA / SDI 2025</span>
                <button
                  aria-label="Put down the photos"
                  onClick={() => {
                    setInspect(false);
                    controls.current?.resume();
                  }}
                >
                  ×
                </button>
              </header>
              <h2>TerraTrunk.</h2>
              <p className="garage-photo-note">Runner-up · Solar Decathlon India</p>
              <div dangerouslySetInnerHTML={{ __html: solarHtml }} />
            </article>
          </div>
        )}
        <div
          className="computer-layer"
          hidden={!using || computerBlocked}
          inert={computerBlocked}
          role="dialog"
          aria-modal="true"
          aria-label={
            computer.id === 'kazam'
              ? 'Using the Kazam work computer'
              : 'Using Arnav’s personal computer'
          }
        >
          <div
            className="computer-surface"
            ref={surface}
            inert={computerBlocked || computer.phase !== 'using'}
            data-booting={computer.phase === 'approaching'}
          >
            {(['kazam', 'projects'] as ComputerId[]).map((id) => (
              <ComputerDesktop
                key={id}
                id={id}
                active={computer.id === id}
                ready={computer.phase !== 'approaching'}
                projects={projects}
                articles={articles}
                time={time}
                onLeave={() => controls.current?.leaveComputer()}
              />
            ))}
            <div className="garage-static" aria-hidden="true" />
          </div>
          <button
            className="computer-step-away"
            disabled={computer.phase === 'leaving'}
            onClick={() => controls.current?.leaveComputer()}
          >
            <kbd>ESC</kbd>Step away
          </button>
          <button
            className="garage-pc-sound"
            onClick={mute}
            aria-label={settings.muted ? 'Unmute computer sound' : 'Mute computer sound'}
          >
            <SoundIcon muted={settings.muted} />
          </button>
        </div>
      </div>
    </div>
  );
}
