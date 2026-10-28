import { useEffect, useId, useRef, useState } from 'react';
import {
  defaultGraphics,
  normalizeGraphics,
  type GraphicsSettings,
} from '../lib/garage/graphics-settings';
import '../styles/graphics-panel.css';

type Props = {
  settings: GraphicsSettings;
  onChange: (settings: GraphicsSettings) => void;
  onPreview: (settings: GraphicsSettings | null) => void;
  onClose: () => void;
};

function Slider({
  label,
  help,
  value,
  min,
  max,
  step,
  display = String(value),
  disabled = false,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="graphics-control graphics-slider" data-disabled={disabled}>
      <div className="graphics-control-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        type="range"
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
      <p id={`${id}-help`}>{help}</p>
    </div>
  );
}

function Select({
  label,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  help: string;
  value: string | number;
  options: [string | number, string][];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="graphics-control graphics-select">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map(([option, title]) => (
          <option value={option} key={option}>
            {title}
          </option>
        ))}
      </select>
      <p id={`${id}-help`}>{help}</p>
    </div>
  );
}

function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="graphics-control graphics-toggle">
      <label htmlFor={id}>
        <span>{label}</span>
        <input
          id={id}
          type="checkbox"
          checked={value}
          aria-describedby={`${id}-help`}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </label>
      <p id={`${id}-help`}>{help}</p>
    </div>
  );
}

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export default function GraphicsPanel({ settings, onChange, onPreview, onClose }: Props) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [comparing, setComparing] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;

  // Focus after the dev-only module has actually mounted, not while it is loading.
  useEffect(() => {
    const button = closeButton.current;
    if (button?.isConnected && button.getClientRects().length && !document.pointerLockElement) {
      button.focus({ preventScroll: true });
    }
  }, []);

  // Also restore the experiment when the parent closes the panel with Escape.
  useEffect(
    () => () => {
      previewRef.current(null);
    },
    [],
  );

  const update = <K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]) => {
    setCopyStatus('');
    setCopyFallback('');
    onChange(normalizeGraphics({ ...settings, [key]: value }));
  };
  const compare = () => {
    onPreview(comparing ? null : { ...defaultGraphics });
    setComparing(!comparing);
    setCopyStatus('');
    setCopyFallback('');
  };
  const close = () => {
    onPreview(null);
    onClose();
  };
  const reset = () => {
    onPreview(null);
    setComparing(false);
    setCopyStatus('Current 60% look restored.');
    setCopyFallback('');
    onChange({ ...defaultGraphics });
  };
  const copy = async () => {
    const json = JSON.stringify(normalizeGraphics(settings), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopyFallback('');
      setCopyStatus('Settings copied. Paste them into the chat.');
    } catch {
      setCopyFallback(json);
      setCopyStatus('Select the settings below and copy them.');
    }
  };

  return (
    <aside
      className="garage-graphics-panel graphics-panel"
      role="dialog"
      aria-label="Graphics settings"
    >
      <header className="graphics-panel-header">
        <div>
          <span className="graphics-panel-live">
            <i aria-hidden="true" />
            Live preview
          </span>
          <h2 id={titleId}>Graphics</h2>
        </div>
        <button
          type="button"
          className="graphics-panel-close"
          ref={closeButton}
          aria-label="Close graphics settings"
          onClick={close}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div className="graphics-panel-scroll">
        <p className="graphics-panel-intro">Tune the room. Watch it change.</p>
        {comparing && (
          <p className="graphics-comparison" role="status">
            Showing the current 60% look. Your experiment is saved — compare again to return.
          </p>
        )}
        <fieldset className="graphics-controls" disabled={comparing}>
          <legend className="graphics-sr-only">Live graphics controls</legend>
          <details className="graphics-group" open>
            <summary>
              <span>01</span> Image <b aria-hidden="true">+</b>
            </summary>
            <div className="graphics-group-body">
              <Slider
                label="Render resolution"
                help="Lower values make the scene softer. Text menus stay crisp."
                value={settings.renderScale}
                min={0.3}
                max={1}
                step={0.01}
                display={percentage(settings.renderScale)}
                onChange={(value) => update('renderScale', value)}
              />
              <Select
                label="Edge smoothing"
                help="MSAA smooths geometry. SMAA softens remaining jagged edges."
                value={settings.antialias}
                options={[
                  ['off', 'Off'],
                  ['smaa', 'SMAA'],
                  ['msaa', 'MSAA'],
                  ['both', 'MSAA + SMAA'],
                ]}
                onChange={(value) => update('antialias', value as GraphicsSettings['antialias'])}
              />
              <Toggle
                label="Hard pixel edges"
                help="Enlarge the rendered pixels sharply for a chunkier look."
                value={settings.pixelated}
                onChange={(value) => update('pixelated', value)}
              />
              <Select
                label="Texture detail at angles"
                help="Keeps floors and walls clearer when viewed from the side."
                value={settings.anisotropy}
                options={[
                  [1, '1×'],
                  [2, '2×'],
                  [4, '4×'],
                  [8, '8×'],
                  [16, '16×'],
                ]}
                onChange={(value) =>
                  update('anisotropy', Number(value) as GraphicsSettings['anisotropy'])
                }
              />
            </div>
          </details>

          <details className="graphics-group">
            <summary>
              <span>02</span> Lighting & shadows <b aria-hidden="true">+</b>
            </summary>
            <div className="graphics-group-body">
              <Slider
                label="Exposure"
                help={
                  settings.toneMapping === 'none'
                    ? 'Choose ACES or Neutral light response to adjust exposure.'
                    : 'Brighten or darken the whole scene.'
                }
                disabled={settings.toneMapping === 'none'}
                value={settings.exposure}
                min={0.4}
                max={2}
                step={0.02}
                display={`${settings.exposure.toFixed(2)}×`}
                onChange={(value) => update('exposure', value)}
              />
              <Select
                label="Light response"
                help="Controls how bright lights and colours are mapped to your screen."
                value={settings.toneMapping}
                options={[
                  ['aces', 'ACES · cinematic'],
                  ['neutral', 'Neutral'],
                  ['none', 'None · raw'],
                ]}
                onChange={(value) =>
                  update('toneMapping', value as GraphicsSettings['toneMapping'])
                }
              />
              <Slider
                label="Ambient light"
                help="Light from the surrounding sky on materials and reflections."
                value={settings.environmentIntensity}
                min={0}
                max={1}
                step={0.02}
                display={percentage(settings.environmentIntensity)}
                onChange={(value) => update('environmentIntensity', value)}
              />
              <Select
                label="Shadows"
                help="Choose soft edges, sharper edges, or no cast shadows."
                value={settings.shadows}
                options={[
                  ['off', 'Off'],
                  ['soft', 'Soft'],
                  ['sharp', 'Sharp'],
                ]}
                onChange={(value) => update('shadows', value as GraphicsSettings['shadows'])}
              />
              <fieldset className="graphics-subcontrols" disabled={settings.shadows === 'off'}>
                <legend className="graphics-sr-only">Shadow detail</legend>
                <Select
                  label="Shadow resolution"
                  help="Full resolution keeps small shadow details more defined."
                  value={settings.shadowResolution}
                  options={[
                    [0.5, 'Half'],
                    [1, 'Full'],
                  ]}
                  onChange={(value) =>
                    update(
                      'shadowResolution',
                      Number(value) as GraphicsSettings['shadowResolution'],
                    )
                  }
                />
              </fieldset>
            </div>
          </details>

          <details className="graphics-group">
            <summary>
              <span>03</span> Contact shading <b aria-hidden="true">+</b>
            </summary>
            <div className="graphics-group-body">
              <Toggle
                label="Ambient occlusion"
                help="Adds shadows where objects meet, in corners and under furniture."
                value={settings.ao}
                onChange={(value) => update('ao', value)}
              />
              <fieldset className="graphics-subcontrols" disabled={!settings.ao}>
                <legend className="graphics-sr-only">Ambient occlusion controls</legend>
                <Slider
                  label="Shading strength"
                  help="How dark the contact shadows appear."
                  value={settings.aoIntensity}
                  min={0}
                  max={1}
                  step={0.02}
                  display={percentage(settings.aoIntensity)}
                  onChange={(value) => update('aoIntensity', value)}
                />
                <Slider
                  label="Shading spread"
                  help="How far contact shadows extend from an object."
                  value={settings.aoRadius}
                  min={0.05}
                  max={1.5}
                  step={0.01}
                  display={settings.aoRadius.toFixed(2)}
                  onChange={(value) => update('aoRadius', value)}
                />
              </fieldset>
            </div>
          </details>

          <details className="graphics-group">
            <summary>
              <span>04</span> Light glow <b aria-hidden="true">+</b>
            </summary>
            <div className="graphics-group-body">
              <Toggle
                label="Bloom"
                help="A soft halo around bright lamps, windows and headlights."
                value={settings.bloom}
                onChange={(value) => update('bloom', value)}
              />
              <fieldset className="graphics-subcontrols" disabled={!settings.bloom}>
                <legend className="graphics-sr-only">Bloom controls</legend>
                <Slider
                  label="Glow strength"
                  help="How much bright areas bleed into their surroundings."
                  value={settings.bloomStrength}
                  min={0}
                  max={1}
                  step={0.005}
                  display={`${(settings.bloomStrength * 100).toFixed(1)}%`}
                  onChange={(value) => update('bloomStrength', value)}
                />
                <Slider
                  label="Glow spread"
                  help="A wider spread makes lights feel hazier."
                  value={settings.bloomRadius}
                  min={0}
                  max={1}
                  step={0.01}
                  display={percentage(settings.bloomRadius)}
                  onChange={(value) => update('bloomRadius', value)}
                />
                <Slider
                  label="Brightness threshold"
                  help="Lower values let more of the scene glow."
                  value={settings.bloomThreshold}
                  min={0}
                  max={4}
                  step={0.05}
                  display={settings.bloomThreshold.toFixed(2)}
                  onChange={(value) => update('bloomThreshold', value)}
                />
              </fieldset>
            </div>
          </details>

          <details className="graphics-group">
            <summary>
              <span>05</span> Atmosphere & colour <b aria-hidden="true">+</b>
            </summary>
            <div className="graphics-group-body">
              <Slider
                label="Distance fog"
                help="Fade distant buildings into the night. Zero clears the air."
                value={settings.fogDensity}
                min={0}
                max={0.04}
                step={0.0005}
                display={settings.fogDensity.toFixed(4)}
                onChange={(value) => update('fogDensity', value)}
              />
              <Toggle
                label="Rain"
                help="Show the rain falling outside the garage."
                value={settings.rain}
                onChange={(value) => update('rain', value)}
              />
              <Slider
                label="Contrast"
                help="Increase the difference between bright and dark areas."
                value={settings.contrast}
                min={0.7}
                max={1.4}
                step={0.01}
                display={percentage(settings.contrast)}
                onChange={(value) => update('contrast', value)}
              />
              <Slider
                label="Colour saturation"
                help="Go from muted colour to vivid colour, or all the way to monochrome."
                value={settings.saturation}
                min={0}
                max={1.6}
                step={0.02}
                display={percentage(settings.saturation)}
                onChange={(value) => update('saturation', value)}
              />
              <Slider
                label="Darkened corners"
                help="The vignette gently shades the edges of your view."
                value={settings.vignette}
                min={0}
                max={1}
                step={0.05}
                display={percentage(settings.vignette)}
                onChange={(value) => update('vignette', value)}
              />
            </div>
          </details>
        </fieldset>

        {copyFallback && (
          <div className="graphics-copy-fallback">
            <label htmlFor={`${titleId}-copy`}>Settings to copy</label>
            <textarea
              id={`${titleId}-copy`}
              readOnly
              value={copyFallback}
              onFocus={(event) => event.currentTarget.select()}
              aria-describedby={`${titleId}-status`}
              rows={8}
            />
          </div>
        )}
      </div>

      <footer className="graphics-panel-footer">
        <button
          type="button"
          className="graphics-compare"
          aria-pressed={comparing}
          onClick={compare}
        >
          <span aria-hidden="true">⇄</span>{' '}
          {comparing ? 'Back to your experiment' : 'Compare current look'}
        </button>
        <div className="graphics-panel-actions">
          <button type="button" onClick={reset}>
            Reset current look
          </button>
          <button type="button" onClick={() => void copy()}>
            Copy settings <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className="graphics-panel-note">
          Changes stay in this browser. Reset returns to the current 60% look.
        </p>
        <p
          className="graphics-copy-status"
          id={`${titleId}-status`}
          role="status"
          aria-live="polite"
        >
          {copyStatus}
        </p>
      </footer>
    </aside>
  );
}
