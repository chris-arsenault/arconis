import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, open, row } from "./browserHarness";

/** The middle of an object's label on screen, which is the middle of the object. */
async function centre(page: Page, label: string) {
  const box = (await row(page, label).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

it("snaps a dragged object to equal spacing and marks the equal gaps", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "spacing.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
node a "First" at 0,0 size 100,60
node b "Second" at 140,0 size 100,60
node c "Third" at 520,300 size 100,60`),
  });
  await row(page, "Third").waitFor();
  const first = await centre(page, "First");
  const second = await centre(page, "Second");
  const third = await centre(page, "Third");
  // First and Second sit 140 apart, which gives the screen's scale.
  const scale = (second.x - first.x) / 140;

  // Drag Third into the row, a little short of 40 from Second.
  await page.mouse.move(third.x, third.y);
  await page.mouse.down();
  await page.mouse.move(second.x + (140 + 5) * scale, second.y + 20 * scale, { steps: 12 });
  const marks = page.getByTestId("equal-gaps");
  await marks.waitFor();
  expect(await marks.locator(".equal-gap-label").allTextContents()).toEqual(["40 u", "40 u"]);
  await page.screenshot({ path: "test-results/equal-gaps.png" });
  await page.mouse.up();

  // It lands exactly 40 from Second, and the marks go with the drag.
  await expect
    .poll(async () => (await exported(page)).objects.find((item) => item.id === "c")?.x)
    .toBeCloseTo(280, 5);
  expect(await marks.count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});
