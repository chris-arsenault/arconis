import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  browser,
  drawInto,
  errors,
  open,
  add,
  row,
  exported,
  drag,
  objectCount,
  railPanel,
  selectConnector,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const emptySpot = { x: 750, y: 760 };

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
  (await exported(page)).objects.find((item) => item.type === "line")!;

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
  await expect.poll(() => objectCount(page)).toBe(3);
  const edge = await connector(page);
  expect(edge).toMatchObject({ fromPort: [1, 0.5], toPort: [0, 0.5] });
  await drag(page, 300, 215, 40, 200);
  await expect.poll(async () => (await exported(page)).objects[0].y).toBeGreaterThan(150);
  expect((await connector(page)).fromPort).toEqual([1, 0.5]);
  const peer = await open(second, room);
  await expect.poll(() => objectCount(peer), { timeout: 15000 }).toBe(3);
  expect((await connector(peer)).toPort).toEqual([0, 0.5]);
  await page.reload();
  await expect.poll(() => objectCount(page)).toBe(3);
  expect(await connector(page)).toMatchObject({ fromPort: [1, 0.5], toPort: [0, 0.5] });
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("re-attaches either connector end by dragging, with no endpoint menus", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(first, room);
  const peer = await open(second, room);
  await add(page, "Rectangle (R)", "Left", 220, 170);
  await add(page, "Rectangle (R)", "Right", 560, 170);
  await add(page, "Rectangle (R)", "Lower right", 560, 420);
  await add(page, "Rectangle (R)", "Lower left", 220, 420);
  await canvas(page).click({ position: emptySpot });
  await connectBetween(page, { x: 380, y: 215 }, { x: 560, y: 215 });
  await expect.poll(() => objectCount(page)).toBe(5);
  const idOf = async (label: string) =>
    (await exported(page)).objects.find((item) => item.name === label)!.id;

  const dragEnd = async (handle: number, to: { x: number; y: number }) => {
    await selectConnector(page);
    expect(await page.getByLabel("Connector source", { exact: true }).count()).toBe(0);
    expect(await page.getByLabel("Connector target", { exact: true }).count()).toBe(0);
    const handles = canvas(page).locator('rect[fill="#0000ff"]');
    const end = (await handles.nth(handle).boundingBox())!;
    const origin = await canvasOrigin(page);
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(origin.x + to.x, origin.y + to.y - 10, { steps: 10 });
    await page.mouse.move(origin.x + to.x, origin.y + to.y, { steps: 3 });
    await page.mouse.up();
  };

  await dragEnd(-1, { x: 640, y: 420 });
  const lowerRight = await idOf("Lower right");
  await expect.poll(async () => (await connector(page)).to).toBe(lowerRight);
  await canvas(page).click({ position: emptySpot });
  await dragEnd(0, { x: 300, y: 420 });
  const lowerLeft = await idOf("Lower left");
  await expect.poll(async () => (await connector(page)).from).toBe(lowerLeft);

  await expect.poll(async () => (await connector(peer)).from).toBe(lowerLeft);
  expect((await connector(peer)).to).toBe(lowerRight);
  await page.reload();
  await expect.poll(() => objectCount(page)).toBe(5);
  expect(await connector(page)).toMatchObject({ from: lowerLeft, to: lowerRight });
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
  await expect.poll(() => objectCount(page)).toBe(3);
  const edge = await connector(page);
  expect(edge.fromPort?.[0]).toBe(1);
  expect(edge.toPort).toBeNull();
  await selectConnector(page);
  const end = (await canvas(page).locator('rect[fill="#0000ff"]').last().boundingBox())!;
  await page.mouse.move(0, 0);
  const origin = await canvasOrigin(page);
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(origin.x + 655, origin.y + 180, { steps: 10 });
  await page.mouse.move(origin.x + 655, origin.y + 170, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await connector(page)).toPort?.[1]).toBe(0);
  await row(page, "Free source").click();
  const before = Number(await page.getByLabel("Object x", { exact: true }).inputValue());
  await drag(page, 300, 215, 30, 0);
  await expect
    .poll(() => page.getByLabel("Object x", { exact: true }).inputValue())
    .toBe(String(before + 30));
  expect(await objectCount(page)).toBe(3);
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

it("zooms across the symmetric millionfold range and keeps editing usable at both ends", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "At normal zoom", 400, 300);
  const dots = () => canvas(page).evaluate((node) => (node as HTMLElement).style.backgroundSize);
  for (const [deltaY, label, name] of [
    [-3000, "1049000×", "in"],
    [3000, "9.537e-7×", "out"],
  ] as const) {
    await zoomTo(page, deltaY, label);
    await canvas(page).click({ position: emptySpot });
    expect(parseFloat(await dots())).toBeGreaterThanOrEqual(100);
    expect(parseFloat(await dots())).toBeLessThanOrEqual(250);
    await railPanel(page, "Shapes");
    await page.getByRole("button", { name: "Sticky note (N)", exact: true }).click();
    await canvas(page).click({ position: { x: 300, y: 200 } });
    await page.keyboard.type(`Zoomed ${name}`);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `test-results/zoom-${name}.png` });
    const saved = await exported(page);
    const note = saved.objects.find((item) => item.name === `Zoomed ${name}`)!;
    const scale = name === "in" ? 2 ** 20 : 2 ** -20;
    // Created at a familiar on-screen size, with text to match: a note's text is 16 at scale 1.
    const textSize = (note.look.textSize ?? 16) * (note.look.scale ?? 1);
    expect(note.width * scale).toBeGreaterThan(100);
    expect(note.width * scale).toBeLessThan(400);
    expect(textSize * scale).toBeGreaterThan(8);
    expect(textSize * scale).toBeLessThan(32);
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
    await drawInto(page, "content");
    await page.mouse.move(origin.x + 500, origin.y + 500);
    await page.mouse.down();
    await page.mouse.move(origin.x + 560, origin.y + 540, { steps: 5 });
    await page.mouse.move(origin.x + 620, origin.y + 500, { steps: 5 });
    await page.mouse.up();
    const strokes = (await exported(page)).objects.filter((item) => item.type === "drawing");
    const points = strokes[strokes.length - 1].points;
    expect(Math.abs(points[points.length - 1][0] - points[0][0]) * scale).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  }
  expect(errors).toEqual([]);
  await context.close();
});
