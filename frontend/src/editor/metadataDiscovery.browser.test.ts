import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, row } from "./browserHarness";

async function labelOpacity(page: Page, text: RegExp) {
  return row(page, text).evaluate((node) => {
    let opacity = 1;
    let current: Element | null = node;
    while (current && !current.matches('[data-testid="canvas"]')) {
      opacity *= Number(getComputedStyle(current).opacity);
      current = current.parentElement;
    }
    return opacity;
  });
}

it("keeps Find and filter reachable below the Properties control on a narrow canvas", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Mobile metadata #api :star", 70, 300);
    await page.getByRole("button", { name: "Close properties", exact: true }).click();
    const properties = page.getByRole("button", { name: "Object properties", exact: true });
    const find = page.getByRole("button", { name: "Find and filter", exact: true });
    const propertiesBox = (await properties.boundingBox())!;
    const findBox = (await find.boundingBox())!;
    expect(findBox.y).toBeGreaterThan(propertiesBox.y + propertiesBox.height);
    expect(
      await find.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        );
      })
    ).toBe(true);
    await page.mouse.click(findBox.x + findBox.width / 2, findBox.y + findBox.height / 2);
    const panel = page.getByRole("search", { name: "Find on canvas" });
    await panel.getByRole("button", { name: "#api", exact: true }).click();
    expect(await page.getByTestId("find-count").textContent()).toBe("1 match");
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.y).toBeGreaterThan(propertiesBox.y + propertiesBox.height);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "test-results/metadata-discovery-mobile.png" });
    await panel.getByRole("button", { name: "Close find", exact: true }).click();
    await properties.click();
    await page.getByLabel("Object properties", { exact: true }).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("discovers tags and named markers, highlights locally and searches matching objects", async () => {
  const first = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  try {
    const room = createRoomId();
    const page = await open(first, room);
    await add(page, "Sticky note (N)", "Orders #api :star", 250, 250);
    await add(page, "Sticky note (N)", "Orders cache #apiary :square", 550, 250);
    await add(page, "Sticky note (N)", "Billing #api :square", 250, 550);
    await page.getByTestId("canvas").click({ position: { x: 850, y: 750 } });
    const before = (await exported(page)).objects;
    const peer = await open(second, room);
    await row(peer, /^Orders$/).waitFor();
    await page.getByRole("button", { name: "Find and filter", exact: true }).click();
    const panel = page.getByRole("search", { name: "Find on canvas" });
    const tag = panel.getByRole("button", { name: "#api", exact: true });
    expect(await tag.textContent()).toBe("#api2");
    await tag.click();
    expect(await tag.getAttribute("aria-pressed")).toBe("true");
    expect(await page.getByTestId("find-count").textContent()).toBe("2 matches");
    expect(await labelOpacity(page, /^Orders cache$/)).toBeLessThan(
      await labelOpacity(page, /^Orders$/)
    );
    expect(await labelOpacity(peer, /^Orders cache$/)).toBe(await labelOpacity(peer, /^Orders$/));
    await panel.getByRole("button", { name: "★ Star", exact: true }).click();
    expect(await page.getByTestId("find-count").textContent()).toBe("1 match");
    await page.screenshot({ path: "test-results/metadata-discovery.png" });
    await panel.getByRole("button", { name: "Next match", exact: true }).click();
    expect(await row(page, /^Orders$/).count()).toBe(1);
    expect(await page.getByTestId("find-count").textContent()).toBe("1 of 1");
    await panel.getByRole("button", { name: "Clear highlights", exact: true }).click();
    const query = panel.getByRole("textbox", { name: "Find on canvas", exact: true });
    await query.fill("#api");
    expect(await page.getByTestId("find-count").textContent()).toBe("2 matches");
    await query.fill("square");
    expect(await page.getByTestId("find-count").textContent()).toBe("2 matches");
    await query.press("Escape");
    await page.getByRole("button", { name: "Find and filter", exact: true }).waitFor();
    expect((await exported(page)).objects).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
