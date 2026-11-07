import { beforeAll, afterAll, afterEach, expect } from "vitest";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import type { CanvasObject, SavedView } from "../document/types";
import { startRelayFixture } from "../collaboration/relayFixture";

export let browser: Browser;
let server: ViteDevServer;
let baseUrl = "";
export const errors: string[] = [];
const engines = { chromium, firefox, webkit };
const traced = new WeakSet<BrowserContext>();
export let fixture: Awaited<ReturnType<typeof startRelayFixture>>;

// Browser tests only ever run against this local server and local relay.
beforeAll(async () => {
  server = await createServer({ server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  baseUrl = server.resolvedUrls!.local[0];
  fixture = await startRelayFixture();
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
  for (const [index, context] of browser.contexts().entries()) {
    for (const [pageIndex, page] of context.pages().entries())
      await page.screenshot({ path: `test-results/failure-${task.id}-${index}-${pageIndex}.png` });
    if (traced.has(context))
      await context.tracing.stop({ path: `test-results/failure-${task.id}-${index}.zip` });
    traced.delete(context);
  }
});

export async function open(context: BrowserContext, room = "", join = false, status = "Connected") {
  if (!traced.has(context)) {
    await context.tracing.start({ screenshots: true, snapshots: true });
    traced.add(context);
  }
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__APP_CONFIG__ = ${JSON.stringify(fixture.config)};`,
    })
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Browser error:", error.message);
  });
  await page.goto(join ? baseUrl : `${baseUrl}#room=${room}`);
  if (join) {
    await page.getByLabel("Room link or code", { exact: true }).fill(`${baseUrl}#room=${room}`);
    await page.getByRole("button", { name: "Join room", exact: true }).click();
  } else if (!room) {
    await page.getByLabel("Your display name", { exact: true }).fill("Designer");
    await page.getByRole("button", { name: "Create a room", exact: true }).click();
    expect(new URL(page.url()).hash).toMatch(/^#room=[a-f0-9]{48}$/);
  }
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).waitFor();
  await page.getByTestId("connection-status").filter({ hasText: status }).waitFor();
  return page;
}
export async function add(page: Page, tool: string, label: string, x: number, y: number) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x, y } });
  await page.getByLabel("Object text", { exact: true }).fill(label);
}
/** An object's label on the canvas. Clicking it selects the object with a real gesture. */
export function row(page: Page, label: string | RegExp) {
  return page
    .getByTestId("canvas")
    .locator("foreignObject div:not(:has(div))")
    .filter({ hasText: label });
}
export async function objectCount(page: Page) {
  return Number(await page.getByTestId("object-count").textContent());
}
export async function selectionLabel(page: Page) {
  const heading = page.getByTestId("selection-count");
  return (await heading.count()) ? await heading.textContent() : "";
}
async function clickPath(page: Page, stroke: string, modifiers: "Shift"[]) {
  const canvas = page.getByTestId("canvas");
  const position = await canvas
    .locator(`path[stroke="${stroke}"]`)
    .first()
    .evaluate((path: SVGPathElement) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      return { x: point.x, y: point.y };
    });
  await canvas.click({ position, modifiers });
}
export function groupLabel(page: Page) {
  return row(page, /^Group$/);
}
export function selectConnector(page: Page, modifiers: "Shift"[] = []) {
  return clickPath(page, "#7f8aa3", modifiers);
}
export function selectDrawing(page: Page, modifiers: "Shift"[] = []) {
  return clickPath(page, "#6554c0", modifiers);
}

export async function exported(
  page: Page
): Promise<{ version: number; objects: CanvasObject[]; bookmarks: SavedView[] }> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export document", exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8")) as {
    version: number;
    objects: CanvasObject[];
    bookmarks: SavedView[];
  };
}

export async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + x, bounds.y + y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + x + dx, bounds.y + y + dy, { steps: 10 });
  await page.mouse.up();
}
