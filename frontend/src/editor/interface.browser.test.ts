import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  browser,
  errors,
  open,
  add,
  row,
  exported,
  drag,
  objectCount,
  selectDrawing,
} from "./browserHarness";

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
  await page.getByRole("button", { name: "Ellipse (E)", exact: true }).click();
  expect(await pressed.getAttribute("aria-label")).toBe("Ellipse (E)");
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
  await a.locator("details[aria-label='Technology'] > summary").click();
  await a.getByRole("button", { name: "Icon: Docker", exact: true }).waitFor();
  const saved = await exported(a);
  const icons = saved.objects.filter((item) => item.stencil === "icon" && item.type === "node");
  expect(icons.map((item) => item.icon)).toEqual(["brand:kubernetes", "lucide:HardDrive"]);
  expect(icons.map((item) => item.name)).toEqual(["Kubernetes", "Hard Drive"]);
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
  await a.getByLabel("Object width", { exact: true }).press("Tab");
  const b = await open(second, room);
  await expect.poll(() => objectCount(b), { timeout: 15000 }).toBe(3);
  await expect.poll(() => canvas(b).locator('image[*|href^="data:image/svg+xml"]').count()).toBe(2);
  expect((await exported(b)).objects.find((item) => item.name === "Kubernetes")?.width).toBe(120);
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
  await a.getByLabel("Object width", { exact: true }).press("Tab");
  await expect.poll(() => a.getByLabel("Object height", { exact: true }).inputValue()).toBe("128");

  // A corner drag asking for a wide shape still scales evenly.
  const bounds = (await canvas(a).boundingBox())!;
  await a.mouse.move(bounds.x + 328, bounds.y + 308);
  await a.mouse.down();
  await a.mouse.move(bounds.x + 450, bounds.y + 340, { steps: 8 });
  await a.mouse.up();
  await expect
    .poll(async () => {
      const item = (await exported(a)).objects.find((value) => value.name === "AWS Lambda")!;
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
  const turned = (await exported(a)).objects.find((value) => value.name === "AWS Lambda")!;
  expect(Number(turned.look.rotation || 0)).toBe(0);

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
  // More text controls can scroll vertically; the compact sidebar must never overflow sideways.
  const fits = () => panel.evaluate((node) => node.scrollWidth <= node.clientWidth);
  expect(await fits()).toBe(true);
  expect(await page.getByLabel("Object x", { exact: true }).count()).toBe(1);
  await page.getByLabel("Object height", { exact: true }).scrollIntoViewIfNeeded();
  expect(await page.getByLabel("Object height", { exact: true }).isVisible()).toBe(true);
  await page.screenshot({ path: "test-results/inspector-shape.png" });
  await add(page, "Sticky note (N)", "Note", 500, 150);
  expect(await fits()).toBe(true);
  expect(await page.getByLabel("Line color", { exact: true }).count()).toBe(0);
  expect(await page.getByLabel("Font size", { exact: true }).inputValue()).toBe("16");
  await add(page, "Text (T)", "Words", 500, 400);
  expect(await page.getByLabel("Fill color", { exact: true }).count()).toBe(0);
  await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
  const bounds = (await canvas(page).boundingBox())!;
  await page.mouse.move(bounds.x + 200, bounds.y + 400);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 350, bounds.y + 450, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await selectDrawing(page);
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
  await a.getByRole("button", { name: "Explore", exact: true }).click();
  await a.getByRole("button", { name: "Save current view", exact: true }).click();
  const saved = a.getByRole("button", { name: "View 1", exact: true });
  await saved.waitFor();
  await saved.hover();
  await a.getByRole("button", { name: "Rename view View 1", exact: true }).click();
  await a.getByLabel("New name for View 1", { exact: true }).fill("Far corner");
  await a.keyboard.press("Enter");
  const b = await open(second, room);
  await b.getByRole("button", { name: "Explore", exact: true }).click();
  const named = b.getByRole("button", { name: "Far corner", exact: true });
  await named.waitFor({ timeout: 15000 });
  await named.click();
  await expect.poll(() => b.getByTestId("zoom-level").textContent()).toBe(zoom);
  await expect.poll(async () => Math.abs((await offsetFromCenter(b)) - expected)).toBeLessThan(5);
  await a.getByRole("button", { name: "Far corner", exact: true }).hover();
  await a.getByRole("button", { name: "Remove view Far corner", exact: true }).click();
  await expect.poll(() => named.count(), { timeout: 15000 }).toBe(0);
  expect((await exported(a)).views).toHaveLength(0);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("keeps long names inside the rail and titles inside their frames, in panels that open alike", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  const longTitle = "Payments platform with an extremely long frame title that keeps going";
  await add(page, "Frame (F)", longTitle, 160, 140);
  await canvas(page).click({ position: emptySpot });
  await add(
    page,
    "Slide",
    "Introduction slide with a very very long name for the deck list",
    700,
    150
  );
  await canvas(page).click({ position: emptySpot });
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page
    .getByLabel("View name", { exact: true })
    .fill("Overview of the whole platform at a glance");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();

  // A frame's title ends inside the frame, which is 320 wide, instead of running past it.
  const title = (await row(page, /^Payments platform/).boundingBox())!;
  expect(title.width).toBeLessThanOrEqual(320);
  const laidOut = await row(page, /^Payments platform/).evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return {
      text: range.getBoundingClientRect().width,
      overflow: getComputedStyle(node).textOverflow,
    };
  });
  expect(laidOut.text).toBeGreaterThan(title.width);
  expect(laidOut.overflow).toBe("ellipsis");

  // Nothing in the rail is wider than the rail, however long its name.
  const rail = (await page
    .getByRole("complementary", { name: "Tools and stencils" })
    .boundingBox())!;
  const boxes = await page
    .locator(".left-rail button:visible")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
  expect(boxes.length).toBeGreaterThan(10);
  for (const right of boxes) expect(right).toBeLessThanOrEqual(rail.x + rail.width + 1);

  // Every secondary panel is the same disclosure: History starts closed with its step count,
  // Saved views starts open, and each stays as it was left after a reload.
  const history = page.locator("details.rail-section[aria-label='History']");
  expect(await history.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
  expect(await history.locator(".rail-count").textContent()).toMatch(/^\d+$/);
  await history.locator("summary").click();
  await history.locator("button[aria-current='step']").waitFor();
  const views = page.locator("details.rail-section[aria-label='Saved views']");
  await views.locator("summary").click();
  await expect.poll(() => page.getByLabel("View name", { exact: true }).isVisible()).toBe(false);
  // The undo history does not survive a reload, so only the saved views panel is there to check.
  await page.reload();
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).waitFor();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  expect(await views.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
  await views.locator("summary").click();
  await page.getByLabel("View name", { exact: true }).waitFor();
  expect(errors).toEqual([]);
  await context.close();
});

