import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { defaultGraphics, normalizeGraphics, type GraphicsSettings } from './graphics-settings';

/** A fixed, user-controlled rendering pipeline. No automatic quality reductions. */
export function createGarageRendering(
  renderer: T.WebGLRenderer,
  scene: T.Scene,
  camera: T.PerspectiveCamera,
  host: HTMLElement,
) {
  let settings = normalizeGraphics(defaultGraphics);
  const display = host.ownerDocument?.defaultView;
  const renderDpr = () => Math.max(1, display?.devicePixelRatio || 1) * settings.renderScale;
  const gl = renderer.getContext();
  let supportedMsaa = 0;
  if ('getInternalformatParameter' in gl) {
    // Half-float color buffers can support fewer samples than the GPU's global limit.
    const supportedSamples = (format: number) =>
      Array.from(
        (gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) as Int32Array | null) ??
          [],
      );
    const colorSamples = supportedSamples(gl.RGBA16F);
    const depthSamples = supportedSamples(gl.DEPTH_COMPONENT24);
    const sampleLimit = Math.min(4, renderer.capabilities.maxSamples);
    supportedMsaa = Math.max(
      0,
      ...colorSamples.filter((n) => n <= sampleLimit && depthSamples.includes(n)),
    );
  }
  const msaaSamples = () =>
    settings.antialias === 'both' || settings.antialias === 'msaa' ? supportedMsaa : 0;
  let samples = msaaSamples();
  const target = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    samples,
  });
  const composer = new EffectComposer(renderer, target);
  const beauty = new RenderPass(scene, camera);
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({
    radius: 0.38,
    samples: 8,
    distanceExponent: 1.5,
    thickness: 0.15,
  });
  ao.updatePdMaterial({
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 4,
    samples: 8,
  });
  ao.blendIntensity = 0.38;
  // The normal override must not turn transparent foliage into solid rectangles.
  const aoExcluded: T.Object3D[] = [];
  const textures = new Set<T.Texture>();
  const materials = new Set<T.Material>();
  const shadows = new Set<T.LightShadow>();
  const shadowBaselines = new WeakMap<T.LightShadow, T.Vector2>();
  const aoRender = ao.render.bind(ao);
  ao.render = (...args) => {
    const hidden = aoExcluded.filter((object) => object.visible);
    for (const object of hidden) object.visible = false;
    try {
      aoRender(...args);
    } finally {
      for (const object of hidden) object.visible = true;
    }
  };
  const setAOSize = ao.setSize.bind(ao);
  ao.setSize = (w, h) =>
    setAOSize(Math.max(1, Math.round(w * 0.65)), Math.max(1, Math.round(h * 0.65)));
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.045, 0.25, 2.0);
  // SMAA also smooths alpha-tested foliage and edges introduced by postprocessing.
  // Three.js runs this pass in linear-sRGB, before OutputPass converts for display.
  const antialias = new SMAAPass();
  const output = new OutputPass();
  composer.addPass(beauty);
  composer.addPass(ao);
  composer.addPass(bloom);
  composer.addPass(antialias);
  composer.addPass(output);
  const pmrem = new T.PMREMGenerator(renderer),
    fallbackScene = new RoomEnvironment();
  let environment = pmrem.fromScene(fallbackScene, 0.06),
    sky: T.DataTexture | undefined,
    disposed = false;
  scene.environment = environment.texture;
  scene.environmentIntensity = settings.environmentIntensity;
  scene.background = new T.Color('#101b2f');
  fallbackScene.dispose();
  const ready = new HDRLoader()
    .loadAsync('/assets/garage/surfaces/kloofendal_overcast_puresky-hdri.hdr')
    .then((texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      // Regrade the existing cloud detail into an overcast night sky in linear light.
      // The same sky drives reflections, so surfaces cannot reflect a daylight sky.
      const pixels = texture.image.data as Uint16Array | Float32Array;
      const halfFloat = texture.type === T.HalfFloatType;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = halfFloat ? T.DataUtils.fromHalfFloat(pixels[i]) : pixels[i];
        const g = halfFloat ? T.DataUtils.fromHalfFloat(pixels[i + 1]) : pixels[i + 1];
        const b = halfFloat ? T.DataUtils.fromHalfFloat(pixels[i + 2]) : pixels[i + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const cloud = luminance / (1 + luminance);
        const night = [0.002 + cloud * 0.009, 0.004 + cloud * 0.016, 0.012 + cloud * 0.037];
        for (let channel = 0; channel < 3; channel++)
          pixels[i + channel] = halfFloat
            ? T.DataUtils.toHalfFloat(night[channel])
            : night[channel];
      }
      texture.needsUpdate = true;
      texture.mapping = T.EquirectangularReflectionMapping;
      const next = pmrem.fromEquirectangular(texture);
      environment.dispose();
      environment = next;
      sky = texture;
      scene.environment = next.texture;
      scene.background = texture;
      scene.backgroundIntensity = 1.0;
      scene.backgroundBlurriness = 0.035;
      scene.backgroundRotation.y = 0.7;
      scene.environmentRotation.y = 0.7;
    })
    .catch((error) => {
      if (!disposed) console.warn('Using the garage lighting fallback.', error);
    });
  let width = 1,
    height = 1,
    appliedDpr = 0;

  function describeRendering() {
    const aa = [samples ? `msaa-${samples}` : '', antialias.enabled ? 'smaa' : '']
      .filter(Boolean)
      .join('+');
    host.dataset.renderQuality = 'custom';
    host.dataset.renderDpr = String(appliedDpr);
    host.dataset.renderAntialias = aa || 'off';
    host.dataset.renderScale = String(settings.renderScale);
  }

  function resize(w: number, h: number) {
    const nextWidth = Math.max(1, w),
      nextHeight = Math.max(1, h),
      dpr = renderDpr();
    if (nextWidth === width && nextHeight === height && dpr === appliedDpr) return;
    const densityChanged = dpr !== appliedDpr;
    width = nextWidth;
    height = nextHeight;
    appliedDpr = dpr;
    // Resolution is a chosen fraction of native display density, including browser zoom.
    // No resize or frame-time path is allowed to overwrite the user's effect settings.
    if (densityChanged) {
      renderer.setPixelRatio(dpr);
      composer.setPixelRatio(dpr);
    }
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    describeRendering();
  }

  function applyTextureSettings() {
    const anisotropy = Math.min(settings.anisotropy, renderer.capabilities.getMaxAnisotropy());
    for (const texture of textures) {
      if (texture.anisotropy === anisotropy) continue;
      texture.anisotropy = anisotropy;
      // Keep authored min/mag filters and mipmaps, including the pixel CRT screens.
      texture.needsUpdate = true;
    }
  }

  function applyShadowSettings() {
    const enabled = settings.shadows !== 'off';
    const type = settings.shadows === 'sharp' ? T.BasicShadowMap : T.PCFShadowMap;
    let changed = renderer.shadowMap.enabled !== enabled || renderer.shadowMap.type !== type;
    renderer.shadowMap.enabled = enabled;
    renderer.shadowMap.type = type;
    for (const shadow of shadows) {
      const base = shadowBaselines.get(shadow)!;
      const extent = shadow.getFrameExtents();
      const maxSize = renderer.capabilities.maxTextureSize;
      const x = Math.max(
        1,
        Math.min(Math.floor(maxSize / extent.x), Math.round(base.x * settings.shadowResolution)),
      );
      const y = Math.max(
        1,
        Math.min(Math.floor(maxSize / extent.y), Math.round(base.y * settings.shadowResolution)),
      );
      if (shadow.mapSize.x === x && shadow.mapSize.y === y) continue;
      shadow.mapSize.set(x, y);
      // Three does not resize an existing shadow map just because mapSize changed.
      // Retire both attachments; the next shadow render rebuilds them at the new size.
      shadow.map?.depthTexture?.dispose();
      shadow.map?.dispose();
      shadow.map = null;
      shadow.mapPass?.dispose();
      shadow.mapPass = null;
      shadow.needsUpdate = true;
      changed = true;
    }
    if (changed) {
      // Shadow sampler types differ between PCF and Basic; refresh material programs.
      for (const material of materials) material.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
    }
  }

  function setSettings(next: GraphicsSettings) {
    if (disposed) return;
    const previous = settings;
    settings = normalizeGraphics(next);
    ao.enabled = settings.ao;
    ao.blendIntensity = settings.aoIntensity;
    if (settings.aoRadius !== previous.aoRadius)
      ao.updateGtaoMaterial({ radius: settings.aoRadius });
    bloom.enabled = settings.bloom;
    bloom.strength = settings.bloomStrength;
    bloom.radius = settings.bloomRadius;
    bloom.threshold = settings.bloomThreshold;
    antialias.enabled = settings.antialias === 'both' || settings.antialias === 'smaa';
    renderer.toneMappingExposure = settings.exposure;
    renderer.toneMapping = {
      aces: T.ACESFilmicToneMapping,
      neutral: T.NeutralToneMapping,
      none: T.NoToneMapping,
    }[settings.toneMapping];
    scene.environmentIntensity = settings.environmentIntensity;
    if (scene.fog instanceof T.FogExp2) scene.fog.density = settings.fogDensity;
    if (settings.anisotropy !== previous.anisotropy) applyTextureSettings();
    if (
      settings.shadows !== previous.shadows ||
      settings.shadowResolution !== previous.shadowResolution
    )
      applyShadowSettings();
    if (appliedDpr && renderDpr() !== appliedDpr) resize(width, height);
    const nextSamples = msaaSamples();
    if (samples !== nextSamples) {
      samples = nextSamples;
      // Sample counts are attachment properties: rebuild only the composer targets.
      // reset() disposes both old targets and preserves all effect passes/uniforms.
      composer.reset(
        new T.WebGLRenderTarget(
          Math.max(1, width * (appliedDpr || renderDpr())),
          Math.max(1, height * (appliedDpr || renderDpr())),
          { type: T.HalfFloatType, samples },
        ),
      );
    }
    describeRendering();
  }

  function prepare() {
    // Assets may arrive after saved settings were applied. Re-scan without duplicate
    // exclusions, and always derive shadow dimensions from the authored baseline.
    aoExcluded.length = 0;
    textures.clear();
    materials.clear();
    shadows.clear();
    scene.traverse((object) => {
      const drawable = object as T.Mesh;
      const sprite = (object as T.Sprite).isSprite;
      if (drawable.isMesh || sprite) {
        const objectMaterials = Array.isArray(drawable.material)
          ? drawable.material
          : [drawable.material];
        if (sprite || objectMaterials.some((m) => m.transparent || m.alphaTest > 0))
          aoExcluded.push(object);
        for (const material of objectMaterials) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value instanceof T.Texture) textures.add(value);
        }
      }
      const light = object as T.Light & { shadow?: T.LightShadow };
      if (light.isLight && light.shadow) {
        const shadow = light.shadow;
        if (!shadowBaselines.has(shadow)) shadowBaselines.set(shadow, shadow.mapSize.clone());
        shadows.add(shadow);
      }
    });
    applyTextureSettings();
    applyShadowSettings();
    setSettings(settings);
  }

  return {
    ready,
    resize,
    prepare,
    setSettings,
    render() {
      // Moving between displays can change density without changing the CSS viewport.
      if (renderDpr() !== appliedDpr) resize(width, height);
      composer.render();
    },
    dispose() {
      disposed = true;
      beauty.dispose();
      ao.dispose();
      bloom.dispose();
      antialias.dispose();
      output.dispose();
      composer.dispose();
      environment.dispose();
      sky?.dispose();
      pmrem.dispose();
      scene.environment = null;
      scene.background = null;
    },
  };
}
