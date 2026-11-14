import { expect, it } from "vitest";
import type { Page } from "playwright";
import { add, browser, errors, exported, open } from "./browserHarness";
import { workspaceTools } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const helpDialog = (page: Page) => page.getByRole("dialog", { name: "Help", exact: true });

it("opens a centred dialog with topics beside the content, searches, follows links and lists commands", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Current work", 360, 300);
    const room = page.url();
    const before = (await exported(page)).objects;
    await workspaceTools(page);
    const help = page.getByRole("button", { name: "Help", exact: true });
    await help.click();
    const reference = helpDialog(page);
    const topics = reference.getByRole("navigation", { name: "Help topics" });
    await topics.waitFor();
    expect(
      (await topics.locator(".help-start button").allTextContents()).map((text) => text.trim())
    ).toEqual(["Take the tour", "Commands and shortcuts"]);
    await expect.poll(() => reference.locator(".help-crumb").textContent()).toBe("Getting started");

    // Centred, with the topics on the left and the reading on the right, aligned to the left.
    const box = (await reference.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 500)).toBeLessThan(2);
    const side = (await topics.boundingBox())!;
    const body = (await reference.locator(".help-body").boundingBox())!;
    expect(side.x + side.width).toBeLessThanOrEqual(body.x + 1);
    for (const node of [
      reference.locator(".help-markdown p").first(),
      topics.getByRole("button", { name: "Slides" }),
    ])
      expect(await node.evaluate((element) => getComputedStyle(element).textAlign)).toMatch(
        /left|start/
      );
    await page.screenshot({ path: "test-results/help-dialog.png" });

    // Choosing a guide lists its sections beneath it and opens the guide.
    await topics.getByRole("button", { name: "Slides", exact: true }).click();
    await expect.poll(() => reference.locator(".help-crumb").textContent()).toBe("Slides");
    await topics.getByRole("button", { name: "Add speaker notes", exact: true }).click();
    await expect
      .poll(() => reference.locator(".help-markdown h2").first().textContent())
      .toBe("Add speaker notes");

    // A guide's link to another guide opens it inside Help.
    await reference.getByLabel("Search help", { exact: true }).fill("Select annotations");
    const results = reference.getByRole("list", { name: "Search results" });
    await results.getByRole("button").first().click();
    await reference.locator('a[data-help-topic^="drawing"]').first().click();
    await expect
      .poll(() => reference.locator(".help-crumb").textContent())
      .toBe("Drawing and markup");

    await topics.getByRole("button", { name: "Commands and shortcuts", exact: true }).click();
    const note = reference.locator("dt", { hasText: "Sticky note" }).first();
    expect(await note.locator("kbd").first().textContent()).toBe("N");
    expect(
      (await note.locator("xpath=following-sibling::dd").textContent())?.length
    ).toBeGreaterThan(10);

    // Escape clears a search first, then closes Help and returns to the button.
    await reference.getByLabel("Search help", { exact: true }).fill("grid");
    await page.keyboard.press("Escape");
    expect(await reference.getByLabel("Search help", { exact: true }).inputValue()).toBe("");
    await page.keyboard.press("Escape");
    await expect.poll(() => reference.count()).toBe(0);
    expect(await help.evaluate((button) => document.activeElement === button)).toBe(true);
    expect(page.url()).toBe(room);
    expect((await exported(page)).objects).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("shows topics, then content, one at a time on a phone", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await open(context);
    await workspaceTools(page);
    await page.getByRole("button", { name: "Help", exact: true }).click();
    const reference = helpDialog(page);
    const topics = reference.getByRole("navigation", { name: "Help topics" });
    await topics.waitFor();
    const box = (await reference.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    expect(await reference.locator(".help-body").isVisible()).toBe(false);
    await topics.getByRole("button", { name: "Files", exact: true }).click();
    await expect.poll(() => topics.isVisible()).toBe(false);
    await expect.poll(() => reference.locator(".help-crumb").textContent()).toBe("Files");
    await page.screenshot({ path: "test-results/help-dialog-phone.png" });
    await reference.getByRole("button", { name: "Topics", exact: true }).click();
    await expect.poll(() => topics.isVisible()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("opens the guide for the area under the pointer with the ? key", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    const draw = page.locator('[data-help-id="rail-draw"]');
    await draw.hover();
    await page.getByRole("region", { name: "Help", exact: true }).getByText("Press ?").waitFor();
    await page.keyboard.press("Shift+?");
    await expect
      .poll(() => helpDialog(page).locator(".help-crumb").textContent())
      .toBe("Drawing and markup");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