it("tags from the ring, filters from the rail's tags, and grows compact branches", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Sticky note (N)", "Strategy", 300, 300);
  const root = (await exported(page)).objects[0];

  // Tab grows a branch that is a compact topic, not another full-size note.
  await row(page, "Strategy").click();
  await page.keyboard.press("Tab");
  await page.getByLabel("Edit canvas text", { exact: true }).fill("Pricing");
  await page.keyboard.press("Escape");
  const branch = (await exported(page)).objects.find((item) => item.name === "Pricing")!;
  expect(branch.type).toBe("note");
  expect(branch.height).toBeLessThan(root.height / 2);

  // The ring's west wedge tags the object where it is.
  await canvas(page).click({ position: emptySpot });
  const box = (await row(page, "Strategy").boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x - 60, y, { steps: 6 });
  await page.mouse.up({ button: "right" });
  const tagField = page.getByRole("dialog", { name: "Tags" }).getByLabel("Add a tag");
  await tagField.fill("growth");
  await tagField.press("Enter");
  await tagField.press("Enter");
  await expect.poll(() => page.getByRole("dialog", { name: "Tags" }).count()).toBe(0);
  await expect
    .poll(async () => (await exported(page)).objects.find((item) => item.id === root.id)?.tags)
    .toEqual(["growth"]);

  // The panel shows the tag as a chip and offers it to the branch, which takes it in one click.
  await expect
    .poll(() => page.locator(".inspector .tag-chip").allTextContents())
    .toEqual(["#growth"]);
  await row(page, "Pricing").click();
  await page.getByRole("group", { name: "Tags in this room" }).getByText("#growth").click();
  await expect
    .poll(async () => (await exported(page)).objects.filter((item) => item.tags).length)
    .toBe(2);

  // The rail lists the room's tags; choosing one filters the canvas to what carries it.
  await canvas(page).click({ position: emptySpot });
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page
    .locator(".left-rail details[aria-label='Tags']")
    .getByRole("button", { name: "#growth" })
    .click();
  await page.getByRole("region", { name: "Filter" }).waitFor();
  await expect
    .poll(() => page.getByRole("button", { name: "#growth" }).first().getAttribute("aria-pressed"))
    .toBe("true");

  // Panel sections fold from their header and stay folded after a reload.
  await row(page, "Strategy").click();
  const appearance = page
    .getByLabel("Object properties")
    .locator("details[aria-label='Appearance']");
  await appearance.locator(":scope > summary").click();
  await expect.poll(() => page.getByLabel("Fill color", { exact: true }).isVisible()).toBe(false);
  await page.reload();
  await row(page, "Strategy").click();
  expect(await appearance.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);

  // Export lives in the File menu.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export document", exact: true }).waitFor();
  expect(errors).toEqual([]);
  await context.close();
});
