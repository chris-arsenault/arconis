import { beforeAll, afterAll, afterEach, it, expect } from "vitest";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CanvasObject, Bookmark } from "../document/types";
import { CanvasDocument } from "../document/canvasDocument";
import { createRoomId } from "../collaboration/room";
import { startAppSyncFixture } from "../collaboration/appsyncFixture";

let browser: Browser;
let server: ViteDevServer | null = null;
let baseUrl = process.env.ARCONIS_URL || "";
const errors: string[] = [];
const engines = { chromium, firefox, webkit };
let fixture: Awaited<ReturnType<typeof startAppSyncFixture>> | null = null;

beforeAll(async () => {
  if (!baseUrl) {
    server = await createServer({ server: { port: 0, host: "127.0.0.1" } });
    await server.listen();
    baseUrl = server.resolvedUrls!.local[0];
  }
  if (!process.env.ARCONIS_URL) fixture = await startAppSyncFixture();
  browser = await engines[(process.env.BROWSER || "chromium") as keyof typeof engines].launch({
    headless: true,
  });
  await mkdir("test-results", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await fixture?.close();
});
afterEach(async ({ task }) => {
  if (task.result?.state !== "fail") return;
  for (const context of browser.contexts())
    for (const page of context.pages()) await page.screenshot({ path: "test-results/failure.png" });
});

async function open(context: BrowserContext, room = "", join = false) {
  if (fixture)
    await context.route("**/config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.__APP_CONFIG__ = ${JSON.stringify(fixture!.config)};`,
      })
    );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(join ? baseUrl : `${baseUrl}#room=${room}`);
  if (join) {
    await page.getByLabel("Room link or code", { exact: true }).fill(`${baseUrl}#room=${room}`);
    await page.getByRole("button", { name: "Join room", exact: true }).click();
  } else if (!room) {
    await page.getByLabel("Your display name", { exact: true }).fill("Designer");
    await page.getByRole("button", { name: "Create a room", exact: true }).click();
    expect(new URL(page.url()).hash).toMatch(/^#room=[a-f0-9]{48}$/);
  }
  if (process.env.EXPECTED_REVISION)
    expect(await page.locator("html").getAttribute("data-revision")).toBe(
      process.env.EXPECTED_REVISION
    );
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).waitFor();
  await page.getByTestId("connection-status").filter({ hasText: "Connected" }).waitFor();
  return page;
}
async function add(page: Page, tool: string, label: string, x: number, y: number) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x, y } });
  await page.getByLabel("Object text", { exact: true }).fill(label);
}
function row(page: Page, label: string) {
  return page.locator(".object-row").filter({ hasText: label });
}

async function exported(page: Page): Promise<{ objects: CanvasObject[]; bookmarks: Bookmark[] }> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export document", exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8")) as {
    objects: CanvasObject[];
    bookmarks: Bookmark[];
  };
}

async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + x, bounds.y + y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + x + dx, bounds.y + y + dy, { steps: 10 });
  await page.mouse.up();
}

it("edits a complete mixed canvas, routes and groups connected objects", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context);
  await add(page, "Rectangle (R)", "API service", 220, 170);
  await add(page, "Sticky note (N)", "A connected idea", 500, 300);
  await page.getByRole("button", { name: "Fill #ffd9da", exact: true }).click();
  await row(page, "API service").click();
  await row(page, "A connected idea").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  await row(page, "API service").click();
  await page.getByLabel("Object x", { exact: true }).fill("350");
  await row(page, "A connected idea").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect.poll(() => page.locator(".object-row").count()).toBe(4);
  await row(page, "Group").click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect.poll(() => page.locator(".object-row").count()).toBe(8);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => page.locator(".object-row").count()).toBe(4);
  await row(page, "Group").click();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  await row(page, "A connected idea").dblclick();
  await page.getByLabel("Edit canvas text").fill("Edited on canvas");
  await page.getByLabel("Edit canvas text").press("Escape");
  await expect.poll(() => row(page, "Edited on canvas").count()).toBe(1);
  await page.getByLabel("View name", { exact: true }).fill("Overview");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "test-results/mixed-canvas.png" });
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
  expect(await isolated.locator(".object-row").count()).toBe(0);
  await row(b, "Peer idea").click();
  await b.getByRole("button", { name: "Delete selection", exact: true }).click();
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
  await a.getByRole("button", { name: "Connect", exact: true }).click();
  await a.getByRole("button", { name: "Group", exact: true }).click();
  await b.locator('.object-row[title="Group"]').waitFor();
  await b.locator('.object-row[title="Group"]').click();
  await b.getByRole("button", { name: "Delete selection", exact: true }).click();
  await expect.poll(() => a.locator(".object-row").count()).toBe(0);
}

