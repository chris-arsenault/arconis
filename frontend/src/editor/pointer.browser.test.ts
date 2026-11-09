import { it, expect } from "vitest";
import { createRoomId } from "../collaboration/room";
import {
  browser,
  errors,
  open,
  add,
  row,
  exported,
  objectCount,
  selectionLabel,
} from "./browserHarness";

it("moves the collective selection frame with the native middle-pan preview", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "First", 300, 200);
  await add(page, "Rectangle (R)", "Second", 600, 400);
  await row(page, "First").click();
  await row(page, "Second").click({ modifiers: ["Shift"] });
  const frame = page.getByTestId("selection-frame");
  const before = (await frame.boundingBox())!;
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + 200, bounds.y + 650);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(bounds.x + 280, bounds.y + 690, { steps: 8 });
  const preview = (await frame.boundingBox())!;
  expect(Math.round(preview.x - before.x)).toBe(80);
  expect(Math.round(preview.y - before.y)).toBe(40);
  await page.mouse.up({ button: "middle" });
  const after = (await frame.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(80);
  expect(Math.round(after.y - before.y)).toBe(40);
  expect(await objectCount(page)).toBe(2);
  await context.close();
});

it("keeps a context menu inside the canvas at its far corner", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  const canvas = page.getByTestId("canvas");
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({
    button: "right",
    position: { x: bounds.width - 12, y: bounds.height - 12 },
  });
  const menuBox = (await page.getByTestId("context-menu").boundingBox())!;
  const currentBounds = (await canvas.boundingBox())!;
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(currentBounds.x + currentBounds.width);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(currentBounds.y + currentBounds.height);
  await canvas.press("Escape");
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps right-click and radial menus exclusive, pans with middle drag, and opens comments above objects", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Target", 300, 200);
  await add(page, "Sticky note (N)", "Other", 700, 500);
  const canvas = page.getByTestId("canvas");
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: 40, y: 40 } });

  // Middle drag pans; the zoom stays, the objects move on screen.
  const before = (await row(page, "Target").boundingBox())!;
  await page.mouse.move(bounds.x + 500, bounds.y + 700);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(bounds.x + 600, bounds.y + 760, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  const after = (await row(page, "Target").boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(100);
  expect(await page.getByTestId("zoom-level").textContent()).toBe("100%");

  // A right click on an object selects it and opens the ring and menu; the menu's items run, and
  // the browser's own menu stays away, whether it fires on press or on release over the ring.
  await page.evaluate(() => {
    const seen: boolean[] = [];
    (window as unknown as { contextMenus: boolean[] }).contextMenus = seen;
    window.addEventListener("contextmenu", (event) => seen.push(event.defaultPrevented));
  });
  await row(page, "Target").click({ button: "right" });
  await page.getByTestId("context-menu").waitFor();
  await page.getByTestId("context-menu").dispatchEvent("contextmenu", { bubbles: true });
  expect(
    await page.evaluate(() => (window as unknown as { contextMenus: boolean[] }).contextMenus)
  ).toEqual([true, true]);
  // A click brings the menu alone; the ring comes only while the button rests or moves.
  expect(await page.getByTestId("command-ring").count()).toBe(0);
  await expect.poll(() => selectionLabel(page)).toBe("Rectangle");
  await page
    .getByRole("menuitem", { name: /^Duplicate/ })
    .last()
    .click();
  await expect.poll(() => objectCount(page)).toBe(3);
  await expect.poll(() => page.getByTestId("context-menu").count()).toBe(0);

  // A right drag past the dead zone strokes a wedge: straight down is Delete on an object.
  const other = (await row(page, "Other").boundingBox())!;
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2 + 60, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => objectCount(page)).toBe(2);

  // Holding the button on empty canvas brings the ring; releasing in its centre leaves the menu,
  // which lists canvas commands, and Escape closes it.
  await page.mouse.move(bounds.x + 40, bounds.y + 40);
  await page.mouse.down({ button: "right" });
  await page.getByTestId("command-ring").waitFor();
  expect(await page.getByRole("menu", { name: "Canvas menu" }).count()).toBe(0);
  const ringBox = (await page.getByTestId("command-ring").boundingBox())!;
  expect(ringBox.x).toBeGreaterThanOrEqual(bounds.x);
  expect(ringBox.y).toBeGreaterThanOrEqual(bounds.y);
  await page.mouse.up({ button: "right" });
  await expect.poll(() => page.getByTestId("command-ring").count()).toBe(0);
  await page.getByRole("menuitem", { name: "Add note here", exact: true }).last().waitFor();
  await canvas.press("Escape");
  await expect.poll(() => page.getByTestId("context-menu").count()).toBe(0);

  // Comments open on the key into a modal above the object, and the mark reopens them.
  await row(page, "Target").last().click();
  await canvas.press("Shift+c");
  const modal = page.getByTestId("comment-modal");
  await modal.waitFor();
  await modal.getByLabel("Add a comment", { exact: true }).fill("Looks right");
  await modal.getByLabel("Add a comment", { exact: true }).press("Enter");
  await expect.poll(() => modal.getByTestId("comment-thread").count()).toBe(1);
  const modalBox = (await modal.boundingBox())!;
  const targetBox = (await row(page, "Target").last().boundingBox())!;
  expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(targetBox.y + 2);
  await canvas.press("Escape");
  await expect.poll(() => modal.count()).toBe(0);
  await row(page, /💬1/).first().locator("[data-mark=comments]").click();
  await modal.waitFor();
  await modal.getByRole("button", { name: "Resolve thread", exact: true }).click();
  await expect.poll(() => modal.getByRole("button", { name: "1 resolved" }).count()).toBe(1);
  expect(await page.getByLabel("Object properties").getByLabel("Add a comment").count()).toBe(0);
  const saved = await exported(page);
  expect(saved.text).toContain('"Looks right"');
  expect(errors).toEqual([]);
  await context.close();
});
