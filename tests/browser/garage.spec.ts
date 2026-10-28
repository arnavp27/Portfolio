import { expect, test } from '@playwright/test';
import { defaultGraphics, GRAPHICS_STORAGE_KEY } from '../../src/lib/garage/graphics-settings';

test.describe('touch-guided garage', () => {
  test.use({ hasTouch: true });
  test('garage entry, Escape menu, both computers, and local assets', async ({ page }) => {
    test.setTimeout(90_000);
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:4179/') && response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Preferences saved by the former public editor must not change the live look.
    await page.addInitScript(
      ({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)),
      {
        key: GRAPHICS_STORAGE_KEY,
        settings: {
          renderScale: 0.3,
          antialias: 'off',
          rain: false,
          contrast: 1.4,
          saturation: 0,
          vignette: 0,
        },
      },
    );
    await page.goto('/');
    // Software GPU rendering has a separate, bounded first-frame startup budget.
    await expect(page.getByRole('button', { name: 'Enter garage' })).toBeVisible({
      timeout: 45_000,
    });
    // Touch entry selects guided mode automatically. Native desktop capture and
    // rejected/late grants have separate production-handler contracts.
    await page.getByRole('button', { name: 'Enter garage' }).click();
    const canvas = page.locator('.workshop-canvas');
    await expect(canvas).toHaveAttribute('data-play-state', 'room');
    await expect(canvas).toHaveAttribute('data-control-mode', 'guided');
    await expect(canvas).toHaveAttribute('data-graphics-settings', JSON.stringify(defaultGraphics));
    await expect(page.locator('.garage-vignette')).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Garage menu', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Graphics & display/ })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Graphics settings' })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Music volume' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Sound effects volume' })).toBeVisible();
    const motion = page.getByRole('button', { name: 'Reduced motion on' });
    await expect(motion).toHaveAttribute('aria-pressed', 'true');
    await motion.click();
    await expect(page.getByRole('button', { name: 'Reduce motion', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.getByRole('button', { name: 'Reduce motion', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Garage menu', exact: true })).toBeHidden();
    for (const [button, dialog] of [
      ['Work computer', 'Using the Kazam work computer'],
      ['Personal computer', 'Using Arnav’s personal computer'],
    ]) {
      await page.getByRole('button', { name: 'Pause and open menu' }).click();
      await page.getByRole('button', { name: new RegExp(`^${button}`) }).click();
      await expect(canvas).toHaveAttribute('data-computer-phase', 'using');
      await expect(page.getByRole('dialog', { name: dialog, exact: true })).toBeVisible();
      await expect(
        page.locator('.computer-desktop:not([hidden]) .os-desktop-icon').first(),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(canvas).toHaveAttribute('data-computer-phase', 'room');
      await expect(canvas).toHaveAttribute('data-play-state', 'room');
    }
    expect(failures).toEqual([]);
  });
});

test('old garage URL redirects to the homepage', async ({ page }) => {
  await page.goto('/camera-workshop/');
  await expect(page).toHaveURL('http://127.0.0.1:4179/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Arnav Patil');
});

test.describe('mobile reading without JavaScript', () => {
  test.use({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  test('projects remain available and fit the screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.no-scene-content')).toBeVisible();
    await page.locator('.no-scene-content a[href="/work/kazam/"]').click();
    await expect(page).toHaveURL(/\/work\/kazam\/$/);
    await expect(page.locator('main h1')).toBeVisible();
    const fits = await page
      .locator('body')
      .evaluate((body) => body.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  });
});
