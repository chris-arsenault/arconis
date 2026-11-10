import { expect, it } from "vitest";
import type { Page } from "playwright";
import { browser, exported, open, row, errors } from "./browserHarness";
import { createRoomId } from "../collaboration/room";
import { CURSORS } from "./cursors";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function scene() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "tools.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(
      'arconis 1\nnode n "Sample" at 150,150 size 180,100 line #112233 fill #abcdef'
    ),
  });
  return { context, page };
}
async function cursor(page: Page, name: keyof typeof CURSORS) {
  const canvas = page.getByTestId("canvas");
  expect(await canvas.getAttribute("data-cursor")).toBe(name);
  const actual = await canvas
    .locator('[stroke="#112233"]')
    .first()
    .evaluate((node) => getComputedStyle(node).cursor);
  // Chromium normalizes quoting in computed CSS URLs.
  if (CURSORS[name].asset) expect(actual).toContain(CURSORS[name].asset);
  else expect(actual).toBe(CURSORS[name].css);
}
async function mark(page: Page, y: number) {
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(box.x + 450, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + 650, box.y + y + 60, { steps: 8 });
  await page.mouse.up();
}

it("matches armed tools to cursors over objects and restores the pen after temporary pan", async () => {
  const { context, page } = await scene();
  await page.keyboard.press("p");
  await cursor(page, "pen");
  const sizes = await page.evaluate(
    async (assets) =>
      Promise.all(
        assets.map(async (asset) => {
          const image = new Image();
          image.src = asset;
          await image.decode();
          return [image.width, image.height];
        })
      ),
    Object.values(CURSORS).flatMap(({ asset }) => (asset ? [asset] : []))
  );
  expect(sizes.every(([width, height]) => width === 28 && height === 28)).toBe(true);
  await page.getByLabel("Stroke color", { exact: true }).fill("#ff0000");
  for (const [family, tool, name] of [
    ["Highlight", "Marker", "marker"],
    ["Highlight", "Object outline", "target"],
    ["Highlight", "Shaped highlight", "crosshair"],
    ["Vector", "Rectangle", "crosshair"],
  ] as const) {
    await button(page, family).click();
    await button(page, tool).click();
    await cursor(page, name);
  }
  for (const [tool, name] of [
    ["Erase segment", "eraser"],
    ["Erase whole stroke", "eraser"],
    ["Select ink", "lasso"],
    ["Fill path", "fill"],
    ["Pick color", "picker"],
  ] as const) {
    await button(page, tool).click();
    await cursor(page, name);
  }
  await page.keyboard.press("p");
  await button(page, "Freehand").click();
  expect(await page.getByLabel("Stroke color", { exact: true }).inputValue()).toBe("#ff0000");
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.keyboard.down("Space");
  await cursor(page, "grab");
  await page.mouse.down();
  await cursor(page, "grabbing");
  await page.mouse.move(box.x + 540, box.y + 340, { steps: 5 });
  await page.mouse.up();
  await cursor(page, "grab");
  await page.keyboard.up("Space");
  await cursor(page, "pen");
  await page.mouse.down({ button: "middle" });
  await cursor(page, "grabbing");
  await page.mouse.up({ button: "middle" });
  await cursor(page, "pen");
  await page.keyboard.press("v");
  expect(await page.getByTestId("canvas").getAttribute("data-cursor")).toBe("default");
  for (const [key, name] of [
    ["t", "text"],
    ["r", "crosshair"],
    ["n", "crosshair"],
    ["c", "link"],
    ["h", "grab"],
  ] as const) {
    await page.keyboard.press(key);
    await cursor(page, name);
  }
  await page.keyboard.press("Space");
  await cursor(page, "grab");
  expect(errors).toEqual([]);
  await context.close();
});

