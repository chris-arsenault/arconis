import { expect, it } from "vitest";
import { add, browser, errors, objectCount, open } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

it("searches the guides, follows their links and lists commands beside a usable canvas", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    const help = page.getByRole("button", { name: "Help", exact: true });
    await help.click();
    const reference = page.getByRole("complementary", { name: "Help reference" });
    await reference.getByRole("navigation", { name: "Help contents" }).waitFor();
    expect(await reference.getByRole("button", { name: "Slides", exact: true }).isVisible()).toBe(
      true
    );

    await reference.getByLabel("Search help", { exact: true }).fill("speaker notes");
    const results = reference.getByRole("list", { name: "Search results" });
    await results.getByRole("button").first().click();
    await expect.poll(() => reference.locator(".help-crumb").textContent()).toBe("Slides");
    await page.screenshot({ path: "test-results/help-reference-article.png" });

    // The reference never blocks the canvas: a note can be added while it stays open.
    const before = await objectCount(page);
    await add(page, "Sticky note (N)", "Read and try", 300, 300);
    expect(await objectCount(page)).toBe(before + 1);
    expect(await reference.isVisible()).toBe(true);

    // A guide's link to another guide opens it inside the reference.
    await reference.getByRole("button", { name: "Contents", exact: true }).click();
    await reference.getByRole("button", { name: "Using the canvas", exact: true }).click();
    await reference.getByLabel("Search help", { exact: true }).fill("Lasso");
    await results.getByRole("button", { name: /Select and transform/ }).click();
    await reference.locator('a[data-help-topic^="drawing"]').first().click();
    await expect
      .poll(() => reference.locator(".help-crumb").textContent())
      .toBe("Drawing and markup");

    await reference.getByRole("button", { name: "Contents", exact: true }).click();
    // The generated command list comes first; the canvas guide has a section of the same name.
    await reference
      .getByRole("button", { name: "Commands and shortcuts", exact: true })
      .first()
      .click();
    const note = reference.locator("dt", { hasText: "Sticky note" }).first();
    expect(await note.locator("kbd").first().textContent()).toBe("N");
    expect(
      (await note.locator("xpath=following-sibling::dd").textContent())?.length
    ).toBeGreaterThan(10);

    await page.keyboard.press("Escape");
    await expect.poll(() => reference.count()).toBe(0);
    expect(await help.evaluate((button) => document.activeElement === button)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("opens the guide for the area under the pointer with the ? key", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    const draw = page
      .getByRole("navigation", { name: "Workspace panels" })
      .getByRole("button", { name: "Draw", exact: true });
    await draw.hover();
    await page.getByRole("region", { name: "Help", exact: true }).getByText("Press ?").waitFor();
    await page.keyboard.press("Shift+?");
    const reference = page.getByRole("complementary", { name: "Help reference" });
    await expect
      .poll(() => reference.locator(".help-crumb").textContent())
      .toBe("Drawing and markup");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
