import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('entry and pause sleep; resize redraws; play and resume animate', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Enter garage/ })).toBeVisible({
    timeout: 45_000,
  });
  const canvas = page.locator('.workshop-canvas');

  // Observe continuously: attaching a new observer for each polling window can
  // miss slow software-rendered frames completed between those windows.
  const draws = await canvas.evaluateHandle((element) => {
    let completed = 0;
    const observer = new MutationObserver((records) => {
      completed += records.length;
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['data-camera-position'],
    });
    return {
      count() {
        completed += observer.takeRecords().length;
        return completed;
      },
      disconnect() {
        observer.disconnect();
      },
    };
  });
  const completedDraws = () => draws.evaluate((observer) => observer.count());
  const observedDraws = async (duration: number) => {
    const before = await completedDraws();
    await page.waitForTimeout(duration);
    return (await completedDraws()) - before;
  };
  const expectAnimation = async () => {
    const before = await completedDraws();
    // This checks continued progress, not a minimum FPS. Every completed draw
    // since the checkpoint counts, including those between polling calls.
    await expect
      .poll(async () => (await completedDraws()) - before, { timeout: 15_000 })
      .toBeGreaterThan(1);
  };

  try {
    expect(await observedDraws(600)).toBe(0);
    const oldWidth = await canvas.locator('canvas').getAttribute('width');
    await page.setViewportSize({ width: 1120, height: 720 });
    await expect(canvas.locator('canvas')).not.toHaveAttribute('width', oldWidth!);
    // Resizing an idle scene can request a one-off draw, but must not restart play.
    await expect(page.getByRole('button', { name: /^Enter garage/ })).toBeVisible();
    await expect.poll(() => observedDraws(400)).toBe(0);

    await page.getByRole('button', { name: /^Enter garage/ }).click();
    await expect(canvas).toHaveAttribute('data-play-state', 'room');
    await expectAnimation();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Garage menu', exact: true })).toBeVisible();
    await expect.poll(() => observedDraws(400)).toBe(0);

    await page.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-play-state', 'room');
    await expectAnimation();
  } finally {
    await draws.evaluate((observer) => observer.disconnect());
    await draws.dispose();
  }
});
