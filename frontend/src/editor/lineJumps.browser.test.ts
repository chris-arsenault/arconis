import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, row } from "./browserHarness";

/** The drawn path of the line stroked in this colour. */
function pathOf(page: Page, color: string) {
  return page
    .getByTestId("canvas")
    .locator(`path[stroke="${color}"][fill="none"]`)
    .first()
    .getAttribute("d");
}

it("hops the flatter connector where two cross, and straightens it when they part", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "crossing.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
node a "Left" at 0,200 size 100,60
node b "Right" at 600,200 size 100,60
node c "Above" at 300,0 size 100,60
node d "Below" at 300,500 size 100,60
a -> b line #ff0000 path diagonal
c -> d line #0000ff path diagonal`),
  });
  await row(page, "Below").waitFor();
  // The line running across hops with a curve; the one running down stays straight.
  await expect.poll(() => pathOf(page, "#ff0000")).toMatch(/C/);
  expect(await pathOf(page, "#0000ff")).not.toMatch(/C/);
  await page.screenshot({ path: "test-results/line-jumps.png" });

  // With the crossing line gone, the hop goes too.
  await row(page, "Above").click();
  await page.getByTestId("canvas").press("Delete");
  await expect.poll(() => row(page, "Above").count()).toBe(0);
  await expect.poll(() => pathOf(page, "#ff0000")).not.toMatch(/C/);
  expect(errors).toEqual([]);
  await context.close();
});
