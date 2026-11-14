import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, open, railPanel, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

/** The middle of an object's label on screen, which is the middle of the object. */
async function centre(page: Page, label: string) {
  const box = (await row(page, label).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function load(page: Page, source: string, last: string) {
  await page.getByLabel("Import file").setInputFiles({
    name: "snap.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1\n${source}`),
  });
  await row(page, last).waitFor();
}

/** Drags an object by its label to a screen offset. */
async function dragBy(page: Page, label: string, dx: number, dy: number) {
  const from = await centre(page, label);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

const placed = async (page: Page, id: string) =>
  (await exported(page)).objects.find((item) => item.id === id)!;

it("pulls a dragged object into alignment from a few pixels away, with the grid off", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await load(
    page,
    `node a "First" at 0,0 size 100,60\nnode c "Third" at 300,200 size 100,60`,
    "Third"
  );
  await page.getByRole("button", { name: "Grid and snapping", exact: true }).click();
  const first = await centre(page, "First");
  const third = await centre(page, "Third");
  const scale = (third.x - first.x) / 300;

  // Five screen pixels below First's top edge, Third's top snaps level with it.
  await dragBy(page, "Third", 0, -200 * scale + 5);
  await expect.poll(async () => (await placed(page, "c")).y).toBe(0);

  // Thirty pixels away from anything it lines up with, it lands where it is dropped.
  await dragBy(page, "Third", 0, 30);
  await expect.poll(async () => (await placed(page, "c")).y).toBeCloseTo(30 / scale, 0);
  expect(errors).toEqual([]);
  await context.close();
});

it("snaps a dragged object to where its connector runs straight", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  // The line leaves First 60 down its right side and meets the middle of Second's left side,
  // so it runs level when Second's top is at 30, which lines up with no edge of First.
  await load(
    page,
    `node a "First" at 0,0 size 120,200
node b "Second" at 400,150 size 100,60
a.(1,0.3) -> b.left`,
    "Second"
  );
  const first = await centre(page, "First");
  const second = await centre(page, "Second");
  const scale = (second.x - first.x) / 390;

  // Drag Second up to three pixels short of level, watching the run it will take.
  const from = second;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 120 * scale + 3, { steps: 12 });
  await page.screenshot({ path: "test-results/straight-connector.png" });
  await page.mouse.up();

  await expect.poll(async () => (await placed(page, "b")).y).toBe(30);
  expect((await placed(page, "b")).x).toBe(400);
  expect(errors).toEqual([]);
  await context.close();
});

it("places a separator line from Shapes as a bare rule", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await railPanel(page, "Shapes");
  await page.getByRole("button", { name: "Separator line", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 500, y: 400 } });

  await expect.poll(async () => (await exported(page)).objects.length).toBe(1);
  const [rule] = (await exported(page)).objects;
  expect(rule).toMatchObject({ type: "node", stencil: "separator", name: "" });
  expect(rule.width).toBeGreaterThan(rule.height * 5);
  // A rule has a line to style but no text or fill.
  await page.getByLabel("Line color", { exact: true }).first().waitFor();
  expect(await page.getByLabel("Fill color", { exact: true }).count()).toBe(0);
  expect(await page.getByRole("button", { name: "Edit text", exact: true }).count()).toBe(0);
  await page.screenshot({ path: "test-results/separator.png" });
  expect(errors).toEqual([]);
  await context.close();
});
