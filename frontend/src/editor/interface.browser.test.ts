import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, drag, objectCount } from "./browserHarness";

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

it("finds, places, connects and syncs icons from the stencil rail", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const search = a.getByLabel("Search stencils", { exact: true });
  await search.fill("kubern");
  await a.getByRole("button", { name: "Icon: Kubernetes", exact: true }).click();
  await canvas(a).click({ position: { x: 200, y: 180 } });
  await expect.poll(() => objectCount(a)).toBe(1);
  await search.fill("hard drive");
  await dragStencil(a, "Icon: Hard Drive", 460, 180);
  await expect.poll(() => objectCount(a)).toBe(2);
  await search.fill("zzzzzz");
  await a.getByText("No stencils match.", { exact: true }).waitFor();
  await search.fill("");
  await a.getByRole("button", { name: "Icon: Docker", exact: true }).waitFor();
  const saved = await exported(a);
  const icons = saved.objects.filter((item) => item.kind === "icon");
  expect(icons.map((item) => item.style.icon)).toEqual(["brand:kubernetes", "lucide:HardDrive"]);
  expect(icons.map((item) => item.label)).toEqual(["Kubernetes", "Hard Drive"]);
  expect(icons[0].width).toBe(64);
  await canvas(a).click({ position: emptySpot });
  const images = canvas(a).locator('image[*|href^="data:image/svg+xml"]');
  await expect.poll(() => images.count()).toBe(2);
  const bounds = (await canvas(a).boundingBox())!;
  await a.mouse.move(bounds.x + 240, bounds.y + 212);
  await a.mouse.move(bounds.x + 264, bounds.y + 212, { steps: 6 });
  await a.mouse.down();
  await a.mouse.move(bounds.x + 450, bounds.y + 212, { steps: 8 });
  await a.mouse.move(bounds.x + 460, bounds.y + 212, { steps: 2 });
  await a.mouse.up();
  await expect.poll(() => objectCount(a)).toBe(3);
  await canvas(a).click({ position: { x: 232, y: 212 } });
  await a.getByLabel("Object width", { exact: true }).fill("120");
  const b = await open(second, room);
  await expect.poll(() => objectCount(b), { timeout: 15000 }).toBe(3);
  await expect.poll(() => canvas(b).locator('image[*|href^="data:image/svg+xml"]').count()).toBe(2);
  expect((await exported(b)).objects.find((item) => item.label === "Kubernetes")?.width).toBe(120);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("offers cloud provider icons that scale evenly and never rotate, for every peer", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const lambda = a.getByRole("button", { name: "Icon: AWS Lambda", exact: true });
  await a.getByText("AWS", { exact: true }).click();
  await lambda.waitFor({ timeout: 15000 });
  await a.getByText("AWS", { exact: true }).click();
  const search = a.getByLabel("Search stencils", { exact: true });
  await search.fill("s3");
  await a
    .getByRole("button", { name: "Icon: Amazon Simple Storage Service", exact: true })
    .waitFor();
  await search.fill("lambda");
  await lambda.click();
  await canvas(a).click({ position: { x: 200, y: 180 } });
  await search.fill("virtual machine");
  await dragStencil(a, "Icon: Virtual Machine", 400, 180);
  await search.fill("");
  await expect.poll(() => objectCount(a)).toBe(2);

  await canvas(a).click({ position: emptySpot });
  await canvas(a).click({ position: { x: 232, y: 212 } });
  expect(await a.getByLabel("Object rotation", { exact: true }).count()).toBe(0);
  expect(await a.getByLabel("Icon color", { exact: true }).count()).toBe(0);
  expect(await a.getByLabel("Fill color", { exact: true }).count()).toBe(0);
  await a.getByLabel("Object width", { exact: true }).fill("128");
  await expect.poll(() => a.getByLabel("Object height", { exact: true }).inputValue()).toBe("128");

  // A corner drag asking for a wide shape still scales evenly.
  const bounds = (await canvas(a).boundingBox())!;
  await a.mouse.move(bounds.x + 328, bounds.y + 308);
  await a.mouse.down();
  await a.mouse.move(bounds.x + 450, bounds.y + 340, { steps: 8 });
  await a.mouse.up();
  await expect
    .poll(async () => {
      const item = (await exported(a)).objects.find((value) => value.label === "AWS Lambda")!;
      return item.width === item.height && item.width > 128;
    })
    .toBe(true);

  // Rotating a selection with a vendor icon moves it but leaves it upright.
  await canvas(a).click({ position: emptySpot });
  await drag(a, 180, 120, 480, 300);
  const handle = (await a.getByTestId("frame-rotate").boundingBox())!;
  await a.mouse.move(handle.x + 6, handle.y + 6);
  await a.mouse.down();
  await a.mouse.move(handle.x + 160, handle.y + 120, { steps: 8 });
  await a.mouse.up();
  const turned = (await exported(a)).objects.find((value) => value.label === "AWS Lambda")!;
  expect(Number(turned.style.rotation || 0)).toBe(0);

  const b = await open(second, room);
  await expect.poll(() => objectCount(b), { timeout: 15000 }).toBe(2);
  await expect
    .poll(() => canvas(b).locator('image[*|href^="data:image/svg+xml"]').count(), {
      timeout: 15000,
    })
    .toBe(2);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
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
