import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import ts from 'typescript';
import { optimizeDirectLighting } from '../src/lib/garage/direct-lighting.ts';

const include = '#include <lights_fragment_begin>';
const suffix = '|garage-bounded-direct-v1';
const guard = 'if ( directLight.visible ) ';
function compile(material, fragmentShader = include, renderer = {}) {
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(shader, renderer);
  return shader;
}
function guardedChunk() {
  const material = new THREE.MeshStandardMaterial();
  optimizeDirectLighting(material);
  return compile(material).fragmentShader;
}

await test('only the installed point/spot direct-light calls gain a visibility guard', () => {
  const original = THREE.ShaderChunk.lights_fragment_begin;
  const result = guardedChunk();
  assert.equal(result.split(guard).length - 1, 2);
  assert.equal(
    result.replaceAll(guard, ''),
    original,
    'Light, shadow and all other shader code is identical',
  );
  for (const kind of ['POINT', 'SPOT']) {
    const start = result.indexOf(`for ( int i = 0; i < NUM_${kind}_LIGHTS; i ++ )`);
    const end = result.indexOf('#pragma unroll_loop_end', start);
    assert(start >= 0 && end > start);
    assert.equal(result.slice(start, end).split(guard).length - 1, 1);
  }
  const otherLights = result.slice(result.indexOf('#if ( NUM_SUN_LIGHTS > 0 )'));
  assert(
    !otherLights.includes(guard),
    'Sun, directional, area and indirect lighting are unchanged',
  );
  assert.equal(
    THREE.ShaderChunk.lights_fragment_begin,
    original,
    'The global Three shader is untouched',
  );
});

await test('standard/physical hooks preserve this, renderer, custom shader edits and dynamic cache keys', () => {
  for (const Constructor of [THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial]) {
    const material = new Constructor();
    material.userData.variant = 'dry';
    const renderer = { identity: 'renderer' };
    let calls = 0;
    material.onBeforeCompile = function (shader, receivedRenderer) {
      assert.equal(this, material);
      assert.equal(receivedRenderer, renderer);
      calls++;
      shader.vertexShader += '\n// authored vertex change';
      shader.fragmentShader = '// authored fragment change\n' + shader.fragmentShader;
      shader.uniforms.authored = { value: 0.75 };
    };
    material.customProgramCacheKey = function () {
      assert.equal(this, material);
      return `weather:${this.userData.variant}`;
    };
    const version = material.version;
    optimizeDirectLighting(material);
    const hook = material.onBeforeCompile,
      key = material.customProgramCacheKey;
    optimizeDirectLighting(material);
    assert.equal(material.onBeforeCompile, hook);
    assert.equal(material.customProgramCacheKey, key);
    assert.equal(
      material.version,
      version + 1,
      'Install invalidates an existing program exactly once',
    );
    assert.equal(material.customProgramCacheKey(), 'weather:dry' + suffix);
    material.userData.variant = 'wet';
    assert.equal(material.customProgramCacheKey(), 'weather:wet' + suffix);
    const shader = compile(material, include, renderer);
    assert.equal(calls, 1);
    assert(shader.vertexShader.endsWith('// authored vertex change'));
    assert(shader.fragmentShader.startsWith('// authored fragment change'));
    assert.equal(shader.uniforms.authored.value, 0.75);
    assert.equal(shader.fragmentShader.split(guard).length - 1, 2);
  }
});

await test('default cache keys retain the original compile hook identity instead of the shared wrapper', () => {
  const first = new THREE.MeshStandardMaterial(),
    second = new THREE.MeshStandardMaterial();
  first.onBeforeCompile = function firstShader(shader) {
    shader.uniforms.first = { value: 1 };
  };
  second.onBeforeCompile = function secondShader(shader) {
    shader.uniforms.second = { value: 2 };
  };
  const firstKey = first.customProgramCacheKey(),
    secondKey = second.customProgramCacheKey();
  optimizeDirectLighting(first);
  optimizeDirectLighting(second);
  assert.equal(first.customProgramCacheKey(), firstKey + suffix);
  assert.equal(second.customProgramCacheKey(), secondKey + suffix);
  assert.notEqual(first.customProgramCacheKey(), second.customProgramCacheKey());
  assert.equal(
    first.onBeforeCompile.toString(),
    second.onBeforeCompile.toString(),
    'Shared wrapper text cannot identify the original hooks',
  );
});

await test('the real city weather shader and its cache key compose without losing surface changes', () => {
  const text = readFileSync(
    new URL('../src/lib/garage/city/materials.ts', import.meta.url),
    'utf8',
  );
  const source = ts.createSourceFile('materials.ts', text, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'weather',
  );
  assert(declaration, 'Use the production weather hook');
  const exports = {};
  const { outputText } = ts.transpileModule('export ' + declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  Function('exports', outputText)(exports);
  const material = exports.weather(new THREE.MeshStandardMaterial(), 'asphalt');
  const expected = compile(material, THREE.ShaderLib.standard.fragmentShader);
  const oldKey = material.customProgramCacheKey();
  assert(expected.fragmentShader.includes('float dampPatch='));
  optimizeDirectLighting(material);
  const actual = compile(material, THREE.ShaderLib.standard.fragmentShader);
  assert.equal(actual.vertexShader, expected.vertexShader);
  assert.equal(actual.fragmentShader.replace(guardedChunk(), include), expected.fragmentShader);
  assert.equal(material.customProgramCacheKey(), oldKey + suffix);
});

await test('unlit and unsupported custom shader models remain untouched', () => {
  for (const material of [
    new THREE.MeshBasicMaterial(),
    new THREE.MeshNormalMaterial(),
    new THREE.MeshDepthMaterial(),
    new THREE.LineBasicMaterial(),
    new THREE.SpriteMaterial(),
    new THREE.ShaderMaterial({ lights: true }),
  ]) {
    const hook = material.onBeforeCompile,
      key = material.customProgramCacheKey,
      version = material.version;
    optimizeDirectLighting(material);
    assert.equal(material.onBeforeCompile, hook);
    assert.equal(material.customProgramCacheKey, key);
    assert.equal(material.version, version);
  }
});

await test('a material hook that removes the lighting include fails explicitly', () => {
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = 'void main() {}';
  };
  optimizeDirectLighting(material);
  assert.throws(
    () => compile(material),
    /expected one lights_fragment_begin include after the material hook/,
  );
});

await test('incompatible Three shader layout fails explicitly instead of silently disabling optimization', async () => {
  const original = THREE.ShaderChunk.lights_fragment_begin;
  try {
    THREE.ShaderChunk.lights_fragment_begin = original.replace(
      'i < NUM_POINT_LIGHTS;',
      'i < RENAMED_POINT_LIGHTS;',
    );
    await assert.rejects(
      import(
        new URL('../src/lib/garage/direct-lighting.ts?missing-point-loop', import.meta.url).href
      ),
      /Unsupported Three.js direct-light shader layout: expected one NUM_POINT_LIGHTS loop/,
    );
    THREE.ShaderChunk.lights_fragment_begin = original.replace(
      'RE_Direct( directLight,',
      'CHANGED_DIRECT( directLight,',
    );
    await assert.rejects(
      import(
        new URL('../src/lib/garage/direct-lighting.ts?changed-direct-call', import.meta.url).href
      ),
      /Unsupported Three.js direct-light shader layout: NUM_POINT_LIGHTS evaluation changed/,
    );
  } finally {
    THREE.ShaderChunk.lights_fragment_begin = original;
  }
});
