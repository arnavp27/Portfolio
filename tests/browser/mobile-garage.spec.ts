import { expect, test, type Locator } from '@playwright/test';

test.describe('phone-sized touch exploration', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('readable entry, both computers, project documents, and touch-only return', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:4179/') && response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const fitsViewport = async () => {
      expect(
        await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth + 1),
        'The phone page must not scroll sideways',
      ).toBe(true);
    };
    const tapTarget = async (target: Locator) => {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      // Measure the visible, camera-projected target, not its untransformed CSS size.
      // A 44px control on the CRT maps to about 42px at this phone viewport.
      expect(box!.width, 'Visible touch target width').toBeGreaterThanOrEqual(40);
      expect(box!.height, 'Visible touch target height').toBeGreaterThanOrEqual(40);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(391);
      expect(box!.y + box!.height).toBeLessThanOrEqual(845);
    };
    const readDocument = async (window: Locator, text: string, screenshot: string) => {
      const content = window.locator('.os-window-content');
      await expect(content).toContainText(text);
      const documentBox = await content.boundingBox();
      expect(documentBox).not.toBeNull();
      expect(
        documentBox!.height,
        'Touch controls must leave a usable reading area on the projected CRT',
      ).toBeGreaterThanOrEqual(110);
      const firstParagraph = content.locator('.os-document p').first();
      await firstParagraph.scrollIntoViewIfNeeded();
      await expect(firstParagraph).toBeInViewport({ ratio: 0.5 });
      expect(
        await content.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        'Document text should wrap inside the phone-sized computer',
      ).toBe(true);
      await testInfo.attach(screenshot, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      // A short CRT must still expose the full article through its scrollable document.
      const lastParagraph = content.locator('.os-document p').last();
      await lastParagraph.scrollIntoViewIfNeeded();
      await expect(lastParagraph).toBeInViewport({ ratio: 0.5 });
      const close = window.getByRole('button', { name: /^Close / });
      await tapTarget(close);
      await close.tap();
      await expect(window).toBeHidden();
    };

    await page.goto('/');
    const readProjects = page.getByRole('link', { name: 'Read projects' });
    await tapTarget(readProjects);
    await readProjects.tap();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.locator('main h1')).toBeVisible();
    await fitsViewport();
    await page.goBack();
    const enter = page.getByRole('button', { name: 'Enter garage' });
    await expect(enter).toBeVisible();
    await enter.tap();

    const canvas = page.locator('.workshop-canvas');
    await expect(canvas).toHaveAttribute('data-control-mode', 'guided');
    await expect(canvas).toHaveAttribute('data-play-state', 'room');
    await expect(page.locator('.garage-reticle')).toHaveCount(0);
    const navigation = page.getByRole('navigation', { name: 'Walk to a corner' });
    await tapTarget(navigation.getByRole('button', { name: 'Work desk', exact: true }));
    await navigation.getByRole('button', { name: 'Work desk', exact: true }).tap();
    await fitsViewport();

    for (const [computer, dialog, desktopClass] of [
      ['Work computer', 'Using the Kazam work computer', '.work-desktop'],
      ['Personal computer', 'Using Arnav’s personal computer', '.personal-desktop'],
    ]) {
      await page.getByRole('button', { name: 'Pause and open menu' }).tap();
      await page.getByRole('button', { name: new RegExp(`^${computer}`) }).tap();
      await expect(canvas).toHaveAttribute('data-computer-phase', 'using');
      await expect(page.getByRole('dialog', { name: dialog, exact: true })).toBeVisible();
      const desktop = page.locator(`${desktopClass}:not([hidden])`);
      await expect(desktop).toBeVisible();
      await fitsViewport();

      if (computer === 'Work computer') {
        const launcher = desktop.getByRole('button', { name: 'My work', exact: true });
        await tapTarget(launcher);
        await launcher.tap();
        const work = desktop.getByRole('region', { name: 'Kazam — work.txt window', exact: true });
        await readDocument(work, 'sole engineer on the project', 'phone-work-computer');
      } else {
        await desktop.getByRole('button', { name: 'Projects', exact: true }).tap();
        const projects = desktop.getByRole('region', { name: 'Projects window', exact: true });
        await projects.getByRole('button', { name: /^OncoEdge/ }).tap();
        const project = desktop.getByRole('region', { name: 'OncoEdge window', exact: true });
        await readDocument(
          project,
          'oral-lesion imaging research project',
          'phone-personal-computer',
        );
        await projects.getByRole('button', { name: 'Close Projects', exact: true }).tap();
        await expect(projects).toBeHidden();
      }

      const start = desktop.getByRole('button', { name: 'Start', exact: true });
      await tapTarget(start);
      await start.tap();
      const stepAway = desktop.locator('.os-start-menu').getByRole('button', { name: 'Step away' });
      await stepAway.scrollIntoViewIfNeeded();
      await tapTarget(stepAway);
      await stepAway.tap();
      await expect(canvas).toHaveAttribute('data-computer-phase', 'room');
      await expect(canvas).toHaveAttribute('data-play-state', 'room');
      await expect(navigation).toBeVisible();
      await fitsViewport();
    }
    expect(failures).toEqual([]);
  });
});
