import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, objectCount } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const emptySpot = { x: 880, y: 760 };

async function dragStencil(page: Page, label: string, x: number, y: number) {
  const stencil = page.getByRole("button", { name: label, exact: true });
  const box = (await stencil.boundingBox())!;
  const bounds = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + x, bounds.y + y, { steps: 10 });
  await page.mouse.up();
}

it("adds objects from a left rail of stencils, with nothing hovering over the canvas", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  const inCanvas = await canvas(page).evaluate(
    (node) => node.parentElement!.querySelectorAll(".tool").length
  );
  expect(inCanvas).toBe(0);
  expect(await page.getByText("On this canvas", { exact: false }).count()).toBe(0);
  await dragStencil(page, "Database", 300, 200);
  await expect.poll(() => objectCount(page)).toBe(1);
  const pressed = page.locator(".tool[aria-pressed=true]");
  expect(await pressed.getAttribute("aria-label")).toBe("Select (V)");
  await page.getByRole("button", { name: "Ellipse", exact: true }).click();
  expect(await pressed.getAttribute("aria-label")).toBe("Ellipse");
  await canvas(page).click({ position: { x: 560, y: 200 } });
  await expect.poll(() => objectCount(page)).toBe(2);
  await dragStencil(page, "Sticky note (N)", 300, 450);
  const inline = page.getByLabel("Edit canvas text", { exact: true });
  await inline.waitFor();
  await page.keyboard.type("Dragged note");
  await page.keyboard.press("Escape");
  await row(page, "Dragged note").waitFor();
  const before = await objectCount(page);
  await dragStencil(page, "Cloud", -80, 300);
  expect(await objectCount(page)).toBe(before);
  expect(errors).toEqual([]);
  await context.close();
});

it("shows a compact property panel only for a selection, with controls that apply", async () => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await open(context, createRoomId());
  const panel = page.getByLabel("Object properties", { exact: true });
  expect(await panel.count()).toBe(0);
  const withoutPanel = (await canvas(page).boundingBox())!.width;
  await add(page, "Rectangle (R)", "Rectangle", 200, 150);
  expect((await canvas(page).boundingBox())!.width).toBeLessThan(withoutPanel);
  const fits = () => panel.evaluate((node) => node.scrollHeight <= node.clientHeight);
  expect(await fits()).toBe(true);
  expect(await page.getByLabel("Object x", { exact: true }).count()).toBe(1);
  await page.screenshot({ path: "test-results/inspector-shape.png" });
  await add(page, "Sticky note (N)", "Note", 500, 150);
  expect(await fits()).toBe(true);
  expect(await page.getByLabel("Line color", { exact: true }).count()).toBe(0);
  expect(await page.getByLabel("Font size", { exact: true }).inputValue()).toBe("16");
  await add(page, "Text", "Words", 500, 400);
  expect(await page.getByLabel("Fill color", { exact: true }).count()).toBe(0);
  await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
  const bounds = (await canvas(page).boundingBox())!;
  await page.mouse.move(bounds.x + 200, bounds.y + 400);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 350, bounds.y + 450, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await canvas(page).click({ position: { x: 275, y: 425 } });
  await panel.waitFor();
  expect(await page.getByLabel("Object text", { exact: true }).count()).toBe(0);
  expect(await page.getByLabel("Font size", { exact: true }).count()).toBe(0);
  expect(await page.getByLabel("Fill color", { exact: true }).count()).toBe(0);
  expect(await page.getByLabel("Line width", { exact: true }).count()).toBe(1);
  await canvas(page).click({ position: { x: 600, y: 600 } });
  await expect.poll(() => panel.count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

it("saves a place, lists it, returns to it on another window size and syncs it", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Far away", 300, 300);
  await a.getByRole("button", { name: "Zoom in", exact: true }).click();
  await a.getByLabel("Object x", { exact: true }).fill("5000");
  await canvas(a).click({ position: emptySpot });
  await a.getByRole("button", { name: "Fit canvas", exact: true }).click();
  const zoom = await a.getByTestId("zoom-level").textContent();
  const offsetFromCenter = async (page: Page) => {
    const bounds = (await canvas(page).boundingBox())!;
    const box = await row(page, "Far away").boundingBox();
    if (!box) return Infinity;
    return box.x + box.width / 2 - (bounds.x + bounds.width / 2);
  };
  const expected = await offsetFromCenter(a);
  await a.getByRole("button", { name: "Save current view", exact: true }).click();
  const saved = a.getByRole("button", { name: "View 1", exact: true });
  await saved.waitFor();
  await saved.hover();
  await a.getByRole("button", { name: "Rename view View 1", exact: true }).click();
  await a.getByLabel("New name for View 1", { exact: true }).fill("Far corner");
  await a.keyboard.press("Enter");
  const b = await open(second, room);
  const named = b.getByRole("button", { name: "Far corner", exact: true });
  await named.waitFor({ timeout: 15000 });
  await named.click();
  await expect.poll(() => b.getByTestId("zoom-level").textContent()).toBe(zoom);
  await expect.poll(async () => Math.abs((await offsetFromCenter(b)) - expected)).toBeLessThan(5);
  await a.getByRole("button", { name: "Far corner", exact: true }).hover();
  await a.getByRole("button", { name: "Remove view Far corner", exact: true }).click();
  await expect.poll(() => named.count(), { timeout: 15000 }).toBe(0);
  expect((await exported(a)).bookmarks).toHaveLength(0);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
