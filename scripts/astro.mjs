import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('astro/package.json')), 'bin/astro.mjs');
const commands = process.argv.slice(2);
if (!commands.length || commands.some((command) => !['check', 'build'].includes(command))) {
  throw new Error('Usage: node scripts/astro.mjs check [build]');
}
for (const command of commands) {
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, command], {
      stdio: 'inherit',
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    child.once('error', reject);
    child.once('exit', (status) => done(status ?? 1));
  });
  if (code) process.exit(code);
}
