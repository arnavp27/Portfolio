import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { contributions } from '../config/contributions';
import type { ComputerId } from '../lib/garage/computers';
import '../styles/computer-desktop.css';
export type DesktopProject = {
  id: string;
  title: string;
  category: string;
  summary: string;
  role: string;
  status?: string;
  zone?: string;
  scene?: string;
  links: { label: string; url: string }[];
};
type Props = {
  id: ComputerId;
  active: boolean;
  ready: boolean;
  projects: DesktopProject[];
  articles: { id: string; title: string }[];
  time: string;
  onLeave: () => void;
};
type App = { id: string; name: string; icon: string };
type OpenWindow = { id: string; minimized: boolean; maximized: boolean; x: number; y: number };
function PixelIcon({ type }: { type: string }) {
  const paths: Record<string, React.ReactNode> = {
    folder: (
      <>
        <path fill="#7f5c19" d="M1 4h6l2 2h6v8H1z" />
        <path fill="#ead48a" d="M1 3h6l2 2h6v2H1z" />
        <path fill="#b38532" d="M1 7h14v7H1z" />
        <path fill="#efce71" d="M2 8h13l-2 6H1z" />
        <path fill="#fff0b0" d="M2 8h13v1H2z" />
      </>
    ),
    file: (
      <>
        <path fill="#566775" d="M4 2h7l3 3v10H4z" />
        <path fill="#f2ecd6" d="M3 1h7l3 3v10H3z" />
        <path fill="#b9b5a6" d="M10 1v4h3z" />
        <path fill="#5c7778" d="M5 6h6v1H5zm0 2h6v1H5zm0 2h4v1H5z" />
      </>
    ),
    computer: (
      <>
        <path fill="#3a4241" d="M1 2h14v10H1z" />
        <path fill="#d1cbb6" d="M1 1h13v10H1zM5 11h5v2H5zM3 13h9v2H3z" />
        <path fill="#213e45" d="M3 3h9v6H3z" />
        <path fill="#77c2b7" d="M4 4h5v1H4zM4 6h2v1H4z" />
      </>
    ),
    code: (
      <>
        <path fill="#f3e8c5" d="M2 2h12v12H2z" />
        <path fill="#526868" d="M2 2h12v3H2z" />
        <path
          fill="#3b7a65"
          d="M5 6H4v1H3v2h1v1h1V9H4V7h1zm6 0h1v1h1v2h-1v1h-1V9h1V7h-1zM8 5h1v2H8v3H7v2H6v-2h1V7h1z"
        />
      </>
    ),
    mail: (
      <>
        <path fill="#695a48" d="M1 4h14v10H1z" />
        <path fill="#e7dfbe" d="M1 3h13v10H1z" />
        <path fill="#b9b18f" d="M2 4h2v1h2v1h3V5h2V4h2v2h-2v1H9v1H6V7H4V6H2z" />
        <path fill="#688d99" d="M11 4h2v2h-2z" />
      </>
    ),
    pixel: (
      <>
        <path fill="#a8bd8d" d="M4 3h2v2h4V3h2v3h2v6h-2v2h-2v-2H6v2H4v-2H2V6h2z" />
        <path fill="#173e46" d="M5 7h2v2H5zm4 0h2v2H9z" />
      </>
    ),
    vision: (
      <>
        <path fill="#e2d6b2" d="M1 6h2V4h3V3h4v1h3v2h2v4h-2v2h-3v1H6v-1H3v-2H1z" />
        <path fill="#6b9ba8" d="M6 5h4v1h1v4h-1v1H6v-1H5V6h1z" />
        <path fill="#1e3d46" d="M7 6h3v4H7z" />
        <path fill="#fff8d1" d="M7 6h1v1H7z" />
      </>
    ),
  };
  return (
    <svg
      className="os-pixel-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {paths[type] || paths.file}
    </svg>
  );
}
export default function ComputerDesktop({
  id,
  active,
  ready,
  projects,
  articles,
  time,
  onLeave,
}: Props) {
  const desktop = useRef<HTMLDivElement>(null),
    workspace = useRef<HTMLDivElement>(null);
  const [windows, setWindows] = useState<OpenWindow[]>([]),
    [menu, setMenu] = useState(false);
  const personal = projects.filter(
    (p) => p.zone === 'projects' || (!p.zone && p.scene !== 'kazam' && p.scene !== 'solar'),
  );
  const work = projects.find((p) => p.scene === 'kazam');
  const apps: App[] =
    id === 'kazam'
      ? [
          { id: 'work', name: 'My work', icon: 'folder' },
          { id: 'readme', name: 'readme.txt', icon: 'file' },
          { id: 'contact', name: 'Contact', icon: 'mail' },
        ]
      : [
          { id: 'projects', name: 'Projects', icon: 'folder' },
          { id: 'opensource', name: 'Open source', icon: 'code' },
          { id: 'readme', name: 'readme.txt', icon: 'file' },
          { id: 'contact', name: 'Contact', icon: 'mail' },
          ...(articles.length ? [{ id: 'writing', name: 'Writing', icon: 'file' }] : []),
        ];
  const title = (app: string) =>
    app === 'work'
      ? 'Kazam — work.txt'
      : app.startsWith('project:')
        ? projects.find((p) => p.id === app.slice(8))?.title || 'Project'
        : apps.find((a) => a.id === app)?.name || app;
  const icon = (app: string) =>
    app.startsWith('project:')
      ? app.includes('pixel')
        ? 'pixel'
        : 'vision'
      : apps.find((a) => a.id === app)?.icon || 'file';
  function focusWithin(app: string) {
    requestAnimationFrame(() =>
      [...(desktop.current?.querySelectorAll<HTMLElement>('[data-app-id]') || [])]
        .find((el) => el.dataset.appId === app)
        ?.querySelector<HTMLElement>('.os-window-content')
        ?.focus({ preventScroll: true }),
    );
  }
  function minimize(app: string) {
    update(app, { minimized: true });
    requestAnimationFrame(() =>
      [...(desktop.current?.querySelectorAll<HTMLElement>('[data-task-id]') || [])]
        .find((el) => el.dataset.taskId === app)
        ?.focus({ preventScroll: true }),
    );
  }
  function open(app: string) {
    setMenu(false);
    focusWithin(app);
    setWindows((prev) => {
      const found = prev.find((w) => w.id === app);
      return [
        ...prev.filter((w) => w.id !== app),
        found
          ? { ...found, minimized: false }
          : {
              id: app,
              minimized: false,
              maximized: false,
              x: (prev.length % 3) * 16,
              y: (prev.length % 3) * 12,
            },
      ];
    });
  }
  function front(app: string) {
    setWindows((prev) => {
      const item = prev.find((w) => w.id === app);
      return item && prev.at(-1) !== item ? [...prev.filter((w) => w.id !== app), item] : prev;
    });
  }
  function update(app: string, patch: Partial<OpenWindow>) {
    setWindows((prev) => prev.map((w) => (w.id === app ? { ...w, ...patch } : w)));
  }
  function close(app: string) {
    setWindows((prev) => prev.filter((w) => w.id !== app));
    requestAnimationFrame(() => {
      const target = [
        ...(desktop.current?.querySelectorAll<HTMLElement>('[data-launcher-id]') || []),
      ].find((el) => el.dataset.launcherId === app);
      (target || desktop.current?.querySelector<HTMLElement>('.os-start'))?.focus({
        preventScroll: true,
      });
    });
  }
  function drag(event: ReactPointerEvent<HTMLElement>, win: OpenWindow) {
    if (win.maximized || (event.target as HTMLElement).closest('button') || !workspace.current)
      return;
    event.preventDefault();
    front(win.id);
    const bar = event.currentTarget,
      el = bar.parentElement!;
    const bounds = workspace.current.getBoundingClientRect(),
      scale = bounds.width / workspace.current.clientWidth;
    const startX = event.clientX,
      startY = event.clientY,
      baseX = win.x,
      baseY = win.y;
    const minX = -el.offsetLeft,
      maxX = workspace.current.clientWidth - el.offsetLeft - el.offsetWidth;
    const minY = -el.offsetTop,
      maxY = workspace.current.clientHeight - el.offsetTop - el.offsetHeight;
    bar.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) =>
      update(win.id, {
        x: Math.max(minX, Math.min(maxX, baseX + (e.clientX - startX) / scale)),
        y: Math.max(minY, Math.min(maxY, baseY + (e.clientY - startY) / scale)),
      });
    const stop = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', stop);
      bar.removeEventListener('pointercancel', stop);
      if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
  }
  useEffect(() => {
    if (!active) setMenu(false);
  }, [active]);
  const external = (links: { label: string; url: string }[]) =>
    links.map((link) => (
      <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
        {link.label} ↗
      </a>
    ));
  const projectStory = (p: DesktopProject) => {
    const html =
      typeof document !== 'undefined'
        ? document.getElementById('case-' + p.id)?.innerHTML || ''
        : '';
    return (
      <>
        <div className="os-document-heading">
          <PixelIcon
            type={p.scene === 'kazam' ? 'computer' : p.scene === 'pixel' ? 'pixel' : 'vision'}
          />
          <div>
            <small>{p.category}</small>
            <h2>{p.title}</h2>
          </div>
        </div>
        <div className="os-record">
          <span>{p.role}</span>
          {p.status && (
            <strong>
              <i />
              {p.status}
            </strong>
          )}
        </div>
        {p.links.length > 0 && <div className="os-links">{external(p.links)}</div>}
        <article className="os-document" dangerouslySetInnerHTML={{ __html: html }} />
      </>
    );
  };
  function content(app: string) {
    if (app === 'work' && work) return projectStory(work);
    if (app.startsWith('project:')) {
      const p = projects.find((p) => p.id === app.slice(8));
      return p ? projectStory(p) : null;
    }
    if (app === 'projects')
      return (
        <>
          <div className="os-explorer-toolbar">
            <span>Location</span>
            <strong>C:\Users\Arnav\Projects</strong>
          </div>
          <div className="os-project-files">
            {personal.map((p) => (
              <button key={p.id} onClick={() => open('project:' + p.id)}>
                <PixelIcon type={p.scene === 'pixel' ? 'pixel' : 'vision'} />
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.category}</small>
                  <p>{p.summary}</p>
                </span>
                <span className="os-file-arrow">↗</span>
              </button>
            ))}
          </div>
          <p className="os-directory-count">{personal.length} projects</p>
        </>
      );
    if (app === 'opensource')
      return (
        <>
          <div className="os-document-heading">
            <PixelIcon type="code" />
            <div>
              <small>CHANGES THAT MADE IT UPSTREAM</small>
              <h2>Open source</h2>
            </div>
          </div>
          {contributions.map((c) => (
            <article className="os-contribution" key={c.name}>
              <strong>{c.name}</strong>
              <span className="os-merged">MERGED</span>
              <p>{c.description}</p>
              <div className="os-links">{external(c.links)}</div>
            </article>
          ))}
          <div className="os-links">
            {external([
              {
                label: 'All pull requests',
                url: 'https://github.com/pulls?q=is%3Apr+author%3Aarnavp27',
              },
            ])}
          </div>
        </>
      );
    if (app === 'readme')
      return (
        <>
          <div className="os-document-heading">
            <PixelIcon type="file" />
            <div>
              <small>README.TXT</small>
              <h2>Arnav Patil</h2>
            </div>
          </div>
          <article className="os-document">
            <p>
              I’m an AI / ML engineer in Bengaluru. I like working through problems and building
              things people can use.
            </p>
            <p>
              I’m currently interning at Kazam, where I built the EV charger investigation assistant
              as its sole engineer. It’s in production and being used by the team.
            </p>
            <p>
              This is my garage. The work computer has my Kazam story; my personal computer has the
              projects and experiments.
            </p>
          </article>
          <div className="os-links">
            <a href="/resume/" target="_blank" rel="noreferrer">
              Open résumé ↗
            </a>
            <button onClick={() => open('contact')}>Contact details →</button>
          </div>
        </>
      );
    if (app === 'contact')
      return (
        <>
          <div className="os-document-heading">
            <PixelIcon type="mail" />
            <div>
              <small>ADDRESS BOOK / 1 CONTACT</small>
              <h2>Say hello.</h2>
            </div>
          </div>
          <dl className="os-address">
            <dt>Name</dt>
            <dd>Arnav Patil</dd>
            <dt>Location</dt>
            <dd>Bengaluru, India</dd>
            <dt>Email</dt>
            <dd>
              <a href="mailto:thearnavpatil27@gmail.com">thearnavpatil27@gmail.com ↗</a>
            </dd>
            <dt>GitHub</dt>
            <dd>
              <a href="https://github.com/arnavp27" target="_blank" rel="noreferrer">
                arnavp27 ↗
              </a>
            </dd>
            <dt>LinkedIn</dt>
            <dd>
              <a href="https://www.linkedin.com/in/thearnavpatil/" target="_blank" rel="noreferrer">
                thearnavpatil ↗
              </a>
            </dd>
          </dl>
          <div className="os-links">
            <a href="/resume/" target="_blank" rel="noreferrer">
              Résumé ↗
            </a>
          </div>
        </>
      );
    if (app === 'writing')
      return (
        <div className="os-writing">
          {articles.map((a) => (
            <a key={a.id} href={`/notes/${a.id}/`} target="_blank" rel="noreferrer">
              <PixelIcon type="file" />
              {a.title} ↗
            </a>
          ))}
        </div>
      );
    return null;
  }
  return (
    <div
      ref={desktop}
      className={`computer-desktop ${id === 'kazam' ? 'work-desktop' : 'personal-desktop'}`}
      hidden={!active}
      inert={!ready}
      aria-label={
        id === 'kazam' ? 'Kazam work computer desktop' : 'Arnav’s personal computer desktop'
      }
    >
      <div className="os-workspace" ref={workspace}>
        <div className="os-wallpaper" aria-hidden="true">
          <div className="os-wallpaper-emblem">
            {id === 'kazam' ? (
              <>
                <span>k</span>
                <i>↗</i>
              </>
            ) : (
              <>
                <span>a</span>
                <i>_</i>
              </>
            )}
          </div>
          <strong>{id === 'kazam' ? 'WORK NOTES' : 'ARNAV’S PC'}</strong>
          <span>{id === 'kazam' ? 'KAZAM · BENGALURU' : 'PROJECTS & EXPERIMENTS'}</span>
        </div>
        <div className="os-desktop-icons">
          {apps.map((app) => (
            <button
              className="os-desktop-icon"
              data-launcher-id={app.id}
              key={app.id}
              onClick={() => open(app.id)}
            >
              <PixelIcon type={app.icon} />
              <span>{app.name}</span>
            </button>
          ))}
        </div>
        {windows.map((win, index) => (
          <section
            key={win.id}
            data-app-id={win.id}
            className={`os-window ${win.maximized ? 'is-maximized' : ''} ${windows.at(-1)?.id === win.id ? 'is-front' : ''}`}
            hidden={win.minimized}
            style={{
              zIndex: index + 2,
              transform: win.maximized ? 'none' : `translate(${win.x}px,${win.y}px)`,
            }}
            aria-label={`${title(win.id)} window`}
            onPointerDownCapture={() => front(win.id)}
          >
            <header
              className="os-titlebar"
              onPointerDown={(e) => drag(e, win)}
              onDoubleClick={() => update(win.id, { maximized: !win.maximized, x: 0, y: 0 })}
            >
              <PixelIcon type={icon(win.id)} />
              <strong>{title(win.id)}</strong>
              <div>
                <button aria-label={`Minimize ${title(win.id)}`} onClick={() => minimize(win.id)}>
                  _
                </button>
                <button
                  aria-label={`${win.maximized ? 'Restore' : 'Maximize'} ${title(win.id)}`}
                  onClick={() => update(win.id, { maximized: !win.maximized, x: 0, y: 0 })}
                >
                  {win.maximized ? '❐' : '□'}
                </button>
                <button aria-label={`Close ${title(win.id)}`} onClick={() => close(win.id)}>
                  ×
                </button>
              </div>
            </header>
            <div className="os-window-menuline">
              <span>{win.id === 'projects' ? 'Folder' : 'Document'}</span>
              <span>Arnav Patil</span>
            </div>
            <div className="os-window-content" tabIndex={0}>
              {content(win.id)}
            </div>
            <footer className="os-window-status">
              <span>{win.id === 'work' ? 'Kazam · March 2026 — present' : 'Arnav’s garage'}</span>
              <span>{win.id.startsWith('project:') ? 'Project notes' : 'Ready'}</span>
              <i aria-hidden="true">◢</i>
            </footer>
          </section>
        ))}
      </div>
      {menu && (
        <div className="os-start-menu">
          <div className="os-start-brand">
            ARNAV <b>OS</b>
          </div>
          <div>
            {apps.map((app) => (
              <button key={app.id} onClick={() => open(app.id)}>
                <PixelIcon type={app.icon} />
                {app.name}
              </button>
            ))}
            <button className="os-shutdown" onClick={onLeave}>
              <span>⏻</span>Step away
            </button>
          </div>
        </div>
      )}
      <footer className="os-taskbar">
        <button
          className={`os-start ${menu ? 'is-pressed' : ''}`}
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
        >
          <PixelIcon type="computer" />
          <strong>Start</strong>
        </button>
        <div className="os-running-apps">
          {windows.map((win) => (
            <button
              key={win.id}
              data-task-id={win.id}
              className={!win.minimized && windows.at(-1)?.id === win.id ? 'is-pressed' : ''}
              onClick={() =>
                win.minimized
                  ? open(win.id)
                  : windows.at(-1)?.id === win.id
                    ? minimize(win.id)
                    : front(win.id)
              }
              aria-label={`Show ${title(win.id)}`}
            >
              <PixelIcon type={icon(win.id)} />
              <span>{title(win.id)}</span>
            </button>
          ))}
        </div>
        <div className="os-clock">
          <span className="os-disk-light" />
          <span>{time.split(' ·')[0]}</span>
        </div>
      </footer>
      {!ready && (
        <div className="os-boot" aria-hidden="true">
          <PixelIcon type="computer" />
          <strong>{id === 'kazam' ? 'WORK COMPUTER' : 'ARNAV’S PC'}</strong>
          <span>
            Starting<span className="os-boot-dots">...</span>
          </span>
          <div className="os-boot-progress">
            <i />
          </div>
        </div>
      )}
      <div className="os-crt-glass" aria-hidden="true" />
    </div>
  );
}
