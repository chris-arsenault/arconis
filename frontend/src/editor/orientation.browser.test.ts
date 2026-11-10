import { expect, it } from "vitest";
import type { Page } from "playwright";
import { add, browser, errors, firstVisit, objectCount, open } from "./browserHarness";

const tourPopup = (page: Page) => page.locator(".driver-popover.arconis-tour");
const nextFocused = (page: Page) =>
  page.evaluate(() => document.activeElement?.classList.contains("driver-popover-next-btn"));

/** Steps through the tour with the keyboard, recording each step's title and placement. */
async function walk(page: Page, width: number, height: number) {
  const titles: string[] = [];
  for (let step = 0; step < 40; step++) {
    const popup = tourPopup(page);
    await popup.waitFor();
    // Each step takes focus once its highlight settles; keys pressed mid-transition are ignored.
    await expect.poll(() => nextFocused(page)).toBe(true);
    const title = (await popup.locator(".driver-popover-title").textContent()) ?? "";
    await page.screenshot({ path: `test-results/orientation-${width}-${step}.png` });
    const box = (await popup.boundingBox())!;
    expect(box.x, title).toBeGreaterThanOrEqual(0);
    expect(box.y, title).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, title).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height, title).toBeLessThanOrEqual(height + 1);
    titles.push(title);
    const done = await popup.getByRole("button", { name: "Done" }).count();
    if (done) {
      await popup.getByRole("button", { name: "Done" }).click();
      break;
    }
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => popup.locator(".driver-popover-title").textContent()).not.toBe(title);
  }
  await expect.poll(() => tourPopup(page).count()).toBe(0);
  return titles;
}

it("offers the orientation once, walks every area without changing the room, and restores the rail", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  firstVisit(context);
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Existing work", 360, 300);
    const before = await objectCount(page);
    const offer = page.getByRole("region", { name: "Tour offer" });
    await offer.getByRole("button", { name: "Take the tour", exact: true }).click();
    const popup = tourPopup(page);
    await popup.waitFor();
    expect(await popup.getAttribute("role")).toBe("dialog");
    await expect.poll(() => nextFocused(page)).toBe(true);
    const titles = await walk(page, 1440, 1000);
    for (const title of [
      "The canvas",
      "Select, Pan and Connect",
      "Add",
      "Draw and markup",
      "Layers",
      "Explore",
      "Slides and presenting",
      "Properties",
      "Find and filter",
      "File",
      "Share the room",
      "Settings",
      "Who is here",
      "Commands and shortcuts",
      "The help zone",
      "Help",
    ])
      expect(titles).toContain(title);
    expect(await objectCount(page)).toBe(before);
    const tabs = page.getByRole("navigation", { name: "Workspace panels" });
    expect(
      await tabs.getByRole("button", { name: "Add", exact: true }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(await offer.count()).toBe(0);
    await page.reload();
    await page.getByRole("navigation", { name: "Workspace panels" }).waitFor();
    expect(await page.getByRole("region", { name: "Tour offer" }).count()).toBe(0);

    // Help starts the tour again whenever someone wants it; Escape ends it.
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await page.getByRole("button", { name: "Take the tour", exact: true }).click();
    await tourPopup(page).waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => tourPopup(page).count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("fits every orientation step on a phone, skipping areas the narrow layout hides", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  firstVisit(context);
  try {
    const page = await open(context);
    await page.getByRole("button", { name: "Take the tour", exact: true }).click();
    const titles = await walk(page, 390, 844);
    expect(titles).toContain("Slides and presenting");
    expect(titles).toContain("Draw and markup");
    await page.screenshot({ path: "test-results/orientation-phone-end.png" });
    const rail = page.locator(".left-rail");
    expect(await rail.getAttribute("data-expanded")).toBe("false");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
