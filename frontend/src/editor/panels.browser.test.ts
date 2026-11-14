import { it, expect } from "vitest";
import type { BrowserContext, Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, drag, objectCount } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const emptySpot = { x: 750, y: 800 };

const find = async (page: Page, label: string) =>
  (await exported(page)).objects.find((item) => item.name === label)!;

/** Places a panel at (160, 140) on the canvas, 320 wide and 220 tall. */
async function addPanel(page: Page, title: string, x = 160, y = 140) {
  await add(page, "Frame (F)", title, x, y);
  await canvas(page).click({ position: emptySpot });
}

it("nests objects dropped on a panel, moves them with it and releases them", async () => {
  const context: BrowserContext = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await addPanel(page, "Backend");
  await add(page, "Rectangle (R)", "Worker", 560, 500);
  await canvas(page).click({ position: emptySpot });
  const panel = await find(page, "Backend");
  expect(panel).toMatchObject({ type: "frame", width: 320, height: 220 });
  // The title renders inside the panel's header.
  const title = (await row(page, "Backend").boundingBox())!;
  const bounds = (await canvas(page).boundingBox())!;
  expect(title.y - bounds.y).toBeGreaterThanOrEqual(140);
  expect(title.y - bounds.y + title.height).toBeLessThanOrEqual(170);
  expect(title.x - bounds.x).toBeGreaterThan(160);

  await drag(page, 640, 545, -340, -280);
  await expect.poll(async () => (await find(page, "Worker")).inside).toBe(panel.id);
  const nested = await find(page, "Worker");

  await drag(page, 200, 154, 100, 60);
  await expect.poll(async () => (await find(page, "Backend")).x).toBe(panel.x + 100);
  const moved = await find(page, "Worker");
  expect(moved.x).toBe(nested.x + 100);
  expect(moved.y).toBe(nested.y + 60);
  expect(moved.inside).toBe(panel.id);

  await canvas(page).click({ position: emptySpot });
  const center = { x: moved.x + 60 + moved.width / 2, y: moved.y + 60 + moved.height / 2 };
  await drag(page, center.x, center.y, 400, 300);
  await expect.poll(async () => (await find(page, "Worker")).inside).toBe("");
  expect((await find(page, "Backend")).width).toBe(320);
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps a panel's size and children when resizing, and accepts connectors and nesting", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await addPanel(page, "Outer", 160, 120);
  await add(page, "Rectangle (R)", "Inside", 220, 200);
  const inside = await find(page, "Inside");
  const outer = await find(page, "Outer");
  expect(inside.inside).toBe(outer.id);
  await add(page, "Text (T)", "Placed in panel", 220, 300);
  expect((await find(page, "Placed in panel")).inside).toBe(outer.id);

  // Moving a child toward the edge leaves the panel at the size it was given.
  await canvas(page).click({ position: emptySpot });
  await drag(page, 300, 245, 60, 0);
  await expect.poll(async () => (await find(page, "Inside")).x).toBe(inside.x + 60);
  expect((await find(page, "Outer")).width).toBe(320);

  // Resizing the panel from its corner handle leaves the child's size alone.
  await page.mouse.click(0, 0);
  await canvas(page).click({ position: { x: 200, y: 134 } });
  await drag(page, 480, 340, 80, 60);
  await expect.poll(async () => (await find(page, "Outer")).width).toBe(400);
  expect((await find(page, "Inside")).width).toBe(inside.width);

  // A selected panel keeps its contents through the ungroup shortcut.
  await page.keyboard.press("ControlOrMeta+Shift+g");
  expect((await find(page, "Inside")).inside).toBe(outer.id);

  await canvas(page).click({ position: emptySpot });
  await add(page, "Rectangle (R)", "Client", 700, 500);
  await page.getByRole("button", { name: "Connector: click two objects (C)", exact: true }).click();
  await canvas(page).click({ position: { x: 780, y: 545 } });
  await canvas(page).click({ position: { x: 200, y: 134 } });
  await expect.poll(() => objectCount(page)).toBe(5);
  const saved = await exported(page);
  const edge = saved.objects.find((item) => item.type === "line")!;
  expect(edge.to).toBe(outer.id);

  await addPanel(page, "Second", 660, 120);
  // Edits less than a moment apart undo together, and this undo is only about the nesting.
  await page.waitForTimeout(500);
  await drag(page, 700, 134, -420, 60);
  await expect.poll(async () => (await find(page, "Second")).inside).toBe(outer.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await find(page, "Second")).inside).toBe("");
  await page.reload();
  await expect.poll(() => objectCount(page)).toBe(6);
  expect((await find(page, "Inside")).inside).toBe(outer.id);
  expect(errors).toEqual([]);
  await context.close();
});

it("converges when a peer moves a panel while another nests an object in it", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  await addPanel(a, "Shared panel");
  await add(a, "Rectangle (R)", "Shared object", 560, 500);
  await canvas(a).click({ position: emptySpot });
  const b = await open(second, room);
  await expect.poll(() => objectCount(b), { timeout: 15000 }).toBe(2);
  const panel = await find(a, "Shared panel");

  await first.setOffline(true);
  await expect.poll(() => a.getByTestId("connection-status").textContent()).toBe("Offline");
  await drag(a, 640, 545, -340, -280);
  await drag(b, 200, 154, 100, 60);
  await expect.poll(async () => (await find(a, "Shared object")).inside).toBe(panel.id);
  await expect.poll(async () => (await find(b, "Shared panel")).x).toBe(panel.x + 100);
  await first.setOffline(false);

  const state = async (page: Page) => {
    const saved = await exported(page);
    return saved.objects.map((item) => [item.name, item.inside, item.x, item.y]);
  };
  await expect
    .poll(async () => JSON.stringify(await state(a)) === JSON.stringify(await state(b)), {
      timeout: 45000,
    })
    .toBe(true);
  expect((await find(b, "Shared object")).inside).toBe(panel.id);
  expect((await find(a, "Shared panel")).x).toBe(panel.x + 100);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
