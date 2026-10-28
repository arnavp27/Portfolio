import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';

const rawOrigin = process.env.PUBLIC_SITE_URL;
assert(rawOrigin, 'Set PUBLIC_SITE_URL to the live HTTPS origin before publishing.');
const origin = new URL(rawOrigin);
assert(
  origin.protocol === 'https:' &&
    !origin.username &&
    !origin.password &&
    !origin.port &&
    origin.pathname === '/' &&
    !origin.search &&
    !origin.hash,
  'PUBLIC_SITE_URL must be a public HTTPS origin without credentials, port or path.',
);
assert(
  !['localhost', '127.0.0.1', '::1', '[::1]'].includes(origin.hostname),
  'Use the public site address.',
);

const root = resolve('dist');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        assert(!entry.isSymbolicLink(), `Unexpected symlink: ${path}`);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}
const paths = await files(root);
assert(paths.length <= 20_000, 'Cloudflare Pages Free allows 20,000 static files per deployment.');
let bytes = 0;
for (const path of paths) {
  const info = await stat(path);
  assert(info.size <= 25 * 1024 * 1024, `Asset exceeds Cloudflare limit: ${relative(root, path)}`);
  bytes += info.size;
}
const html = await readFile(join(root, 'index.html'), 'utf8');
const canonical = /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(html)?.[1];
assert.equal(
  canonical,
  `${origin.origin}/`,
  'Build PUBLIC_SITE_URL differs from the deploy origin; rebuild first.',
);
assert(
  html.includes(`${origin.origin}/assets/social/garage.jpg`),
  'Missing absolute social preview image.',
);
assert(
  !/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html),
  'Production homepage is marked noindex.',
);
assert(
  (await readFile(join(root, 'robots.txt'), 'utf8')).includes(`${origin.origin}/sitemap.xml`),
  'Missing sitemap URL.',
);
assert(
  (await readFile(join(root, 'sitemap.xml'), 'utf8')).includes(`<loc>${origin.origin}/</loc>`),
  'Sitemap does not match the public URL.',
);
await Promise.all(
  ['404.html', '_headers', '_redirects', 'assets/social/garage.jpg'].map((path) =>
    stat(join(root, path)),
  ),
);
console.log(
  `Deployment check passed: ${paths.length} files, ${(bytes / 1_000_000).toFixed(2)} MB, ${origin.origin}`,
);
