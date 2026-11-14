import { expect, it } from "vitest";
import type { Page } from "playwright";
import {
  add,
  browser,
  errors,
  exported,
  objectCount,
  open,
  row,
  setContextWheel,
} from "./browserHarness";
import { openSettings } from "./browserHarness";

/**
 * Every way a right-button gesture can end. A click opens the menu on release and nothing before
 * it; a hold shows the ring and never the menu; a stroke chooses the wedge it ends on or cancels;
 * and the browser's own menu never appears for a gesture that began on the canvas, wherever it is
 * released.
 */

const ring = (page: Page) => page.getByTestId("command-ring");
const menu = (page: Page) => page.getByTestId("context-menu");

async function expectCanvasHit(page: Page, point: { x: number; y: number }) {
  expect(
    await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest('[data-testid="canvas"]') ? "canvas" : hit?.outerHTML;
    }, point)
  ).toBe("canvas");
}

/** Neither ring nor menu is open now, nor appears a moment later from a late event. */
async function nothingOpen(page: Page) {
  await expect.poll(() => menu(page).count()).toBe(0);
  await page.waitForTimeout(400);
  expect(await menu(page).count()).toBe(0);
  expect(await ring(page).count()).toBe(0);
}

/** Records whether each browser menu request reached the page unprevented. */
async function watchBrowserMenus(page: Page) {
  await page.evaluate(() => {
    const allowed: string[] = [];
    (window as unknown as { browserMenus: string[] }).browserMenus = allowed;
    window.addEventListener("contextmenu", (event) => {
      if (!event.defaultPrevented) allowed.push((event.target as Element).tagName);
    });
  });
}
const browserMenus = (page: Page) =>
  page.evaluate(() => (window as unknown as { browserMenus: string[] }).browserMenus);

/** Sends the browser's release-time menu request at a point, as Windows and macOS do. */
const releaseMenuAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)!.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: px,
          clientY: py,
        })
      ),
    [x, y]
  );

async function press(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
}

