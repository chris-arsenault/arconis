import { expect, it } from "vitest";
import { browser, open, exported, errors, row, add, fileMenu, drawInto } from "./browserHarness";
import { createRoomId } from "../collaboration/room";
import type { Page } from "playwright";

async function stroke(page: Page, start: [number, number], end: [number, number]) {
  const canvas = await page.getByTestId("canvas").boundingBox();
  await page.mouse.move(canvas!.x + start[0], canvas!.y + start[1]);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + end[0], canvas!.y + end[1], { steps: 12 });
  await page.mouse.up();
}

it("draws shared markup without moving notes; highlights follow objects; clean exports omit annotations", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  const peer = await open(await browser.newContext(), new URL(page.url()).hash.slice(6));
  await add(page, "Sticky note (N)", "Review", 150, 150);
  const before = (await exported(page)).objects.find((item) => item.type === "note")!;
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("button", { name: "Marker", exact: true }).click();
  await stroke(page, [130, 190], [360, 200]);
  await expect
    .poll(async () => (await exported(peer)).objects.filter((item) => item.markup).length)
    .toBe(1);
  const ink = (await exported(page)).objects.find((item) => item.type === "drawing")!;
  expect(ink.look.strokeOpacity).toBe(30);
  expect((await exported(page)).objects.find((item) => item.id === before.id)).toEqual(before);
  await page.getByRole("button", { name: "Object outline", exact: true }).click();
  const canvas = await page.getByTestId("canvas").boundingBox();
  await page.mouse.click(canvas!.x + 200, canvas!.y + 220);
  await expect
    .poll(
      async () => (await exported(peer)).objects.filter((item) => item.type === "highlight").length
    )
    .toBe(1);
  await fileMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Include markup" }).uncheck();
  const clean = await exported(page);
  expect(clean.objects.map((item) => item.type)).toEqual(["note"]);
  await fileMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Include markup" }).check();
  await page.getByRole("button", { name: "Delete all annotations", exact: true }).click();
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(3);
  await page.keyboard.press("v");
  await row(page, "Review").click();
  expect(errors).toEqual([]);
});

it("moves lassoed annotations to the content layer and back with shared Undo", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  const peer = await open(await browser.newContext(), new URL(page.url()).hash.slice(6));
  await page.keyboard.press("m");
  await stroke(page, [150, 150], [290, 220]);
  await stroke(page, [190, 180], [310, 240]);
  await page.getByRole("button", { name: "Select ink", exact: true }).click();
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + 130, canvas.y + 130);
  await page.mouse.down();
  for (const [x, y] of [
    [340, 130],
    [340, 270],
    [130, 270],
    [130, 130],
  ])
    await page.mouse.move(canvas.x + x, canvas.y + y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => await page.getByTestId("selection-count").textContent())
    .toBe("2 objects");
  await page.getByRole("button", { name: "Move to content layer", exact: true }).click();
  let saved = await exported(page);
  expect(saved.objects).toHaveLength(2);
  expect(saved.objects.every((item) => item.type === "drawing" && !item.markup)).toBe(true);
  expect(
    await page.getByRole("button", { name: "Delete all annotations", exact: true }).isDisabled()
  ).toBe(true);
  await drawInto(page, "content");
  expect(
    await page.getByRole("button", { name: "Delete all annotations", exact: true }).count()
  ).toBe(0);
  await page.getByRole("button", { name: "Freehand", exact: true }).click();
  await stroke(page, [210, 170], [250, 200]);
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(3);
  await page.getByRole("button", { name: "Move to Markup", exact: true }).click();
  saved = await exported(page);
  expect(saved.objects.filter((item) => item.markup)).toHaveLength(2);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await exported(peer)).objects.filter((item) => item.markup).length)
    .toBe(0);
  expect(errors).toEqual([]);
});

it("fills closed shapes with a gradient, adjusts its direction and erases part of editable ink", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1100 } }),
    createRoomId()
  );
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "Vector", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByText("Fill gradient", { exact: true }).click();
  await page.getByLabel("Fill color", { exact: true }).fill("#ff0000");
  await page.getByLabel("Gradient color", { exact: true }).fill("#0000ff");
  await stroke(page, [180, 170], [380, 310]);
  const first = (await exported(page)).objects[0];
  expect(first.look).toMatchObject({ fill: "#ff0000", gradient: "#0000ff", closed: true });
  await expect
    .poll(() => page.getByTestId("canvas").locator("defs.ink-gradients linearGradient").count())
    .toBe(1);
  await page.getByRole("button", { name: "Select ink", exact: true }).click();
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + 160, canvas.y + 150);
  await page.mouse.down();
  for (const [x, y] of [
    [400, 150],
    [400, 330],
    [160, 330],
    [160, 150],
  ])
    await page.mouse.move(canvas.x + x, canvas.y + y, { steps: 4 });
  await page.mouse.up();
  const handle = await page
    .getByRole("button", { name: "Gradient direction", exact: true })
    .boundingBox();
  await page.mouse.move(handle!.x + 12, handle!.y + 12);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 280, canvas.y + 350, { steps: 8 });
  await page.mouse.up();
  expect((await exported(page)).objects[0].look.gradientAngle).toBeGreaterThan(70);
  await page.screenshot({ path: "test-results/drawing-tools.png" });
  await page.getByRole("button", { name: "Vector", exact: true }).click();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await stroke(page, [170, 420], [450, 420]);
  await page.getByRole("button", { name: "Erase segment", exact: true }).click();
  await stroke(page, [310, 390], [310, 450]);
  await expect.poll(async () => (await exported(page)).objects.length).toBe(3);
  await page.keyboard.press("Control+z");
  expect((await exported(page)).objects).toHaveLength(2);
  expect(errors).toEqual([]);
});
