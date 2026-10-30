import { Material, ShaderChunk, type MeshStandardMaterial } from 'three';

const include = '#include <lights_fragment_begin>';
const cacheSuffix = '|garage-bounded-direct-v1';
const optimized = new WeakSet<Material>();

function guardLightLoop(source: string, kind: 'POINT' | 'SPOT') {
  const count = `NUM_${kind}_LIGHTS`;
  const loop = new RegExp(
    String.raw`(for \( int i = 0; i < ${count}; i \+\+ \) \{)([\s\S]*?)(\n\t\}\s*\n\t#pragma unroll_loop_end)`,
    'g',
  );
  const directCall = /^([ \t]*)(RE_Direct\( directLight,[^\n;]*\);)$/gm;
  const lightInfo = kind === 'POINT' ? 'getPointLightInfo' : 'getSpotLightInfo';
  let loops = 0;
  const result = source.replace(loop, (_match, start: string, body: string, end: string) => {
    loops++;
    if (Array.from(body.matchAll(directCall)).length !== 1 || !body.includes(`${lightInfo}(`))
      throw new Error(
        `Unsupported Three.js direct-light shader layout: ${count} evaluation changed.`,
      );
    return start + body.replace(directCall, '$1if ( directLight.visible ) $2') + end;
  });
  if (loops !== 1)
    throw new Error(`Unsupported Three.js direct-light shader layout: expected one ${count} loop.`);
  return result;
}

// Validate the installed shader once. A Three upgrade must not silently drop the guard.
const guardedLights = guardLightLoop(
  guardLightLoop(ShaderChunk.lights_fragment_begin, 'POINT'),
  'SPOT',
);

/** Skip zero-contribution point/spot BRDF work without changing light or shadow inputs. */
export function optimizeDirectLighting(material: Material) {
  // Physical materials inherit this flag; custom/unlit shader models are deliberately untouched.
  if (!(material as MeshStandardMaterial).isMeshStandardMaterial || optimized.has(material)) return;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  // Three's default key reads this.onBeforeCompile. Capture the original hook identity
  // before wrapping it, otherwise unrelated custom shaders would share our wrapper's key.
  const defaultKey =
    previousCacheKey === Material.prototype.customProgramCacheKey
      ? previousCompile.toString()
      : undefined;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    if (shader.fragmentShader.split(include).length !== 2)
      throw new Error(
        'Cannot optimize direct lighting: expected one lights_fragment_begin include after the material hook.',
      );
    shader.fragmentShader = shader.fragmentShader.replace(include, guardedLights);
  };
  material.customProgramCacheKey = function () {
    return (defaultKey ?? previousCacheKey.call(this)) + cacheSuffix;
  };
  optimized.add(material);
  material.needsUpdate = true;
}
