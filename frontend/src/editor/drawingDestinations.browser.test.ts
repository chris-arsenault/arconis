import { expect, it } from "vitest";
import type { Locator, Page } from "playwright";
import {
  browser,
  open,
  exported,
  errors,
  row,
  dockPanel,
  drawInto,
  markupBar,
} from "./browserHarness";
import { createRoomId } from "../collaboration/room";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + from[0], bounds.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(bounds.x + to[0], bounds.y + to[1], { steps: 10 });
  await page.mouse.up();
}
async function lasso(page: Page, tool: Locator) {
  await tool.click();
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + 170, bounds.y + 170);
  await page.mouse.down();
  for (const [x, y] of [
    [440, 170],
    [440, 440],
    [170, 440],
    [170, 170],
  ])
    await page.mouse.move(bounds.x + x, bounds.y + y, { steps: 5 });
  await page.mouse.up();
}

async function resizeDimension(page: Page, dimension: "width" | "height", value: string) {
  const field = page.getByLabel(`Object ${dimension}`, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

async function resizePanelHandle(page: Page) {
  const handles = page.getByTestId("canvas").locator('[style*="cursor:"][style*="se-resize"]');
  const handle = (await handles.first().boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 100, handle.y + handle.height / 2 + 75, {
    steps: 10,
  });
  await page.mouse.up();
}

it("keeps Draw's brush and Markup's choices apart while each creates, erases and transfers in its own place", async () => {
  const room = createRoomId();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const peerContext = await browser.newContext();
  const page = await open(context, room),
    peer = await open(peerContext, room);
  await dockPanel(page, "Layers");
  await button(page, "New layer").click();
  await page.locator('[data-testid="layer"] .layer-name', { hasText: "Layer 2" }).dblclick();
  await page.getByLabel("New name for Layer 2", { exact: true }).fill("Earth detail");
  await page.getByLabel("New name for Layer 2", { exact: true }).press("Enter");
  // Draw paints into the layer chosen in Layers, and names it.
  await drawInto(page, "content");
  await expect
    .poll(() => page.getByTestId("drawing-layer").textContent())
    .toContain("Earth detail");
  await button(page, "Vector").click();
  await button(page, "Rectangle").click();
  await page.getByLabel("Fill color", { exact: true }).fill("#247dab");
  await drag(page, [200, 200], [400, 400]);
  const content = (await exported(page)).objects[0];
  expect(content).toMatchObject({ type: "drawing", markup: false });
  expect(content.layer).toBeTruthy();
  // Markup has its own few tools and colours; it never takes the brush's fill.
  await drawInto(page, "markup");
  const bar = markupBar(page);
  await bar.getByRole("button", { name: "Box", exact: true }).click();
  await bar.getByRole("button", { name: "Blue", exact: true }).click();
  await drag(page, [230, 230], [360, 360]);
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(2);
  const annotation = (await exported(page)).objects.find((i) => i.markup)!;
  expect(annotation.look).toMatchObject({ line: "#1971c2", fill: "none" });
  expect(annotation.layer).toBe("");
  await bar.getByRole("button", { name: "Erase", exact: true }).click();
  await drag(page, [300, 160], [300, 430]);
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(1);
  expect((await exported(page)).objects[0]).toEqual(content);
  await button(page, "Undo").click();
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(2);
  // Back in Draw the brush is as it was left: Markup's box, blue and eraser changed nothing.
  await drawInto(page, "content");
  expect(await button(page, "Vector").getAttribute("aria-pressed")).toBe("true");
  expect(await page.getByLabel("Fill color", { exact: true }).inputValue()).toBe("#247dab");
  await button(page, "Erase stroke").click();
  await drag(page, [300, 160], [300, 430]);
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(1);
  expect((await exported(page)).objects[0].markup).toBe(true);
  await button(page, "Undo").click();
  await expect.poll(async () => (await exported(peer)).objects.length).toBe(2);
  await lasso(page, button(page, "Select ink"));
  await button(page, "Move to Markup").click();
  await expect
    .poll(async () => (await exported(peer)).objects.filter((i) => i.markup).length)
    .toBe(2);
  await drawInto(page, "markup");
  await lasso(page, bar.getByRole("button", { name: "Select annotations", exact: true }));
  await button(page, "Move to content layer").click();
  await expect
    .poll(async () => (await exported(peer)).objects.filter((i) => i.markup).length)
    .toBe(0);
  expect((await exported(peer)).objects.every((i) => i.layer === content.layer)).toBe(true);
  expect(await button(page, "New Drawing").count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
  await peerContext.close();
});

it("scales mixed panel content through numeric and pointer resizing, shares it and undoes the gesture", async () => {
  const room = createRoomId();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const peerContext = await browser.newContext();
  const page = await open(context, room),
    peer = await open(peerContext, room);
  await page.getByLabel("Import file").setInputFiles({
    name: "panel.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
frame panel "Panel" at 100,100 size 400,300 title top fill none {
  node box "Box" at 130,150 size 100,50 fill #247dab
  text label "A label" at 270,150 size 100,30 text-size 14
  drawing ink "" points 150,260 260,260 line-width 4
  frame inner "Inner" at 300,260 size 100,100 scale-contents title top {
    drawing nested points 320,300 360,320
  }
}`),
  });
  await row(page, "Panel").click();
  const option = page.getByRole("checkbox", { name: "Scale content on resize", exact: true });
  expect(await option.isChecked()).toBe(false);
  await option.check();
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.id === "panel")?.scaleContents)
    .toBe(true);
  const before = await exported(page);
  await resizeDimension(page, "width", "800");
  await resizeDimension(page, "height", "600");
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.id === "box")?.width)
    .toBe(200);
  const resized = (await exported(page)).objects;
  expect(resized.find((i) => i.id === "box")).toMatchObject({
    x: 160,
    y: 200,
    width: 200,
    height: 100,
  });
  expect(resized.find((i) => i.id === "label")?.look.scale).toBeCloseTo(2);
  expect(resized.find((i) => i.id === "ink")?.points).toEqual([
    [200, 420],
    [420, 420],
  ]);
  expect(resized.find((i) => i.id === "nested")?.points).toEqual([
    [540, 500],
    [620, 540],
  ]);
  await button(page, "Undo").click();
  await button(page, "Undo").click();
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.id === "box")?.width)
    .toBe(100);
  await row(page, "Panel").click();
  await resizePanelHandle(page);
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.id === "box")!.width)
    .toBeGreaterThan(110);
  await button(page, "Undo").click();
  await expect
    .poll(async () => (await exported(peer)).objects.find((i) => i.id === "box")!.width)
    .toBe(100);
  expect((await exported(page)).objects.find((i) => i.id === "nested")?.points).toEqual(
    before.objects.find((i) => i.id === "nested")!.points
  );
  await page.screenshot({ path: "test-results/scalable-panel.png" });
  expect(errors).toEqual([]);
  await context.close();
  await peerContext.close();
});

it("moves scalable grouped artwork without scaling its members", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "group.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
group panel "Artwork" at 100,100 size 200,150 scale-contents {
  node member "Member" at 130,130 size 100,60
}`),
  });
  await row(page, "Member").click();
  const member = (await row(page, "Member").boundingBox())!;
  await page.mouse.move(member.x + member.width / 2, member.y + member.height / 2);
  await page.mouse.down();
  await page.mouse.move(member.x + member.width / 2 + 300, member.y + member.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await exported(page)).objects.find((i) => i.id === "member")?.x)
    .toBeGreaterThan(250);
  expect((await exported(page)).objects.find((i) => i.id === "member")).toMatchObject({
    width: 100,
    height: 60,
  });
  expect(errors).toEqual([]);
  await context.close();
});
