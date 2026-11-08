import { expect, it } from "vitest";
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
