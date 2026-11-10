import { expect, it } from "vitest";
import type { Page } from "playwright";
import { browser, errors, open, row } from "./browserHarness";

const step = (page: Page) => page.locator(".driver-popover.arconis-tour .driver-popover-title");

/** Waits for the practice to move on to a task, which it does only when the room shows it done. */
async function onTask(page: Page, title: string) {
  await expect.poll(() => step(page).textContent()).toBe(title);
  // Once the step settles, focus returns to the canvas so its keys work.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
    .toBe("canvas");
}

it("practises editing, connecting, markup and presenting in a sample room on this device", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    const sharedRoom = new URL(page.url()).hash;
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await page.getByRole("button", { name: "Practice in a sample room", exact: true }).click();
    await expect.poll(() => new URL(page.url()).hash).not.toBe(sharedRoom);
    expect(new URL(page.url()).hash).toMatch(/^#local=/);
    await page
      .getByTestId("connection-status")
      .filter({ hasText: "On this device only" })
      .waitFor();

    await onTask(page, "Edit an object");
    await page.screenshot({ path: "test-results/practice-start.png" });
    await row(page, "Edit me").dblclick();
    const editor = page.getByLabel("Edit canvas text", { exact: true });
    await editor.fill("My first idea");
    await editor.press("ControlOrMeta+Enter");

    await onTask(page, "Connect two objects");
    await page.keyboard.press("c");
    await row(page, "Orders API").click();
    await row(page, /^Orders$/).click();

    await onTask(page, "Mark it up");
    await page.keyboard.press("m");
    const api = (await row(page, "Orders API").boundingBox())!;
    await page.mouse.move(api.x - 40, api.y + 10);
    await page.mouse.down();
    await page.mouse.move(api.x + 80, api.y + 40, { steps: 8 });
    await page.mouse.move(api.x + 200, api.y + 10, { steps: 8 });
    await page.mouse.up();

    await onTask(page, "Present it");
    await page
      .getByRole("navigation", { name: "Workspace panels" })
      .getByRole("button", { name: "Slides", exact: true })
      .click();
    await page.getByRole("button", { name: "Present practice", exact: true }).click();
    await expect.poll(() => step(page).count()).toBe(0);
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Workspace panels" }).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
