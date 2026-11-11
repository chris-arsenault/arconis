import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, dockPanel, errors, exported, open, railPanel } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

const layerRow = (page: Page, id: string) =>
  page.locator(`[data-testid="layer"][data-layer="${id}"]`);
const shape = (page: Page, fill: string) =>
  page.getByTestId("canvas").locator(`[fill="${fill}"]`).first();

async function centre(page: Page, fill: string) {
  const box = (await shape(page, fill).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Whether a shape's middle is inside the canvas's window. A shape outside it is left in the page,
 * hidden, with the place it was last drawn, so only one that is displayed counts.
 */
async function inView(page: Page, fill: string) {
  if (!(await shape(page, fill).isVisible())) return false;
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  const box = await shape(page, fill).boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return (
    x > canvas.x && x < canvas.x + canvas.width && y > canvas.y && y < canvas.y + canvas.height
  );
}

const selection = (page: Page) => page.locator("aside.inspector");

/** The selected object's text, or "" when nothing is selected. */
async function selectedName(page: Page) {
  const field = page.getByLabel("Object text", { exact: true });
  return (await field.count()) ? field.inputValue() : "";
}

it("locks a layer for everyone so clicks pass through to what is beneath", async () => {
  const a = await browser.newContext(VIEWPORT);
  const b = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(a, room);
  // A plan layer drawn over a box in the base layer, with a corner of the box showing.
  await page.getByLabel("Import file").setInputFiles({
    name: "plan.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
layer plan "Plan"
node under "Under" at 0,0 size 300,200 fill #ff0000
node cover "Cover" at 150,100 size 300,200 fill #0000ff in-layer plan`),
  });
  await shape(page, "#0000ff").waitFor();
  const peer = await open(b, room);
  await shape(peer, "#0000ff").waitFor();
  await page.getByTestId("canvas").press("Escape");

  // Unlocked, a click on the cover selects the cover.
  const cover = await centre(page, "#0000ff");
  const overlap = { x: cover.x - 60, y: cover.y - 40 };
  await page.mouse.click(overlap.x, overlap.y);
  await expect.poll(() => selectedName(page)).toBe("Cover");

  // Locking the layer drops it from the selection, for the peer as well.
  const theirs = await centre(peer, "#0000ff");
  await peer.mouse.click(theirs.x + 60, theirs.y + 40);
  await selection(peer).waitFor();
  await dockPanel(page, "Layers");
  await layerRow(page, "plan").getByRole("button", { name: "Lock Plan", exact: true }).click();
  await expect.poll(() => selection(peer).count()).toBe(0);
  expect((await exported(page)).text).toContain('layer plan "Plan" locked');

  // Now the same click reaches the box beneath, and the cover cannot be picked or dragged.
  await page.mouse.click(overlap.x, overlap.y);
  await expect.poll(() => selectedName(page)).toBe("Under");
  await page.getByTestId("canvas").press("Escape");
  await peer.mouse.move(cover.x + 60, cover.y + 40);
  await peer.mouse.down();
  await peer.mouse.move(cover.x + 260, cover.y + 140, { steps: 8 });
  await peer.mouse.up();
  await peer.getByTestId("canvas").press("ControlOrMeta+a");
  await peer.getByTestId("canvas").press("Delete");
  const after = (await exported(page)).objects;
  expect(after.find((item) => item.id === "cover")).toMatchObject({ x: 150, y: 100 });
  expect(after.find((item) => item.id === "under")).toBeUndefined();

  // A locked layer cannot take new objects; unlocking restores it.
  await layerRow(page, "plan").locator(".layer-name").click();
  await page.getByText('"Plan" is locked; unlock it to add to it.').waitFor();
  expect(await layerRow(page, "plan").getAttribute("data-active")).toBe("false");
  await layerRow(page, "plan").getByRole("button", { name: "Unlock Plan", exact: true }).click();
  await page.mouse.click(cover.x + 60, cover.y + 40);
  await expect.poll(() => selectedName(page)).toBe("Cover");
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});

it("starts newcomers on the room's default layer and at its opening view", async () => {
  const a = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(a, room);
  await page.getByLabel("Import file").setInputFiles({
    name: "room.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
layer ideas "Ideas"
node origin "Origin" at 0,0 size 160,90 fill #ff0000
node far "Start here" at 3000,600 size 160,90 fill #0000ff`),
  });
  await shape(page, "#ff0000").waitFor();

  // Make Ideas the default layer; it cannot then be locked.
  await dockPanel(page, "Layers");
  await layerRow(page, "ideas").locator(".layer-name").click();
  await page.getByRole("button", { name: "Make Ideas the default layer", exact: true }).click();
  await layerRow(page, "ideas").getByTestId("default-layer").waitFor();
  await layerRow(page, "ideas").getByRole("button", { name: "Lock Ideas", exact: true }).click();
  await page.getByText(/make another layer the default before locking it/).waitFor();

  // Choose the far object as the room's opening view from the jump points.
  await page.getByTestId("canvas").press("ControlOrMeta+a");
  await dockPanel(page, "Navigate");
  await page.getByRole("button", { name: "Mark selection", exact: true }).click();
  await page.getByRole("button", { name: "Open the room at Start here", exact: true }).click();
  const saved = (await exported(page)).text;
  expect(saved).toContain('layer ideas "Ideas" default');
  expect(saved.trimEnd().endsWith("opening far")).toBe(true);

  // A newcomer's view starts on that object, with nothing selected, and their first object goes
  // into the default layer.
  const b = await browser.newContext(VIEWPORT);
  const peer = await open(b, room);
  await expect.poll(() => inView(peer, "#0000ff"), { timeout: 10000 }).toBe(true);
  expect(await inView(peer, "#ff0000")).toBe(false);
  expect(await selection(peer).count()).toBe(0);
  await dockPanel(peer, "Layers");
  expect(await layerRow(peer, "ideas").getAttribute("data-active")).toBe("true");
  await railPanel(peer, "Shapes");
  await peer.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  await peer.getByTestId("canvas").click({ position: { x: 300, y: 300 } });
  await expect
    .poll(
      async () => (await exported(peer)).objects.find((item) => item.name === "Rectangle")?.layer
    )
    .toBe("ideas");

  // A link to another object wins over the opening view.
  const c = await browser.newContext(VIEWPORT);
  const linked = await open(c, `${room}&item=origin`);
  await expect.poll(() => inView(linked, "#ff0000"), { timeout: 10000 }).toBe(true);
  expect(await inView(linked, "#0000ff")).toBe(false);
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
  await c.close();
});
