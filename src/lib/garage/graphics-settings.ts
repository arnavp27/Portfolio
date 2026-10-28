/** Visual controls are explicit and fixed; frame rate never changes them. */
export interface GraphicsSettings {
  /** 0.3–1: fraction of the display's native resolution. */
  renderScale: number;
  /** Geometry multisampling and/or the final edge-smoothing pass. */
  antialias: 'off' | 'smaa' | 'msaa' | 'both';
  /** Nearest-neighbour canvas enlargement; does not alter texture filtering. */
  pixelated: boolean;
  /** Detail retained on surfaces seen at an angle, capped by GPU support. */
  anisotropy: 1 | 2 | 4 | 8 | 16;
  /** 0.4–2: exposure before the selected tone mapper. */
  exposure: number;
  toneMapping: 'aces' | 'neutral' | 'none';
  ao: boolean;
  /** 0–1: strength of contact shading. */
  aoIntensity: number;
  /** 0.05–1.5: world-space reach of contact shading. */
  aoRadius: number;
  bloom: boolean;
  /** 0–1: glow strength. */
  bloomStrength: number;
  /** 0–1: spread of the glow. */
  bloomRadius: number;
  /** 0–4: brightness threshold that starts glowing, in linear light. */
  bloomThreshold: number;
  shadows: 'off' | 'soft' | 'sharp';
  /** Fraction of each light's authored shadow-map dimensions. */
  shadowResolution: 0.5 | 1;
  /** 0–1: ambient reflection/lighting strength from the sky. */
  environmentIntensity: number;
  /** 0–0.04: exponential distance fog density. */
  fogDensity: number;
  rain: boolean;
  /** 0.7–1.4: scene-only display contrast. */
  contrast: number;
  /** 0–1.6: scene-only display saturation. */
  saturation: number;
  /** 0–1: opacity of the existing edge vignette. */
  vignette: number;
}

export const GRAPHICS_STORAGE_KEY = 'garage-graphics-v1';

/** The current look, also used by Reset. Never changed by device performance. */
export const defaultGraphics: Readonly<GraphicsSettings> = Object.freeze({
  renderScale: 0.6,
  antialias: 'both',
  pixelated: false,
  anisotropy: 8,
  exposure: 1.08,
  toneMapping: 'aces',
  ao: true,
  aoIntensity: 0.38,
  aoRadius: 0.38,
  bloom: true,
  bloomStrength: 0.045,
  bloomRadius: 0.25,
  bloomThreshold: 2,
  shadows: 'soft',
  shadowResolution: 1,
  environmentIntensity: 0.24,
  fogDensity: 0.0095,
  rain: true,
  contrast: 1,
  saturation: 1,
  vignette: 1,
});

/** Validate saved/imported settings without coercing strings or trusting unknown keys. */
export function normalizeGraphics(input: unknown): GraphicsSettings {
  const value =
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  function number(key: keyof GraphicsSettings, min: number, max: number): number {
    const candidate = value[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : (defaultGraphics[key] as number);
  }
  function boolean(key: keyof GraphicsSettings): boolean {
    return typeof value[key] === 'boolean'
      ? (value[key] as boolean)
      : (defaultGraphics[key] as boolean);
  }
  function choice<K extends keyof GraphicsSettings>(
    key: K,
    choices: readonly GraphicsSettings[K][],
  ): GraphicsSettings[K] {
    return choices.includes(value[key] as GraphicsSettings[K])
      ? (value[key] as GraphicsSettings[K])
      : defaultGraphics[key];
  }
  return {
    renderScale: number('renderScale', 0.3, 1),
    antialias: choice('antialias', ['off', 'smaa', 'msaa', 'both']),
    pixelated: boolean('pixelated'),
    anisotropy: choice('anisotropy', [1, 2, 4, 8, 16]),
    exposure: number('exposure', 0.4, 2),
    toneMapping: choice('toneMapping', ['aces', 'neutral', 'none']),
    ao: boolean('ao'),
    aoIntensity: number('aoIntensity', 0, 1),
    aoRadius: number('aoRadius', 0.05, 1.5),
    bloom: boolean('bloom'),
    bloomStrength: number('bloomStrength', 0, 1),
    bloomRadius: number('bloomRadius', 0, 1),
    bloomThreshold: number('bloomThreshold', 0, 4),
    shadows: choice('shadows', ['off', 'soft', 'sharp']),
    shadowResolution: choice('shadowResolution', [0.5, 1]),
    environmentIntensity: number('environmentIntensity', 0, 1),
    fogDensity: number('fogDensity', 0, 0.04),
    rain: boolean('rain'),
    contrast: number('contrast', 0.7, 1.4),
    saturation: number('saturation', 0, 1.6),
    vignette: number('vignette', 0, 1),
  };
}
