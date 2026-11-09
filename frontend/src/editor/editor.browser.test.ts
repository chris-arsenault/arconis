import { it, expect } from "vitest";
import type { Page } from "playwright";
import { writeFile } from "node:fs/promises";
import { CanvasDocument } from "../document/canvasDocument";
import { serializeDocument } from "../files/canvasFile";
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
  selectionLabel,
  groupLabel,
  selectConnector,
  selectDrawing,
  more,
} from "./browserHarness";

it("edits a complete mixed canvas, routes and groups connected objects", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context);
  await add(page, "Rectangle (R)", "API service", 220, 170);
  await add(page, "Sticky note (N)", "A connected idea", 500, 300);
  await page
    .getByLabel("Object properties")
    .getByRole("button", { name: "Fill #ffd9da", exact: true })
    .click();
  await row(page, "API service").click();
  await row(page, "A connected idea").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Connect with a line", exact: true }).click();
  await expect.poll(() => objectCount(page)).toBe(3);
  await row(page, "API service").click();
  await page.getByLabel("Object x", { exact: true }).fill("350");
  await row(page, "A connected idea").click({ modifiers: ["Shift"] });
  await more(page, "Group");
  await expect.poll(() => objectCount(page)).toBe(4);
  await groupLabel(page).click();
  await more(page, "Duplicate");
  await expect.poll(() => objectCount(page)).toBe(8);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => objectCount(page)).toBe(4);
  await groupLabel(page).click();
  await more(page, "Ungroup");
  await expect.poll(() => objectCount(page)).toBe(3);
  await row(page, "A connected idea").dblclick();
  await page.getByLabel("Edit canvas text").fill("Edited on canvas");
  await page.getByLabel("Edit canvas text").press("Escape");
  await expect.poll(() => row(page, "Edited on canvas").count()).toBe(1);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByLabel("View name", { exact: true }).fill("Overview");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "test-results/mixed-canvas.png" });
  await page.reload();
  await row(page, "Edited on canvas").waitFor();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).waitFor();
  expect(await objectCount(page)).toBe(3);
  expect(errors).toEqual([]);
  await context.close();
});

it("synchronizes independent browsers, late join, offline edits, reload and room isolation", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Database", "Shared database", 220, 170);
  const b = await open(second, room, true);
  await row(b, "Shared database").waitFor();
  await add(b, "Sticky note (N)", "Peer idea", 500, 300);
  await row(a, "Peer idea").waitFor();
  await row(a, "Shared database").click();
  await row(b, "Shared database").click();
  await first.setOffline(true);
  await expect.poll(() => a.getByTestId("connection-status").textContent()).toBe("Offline");
  await a.getByLabel("Object x", { exact: true }).fill("450");
  await b.getByLabel("Object y", { exact: true }).fill("420");
  await a.getByLabel("Object text", { exact: true }).fill("First Shared database");
  await b.getByLabel("Object text", { exact: true }).fill("Shared database second");
  await a.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Enter");
  await b.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Enter");
  await first.setOffline(false);
  await expect
    .poll(() => a.getByLabel("Object y", { exact: true }).inputValue(), { timeout: 45000 })
    .toBe("420");
  await expect
    .poll(() => b.getByLabel("Object x", { exact: true }).inputValue(), { timeout: 45000 })
    .toBe("450");
  await expect
    .poll(() => a.getByLabel("Object text", { exact: true }).inputValue())
    .toBe("First Shared database second");
  await a.reload();
  await row(a, "Peer idea").waitFor();
  await row(a, "Shared database").waitFor();
  const isolated = await open(second, createRoomId());
  expect(await objectCount(isolated)).toBe(0);
  await row(b, "Peer idea").click();
  await more(b, "Delete");
  await expect.poll(() => row(a, "Peer idea").count()).toBe(0);
  await sharedGroupDeletion(a, b);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

async function sharedGroupDeletion(a: Page, b: Page) {
  await add(b, "Sticky note (N)", "Grouped peer idea", 500, 300);
  await row(a, "Grouped peer idea").waitFor();
  await row(a, "Shared database").click();
  await row(a, "Grouped peer idea").click({ modifiers: ["Shift"] });
  await a.getByRole("button", { name: "Connect with a line", exact: true }).click();
  await more(a, "Group");
  await groupLabel(b).waitFor();
  // b still has its new note selected, and that note's rotation handle sits over the group label.
  await b.getByTestId("canvas").click({ position: { x: 880, y: 800 } });
  await groupLabel(b).click();
  expect(await selectionLabel(b)).toBe("Group");
  await more(b, "Delete");
  await expect.poll(() => objectCount(b)).toBe(0);
  await expect.poll(() => objectCount(a), { timeout: 15000 }).toBe(0);
}

it("drags and resizes attached objects, changes routing and preserves portable views", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Move me", 220, 170);
  await add(page, "Sticky note (N)", "Attached note", 540, 390);
  await row(page, "Move me").click();
  await row(page, "Attached note").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Connect with a line", exact: true }).click();
  await row(page, "Move me").click();
  const oldX = Number(await page.getByLabel("Object x", { exact: true }).inputValue());
  await drag(page, 300, 215, 100, 70);
  await expect
    .poll(() => page.getByLabel("Object x", { exact: true }).inputValue())
    .toBe(String(oldX + 100));
  await drag(page, 480, 330, 80, 40);
  await expect
    .poll(() => page.getByLabel("Object width", { exact: true }).inputValue())
    .toBe("240");
  await selectConnector(page);
  await page.getByLabel("Line type").selectOption("diagonal");
  await page.getByLabel("Object text", { exact: true }).fill("Relationship");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByLabel("View name", { exact: true }).fill("Portable view");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  const saved = await exported(page);
  const edge = saved.objects.find((item) => item.type === "line")!;
  expect(saved.objects.find((item) => item.id === edge.from)).toMatchObject({
    name: "Move me",
    x: oldX + 100,
    width: 240,
  });
  expect(saved.objects.find((item) => item.id === edge.to)?.name).toBe("Attached note");
  expect(edge.look.path).toBe("diagonal");
  expect(saved.views[0].name).toBe("Portable view");
  await page.getByLabel("Import file").setInputFiles({
    name: "copy.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(saved.text),
  });
  await expect.poll(() => objectCount(page)).toBe(6);
  expect((await exported(page)).views).toHaveLength(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => objectCount(page)).toBe(3);
  expect(errors).toEqual([]);
  await context.close();
});

