import { expect, it } from "vitest";
import type { Page } from "playwright";
import { add, browser, errors, exported, firstVisit, open } from "./browserHarness";

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
    const room = page.url();
    const before = (await exported(page)).objects;
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
      "Markup",
      "Shapes",
      "Draw",
      "Properties",
      "Layers",
      "Slides and presenting",
      "Navigate",
      "Find and filter",
      "File",
      "Share the room",
      "Settings",
      "Feedback",
      "Who is here",
      "Commands and shortcuts",
      "The help zone",
      "Help",
    ])
      expect(titles).toContain(title);
    expect(page.url()).toBe(room);
    expect((await exported(page)).objects).toEqual(before);
    const tabs = page.getByRole("navigation", { name: "Workspace panels" });
    expect(
      await tabs.getByRole("button", { name: "Shapes", exact: true }).getAttribute("aria-pressed")
    ).toBe("true");
    // The tour opened the document panels and Markup's bar to show them, then put them away.
    expect(
      await page
        .getByRole("navigation", { name: "Document panels" })
        .locator('[aria-pressed="true"]')
        .count()
    ).toBe(0);
    expect(await page.getByRole("toolbar", { name: "Markup", exact: true }).count()).toBe(0);
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
    expect(page.url()).toBe(room);
    expect((await exported(page)).objects).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("lets people try the right button while the tour describes it", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  firstVisit(context);
  try {
    const page = await open(context);
    await page.getByRole("button", { name: "Take the tour", exact: true }).click();
    const title = tourPopup(page).locator(".driver-popover-title");
    for (const next of ["The canvas", "Right button: pan and menu"]) {
      await expect.poll(() => nextFocused(page)).toBe(true);
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => title.textContent()).toBe(next);
    }
    await expect.poll(() => nextFocused(page)).toBe(true);
    // A real right click on the highlighted canvas opens the menu, and its items work.
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    await page.mouse.click(canvas.x + 300, canvas.y + 300, { button: "right" });
    const menu = page.getByRole("menu", { name: "Canvas menu" });
    await menu.waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => menu.count()).toBe(0);
    expect(await title.textContent()).toBe("Right button: pan and menu");
    await page.mouse.click(canvas.x + 300, canvas.y + 300, { button: "right" });
    await menu.waitFor();
    const grid = page.getByRole("button", { name: "Grid and snapping", exact: true });
    expect(await grid.getAttribute("aria-pressed")).toBe("true");
    await menu.getByRole("menuitem", { name: "View", exact: true }).hover();
    await menu.getByRole("menuitem", { name: /^Hide grid/ }).click();
    await expect.poll(() => grid.getAttribute("aria-pressed")).toBe("false");
    // Right-drag pans during the tour without opening either menu.
    await page.mouse.move(canvas.x + 400, canvas.y + 350);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(canvas.x + 480, canvas.y + 390, { steps: 8 });
    await page.mouse.up({ button: "right" });
    expect(await page.getByTestId("command-ring").count()).toBe(0);
    expect(await menu.count()).toBe(0);
    expect(await title.textContent()).toBe("Right button: pan and menu");
    expect(
      await page.getByTestId("canvas").evaluate((element) => document.activeElement === element)
    ).toBe(true);
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
    expect(titles).toContain("Markup");
    expect(titles).toContain("Draw");
    await expect.poll(() => page.locator(".right-dock").count()).toBe(0);
    const rail = page.locator(".left-rail");
    await expect.poll(() => rail.getAttribute("data-expanded")).toBe("false");
    await page.screenshot({ path: "test-results/orientation-phone-end.png" });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
