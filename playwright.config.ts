import { defineConfig } from '@playwright/test';
import process from 'node:process';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Use the full browser's native Escape/capture lifecycle, including headless runs.
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:4179',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run preview',
    env: { PORT: '4179' },
    url: 'http://127.0.0.1:4179/',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
