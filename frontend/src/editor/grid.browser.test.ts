import { expect, it } from "vitest";
import { mkdir } from "node:fs/promises";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, drag, errors, exported, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const gridButton = (page: Page) =>
  page.getByRole("button", { name: "Grid and snapping", exact: true });
const firstX = async (page: Page) => (await exported(page)).objects[0].x;

it("snaps to a visible grid, and turning it off frees placement for that person", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  const peer = await open(await browser.newContext(VIEWPORT), room);
  await add(page, "Rectangle (R)", "Placed", 300, 200);
  const canvas = page.getByTestId("canvas");
  expect(await gridButton(page).getAttribute("aria-pressed")).toBe("true");
  const lines = () => canvas.evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(await lines()).toContain("linear-gradient");

  await row(page, "Placed").click();
  await drag(page, 380, 245, 23, 0);
  await expect.poll(() => firstX(page)).not.toBe(300);
  expect((await firstX(page)) % 10).toBe(0);

  await gridButton(page).click();
  expect(await gridButton(page).getAttribute("aria-pressed")).toBe("false");
  expect(await lines()).toBe("none");
  const before = await firstX(page);
  await drag(page, before + 80, 245, 23, 0);
  await expect.poll(() => firstX(page)).toBe(before + 23);

  expect(await gridButton(peer).getAttribute("aria-pressed")).toBe("true");
  await page.reload();
  await gridButton(page).waitFor();
  expect(await gridButton(page).getAttribute("aria-pressed")).toBe("false");
  expect(errors).toEqual([]);
});

it("keeps the grid readable at both ends of the zoom range", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await add(page, "Rectangle (R)", "Reference", 300, 200);
  await mkdir("test-results/review", { recursive: true });
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + 400, bounds.y + 300);
  const spacing = () =>
    page
      .getByTestId("canvas")
      .evaluate((element) => parseFloat(element.style.backgroundSize.split(",")[2]));
  await page.screenshot({ path: "test-results/review/grid-100.png" });
  for (const [delta, name] of [
    [-1000, "in"],
    [1000, "out"],
  ] as const) {
    for (let step = 0; step < 60; step++) await page.mouse.wheel(0, delta);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/review/grid-${name}.png` });
    expect(await spacing()).toBeGreaterThanOrEqual(8);
    expect(await spacing()).toBeLessThanOrEqual(80);
  }
  expect(errors).toEqual([]);
});