it("drags and resizes attached objects, changes routing and preserves portable views", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Move me", 220, 170);
  await add(page, "Sticky note (N)", "Attached note", 540, 390);
  await row(page, "Move me").click();
  await row(page, "Attached note").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
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
  await row(page, "Connector").click();
  await page.getByLabel("Connector routing").selectOption("none");
  await page.getByLabel("Object text", { exact: true }).fill("Relationship");
  await page.getByLabel("View name", { exact: true }).fill("Portable view");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  const saved = await exported(page);
  const edge = saved.objects.find((item) => item.kind === "connector")!;
  expect(saved.objects.find((item) => item.id === edge.source)).toMatchObject({
    label: "Move me",
    x: oldX + 100,
    width: 240,
  });
  expect(saved.objects.find((item) => item.id === edge.target)?.label).toBe("Attached note");
  expect(edge.style.edgeStyle).toBe("none");
  expect(saved.bookmarks[0].name).toBe("Portable view");
  await page.getByLabel("Import file").setInputFiles({
    name: "copy.arconis",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "arconis", version: 1, ...saved })),
  });
  await expect.poll(() => page.locator(".object-row").count()).toBe(6);
  expect((await exported(page)).bookmarks).toHaveLength(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  expect(errors).toEqual([]);
  await context.close();
});

it("uses every diagram tool, draws a stroke and keeps objects when changing modes", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  const tools = ["Ellipse", "Decision (D)", "Service", "Database", "Cloud", "Person", "Text"];
  for (let i = 0; i < tools.length; i++)
    await add(page, tools[i], `Component ${i}`, 190 + (i % 3) * 220, 150 + Math.floor(i / 3) * 200);
  await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
  await drag(page, 200, 750, 200, -70);
  await expect.poll(() => page.locator(".object-row").count()).toBe(8);
  const beforeMove = await exported(page);
  const beforePoints = JSON.parse(
    beforeMove.objects.find((item) => item.kind === "stroke")!.points
  ) as [number, number][];
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await row(page, "Drawing").click();
  await drag(page, 300, 715, 50, 20);
  const afterMove = await exported(page);
  const afterPoints = JSON.parse(
    afterMove.objects.find((item) => item.kind === "stroke")!.points
  ) as [number, number][];
  expect(afterPoints[0]).toEqual([beforePoints[0][0] + 50, beforePoints[0][1] + 20]);
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  expect(await page.locator(".object-row").count()).toBe(8);
  await add(page, "Sticky note (N)", "Still one document", 650, 700);
  await page.getByRole("button", { name: "Connector: click two objects", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 270, y: 195 } });
  await page.getByTestId("canvas").click({ position: { x: 490, y: 195 } });
  await expect.poll(() => page.locator(".object-row").count()).toBe(10);
  const saved = await exported(page);
  expect(saved.objects.filter((item) => item.kind === "stroke")).toHaveLength(1);
  expect(
    JSON.parse(saved.objects.find((item) => item.kind === "stroke")!.points).length
  ).toBeGreaterThan(2);
  expect(errors).toEqual([]);
  await context.close();
});

function representativeCanvas() {
  const document = new CanvasDocument();
  for (let i = 0; i < 150; i++) {
    const x = (i % 10) * 480;
    const y = Math.floor(i / 10) * 260;
    const source = document.create("service", x, y, { label: `Service ${i}` });
    const target = document.create("sticky", x + 220, y, {
      label: `Design note ${i}: ${"A shared thought. ".repeat(20)}`,
    });
    document.create("connector", 0, 0, { source, target });
  }
  const result = JSON.stringify({
    format: "arconis",
    version: 1,
    title: "System overview",
    objects: document.list(),
  });
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
    mimeType: "application/json",
    buffer: Buffer.from(representativeCanvas()),
  });
  await expect.poll(() => a.locator(".object-row").count()).toBe(450);
  const imported = performance.now() - start;
  const b = await open(second, room);
  await expect.poll(() => b.locator(".object-row").count(), { timeout: 45000 }).toBe(450);
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
