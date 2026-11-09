import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, row } from "./browserHarness";

async function heldRing(page: Page, x = 500, y = 500) {
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + x, canvas.y + y);
  await page.mouse.down({ button: "right" });
  const ring = page.getByTestId("command-ring");
  await ring.waitFor();
  const box = (await ring.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

it("changes radial tool families during a held drag and shares the resulting objects and connector", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const page = await open(context, room);
  const peer = await open(peerContext, room);
  await add(page, "Sticky note (N)", "Source", 200, 200);
  let centre = await heldRing(page);
  await page.mouse.move(centre.x, centre.y - 152);
  const ring = page.getByTestId("command-ring");
  await ring.getByRole("menuitem", { name: "Rectangle", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/radial-modes.png" });
  await page.mouse.move(centre.x + 84, centre.y);
  await page.mouse.up({ button: "right" });
  expect(await page.getByTestId("canvas").getAttribute("data-tool")).toBe("rectangle");
  await page.getByTestId("canvas").click({ position: { x: 550, y: 250 } });
  await page.getByLabel("Object text", { exact: true }).fill("Target");
  await page.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Enter");

  centre = await heldRing(page, 500, 550);
  await page.mouse.move(centre.x, centre.y + 152);
  await ring.getByRole("menuitem", { name: "Connector: click two objects", exact: true }).waitFor();
  await page.mouse.move(centre.x, centre.y - 84);
  await page.mouse.up({ button: "right" });
  expect(await page.getByTestId("canvas").getAttribute("data-tool")).toBe("connect");
  await row(page, "Source").click();
  await row(page, "Target").click();
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(3);
  const saved = (await exported(peer)).objects;
  const source = saved.find((item) => item.name === "Source")!;
  const target = saved.find((item) => item.name === "Target")!;
  expect(saved.find((item) => item.type === "line")).toMatchObject({
    from: source.id,
    to: target.id,
  });
  expect(errors).toEqual([]);
  await context.close();
  await peerContext.close();
});

it("switches to drawing from the radial and hides workspace handles while preserving ink lasso transforms", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Keep still", 260, 240);
  const canvas = page.getByTestId("canvas");
  const resize = canvas.locator('[style*="cursor:"][style*="-resize"]');
  expect(await resize.count()).toBeGreaterThan(0);
  await page.getByTestId("quick-create").waitFor();
  await row(page, "Keep still").hover();
  await expect
    .poll(() => canvas.locator('image[*|href$="/connection-point.svg"]').count())
    .toBeGreaterThan(0);
  const before = (await exported(page)).objects[0];
  // Right press on the selected object retains the selection while choosing a drawing instrument.
  const target = (await row(page, "Keep still").boundingBox())!;
  const bounds = (await canvas.boundingBox())!;
  const centre = await heldRing(
    page,
    target.x + target.width / 2 - bounds.x,
    target.y + target.height / 2 - bounds.y
  );
  await page.mouse.move(centre.x + 152, centre.y);
  await page
    .getByTestId("command-ring")
    .getByRole("menuitem", { name: "Pen", exact: true })
    .waitFor();
  await page.mouse.move(centre.x, centre.y - 84);
  await page.mouse.up({ button: "right" });
  expect(await canvas.getAttribute("data-tool")).toBe("draw");
  await expect.poll(() => resize.count()).toBe(0);
  expect(await page.getByTestId("quick-create").count()).toBe(0);
  expect(await page.getByTestId("selection-frame").count()).toBe(0);
  await row(page, "Keep still").hover();
  expect(await canvas.locator('image[*|href$="/connection-point.svg"]').count()).toBe(0);
  await page.mouse.move(bounds.x + 270, bounds.y + 270);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 400, bounds.y + 320, { steps: 10 });
  await page.mouse.up();
  const saved = (await exported(page)).objects;
  expect(saved.find((item) => item.id === before.id)).toEqual(before);
  expect(saved.filter((item) => item.type === "drawing")).toHaveLength(1);

  await page.getByRole("button", { name: "Lasso", exact: true }).click();
  await page.mouse.move(bounds.x + 250, bounds.y + 250);
  await page.mouse.down();
  for (const [x, y] of [
    [420, 250],
    [420, 340],
    [250, 340],
    [250, 250],
  ])
    await page.mouse.move(bounds.x + x, bounds.y + y, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId("selection-frame").waitFor();
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await row(page, "Keep still").click();
  await expect.poll(() => resize.count()).toBeGreaterThan(0);
  await page.getByTestId("quick-create").waitFor();
  await row(page, "Keep still").hover();
  await expect
    .poll(() => canvas.locator('image[*|href$="/connection-point.svg"]').count())
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await context.close();
});
