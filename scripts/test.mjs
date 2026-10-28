import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../tests/', import.meta.url);
const suites = (await readdir(directory)).filter((name) => name.endsWith('-contract.mjs')).sort();
let failed = 0;
for (const suite of suites) {
  console.log(`\n${suite}`);
  const status = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(suite, directory))], {
      stdio: 'inherit',
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    child.once('error', reject);
    child.once('exit', (code) => done(code ?? 1));
  });
  if (status) failed += 1;
}
console.log(`\n${suites.length - failed}/${suites.length} contract suites passed.`);
process.exitCode = failed ? 1 : 0;