it("ends every right-button gesture the same way, and never with an unasked menu", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    await setContextWheel(page, true);
    await add(page, "Rectangle (R)", "Target", 520, 360);
    await add(page, "Rectangle (R)", "Spare", 820, 360);
    await watchBrowserMenus(page);
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    const empty = { x: canvas.x + 300, y: canvas.y + 600 };

    // A click: nothing on the press, then the menu alone on release, which stays for a choice.
    await press(page, empty.x, empty.y);
    expect(await menu(page).count()).toBe(0);
    await page.mouse.up({ button: "right" });
    await menu(page).waitFor();
    await page.waitForTimeout(400);
    expect(await ring(page).count()).toBe(0);
    expect(await menu(page).count()).toBe(1);
    await page.keyboard.press("Escape");
    await nothingOpen(page);

    // A still hold: the ring alone while held, no wedge marked, and nothing once released.
    await press(page, empty.x, empty.y);
    await ring(page).waitFor();
    expect(await page.getByRole("menu", { name: "Canvas menu" }).count()).toBe(0);
    expect(await ring(page).locator(".ring-wedge:focus, .ring-wedge.active").count()).toBe(0);
    await page.mouse.up({ button: "right" });
    await nothingOpen(page);

    // A drag off the ring cancels: no ring, no menu.
    await press(page, empty.x, empty.y);
    await page.mouse.move(empty.x + 260, empty.y - 40, { steps: 10 });
    await ring(page).waitFor();
    await page.mouse.up({ button: "right" });
    await nothingOpen(page);

    // A drag that returns to the centre cancels too.
    await press(page, empty.x, empty.y);
    await page.mouse.move(empty.x + 40, empty.y + 30, { steps: 6 });
    await page.mouse.move(empty.x, empty.y, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await nothingOpen(page);

    // A drag into a wedge chooses it, and only it.
    const target = (await row(page, "Target").boundingBox())!;
    const before = await objectCount(page);
    await press(page, target.x + target.width / 2, target.y + target.height / 2);
    await ring(page).waitFor();
    const centre = (await ring(page).boundingBox())!;
    await page.mouse.move(centre.x + centre.width / 2, centre.y + centre.height / 2 + 84, {
      steps: 6,
    });
    await page.mouse.up({ button: "right" });
    await expect.poll(() => objectCount(page)).toBe(before - 1);
    await nothingOpen(page);

    // A stroke released outside the canvas, over the rail: nothing opens, not even the browser's
    // menu, while a right click elsewhere later still reaches the browser.
    const spare = (await row(page, "Spare").boundingBox())!;
    await press(page, spare.x + spare.width / 2, spare.y + spare.height / 2);
    const rail = (await page.locator(".left-rail").boundingBox())!;
    const outside = { x: rail.x + rail.width / 2, y: rail.y + rail.height / 2 };
    await page.mouse.move(outside.x, outside.y, { steps: 12 });
    await page.mouse.up({ button: "right" });
    await releaseMenuAt(page, outside.x, outside.y);
    await nothingOpen(page);
    expect(await browserMenus(page)).toEqual([]);
    await page.waitForTimeout(600);
    await releaseMenuAt(page, outside.x, outside.y);
    expect((await browserMenus(page)).length).toBe(1);
    expect(await objectCount(page)).toBe(before - 1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("defaults to right-drag panning and remembers the optional wheel only on this device", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    const peer = await open(peerContext, new URL(page.url()).hash.slice("#room=".length));
    await openSettings(page);
    const checkbox = page.getByRole("checkbox", { name: "Enable context wheel", exact: true });
    expect(await checkbox.isChecked()).toBe(false);
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await add(page, "Rectangle (R)", "Target", 400, 300);
    await add(page, "Rectangle (R)", "Selected", 700, 550);
    await expect.poll(() => objectCount(peer)).toBe(2);
    const saved = (await exported(page)).objects;
    const target = (await row(page, "Target").boundingBox())!;
    const peerBefore = (await row(peer, "Target").boundingBox())!;
    const start = { x: target.x + 12, y: target.y + 12 };
    await expectCanvasHit(page, start);
    await watchBrowserMenus(page);

    // Dragging over a different object pans without changing the selection or shared geometry.
    await press(page, start.x, start.y);
    await page.waitForTimeout(350);
    expect(await ring(page).count()).toBe(0);
    await page.mouse.move(start.x + 100, start.y + 60, { steps: 8 });
    const preview = (await row(page, "Target").boundingBox())!;
    expect(Math.round(preview.x - target.x)).toBe(100);
    expect(Math.round(preview.y - target.y)).toBe(60);
    await page.mouse.up({ button: "right" });
    await nothingOpen(page);
    const after = (await row(page, "Target").boundingBox())!;
    expect(Math.round(after.x - target.x)).toBe(100);
    expect(Math.round(after.y - target.y)).toBe(60);
    expect(await row(page, /^Selected$/).count()).toBe(1);
    const peerAfter = (await row(peer, "Target").boundingBox())!;
    expect(peerAfter.x).toBeCloseTo(peerBefore.x, 0);
    expect(peerAfter.y).toBeCloseTo(peerBefore.y, 0);
    expect((await exported(page)).objects).toEqual(saved);
    expect(await browserMenus(page)).toEqual([]);

    // A click, including a stationary hold, still opens the menu after release.
    const area = (await page.getByTestId("canvas").boundingBox())!;
    await press(page, area.x + 250, area.y + 650);
    await page.waitForTimeout(350);
    expect(await ring(page).count()).toBe(0);
    await page.mouse.up({ button: "right" });
    await menu(page).waitFor();
    await page.keyboard.press("Escape");

    // The checkbox works with a keyboard and survives a reload.
    await openSettings(page);
    await checkbox.focus();
    await page.keyboard.press("Space");
    expect(await checkbox.isChecked()).toBe(true);
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await page.reload();
    await page.getByTestId("canvas").waitFor();
    await openSettings(page);
    expect(await checkbox.isChecked()).toBe(true);
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    await press(page, canvas.x + 300, canvas.y + 600);
    await ring(page).waitFor();
    await page.mouse.up({ button: "right" });
    await nothingOpen(page);
    await openSettings(peer);
    expect(
      await peer.getByRole("checkbox", { name: "Enable context wheel", exact: true }).isChecked()
    ).toBe(false);

    // Turning it off applies immediately: a drag again pans and opens neither menu.
    await setContextWheel(page, false);
    await press(page, canvas.x + 300, canvas.y + 600);
    await page.mouse.move(canvas.x + 380, canvas.y + 640, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await nothingOpen(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await peerContext.close();
  }
});
