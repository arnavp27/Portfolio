import * as THREE from 'three';
import type { SceneKit } from './types';
type SurfaceMaps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
type Weather = 'wall' | 'paving' | 'asphalt' | 'wood' | 'none';

/** Meter-scale weathering supplements, rather than replaces, scanned surface detail. */
function weather(material: THREE.MeshStandardMaterial, kind: Weather) {
  if (kind === 'none') return material;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 vSurfacePosition;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
      vec4 surfacePosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
      #endif
      vSurfacePosition = (modelMatrix * surfacePosition).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vSurfacePosition;
      float surfaceHash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float surfaceNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);
      }`,
    );
    const wall = `float surfaceVariation=surfaceNoise(vSurfacePosition.xz*.38+vSurfacePosition.y*.06);
      float dampBase=(1.0-smoothstep(.12,.72,vSurfacePosition.y))*(.35+.65*surfaceVariation);
      float streaks=surfaceNoise(vec2(vSurfacePosition.x+vSurfacePosition.z,vSurfacePosition.y*.065)*3.0);
      diffuseColor.rgb *= .94+.10*surfaceVariation;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.48,.55,.43),dampBase*.28);
      diffuseColor.rgb *= 1.0-smoothstep(.65,.90,streaks)*.06;`;
    const ground = `float surfaceVariation=surfaceNoise(vSurfacePosition.xz*.43)*.62+surfaceNoise(vSurfacePosition.xz*1.71)*.38;
      float dampPatch=smoothstep(.48,.77,surfaceVariation);
      diffuseColor.rgb *= mix(1.0,.71,dampPatch);
      ${kind === 'asphalt' ? 'float wheel=pow(abs(sin((vSurfacePosition.z-17.65)*3.14159/1.5)),18.0);diffuseColor.rgb *= 1.0-wheel*.045;' : ''}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${kind === 'wall' ? wall : kind === 'wood' ? 'diffuseColor.rgb *= .92+.12*surfaceNoise(vSurfacePosition.xy*.6);' : ground}`,
    );
    if (kind === 'paving' || kind === 'asphalt')
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
      roughnessFactor=mix(max(.68,roughnessFactor),.27,dampPatch*.85);`,
      );
  };
  material.customProgramCacheKey = () => `koramangala-surface-${kind}-1`;
  return material;
}

export async function createCityMaterials(kit: SceneKit) {
  const loader = new THREE.TextureLoader();
  const definitions = {
    plaster: ['painted_plaster_wall', 2],
    brick: ['brick_wall_001', 3],
    roof: ['clay_roof_tiles', 4],
    paving: ['rectangular_paving', 2],
    asphalt: ['asphalt_03', 2.05],
    wood: ['dark_wood', 2],
    bark: ['bark_brown_02', 1],
  } as const;
  const entries = await Promise.all(
    Object.entries(definitions).map(async ([key, [name, metres]]) => {
      const channels = await Promise.all(
        ['Diffuse', 'nor_gl', 'Rough'].map(async (channel, index) => {
          const texture = await loader.loadAsync(`/assets/garage/surfaces/${name}-${channel}.jpg`);
          texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          // Architectural UVs represent two metres; use the source's photographed dimensions.
          texture.repeat.setScalar(2 / metres);
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.anisotropy = 8;
          kit.maps.add(texture);
          return texture;
        }),
      );
      return [
        key,
        { map: channels[0], normalMap: channels[1], roughnessMap: channels[2] },
      ] as const;
    }),
  );
  const maps = Object.fromEntries(entries) as Record<keyof typeof definitions, SurfaceMaps>;
  function finish(
    source: SurfaceMaps,
    color: string,
    roughness: number,
    relief: number,
    kind: Weather = 'none',
  ) {
    const material = weather(
      new THREE.MeshStandardMaterial({
        ...source,
        color,
        roughness,
        normalScale: new THREE.Vector2(relief, relief),
      }),
      kind,
    );
    kit.mats.add(material);
    return material;
  }
  function lit(color: string, intensity: number) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.45,
    });
    kit.mats.add(material);
    return material;
  }
  const bulb = new THREE.MeshBasicMaterial({ color: '#ffe6b1', toneMapped: false });
  kit.mats.add(bulb);
  const wood = finish(maps.wood, '#aca492', 0.82, 0.22, 'wood');
  for (const texture of Object.values(maps.wood)) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 2;
  }
  return {
    cream: finish(maps.plaster, '#e6d5b4', 0.96, 0.26, 'wall'),
    sage: finish(maps.plaster, '#98ab9a', 0.96, 0.26, 'wall'),
    pink: finish(maps.plaster, '#bfa59b', 0.96, 0.26, 'wall'),
    stone: finish(maps.plaster, '#c4bfac', 0.94, 0.45, 'wall'),
    brick: finish(maps.brick, '#c0b3a1', 0.96, 0.6, 'wall'),
    roof: finish(maps.roof, '#baa18c', 0.94, 0.65),
    paving: finish(maps.paving, '#b9b5a4', 0.93, 0.48, 'paving'),
    sidewalk: finish(maps.paving, '#a0aaa3', 0.97, 0.42, 'paving'),
    asphalt: finish(maps.asphalt, '#7d8a90', 0.94, 0.38, 'asphalt'),
    wood,
    bark: finish(maps.bark, '#9b9f87', 1, 0.7),
    iron: kit.mat('#263b35', 0.52, 0.55),
    steel: kit.mat('#a1aaa8', 0.32, 0.82),
    rubber: kit.mat('#171f20', 0.94),
    dark: kit.mat('#172724'),
    clay: finish(maps.plaster, '#a7684b', 0.95, 0.38),
    soil: kit.mat('#343b28'),
    glass: kit.mat('#617b80', 0.22, 0.3),
    bulb,
    curtain: kit.mat('#b3ad95'),
    paint: kit.mat('#d6d0ba'),
    gold: kit.mat('#a99568', 0.42, 0.72),
    lit,
  };
}
export type CityMaterials = Awaited<ReturnType<typeof createCityMaterials>>;