it("shares immediate selected paint edits with undo while preserving the next brush and sampling fill", async () => {
  const { context, page } = await scene();
  const peerContext = await browser.newContext();
  const peer = await open(peerContext, new URL(page.url()).hash.slice(6));
  await page.keyboard.press("p");
  await page.getByLabel("Stroke color", { exact: true }).fill("#ff0000");
  await mark(page, 370);
  await selectDrawingRed(page);
  await page.getByLabel("Stroke color", { exact: true }).fill("#1971c2");
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.type === "drawing")?.look.line)
    .toBe("#1971c2");
  await button(page, "Undo").click();
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.type === "drawing")?.look.line)
    .toBe("#ff0000");
  await button(page, "Freehand").click();
  expect(await page.getByLabel("Stroke color", { exact: true }).inputValue()).toBe("#ff0000");
  await button(page, "Vector").click();
  await button(page, "Pick color").click();
  await page
    .getByRole("group", { name: "Sample into", exact: true })
    .getByRole("button", { name: "Fill", exact: true })
    .click();
  await row(page, "Sample").click();
  await cursor(page, "crosshair");
  expect(await page.getByLabel("Fill color", { exact: true }).inputValue()).toBe("#abcdef");
  await page.getByLabel("Ink opacity", { exact: true }).fill("65");
  await mark(page, 500);
  await expect
    .poll(async () => (await exported(peer)).objects.filter((i) => i.type === "drawing").length)
    .toBe(2);
  const shapes = (await exported(peer)).objects.filter((i) => i.type === "drawing");
  expect(shapes.find((i) => i.ink === "rectangle")?.look).toMatchObject({
    fill: "#abcdef",
    opacity: 65,
    strokeOpacity: 65,
  });
  expect(errors).toEqual([]);
  await context.close();
  await peerContext.close();
});

async function selectDrawingRed(page: Page) {
  const box = (await page
    .getByTestId("canvas")
    .locator('path[stroke="#ff0000"]')
    .first()
    .boundingBox())!;
  await button(page, "Select ink").click();
  await page.mouse.move(box.x - 12, box.y - 12);
  await page.mouse.down();
  for (const [x, y] of [
    [box.x + box.width + 12, box.y - 12],
    [box.x + box.width + 12, box.y + box.height + 12],
    [box.x - 12, box.y + box.height + 12],
    [box.x - 12, box.y - 12],
  ])
    await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
}

it("cancels pending polygons on tool changes and Escape without publishing partial paths", async () => {
  const { context, page } = await scene();
  await page.keyboard.press("p");
  await button(page, "Vector").click();
  await button(page, "Polygon").click();
  const canvas = page.getByTestId("canvas");
  for (const [x, y] of [
    [450, 300],
    [600, 300],
    [600, 400],
  ])
    await canvas.click({ position: { x, y } });
  await button(page, "Freehand").click();
  await page.keyboard.press("Enter");
  expect((await exported(page)).objects).toHaveLength(1);
  await button(page, "Vector").click();
  for (const [x, y] of [
    [450, 300],
    [600, 300],
    [600, 400],
  ])
    await canvas.click({ position: { x, y } });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  expect((await exported(page)).objects).toHaveLength(1);
  await page.keyboard.press("p");
  await button(page, "Freehand").click();
  await mark(page, 400);
  expect((await exported(page)).objects).toHaveLength(2);
  expect(errors).toEqual([]);
  await context.close();
});

it("samples visible content beneath hidden Markup", async () => {
  const { context, page } = await scene();
  await page.getByLabel("Import file").setInputFiles({
    name: "annotation.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "arconis 1\ndrawing annotation markup points 150,200 330,200 line #ff0000 line-width 20"
    ),
  });
  await page.keyboard.press("p");
  await page.getByRole("checkbox", { name: "Show annotations", exact: true }).uncheck();
  await button(page, "Pick color").click();
  await row(page, "Sample").click();
  expect(await page.getByLabel("Stroke color", { exact: true }).inputValue()).toBe("#112233");
  expect(errors).toEqual([]);
  await context.close();
});
