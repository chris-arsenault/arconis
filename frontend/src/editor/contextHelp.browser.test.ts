import { expect, it } from "vitest";
import type { Page } from "playwright";
import { add, browser, errors, open } from "./browserHarness";
import { selectionLabel } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

const zone = (page: Page) => page.getByRole("region", { name: "Help", exact: true });
/** The control named in the zone, which draws the name from an attribute. */
const zoneTitle = (page: Page) =>
  page.locator(".help-zone-title").getAttribute("data-label", { timeout: 2000 });

it("shows hover help in the rail's help zone at once and follows live changes", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await zone(page).getByText("Point at or focus any control").waitFor();
    const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
    await zoom.hover();
    await expect.poll(() => zoneTitle(page)).toBe("Zoom in");
    // The zone is part of the rail, not a floating popup beside the control.
    const rail = (await page
      .getByRole("complementary", { name: "Tools and stencils" })
      .boundingBox())!;
    const box = (await zone(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(rail.x);
    expect(box.x + box.width).toBeLessThanOrEqual(rail.x + rail.width + 1);
    expect(await page.getByRole("tooltip").count()).toBe(0);
    await zoom.evaluate((button) => button.setAttribute("data-hint-detail", "Updated while shown"));
    await expect
      .poll(() => page.getByTestId("help-zone-detail").textContent())
      .toBe("Updated while shown");
    await page.mouse.move(700, 500);
    await zone(page).getByText("Point at or focus any control").waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("describes focused controls from the zone and keeps information tooltips separate", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Keep selected", 260, 240);
    const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
    await page.getByRole("button", { name: "Zoom out", exact: true }).press("Tab");
    await page.keyboard.press("Tab");
    expect(await zoom.evaluate((button) => document.activeElement === button)).toBe(true);
    await expect.poll(() => zoneTitle(page)).toBe("Zoom in");
    expect(await zoom.getAttribute("aria-describedby")).toContain("help-zone-detail");
    // Who is in the room is information, so it floats beside the badge; its help reads in the zone.
    const people = page.getByRole("button", { name: "Participants", exact: true });
    await people.hover();
    await page.getByRole("tooltip").filter({ hasText: "In this room:" }).waitFor();
    expect(await zoneTitle(page)).toBe("Participants");
    expect(await page.getByTestId("help-zone-detail").textContent()).toContain("follow someone");
    await page.keyboard.press("Escape");
    expect(await page.getByRole("tooltip").count()).toBe(0);
    expect(await selectionLabel(page)).toContain("Sticky note");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("shows touch-hold help in the docked zone after the delay and leaves a quick tap usable", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await open(context);
    const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
    const bounds = (await zoom.boundingBox())!;
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const before = await page.getByTestId("zoom-level").textContent();
    const input = await context.newCDPSession(page);
    // The folded rail has no room for the zone, so it docks below the header while it speaks.
    await page.mouse.move(220, 420);
    await expect.poll(() => zone(page).isVisible()).toBe(false);
    await page.evaluate(() => {
      document.addEventListener("pointerdown", () => performance.mark("help-touch-start"), {
        once: true,
      });
      const observer = new MutationObserver(() => {
        if (document.querySelector('.help-zone[data-active="true"]')?.checkVisibility() !== true)
          return;
        performance.mark("help-touch-visible");
        observer.disconnect();
      });
      observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    });
    await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await expect.poll(() => zoneTitle(page)).toBe("Zoom in");
    const delay = await page.evaluate(
      () =>
        performance.measure("help-touch-delay", "help-touch-start", "help-touch-visible").duration
    );
    expect(delay).toBeGreaterThanOrEqual(400);
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(100);
    expect(await zone(page).isVisible()).toBe(true);
    expect(await page.getByRole("tooltip").count()).toBe(0);
    expect(await page.getByTestId("zoom-level").textContent()).toBe(before);
    const dock = (await zone(page).boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(8);
    expect(dock.x + dock.width).toBeLessThanOrEqual(382);
    expect(dock.y + dock.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: "test-results/context-help-touch-hold.png" });
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => page.getByTestId("zoom-level").textContent()).not.toBe(before);
    await expect.poll(() => zone(page).isVisible()).toBe(false);
    await input.detach();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("owns File menu keyboard navigation and returns focus safely", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Keep menu selection", 260, 240);
    const trigger = page.getByRole("button", { name: "File", exact: true });
    await trigger.press("ArrowDown");
    const first = page.getByRole("menuitem", { name: "New canvas", exact: true });
    await expect
      .poll(() => first.evaluate((button) => document.activeElement === button))
      .toBe(true);
    await page.keyboard.press("ArrowDown");
    expect(
      await page
        .getByRole("menuitem", { name: "Join room…", exact: true })
        .evaluate((button) => document.activeElement === button)
    ).toBe(true);
    await page.keyboard.press("End");
    const last = page.getByRole("menuitem", { name: "Import document", exact: true });
    expect(await last.evaluate((button) => document.activeElement === button)).toBe(true);
    await page.keyboard.press("Home");
    expect(await first.evaluate((button) => document.activeElement === button)).toBe(true);
    await page.keyboard.press("ArrowUp");
    expect(await last.evaluate((button) => document.activeElement === button)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.getByRole("menu", { name: "File", exact: true }).count()).toBe(0);
    expect(await trigger.evaluate((button) => document.activeElement === button)).toBe(true);
    expect(await selectionLabel(page)).toContain("Sticky note");
    await trigger.press("ArrowDown");
    await first.waitFor();
    // Tab closes the menu and continues to the canvas title beside File.
    await page.keyboard.press("Tab");
    expect(await page.getByRole("menu", { name: "File", exact: true }).count()).toBe(0);
    expect(
      await page
        .getByLabel("Canvas title", { exact: true })
        .evaluate((button) => document.activeElement === button)
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
