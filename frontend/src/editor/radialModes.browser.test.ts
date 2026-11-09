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

/** A point at a compass angle (degrees clockwise from the top) and radius from the ring's centre. */
const at = (centre: { x: number; y: number }, degrees: number, radius: number) => ({
  x: centre.x + radius * Math.sin((degrees * Math.PI) / 180),
  y: centre.y - radius * Math.cos((degrees * Math.PI) / 180),
});
/** The canvas ring's Mode wedge, south-west, and the arc's segments beside it. */
const MODE_WEDGE = 225;
const SEGMENTS = { Select: 180, Add: 210, Draw: 240, Connect: 270 };

/** Rests a held right button on the Mode wedge, then releases on one of the arc's modes. */
async function chooseMode(page: Page, mode: keyof typeof SEGMENTS, x = 500, y = 500) {
  const centre = await heldRing(page, x, y);
  const ring = page.getByTestId("command-ring");
  const wedge = at(centre, MODE_WEDGE, 84);
  await page.mouse.move(wedge.x, wedge.y);
  await ring.getByRole("menuitemradio", { name: mode, exact: true }).waitFor();
  const segment = at(centre, SEGMENTS[mode], 149);
  await page.mouse.move(segment.x, segment.y);
  await page.mouse.up({ button: "right" });
}

it("opens the mode arc from the Mode wedge without changing the ring, and switches modes", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const page = await open(context, room);
  const peer = await open(peerContext, room);
  await add(page, "Sticky note (N)", "Source", 200, 200);
  const ring = page.getByTestId("command-ring");

  // The ring holds its commands, and no arc, until the Mode wedge is reached.
  const centre = await heldRing(page);
  expect(await ring.getByRole("menuitemradio").count()).toBe(0);
  const wedge = at(centre, MODE_WEDGE, 84);
  await page.mouse.move(wedge.x, wedge.y);
  await ring.getByRole("menuitemradio", { name: "Draw", exact: true }).waitFor();
  const note = ring.getByRole("menuitem", { name: "Add note here", exact: true });
  expect(await note.count()).toBe(1);
  expect(
    await ring
      .getByRole("menuitemradio", { name: "Select", exact: true })
      .getAttribute("aria-checked")
  ).toBe("true");
  await page.screenshot({ path: "test-results/radial-modes.png" });
  // Crossing the arc changes nothing until release.
  const draw = at(centre, SEGMENTS.Draw, 149);
  await page.mouse.move(draw.x, draw.y);
  expect(await note.count()).toBe(1);
  // Releasing on Add offers the shapes to place.
  const adding = at(centre, SEGMENTS.Add, 149);
  await page.mouse.move(adding.x, adding.y);
  await page.mouse.up({ button: "right" });
  await ring.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  expect(await page.getByTestId("canvas").getAttribute("data-tool")).toBe("rectangle");
  await page.getByTestId("canvas").click({ position: { x: 550, y: 250 } });
  await page.getByLabel("Object text", { exact: true }).fill("Target");
  await page.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Enter");

  await chooseMode(page, "Connect", 500, 550);
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
  const bounds = (await canvas.boundingBox())!;
  await chooseMode(page, "Draw", 700, 500);
  expect(await canvas.getAttribute("data-tool")).toBe("draw");
  expect(await page.getByTestId("command-ring").count()).toBe(0);
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