it("uses shapes, notes, connectors and drawing tools together on one canvas", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  const tools = [
    "Ellipse (E)",
    "Decision (D)",
    "Service",
    "Database",
    "Cloud",
    "Person",
    "Text (T)",
  ];
  for (let i = 0; i < tools.length; i++)
    await add(page, tools[i], `Component ${i}`, 190 + (i % 3) * 220, 150 + Math.floor(i / 3) * 200);
  await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
  await drag(page, 200, 750, 200, -70);
  await expect.poll(() => objectCount(page)).toBe(8);
  const beforeMove = await exported(page);
  const beforePoints = beforeMove.objects.find((item) => item.type === "drawing")!.points;
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await selectDrawing(page);
  await drag(page, 300, 715, 50, 20);
  const afterMove = await exported(page);
  const afterPoints = afterMove.objects.find((item) => item.type === "drawing")!.points;
  expect(afterPoints[0]).toEqual([beforePoints[0][0] + 50, beforePoints[0][1] + 20]);
  expect(await objectCount(page)).toBe(8);
  await add(page, "Sticky note (N)", "Still one document", 650, 700);
  await page.getByRole("button", { name: "Connector: click two objects (C)", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 270, y: 195 } });
  await page.getByTestId("canvas").click({ position: { x: 490, y: 195 } });
  await expect.poll(() => objectCount(page)).toBe(10);
  const saved = await exported(page);
  expect(saved.objects.filter((item) => item.type === "drawing")).toHaveLength(1);
  expect(
    saved.objects.find((item) => item.type === "drawing")!.points.length
  ).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
  await context.close();
});

function representativeCanvas() {
  const document = new CanvasDocument();
  document.rename("System overview");
  for (let i = 0; i < 150; i++) {
    const x = (i % 10) * 480;
    const y = Math.floor(i / 10) * 260;
    const from = document.create("node", x, y, { stencil: "service", name: `Service ${i}` });
    const to = document.create("note", x + 220, y, {
      name: `Design note ${i}: ${"A shared thought. ".repeat(20)}`,
    });
    document.create("line", 0, 0, { from, to });
  }
  const result = serializeDocument(document);
  document.destroy();
  return result;
}

it("renders a representative diagram and synchronizes its chunked state to a new browser", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const a = await open(first, room);
  const start = performance.now();
  await a.getByLabel("Import file").setInputFiles({
    name: "system.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(representativeCanvas()),
  });
  await expect.poll(() => objectCount(a)).toBe(450);
  const imported = performance.now() - start;
  const b = await open(second, room);
  await expect.poll(() => objectCount(b), { timeout: 45000 }).toBe(450);
  const aDocument = await exported(a);
  const bDocument = await exported(b);
  aDocument.objects.sort((left, right) => left.id.localeCompare(right.id));
  bDocument.objects.sort((left, right) => left.id.localeCompare(right.id));
  expect(aDocument.objects).toEqual(bDocument.objects);
  expect(await b.getByTestId("zoom-level").textContent()).toBe("100%");
  await writeFile(
    "test-results/performance.json",
    JSON.stringify({
      objects: 450,
      importedMs: Math.round(imported),
      synchronizedMs: Math.round(performance.now() - start - imported),
    })
  );
  await a.screenshot({ path: "test-results/representative-canvas.png" });
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
