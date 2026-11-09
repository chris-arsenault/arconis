import { expect, it } from "vitest";
import { add, browser, errors, open } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

it("reads live help changes during the hover delay and while the popup is open", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
    await page.evaluate(() => {
      const changeDuringHover = (event: PointerEvent) => {
        const target =
          event.target instanceof Element
            ? event.target.closest('button[aria-label="Zoom in"]')
            : null;
        if (!target) return;
        // Runs after the help listener scheduled its delay, before the popup can open.
        target.setAttribute("data-hint-detail", "Updated before opening");
        document.removeEventListener("pointerover", changeDuringHover);
      };
      document.addEventListener("pointerover", changeDuringHover);
    });
    await zoom.hover();
    await page.getByRole("tooltip").filter({ hasText: "Updated before opening" }).waitFor();
    await zoom.evaluate((button) => button.setAttribute("data-hint-detail", "Updated while open"));
    await page.getByRole("tooltip").filter({ hasText: "Updated while open" }).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("shows hover and keyboard help, and dismisses it without clearing selection", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Keep selected", 260, 240);
    const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
    await zoom.hover();
    await page.getByRole("tooltip").filter({ hasText: "Zoom in" }).waitFor();
    expect(await zoom.getAttribute("aria-describedby")).toContain("context-help");
    await page.keyboard.press("Escape");
    expect(await page.getByRole("tooltip").count()).toBe(0);
    expect(await page.getByTestId("selection-count").textContent()).toContain("Sticky note");
    await page.getByRole("button", { name: "Zoom out", exact: true }).press("Tab");
    await page.keyboard.press("Tab");
    expect(await zoom.evaluate((button) => document.activeElement === button)).toBe(true);
    await page.getByRole("tooltip").filter({ hasText: "Zoom in" }).waitFor();
    await page.keyboard.press("Escape");
    expect(await page.getByTestId("selection-count").textContent()).toContain("Sticky note");
    expect(await zoom.getAttribute("aria-describedby")).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("shows touch-hold help after the delay, keeps it on release, and leaves a quick tap usable", async () => {
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
    await page.evaluate(() => {
      document.addEventListener("pointerdown", () => performance.mark("help-touch-start"), {
        once: true,
      });
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[role="tooltip"]')) return;
        performance.mark("help-touch-visible");
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true });
    });
    await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await page.getByRole("tooltip").filter({ hasText: "Zoom in" }).waitFor();
    const delay = await page.evaluate(
      () =>
        performance.measure("help-touch-delay", "help-touch-start", "help-touch-visible").duration
    );
    expect(delay).toBeGreaterThanOrEqual(400);
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(100);
    expect(await page.getByRole("tooltip").count()).toBe(1);
    expect(await page.getByTestId("zoom-level").textContent()).toBe(before);
    const popup = (await page.getByRole("tooltip").boundingBox())!;
    expect(popup.x).toBeGreaterThanOrEqual(8);
    expect(popup.x + popup.width).toBeLessThanOrEqual(382);
    await page.screenshot({ path: "test-results/context-help-touch-hold.png" });
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => page.getByTestId("zoom-level").textContent()).not.toBe(before);
    expect(await page.getByRole("tooltip").count()).toBe(0);
    await input.detach();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("owns File menu keyboard navigation, includes its checkbox and returns focus safely", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Keep menu selection", 260, 240);
    const trigger = page.getByRole("button", { name: "File", exact: true });
    await trigger.press("ArrowDown");
    const first = page.getByRole("menuitem", { name: "Export document", exact: true });
    await expect
      .poll(() => first.evaluate((button) => document.activeElement === button))
      .toBe(true);
    await page.keyboard.press("ArrowDown");
    expect(
      await page
        .getByRole("menuitem", { name: "Export PNG", exact: true })
        .evaluate((button) => document.activeElement === button)
    ).toBe(true);
    await page.keyboard.press("End");
    const markup = page.getByRole("menuitemcheckbox", { name: "Include markup", exact: true });
    expect(await markup.evaluate((checkbox) => document.activeElement === checkbox)).toBe(true);
    await page.keyboard.press("Space");
    expect(await markup.isChecked()).toBe(false);
    await page.keyboard.press("Home");
    expect(await first.evaluate((button) => document.activeElement === button)).toBe(true);
    await page.keyboard.press("ArrowUp");
    expect(await markup.evaluate((checkbox) => document.activeElement === checkbox)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.getByRole("menu", { name: "File", exact: true }).count()).toBe(0);
    expect(await trigger.evaluate((button) => document.activeElement === button)).toBe(true);
    expect(await page.getByTestId("selection-count").textContent()).toContain("Sticky note");
    await trigger.press("ArrowDown");
    await first.waitFor();
    await page.keyboard.press("Tab");
    expect(await page.getByRole("menu", { name: "File", exact: true }).count()).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Participants", exact: true })
        .evaluate((button) => document.activeElement === button)
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
