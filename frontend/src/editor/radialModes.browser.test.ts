import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, row, setContextWheel } from "./browserHarness";

const ring = (page: Page) => page.getByTestId("command-ring");

/** The centre of the ring as it is drawn now; a sub-ring opens in the same place. */
async function ringCentre(page: Page) {
  const box = (await ring(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Presses the right button at a page point and waits for the ring around it. */
async function heldRing(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await ring(page).waitFor();
  return ringCentre(page);
}

/** A point at a compass angle (degrees clockwise from the top) and radius from the ring's centre. */
const at = (centre: { x: number; y: number }, degrees: number, radius = 84) => ({
  x: centre.x + radius * Math.sin((degrees * Math.PI) / 180),
  y: centre.y - radius * Math.cos((degrees * Math.PI) / 180),
});
const WEST = 270;
/** Where each mode sits in the Mode ring: Back is west, where Mode was. */
const MODES = { Draw: 0, Markup: 45, Connect: 180, Add: 225, Select: 315 };
const mode = (page: Page, name: keyof typeof MODES) =>
  ring(page).getByRole("menuitemradio", { name, exact: true });
const item = (page: Page, name: string) => ring(page).getByRole("menuitem", { name, exact: true });

/** Brings a held right button from the centre to rest on a wedge, where it stays. */
async function restOn(page: Page, centre: { x: number; y: number }, degrees: number) {
  await page.mouse.move(centre.x, centre.y, { steps: 2 });
  const wedge = at(centre, degrees);
  await page.mouse.move(wedge.x, wedge.y, { steps: 4 });
}

/** One stroke from a press point: west onto Mode, then toward a mode, and release. */
async function chooseMode(page: Page, name: keyof typeof MODES, x: number, y: number) {
  const centre = await heldRing(page, x, y);
  await restOn(page, centre, WEST);
  await mode(page, name).waitFor();
  const wedge = at(centre, MODES[name]);
  await page.mouse.move(wedge.x, wedge.y, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => ring(page).count()).toBe(0);
}

it("switches mode in one stroke from any ring, with nothing further to choose", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const page = await open(context, room);
  await setContextWheel(page, true);
  const peer = await open(peerContext, room);
  await add(page, "Sticky note (N)", "Source", 420, 320);
  const canvas = page.getByTestId("canvas");
  const bounds = (await canvas.boundingBox())!;
  const tool = () => canvas.getAttribute("data-tool");

  // The canvas ring keeps Mode west and the menu south-west; no mode shows until Mode is reached.
  const centre = await heldRing(page, bounds.x + 700, bounds.y + 600);
  expect(await ring(page).getByRole("menuitemradio").count()).toBe(0);
  await page.mouse.move(at(centre, WEST).x, at(centre, WEST).y, { steps: 4 });
  expect(await ring(page).locator(".ring-wedge.active").getAttribute("aria-label")).toBe("Mode");
  await page.mouse.move(at(centre, 225).x, at(centre, 225).y, { steps: 4 });
  expect(await ring(page).locator(".ring-wedge.active").getAttribute("aria-label")).toBe("More…");

  // Resting on Mode opens the modes where the ring was, the current one marked, and Back under
  // the pointer waits until the pointer has left it.
  await restOn(page, centre, WEST);
  await mode(page, "Select").waitFor();
  expect(await mode(page, "Select").getAttribute("aria-checked")).toBe("true");
  expect(await ring(page).getByRole("menuitemradio").count()).toBe(5);
  expect(await item(page, "Add note here").count()).toBe(0);
  expect(await ringCentre(page)).toEqual(centre);
  await page.waitForTimeout(400);
  expect(await item(page, "Back").count()).toBe(1);
  await page.screenshot({ path: "test-results/radial-modes.png" });

  // Leaving Back and resting on it again returns to the ring it came from.
  await restOn(page, centre, WEST);
  await item(page, "Add note here").waitFor();

  // Onto Mode again and on to Add: the last shape placed is armed, and the ring is gone.
  await restOn(page, centre, WEST);
  await mode(page, "Add").waitFor();
  await page.mouse.move(at(centre, MODES.Add).x, at(centre, MODES.Add).y, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => ring(page).count()).toBe(0);
  expect(await tool()).toBe("note");

  // While adding, the ring offers the shapes wherever it is pressed, Mode and the menu in place.
  const shapes = await heldRing(page, bounds.x + 700, bounds.y + 600);
  expect(await ring(page).getByRole("menuitem", { name: "Mode", exact: true }).count()).toBe(1);
  expect(await ring(page).getByRole("menuitem", { name: "More…", exact: true }).count()).toBe(1);
  await page.mouse.move(at(shapes, 90).x, at(shapes, 90).y, { steps: 4 });
  await page.mouse.up({ button: "right" });
  expect(await tool()).toBe("rectangle");
  await canvas.click({ position: { x: 760, y: 320 } });
  await canvas.press("Enter");
  await page.getByLabel("Edit canvas text", { exact: true }).fill("Target");
  await page.getByLabel("Edit canvas text", { exact: true }).press("ControlOrMeta+Enter");

  // Mode is on an object's ring too: a quick stroke out through it, then south, connects.
  const source = (await row(page, "Source").boundingBox())!;
  const object = await heldRing(page, source.x + source.width / 2, source.y + source.height / 2);
  expect(await ring(page).getByRole("menuitem", { name: "Delete", exact: true }).count()).toBe(1);
  await page.mouse.move(at(object, WEST).x, at(object, WEST).y, { steps: 3 });
  const beyond = at(object, WEST, 132);
  await page.mouse.move(beyond.x, beyond.y, { steps: 2 });
  await mode(page, "Connect").waitFor();
  expect(await ringCentre(page)).toEqual(object);
  const connect = at(object, MODES.Connect);
  await page.mouse.move(connect.x, connect.y, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => ring(page).count()).toBe(0);
  expect(await tool()).toBe("connect");
  expect((await exported(page)).objects).toHaveLength(2);

  await row(page, "Source").click();
  await row(page, "Target").click();
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(3);
  const saved = (await exported(peer)).objects;
  const from = saved.find((item) => item.name === "Source")!;
  const to = saved.find((item) => item.name === "Target")!;
  expect(saved.find((item) => item.type === "line")).toMatchObject({ from: from.id, to: to.id });

  // Select is beside Mode, from any mode.
  await chooseMode(page, "Select", bounds.x + 700, bounds.y + 600);
  expect(await tool()).toBe("select");
  expect(errors).toEqual([]);
  await context.close();
  await peerContext.close();
});

it("switches to drawing from the radial and hides workspace handles while preserving ink lasso transforms", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await setContextWheel(page, true);
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
  // Choosing Draw is the whole switch: the last brush is armed with no tool to pick.
  await chooseMode(page, "Draw", bounds.x + 700, bounds.y + 500);
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

  // In Draw the ring holds the drawing tools, even over an object: east opens the vector shapes
  // in place, Back where Vector was, and north-east of those is the arrow.
  const object = (await row(page, "Keep still").boundingBox())!;
  const tools = await heldRing(page, object.x + object.width / 2, object.y + object.height / 2);
  expect(await ring(page).getByRole("menuitem", { name: "Freehand", exact: true }).count()).toBe(1);
  expect(await ring(page).getByRole("menuitem", { name: "Delete", exact: true }).count()).toBe(0);
  await restOn(page, tools, 90);
  await item(page, "Draw arrow").waitFor();
  expect(await item(page, "Back").count()).toBe(1);
  expect(await ringCentre(page)).toEqual(tools);
  await page.mouse.move(at(tools, 45).x, at(tools, 45).y, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => ring(page).count()).toBe(0);
  expect(
    await page.getByRole("button", { name: "Arrow", exact: true }).getAttribute("aria-pressed")
  ).toBe("true");
  expect(await canvas.getAttribute("data-cursor")).toBe("crosshair");

  // Released on a wedge that opens a ring, that ring stays for a click.
  const again = await heldRing(page, bounds.x + 700, bounds.y + 500);
  await page.mouse.move(at(again, 180).x, at(again, 180).y, { steps: 2 });
  await page.mouse.up({ button: "right" });
  await ring(page).getByRole("menuitem", { name: "Erase segment", exact: true }).waitFor();
  expect(await ring(page).getByRole("menuitem", { name: "Back", exact: true }).count()).toBe(1);
  await ring(page).getByRole("menuitem", { name: "Back", exact: true }).click();
  await ring(page).getByRole("menuitem", { name: "Freehand", exact: true }).waitFor();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Select ink", exact: true }).click();
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
