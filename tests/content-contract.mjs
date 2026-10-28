import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Fixtures and generated output belong to a disposable site. The checkout's
// content and dist are never modified, even if the test or a build fails.
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(join(tmpdir(), 'garage-content-'));
const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('astro/package.json')), 'bin/astro.mjs');
const run = promisify(execFile);
const id = `contract-${randomUUID()}`;
const projectPath = join(fixture, 'src/content/projects', `${id}.md`);
const articlePath = join(fixture, 'src/content/articles', `${id}.md`);
const existingId = `${id}-existing`;
const draftId = `${id}-draft`;
const build = () =>
  run(process.execPath, [cli, 'build'], {
    cwd: fixture,
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: '1',
      PUBLIC_SITE_URL: 'https://portfolio.example.test/',
    },
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
const html = (path = 'index.html') => readFile(join(fixture, 'dist', path), 'utf8');
const absent = (path) => assert.rejects(access(join(fixture, 'dist', path)));
const article = (title, draft = false) =>
  `---\ntitle: "${title}"\ndescription: "Content regression fixture"\ndate: 2026-10-28\ndraft: ${draft}\n---\n\nFixture article body.\n`;

try {
  await Promise.all([
    cp(join(root, 'src'), join(fixture, 'src'), { recursive: true }),
    ...['astro.config.mjs', 'tsconfig.json', 'package.json'].map((name) =>
      cp(join(root, name), join(fixture, name)),
    ),
    symlink(join(root, 'node_modules'), join(fixture, 'node_modules'), 'junction'),
    symlink(join(root, 'public'), join(fixture, 'public'), 'junction'),
  ]);
  // Exercise extension of a site that already contains published writing.
  await writeFile(
    join(fixture, 'src/content/articles', `${existingId}.md`),
    article('EXISTING CONTRACT ARTICLE'),
    { flag: 'wx' },
  );
  await build();
  assert((await html()).includes('EXISTING CONTRACT ARTICLE'));
  assert((await html()).includes('href="/notes/"'));
  const initialHome = await html();
  assert(initialHome.includes('Read projects'), 'Healthy entry offers the readable project index');
  assert(initialHome.includes('rel="canonical" href="https://portfolio.example.test/"'));
  assert(initialHome.includes('property="og:url" content="https://portfolio.example.test/"'));
  assert(
    initialHome.includes(
      'property="og:image" content="https://portfolio.example.test/assets/social/garage.jpg"',
    ),
  );
  assert(initialHome.includes('name="twitter:card" content="summary_large_image"'));
  assert(
    !initialHome.includes('name="robots" content="noindex'),
    'Configured homepage is indexable',
  );
  assert(
    (await html('robots.txt')).includes('Sitemap: https://portfolio.example.test/sitemap.xml'),
  );
  assert((await html('404.html')).includes('name="robots" content="noindex, nofollow"'));
  assert(!(await html('404.html')).includes('rel="canonical"'));

  await writeFile(
    projectPath,
    '---\ntitle: "NEW CONTRACT PROJECT"\ncategory: "Test"\nzone: "projects"\nsummary: "Test addition"\norder: 99\nyear: "2026"\nrole: "Test"\ntags: []\n---\n\nFixture project body.\n',
    { flag: 'wx' },
  );
  await writeFile(articlePath, article('NEW CONTRACT ARTICLE'), { flag: 'wx' });
  await writeFile(
    join(fixture, 'src/content/articles', `${draftId}.md`),
    article('DRAFT CONTRACT ARTICLE', true),
    { flag: 'wx' },
  );
  await build();

  const home = await html();
  assert(home.includes('NEW CONTRACT PROJECT'), 'A new project reaches the garage content');
  assert(home.includes('NEW CONTRACT ARTICLE'), 'A new article reaches the garage content');
  assert(home.includes('EXISTING CONTRACT ARTICLE'), 'Existing writing remains published');
  assert(
    !home.includes('DRAFT CONTRACT ARTICLE'),
    'Draft content stays out of serialized UI and fallback HTML',
  );
  assert((await html(`work/${id}/index.html`)).includes('Fixture project body.'));
  assert((await html('work/index.html')).includes('NEW CONTRACT PROJECT'));
  assert((await html(`notes/${id}/index.html`)).includes('Fixture article body.'));
  assert((await html('notes/index.html')).includes('NEW CONTRACT ARTICLE'));
  await absent(`notes/${draftId}/index.html`);
  const sitemap = await html('sitemap.xml');
  assert(sitemap.includes(`<loc>https://portfolio.example.test/work/${id}/</loc>`));
  assert(sitemap.includes(`<loc>https://portfolio.example.test/notes/${id}/</loc>`));
  assert(sitemap.includes('<loc>https://portfolio.example.test/notes/</loc>'));
  assert(!sitemap.includes(draftId), 'Draft writing is also excluded from search discovery');
  assert(!sitemap.includes('/404'), 'Error pages are excluded from search discovery');
  assert(
    !sitemap.includes('/camera-workshop'),
    'Legacy redirect is excluded from search discovery',
  );
  assert(
    (await html(`work/${id}/index.html`)).includes(
      `rel="canonical" href="https://portfolio.example.test/work/${id}/"`,
    ),
  );

  await rm(projectPath);
  await rm(articlePath);
  await build();
  const restored = await html();
  assert(!restored.includes('NEW CONTRACT'));
  assert(restored.includes('EXISTING CONTRACT ARTICLE'));
  assert(
    restored.includes('href="/notes/"'),
    'Existing writing keeps its navigation after fixture removal',
  );
  await absent(`work/${id}/index.html`);
  await absent(`notes/${id}/index.html`);
  const restoredSitemap = await html('sitemap.xml');
  assert(!restoredSitemap.includes(`/work/${id}/`));
  assert(!restoredSitemap.includes(`/notes/${id}/`));
  assert(restoredSitemap.includes(`/notes/${existingId}/`));
  console.log(
    'PASS: isolated content extension, existing published articles, project index/routes, draft exclusion, removed entries, retained writing navigation, canonical/share metadata, robots, and published-only sitemap.',
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  await rm(fixture, { recursive: true, force: true });
}
