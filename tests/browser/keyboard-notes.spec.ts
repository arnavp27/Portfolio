import { expect, test, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { keyboardNoteIds, keyboardNotes } from '../../src/lib/garage/keyboard-notes';

type NoteStart = { offset: number; duration: number };
declare global {
  interface Window {
    keyboardNoteStarts: NoteStart[];
  }
}

async function view(page: Page) {
  const canvas = page.locator('.workshop-canvas');
  const data = await canvas.evaluate((element) => ({
    position: element.dataset.cameraPosition!.split(',').map(Number),
    target: element.dataset.cameraTarget!.split(',').map(Number),
  }));
  const rect = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(
    rect.width / rect.height < 0.9 ? 74 : 65,
    rect.width / rect.height,
  );
  camera.position.fromArray(data.position);
  camera.lookAt(new Vector3().fromArray(data.target));
  camera.updateMatrixWorld();
  return { camera, rect };
}

async function lookAtKeyboard(page: Page, position: Vector3) {
  const { camera, rect } = await view(page);
  const current = camera.getWorldDirection(new Vector3());
  const desired = position.clone().sub(camera.position).normalize();
  const yawDelta = Math.atan2(-current.x, -current.z) - Math.atan2(-desired.x, -desired.z);
  const dx = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)) / 0.003;
  const dy = (Math.asin(current.y) - Math.asin(desired.y)) / 0.003;
  const x = rect.x + rect.width * 0.35;
  const y = rect.y + rect.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const updated = await view(page);
      return updated.camera.getWorldDirection(new Vector3()).dot(desired);
    })
    .toBeGreaterThan(0.999);
}

test.describe('physical keyboard notes', () => {
  test.use({ hasTouch: true });
  test('both keyboards play individual samples through their actual 3D keycaps', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    let bankRequests = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/koi-mil-gaya-keyboard.mp3')) bankRequests++;
    });
    await page.addInitScript(() => {
      window.keyboardNoteStarts = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
        if (this.buffer && Math.abs(this.buffer.duration - 4.818) < 0.01 && duration !== undefined)
          window.keyboardNoteStarts.push({ offset, duration });
        return duration === undefined
          ? start.call(this, when, offset)
          : start.call(this, when, offset, duration);
      };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Enter garage/ })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole('button', { name: /^Enter garage/ }).click();
    const canvas = page.locator('.workshop-canvas');
    await expect(canvas).toHaveAttribute('data-play-state', 'room');
    let played = 0;
    for (const keyboard of [
      {
        button: 'Work desk',
        x: -1.22,
        y: 0.9,
        z: 1.09,
        width: 0.65,
        standing: '-1.200,1.640,2.050',
      },
      {
        button: 'Personal PC',
        x: 0,
        y: 0.895,
        z: -2.04,
        width: 0.68,
        standing: '0.120,1.640,-0.910',
      },
    ]) {
      await page
        .getByRole('navigation', { name: 'Walk to a corner' })
        .getByRole('button', { name: keyboard.button, exact: true })
        .click();
      await expect(canvas).toHaveAttribute('data-camera-position', keyboard.standing);
      await lookAtKeyboard(page, new Vector3(keyboard.x, keyboard.y + 0.04, keyboard.z));
      for (const [index, note] of keyboardNoteIds.entries()) {
        const { camera, rect } = await view(page);
        const point = new Vector3(
          keyboard.x + keyboard.width * (-0.345 + index * 0.23),
          keyboard.y + 0.0392,
          keyboard.z + 0.068,
        ).project(camera);
        const x = rect.x + ((point.x + 1) / 2) * rect.width;
        const y = rect.y + ((1 - point.y) / 2) * rect.height;
        expect(x).toBeGreaterThan(rect.x);
        expect(x).toBeLessThan(rect.x + rect.width);
        expect(y).toBeGreaterThan(rect.y);
        expect(y).toBeLessThan(rect.y + rect.height);
        await page.mouse.click(x, y);
        played++;
        await expect.poll(() => page.evaluate(() => window.keyboardNoteStarts.length)).toBe(played);
        const last = await page.evaluate(() => window.keyboardNoteStarts.at(-1)!);
        expect(last.offset).toBe(keyboardNotes[note].offset);
        expect(last.duration).toBe(keyboardNotes[note].duration);
        await expect(canvas).toHaveAttribute('data-play-state', 'room');
        await expect(page.locator('.computer-surface:visible')).toHaveCount(0);
      }
    }
    await test.info().attach('Personal computer note keys', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect(bankRequests).toBe(1);
    expect(errors).toEqual([]);
  });
});
