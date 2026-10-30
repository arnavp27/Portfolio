import { expect, test, type Page } from '@playwright/test';

async function desktop(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Enter garage/ })).toBeVisible({
    timeout: 45_000,
  });
  const cdp = await page.context().newCDPSession(page);
  // Playwright evaluate() supplies userGesture:true, which can hide this bug.
  // Native key codes let Chromium handle its own Escape unlock when not captured.
  const state = async () => {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('.workshop-canvas');
        return {
          locked: document.pointerLockElement === canvas,
          fullscreen: document.fullscreenElement === document.querySelector('.garage'),
          play: canvas?.dataset.playState,
          phase: canvas?.dataset.computerPhase,
          capture: canvas?.dataset.mouseCapture,
          menu: !!document.querySelector('.garage-pause'),
          dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(element => element.checkVisibility()).length,
          retryFocused: document.activeElement === document.querySelector('.garage-pause .garage-enter'),
          reticle: !!document.querySelector('.garage-reticle'),
          target: canvas?.dataset.cameraTarget,
          active: navigator.userActivation.isActive,
        };
      })()`,
      returnByValue: true,
      userGesture: false,
    });
    return result.value;
  };
  const escape = async () => {
    for (const type of ['rawKeyDown', 'keyUp'] as const) {
      await cdp.send('Input.dispatchKeyEvent', {
        type,
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode:
          process.platform === 'darwin' ? 53 : process.platform === 'win32' ? 27 : 9,
      });
    }
  };
  const exitFullscreen = () =>
    cdp.send('Runtime.evaluate', {
      expression: 'document.exitFullscreen()',
      awaitPromise: true,
      userGesture: false,
    });
  return { state, escape, exitFullscreen };
}

test('Escape pauses outside fullscreen; Enter resumes fullscreen gameplay', async ({ page }) => {
  test.setTimeout(90_000);
  const { state, escape, exitFullscreen } = await desktop(page);
  await page.getByRole('button', { name: /^Enter garage/ }).click();
  await expect.poll(state).toMatchObject({ fullscreen: true, locked: true, play: 'room' });
  // Pause must work after activation expires. Enter then supplies the real
  // gesture required to return to fullscreen; page evaluation must not fake it.
  await expect.poll(async () => (await state()).active, { timeout: 8_000 }).toBe(false);
  for (let cycle = 0; cycle < 2; cycle++) {
    await escape();
    await expect.poll(state).toMatchObject({
      fullscreen: false,
      locked: false,
      menu: true,
      play: 'paused',
      retryFocused: true,
      dialogs: 1,
    });
    await escape();
    expect(await state()).toMatchObject({ fullscreen: false, locked: false, play: 'paused' });
    await page.keyboard.press('Enter');
    await expect.poll(state).toMatchObject({
      fullscreen: true,
      locked: true,
      play: 'room',
      capture: 'locked',
      menu: false,
      dialogs: 0,
      reticle: true,
    });
  }
  const before = (await state()).target;
  await page.mouse.move(600, 300);
  await page.mouse.move(670, 320);
  await expect.poll(async () => (await state()).target).not.toBe(before);
  await escape();
  await page.getByRole('button', { name: /^Work computer/ }).click();
  await expect.poll(state).toMatchObject({ fullscreen: true, phase: 'using', locked: false });
  await escape();
  await expect
    .poll(state)
    .toMatchObject({ fullscreen: false, phase: 'room', locked: false, menu: true });
  await page.getByRole('button', { name: /^Personal computer/ }).click();
  await expect.poll(state).toMatchObject({ fullscreen: true, phase: 'using' });
  // Browser chrome can exit fullscreen while the OS pointer is on a computer.
  // The existing menu must still be resumable, with no stuck computer phase.
  await exitFullscreen();
  await expect.poll(state).toMatchObject({
    fullscreen: false,
    phase: 'room',
    play: 'paused',
    menu: true,
  });
  await page.keyboard.press('Enter');
  await expect.poll(state).toMatchObject({ fullscreen: true, locked: true, play: 'room' });
  // Every normal Escape leaves fullscreen and pauses without an extra screen.
  await escape();
  await expect.poll(state).toMatchObject({ fullscreen: false, locked: false, play: 'paused' });
});

test('denied fullscreen keeps one pause menu and its original Enter action', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new DOMException('Fullscreen denied for this test', 'NotAllowedError'));
  });
  const { state, escape } = await desktop(page);
  await page.getByRole('button', { name: /^Enter garage/ }).click();
  await expect.poll(state).toMatchObject({ fullscreen: false, locked: true, play: 'room' });
  await escape();
  await expect.poll(state).toMatchObject({ locked: false, menu: true, play: 'paused' });
  await expect.poll(async () => (await state()).active, { timeout: 8_000 }).toBe(false);
  await escape();
  await expect.poll(state).toMatchObject({
    locked: false,
    play: 'paused',
    menu: true,
    dialogs: 1,
    retryFocused: true,
    reticle: false,
  });
  await page.keyboard.press('Enter');
  await expect.poll(state).toMatchObject({
    locked: true,
    play: 'room',
    menu: false,
    dialogs: 0,
    reticle: true,
  });
});

test('immediate mouse-capture failure stays windowed and Enter can retry', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const request = Element.prototype.requestPointerLock;
    let rejected = false;
    Element.prototype.requestPointerLock = function (...args) {
      if (!rejected) {
        rejected = true;
        throw new DOMException('Capture unavailable for this attempt', 'NotAllowedError');
      }
      return request.apply(this, args);
    };
  });
  const { state } = await desktop(page);
  await page.getByRole('button', { name: /^Enter garage/ }).click();
  await expect.poll(state).toMatchObject({
    fullscreen: false,
    locked: false,
    capture: 'unavailable',
    play: 'paused',
    menu: true,
    dialogs: 1,
    retryFocused: true,
  });
  await page.keyboard.press('Enter');
  await expect.poll(state).toMatchObject({
    fullscreen: true,
    locked: true,
    play: 'room',
    menu: false,
    reticle: true,
  });
});
