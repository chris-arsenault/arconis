import { expect, it } from "vitest";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, objectCount, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

async function exportPng(page: Page, reviewName: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const path = (await download.path())!;
  await mkdir("test-results/review", { recursive: true });
  await copyFile(path, `test-results/review/${reviewName}.png`);
  return readFile(path);
}

/** Decodes a PNG in the browser and reports its size and how much of it is drawn on. */
const inspect = (page: Page, png: Buffer) =>
  page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let inked = 0;
    for (let index = 0; index < data.length; index += 4)
      if (data[index] < 200 || data[index + 1] < 200 || data[index + 2] < 200) inked++;
    return { width: image.width, height: image.height, inked };
  }, png.toString("base64"));

async function load(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel("Import file").setInputFiles({ name, mimeType: "image/png", buffer });
}

async function buildCanvas(page: Page) {
  await add(page, "Rectangle (R)", "First box", 220, 170);
  await add(page, "Sticky note (N)", "Second note", 560, 170);
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByTestId("canvas").click({ position: { x: 880, y: 760 } });
  await page.mouse.move(bounds.x + 340, bounds.y + 215, { steps: 2 });
  await page.mouse.move(bounds.x + 380, bounds.y + 215, { steps: 8 });
  await page.mouse.down();
  await page.mouse.move(bounds.x + 550, bounds.y + 255, { steps: 12 });
  await page.mouse.move(bounds.x + 560, bounds.y + 255, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => objectCount(page)).toBe(3);
}

it("exports the whole canvas as a picture that loads back in another room", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await buildCanvas(page);
  const scale = await page.getByTestId("zoom-level").textContent();
  const png = await exportPng(page, "export-canvas");
  const { width, height, inked } = await inspect(page, png);
  expect(width).toBeGreaterThan(height);
  expect(inked).toBeGreaterThan(100);
  expect(await page.getByTestId("zoom-level").textContent()).toBe(scale);

  const other = await open(await browser.newContext(VIEWPORT), createRoomId());
  await load(other, "canvas.png", png);
  await expect.poll(() => objectCount(other)).toBe(3);
  const labels = (await exported(other)).objects.map((item) => item.name);
  expect(labels).toEqual(expect.arrayContaining(["", "First box", "Second note"]));
  const edge = (await exported(other)).objects.find((item) => item.type === "line")!;
  expect(edge.from && edge.to).toBeTruthy();
  expect(errors).toEqual([]);
});

it("exports only the selection, in the picture and in its copy", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await buildCanvas(page);
  const whole = await inspect(page, await exportPng(page, "export-whole"));
  await row(page, "First box").click();
  const png = await exportPng(page, "export-selection");
  const part = await inspect(page, png);
  expect(part.width).toBeLessThan(whole.width);

  const other = await open(await browser.newContext(VIEWPORT), createRoomId());
  await load(other, "part.png", png);
  await expect.poll(() => objectCount(other)).toBe(1);
  expect((await exported(other)).objects[0].name).toBe("First box");
  expect(errors).toEqual([]);
});

it("draws icons in the picture", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await page.getByRole("button", { name: "Icon: Server", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 300, y: 240 } });
  await expect.poll(() => objectCount(page)).toBe(1);
  await page.keyboard.press("Escape");
  const { inked } = await inspect(page, await exportPng(page, "export-icon"));
  expect(inked).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

it("explains an empty canvas and a picture with no canvas inside", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await page.getByText("Add something to the canvas first.").waitFor();
  const plain = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );
  await load(page, "photo.png", plain);
  await page.getByText("This picture has no canvas inside it.").waitFor();
  expect(await objectCount(page)).toBe(0);
  expect(errors).toEqual([]);
});
