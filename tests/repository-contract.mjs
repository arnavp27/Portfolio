import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(root, 'public');
const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });

for (const path of [
  'versions',
  'SDI',
  'art-source',
  'docs/concepts',
  'docs/previews',
  'public/classic',
  'public/indie',
  'public/assets/pixel-workshop',
  'public/assets/workshop',
  'public/assets/camera-room',
]) {
  assert(
    !existsSync(join(root, path)),
    `Historical/source material belongs outside the publishable repository: ${path}`,
  );
}
for (const file of files(join(root, 'src'))) {
  if (!['.ts', '.tsx', '.astro', '.css', '.md', '.json'].includes(extname(file))) continue;
  const source = readFileSync(file, 'utf8');
  assert(
    !/(?:lib\/(?:camera-room|workshop|pixel)\/|assets\/(?:camera-room|pixel-workshop|workshop)\/|ImmersiveWorkshop|active-design\.json)/.test(
      source,
    ),
    `Retired runtime reference in ${relative(root, file)}`,
  );
  for (const match of source.matchAll(/\/assets\/[^\s'"`()<>]+/g)) {
    const url = match[0].split(/[?#]/)[0];
    // Runtime templates are validated through their source manifests or in the browser smoke test.
    if (url.includes('${') || !extname(url)) continue;
    const asset = resolve(publicRoot, `.${decodeURIComponent(url)}`);
    assert(asset.startsWith(`${publicRoot}/`) || asset.startsWith(`${publicRoot}\\`));
    assert(existsSync(asset), `Missing static asset ${url} referenced by ${relative(root, file)}`);
  }
}
for (const file of files(publicRoot).filter((path) => path.endsWith('.gltf'))) {
  const model = JSON.parse(readFileSync(file, 'utf8'));
  for (const resource of [...(model.buffers ?? []), ...(model.images ?? [])]) {
    if (!resource.uri || resource.uri.startsWith('data:')) continue;
    assert(
      !/^https?:/.test(resource.uri),
      `Model must work without remote asset requests: ${relative(root, file)}`,
    );
    assert(
      existsSync(resolve(file, '..', decodeURIComponent(resource.uri))),
      `Missing model dependency ${resource.uri} in ${relative(root, file)}`,
    );
  }
}
console.log(
  'PASS: archive boundaries, current runtime references, literal static asset paths, and local model dependencies.',
);
