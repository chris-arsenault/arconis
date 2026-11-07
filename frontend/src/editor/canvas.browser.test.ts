import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, drag } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const emptySpot = { x: 880, y: 760 };

async function canvasOrigin(page: Page) {
  const bounds = (await canvas(page).boundingBox())!;
  return { x: bounds.x, y: bounds.y };
}

async function connectBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + from.x - 40, origin.y + from.y, { steps: 2 });
  await page.mouse.move(origin.x + from.x, origin.y + from.y, { steps: 8 });
  await page.mouse.down();
  await page.mouse.move(origin.x + to.x - 10, origin.y + to.y, { steps: 12 });
  await page.mouse.move(origin.x + to.x, origin.y + to.y, { steps: 3 });
  await page.mouse.up();
}

const connector = async (page: Page) =>
  (await exported(page)).objects.find((item) => item.kind === "connector")!;

it("connects chosen points that hold through moves, peers and reload", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(first, room);
  await add(page, "Rectangle (R)", "Point source", 220, 170);
  await add(page, "Sticky note (N)", "Point target", 560, 170);
  await canvas(page).click({ position: emptySpot });
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + 300, origin.y + 215);
  await page.mouse.move(origin.x + 304, origin.y + 217);
  await expect.poll(() => canvas(page).locator("image").count()).toBe(12);
  await connectBetween(page, { x: 380, y: 215 }, { x: 560, y: 255 });
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  const edge = await connector(page);
  expect(edge.style).toMatchObject({ exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 });
  await drag(page, 300, 215, 40, 200);
  await expect.poll(async () => (await exported(page)).objects[0].y).toBeGreaterThan(150);
  expect((await connector(page)).style).toMatchObject({ exitX: 1, exitY: 0.5 });
  const peer = await open(second, room);
  await expect.poll(() => peer.locator(".object-row").count(), { timeout: 15000 }).toBe(3);
  expect((await connector(peer)).style).toMatchObject({ entryX: 0, entryY: 0.5 });
  await page.reload();
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  expect((await connector(page)).style).toMatchObject({ exitX: 1, entryX: 0 });
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("leaves a free end on a body drop, re-anchors an end, and drags from the body move", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Free source", 220, 170);
  await add(page, "Sticky note (N)", "Free target", 560, 170);
  await canvas(page).click({ position: emptySpot });
  await connectBetween(page, { x: 380, y: 215 }, { x: 655, y: 255 });
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  const edge = await connector(page);
  expect(edge.style.exitX).toBe(1);
  expect(edge.style.entryX).toBeUndefined();
  await row(page, "Connector").click();
  const end = (await canvas(page).locator('rect[fill="#0000ff"]').last().boundingBox())!;
  await page.mouse.move(0, 0);
  const origin = await canvasOrigin(page);
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(origin.x + 655, origin.y + 180, { steps: 10 });
  await page.mouse.move(origin.x + 655, origin.y + 170, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await connector(page)).style.entryY).toBe(0);
  await row(page, "Free source").click();
  const before = Number(await page.getByLabel("Object x", { exact: true }).inputValue());
  await drag(page, 300, 215, 30, 0);
  await expect
    .poll(() => page.getByLabel("Object x", { exact: true }).inputValue())
    .toBe(String(before + 30));
  expect(await page.locator(".object-row").count()).toBe(3);
  expect(errors).toEqual([]);
  await context.close();
});

async function zoomTo(page: Page, deltaY: number, label: string) {
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + 500, origin.y + 400);
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, deltaY);
        await page.waitForTimeout(50);
        return page.getByTestId("zoom-level").textContent();
      },
      { timeout: 20000, interval: 10 }
    )
    .toBe(label);
}

it("zooms across the 1000x range and keeps editing usable at both ends", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "At normal zoom", 400, 300);
  const dots = () => canvas(page).evaluate((node) => (node as HTMLElement).style.backgroundSize);
  for (const [deltaY, label, name] of [
    [-3000, "100000%", "in"],
    [3000, "0.1%", "out"],
  ] as const) {
    await zoomTo(page, deltaY, label);
    await canvas(page).click({ position: emptySpot });
    expect(parseFloat(await dots())).toBeGreaterThanOrEqual(19);
    expect(parseFloat(await dots())).toBeLessThanOrEqual(201);
    await page.getByRole("button", { name: "Sticky note (N)", exact: true }).click();
    await canvas(page).click({ position: { x: 300, y: 200 } });
    await page.keyboard.type(`Zoomed ${name}`);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `test-results/zoom-${name}.png` });
    const saved = await exported(page);
    const note = saved.objects.find((item) => item.label === `Zoomed ${name}`)!;
    const scale = name === "in" ? 1000 : 0.001;
    // Created at a familiar on-screen size, with text to match.
    expect(note.width * scale).toBeGreaterThan(100);
    expect(note.width * scale).toBeLessThan(400);
    expect(Number(note.style.fontSize) * scale).toBeGreaterThan(8);
    expect(Number(note.style.fontSize) * scale).toBeLessThan(32);
    const box = (await canvas(page)
      .locator("div", { hasText: `Zoomed ${name}` })
      .last()
      .boundingBox())!;
    // The label itself renders at a readable size, not just the note behind it.
    expect(box.height).toBeGreaterThan(8);
    const origin = await canvasOrigin(page);
    await row(page, `Zoomed ${name}`).click();
    const beforeX = note.x;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 105, box.y + 5, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const moved = (await exported(page)).objects.find((item) => item.id === note.id)!;
        return (moved.x - beforeX) * scale;
      })
      .toBeGreaterThan(80);
    await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
    await page.mouse.move(origin.x + 500, origin.y + 500);
    await page.mouse.down();
    await page.mouse.move(origin.x + 560, origin.y + 540, { steps: 5 });
    await page.mouse.move(origin.x + 620, origin.y + 500, { steps: 5 });
    await page.mouse.up();
    const strokes = (await exported(page)).objects.filter((item) => item.kind === "stroke");
    const points = JSON.parse(strokes[strokes.length - 1].points) as [number, number][];
    expect(Math.abs(points[points.length - 1][0] - points[0][0]) * scale).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  }
  expect(errors).toEqual([]);
  await context.close();
});
