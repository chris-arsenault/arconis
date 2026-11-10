import { expect, it } from "vitest";
import type { Page } from "playwright";
import { browser, errors, exported, open, row, selectDrawing } from "./browserHarness";
import { createRoomId } from "../collaboration/room";

async function scene(source: string) {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    room
  );
  await page.getByLabel("Import file").setInputFiles({
    name: "review.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1\n${source}`),
  });
  return { page, room };
}

async function bounds(page: Page, color: string) {
  const shape = page.getByTestId("canvas").locator(`[stroke="${color}"]`).first();
  await shape.waitFor({ state: "attached" });
  return shape.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

async function redAt(page: Page, x: number, y: number) {
  const screenshot = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ data, x, y }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return pixel[0] > 200 && pixel[1] < 80 && pixel[2] < 80;
    },
    { data: screenshot, x, y }
  );
}

it("erases sparse sweep crossings and single clicks without touching workspace objects or recoloring them", async () => {
  const { page, room } = await scene(`drawing p markup points 150,250 450,250
    node n "Workspace" at 550,200 size 160,100 line #112233`);
  const peer = await open(await browser.newContext(), room);
  const box = await bounds(page, "#6554c0"),
    x = box.x + box.width / 2,
    y = box.y;
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Erase whole stroke", exact: true }).click();
  await page.mouse.move(x, y - 100);
  await page.mouse.down();
  await page.mouse.move(x, y + 100);
  await page.mouse.up();
  await expect
    .poll(async () => (await exported(peer)).objects.some((item) => item.id === "p"))
    .toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await exported(page)).objects.some((item) => item.id === "p"))
    .toBe(true);
  await page.mouse.click(x, y);
  await expect
    .poll(async () => (await exported(peer)).objects.some((item) => item.id === "p"))
    .toBe(false);
  const original = (await exported(page)).objects.find((item) => item.id === "n");
  await page.keyboard.press("v");
  await row(page, "Workspace").click();
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Freehand", exact: true }).click();
  await page.getByRole("button", { name: "Stroke #e64980", exact: true }).click();
  expect(
    await page.getByRole("button", { name: "Apply ink color to strokes", exact: true }).count()
  ).toBe(0);
  expect((await exported(page)).objects.find((item) => item.id === "n")).toEqual(original);
  expect((await exported(peer)).objects.find((item) => item.id === "n")).toEqual(original);
  expect(errors).toEqual([]);
});

it("highlights the displayed rotated object and ignores its former footprint", async () => {
  const { page, room } = await scene(`style turned rotate 90
    node n "Rotated" at 200,200 size 200,40 turned line #112233`);
  const peer = await open(await browser.newContext(), room);
  const box = await bounds(page, "#112233");
  const x = box.x + box.width / 2,
    y = box.y + box.height * 0.8;
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("button", { name: "Object outline", exact: true }).click();
  await page.mouse.click(x, y);
  await expect
    .poll(
      async () => (await exported(peer)).objects.filter((item) => item.type === "highlight").length
    )
    .toBe(1);
  await page.mouse.click(x, y);
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(1);
  await page.mouse.click(x - (80 * box.height) / 200, box.y + box.height / 2);
  expect((await exported(page)).objects).toHaveLength(1);
  expect(errors).toEqual([]);
});

it("keeps a rectangular gradient handle continuous and shares one undoable direction gesture", async () => {
  const { page, room } = await scene(
    `drawing p markup points 150,150 350,150 350,250 150,250 150,150 closed fill #ff0000 gradient #0000ff gradient-angle 45`
  );
  const peer = await open(await browser.newContext(), room);
  await selectDrawing(page);
  const handle = page.getByRole("button", { name: "Gradient direction", exact: true });
  const first = (await handle.boundingBox())!;
  const x = first.x + first.width / 2,
    y = first.y + first.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 1, y);
  await page.mouse.up();
  const angle = (await exported(page)).objects[0].look.gradientAngle!;
  expect(Math.abs(angle - 45)).toBeLessThan(2);
  const path = await bounds(page, "#6554c0");
  const next = (await handle.boundingBox())!;
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.down();
  await page.mouse.move(path.x + path.width / 2, path.y + path.height, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await exported(peer)).objects[0].look.gradientAngle)
    .toBeCloseTo(90, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await exported(peer)).objects[0].look.gradientAngle)
    .toBeCloseTo(angle, 4);
  expect(errors).toEqual([]);
});

it("preserves visible wide ink when moving between markup and content layers", async () => {
  const { page } = await scene(`drawing p markup points 200,200 400,200 line-width 48`);
  await selectDrawing(page);
  await page.getByLabel("Stroke color", { exact: true }).fill("#ff0000");
  const box = await bounds(page, "#ff0000");
  const x = box.x + box.width / 2,
    y = box.y - (22 * box.width) / 200;
  expect(await redAt(page, x, y)).toBe(true);
  const before = (await exported(page)).objects[0];
  await page.getByRole("button", { name: "Move to content layer", exact: true }).click();
  const promoted = (await exported(page)).objects;
  expect(promoted).toHaveLength(1);
  expect(promoted[0].markup).toBe(false);
  expect(promoted.find((item) => item.id === "p")?.points).toEqual(before.points);
  expect(await redAt(page, x, y)).toBe(true);
  await page.getByRole("button", { name: "Move to Markup", exact: true }).click();
  expect(await redAt(page, x, y)).toBe(true);
  expect(errors).toEqual([]);
});

it("reads legacy Drawing holders as ordinary scalable panels without clipping their ink", async () => {
  const { page } = await scene(`style turned rotate 90 line #112233
    sketch s at 200,200 size 200,100 turned {
      drawing p points 270,170 330,170 330,330 270,330 270,170 closed fill #ff0000 line #ff0000
    }`);
  const canvas = page.getByTestId("canvas");
  expect(await canvas.locator("defs.ink-clips").count()).toBe(0);
  const box = await bounds(page, "#ff0000");
  expect(await redAt(page, box.x + box.width / 2, box.y + 10)).toBe(true);
  expect(
    (await exported(page)).objects.find((item) => item.id === "s")?.look.rotation
  ).toBeUndefined();
  expect((await exported(page)).objects.find((item) => item.id === "s")).toMatchObject({
    type: "frame",
    scaleContents: true,
  });
  expect(errors).toEqual([]);
});
