import { expect, it } from "vitest";
import { add, browser, errors, open, row } from "./browserHarness";

it("swaps appearance and text tools in one object-anchored container", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    await add(page, "Rectangle (R)", "Edit in place", 260, 280);
    const tools = page.getByRole("region", { name: "Object tools", exact: true });
    const before = (await tools.boundingBox())!;
    const label = (await row(page, /^Edit in place$/).boundingBox())!;
    expect(before.y + before.height).toBeLessThan(label.y);
    // A marker on the container proves it survives the context switch.
    await tools.evaluate((element) => element.setAttribute("data-retained-tools", "true"));
    await row(page, /^Edit in place$/).dblclick();
    const inline = page.getByLabel("Edit canvas text", { exact: true });
    await inline.press("ControlOrMeta+a");
    await tools.getByRole("button", { name: "Markdown bold", exact: true }).click();
    expect(await inline.inputValue()).toBe("**Edit in place**");
    expect(await tools.getAttribute("data-retained-tools")).toBe("true");
    expect(await page.getByRole("toolbar", { name: "Selection toolbar" }).count()).toBe(0);
    const textTools = (await tools.boundingBox())!;
    const editing = (await inline.boundingBox())!;
    expect(textTools.y + textTools.height).toBeLessThan(editing.y);
    await tools.getByRole("button", { name: "Finish editing text", exact: true }).click();
    await tools.getByRole("button", { name: "Fill #d9e9ff", exact: true }).click();
    expect(await tools.getAttribute("data-retained-tools")).toBe("true");
    expect(
      await tools.getByRole("button", { name: "Fill #d9e9ff" }).getAttribute("aria-pressed")
    ).toBe("true");
    // Panning moves the anchor with its object, leaving the bottom HUD independent.
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    const original = (await tools.boundingBox())!;
    await page.mouse.move(canvas.x + 650, canvas.y + 550);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(canvas.x + 700, canvas.y + 600, { steps: 6 });
    await page.mouse.up({ button: "middle" });
    await expect.poll(async () => (await tools.boundingBox())!.y).toBeGreaterThan(original.y + 30);
    await page.screenshot({ path: "test-results/contextual-tools-desktop.png" });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("keeps object tools and expanded text options inside a narrow canvas", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Small screen", 70, 260);
    await page.getByRole("button", { name: "Close properties", exact: true }).click();
    const tools = page.getByRole("region", { name: "Object tools", exact: true });
    const checkBounds = async () => {
      const bounds = (await tools.boundingBox())!;
      const canvas = (await page.getByTestId("canvas").boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(canvas.x + 7);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvas.x + canvas.width - 7);
      expect(bounds.y).toBeGreaterThanOrEqual(canvas.y + 7);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(canvas.y + canvas.height - 7);
    };
    await checkBounds();
    await row(page, /^Small screen$/).dblclick();
    await tools.getByText("Code, preview and copy", { exact: true }).click();
    await tools.getByRole("button", { name: "Preview", exact: true }).click();
    await checkBounds();
    await tools.getByRole("button", { name: "Finish editing text", exact: true }).click();
    await checkBounds();
    await page.screenshot({ path: "test-results/contextual-tools-mobile.png" });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("keeps below-object tools clear of metadata badges near the canvas edge", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    await add(page, "Rectangle (R)", "At the top", 260, 35);
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    await page.getByLabel("Add a tag", { exact: true }).fill("api");
    await page.getByLabel("Add a tag", { exact: true }).press("Enter");
    await page.getByLabel("Marker", { exact: true }).selectOption("star");
    const tools = page.getByRole("region", { name: "Object tools", exact: true });
    const chrome = page.getByTestId("object-metadata");
    await expect
      .poll(async () => {
        const toolbar = (await tools.boundingBox())!;
        const badges = (await chrome.boundingBox())!;
        return toolbar.y >= badges.y + badges.height + 10;
      })
      .toBe(true);
    await tools.getByRole("button", { name: "Fill #d9e9ff", exact: true }).click();
    await chrome.getByRole("button", { name: "Highlight tag api", exact: true }).click();
    await page
      .getByRole("region", { name: "Filter", exact: true })
      .getByRole("button", { name: "#api", exact: true })
      .waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("keeps metadata and tools visible above an object near the bottom edge", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    const canvas = page.getByTestId("canvas");
    const area = (await canvas.boundingBox())!;
    await add(page, "Rectangle (R)", "At the bottom", 260, area.height - 100);
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    await page.getByLabel("Add a tag", { exact: true }).fill("api");
    await page.getByLabel("Add a tag", { exact: true }).press("Enter");
    const chrome = page.getByTestId("object-metadata");
    const tools = page.getByRole("region", { name: "Object tools", exact: true });
    await expect
      .poll(async () => {
        const badges = (await chrome.boundingBox())!;
        const toolbar = (await tools.boundingBox())!;
        return (
          badges.y + badges.height <= area.y + area.height - 7 &&
          toolbar.y + toolbar.height < badges.y
        );
      })
      .toBe(true);
    await chrome.getByRole("button", { name: "Highlight tag api", exact: true }).click();
    await page.getByRole("region", { name: "Filter", exact: true }).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
