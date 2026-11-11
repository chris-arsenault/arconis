import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, open, railPanel } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

const shape = (page: Page, fill: string) =>
  page.getByTestId("canvas").locator(`[fill="${fill}"]`).first();

async function placeNote(page: Page, x: number, y: number, name: string) {
  await railPanel(page, "Shapes");
  await page.getByRole("button", { name: "Sticky note (N)", exact: true }).click();
  await page.mouse.click(x, y);
  await page.keyboard.type(name);
  await page.keyboard.press("Escape");
}

it("makes a new object the size of the object it is placed closest to, whatever the zoom", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "near.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from('arconis 1\nnote first "First" at 0,0 fill #ff0000'),
  });
  await shape(page, "#ff0000").waitFor();
  await page.getByTestId("canvas").press("Escape");
  const first = (await exported(page)).objects.find((item) => item.id === "first")!;

  // Zoomed out to a quarter, a note placed beside the first is the first's size, not four times it.
  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: "Zoom out", exact: true }).click();
        return page.getByTestId("zoom-level").textContent();
      },
      { timeout: 15000, interval: 200 }
    )
    .toBe("0.25×");
  const box = (await shape(page, "#ff0000").boundingBox())!;
  await placeNote(page, box.x + box.width + 60, box.y + box.height / 2, "Beside");
  const beside = (await exported(page)).objects.find((item) => item.name === "Beside")!;
  expect(beside.width).toBe(first.width);
  expect(beside.height).toBe(first.height);
  expect(beside.look.scale ?? 1).toBe(first.look.scale ?? 1);

  // A topic grown from it matches it too.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Tab");
  await page.keyboard.type("Grown");
  await page.keyboard.press("Escape");
  const grown = (await exported(page)).objects.find((item) => item.name === "Grown")!;
  expect(grown.look.scale ?? 1).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});
