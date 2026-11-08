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
import type { Item, View } from "../document/types";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument } from "../files/canvasFile";
import { startRelayFixture } from "../collaboration/relayFixture";

export let browser: Browser;
let server: ViteDevServer;
let siteUrl = "";
export const baseUrl = () => siteUrl;
export const errors: string[] = [];
const engines = { chromium, firefox, webkit };
const traced = new WeakSet<BrowserContext>();
export let fixture: Awaited<ReturnType<typeof startRelayFixture>>;

// Browser tests only ever run against this local server and local relay.
beforeAll(async () => {
  server = await createServer({ server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  siteUrl = server.resolvedUrls!.local[0];
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

/** Points a context at the local relay, and at picture storage through the website's address. */
export async function serveFixtures(context: BrowserContext) {
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__APP_CONFIG__ = ${JSON.stringify(fixture.config)};`,
    })
  );
  // CloudFront in miniature: a missing key serves the app with a 200, as the website does.
  await context.route("**/pictures/*", (route) => {
    const picture = fixture.picture(route.request().url().split("/").pop()!);
    return route.fulfill(
      picture
        ? { body: picture.bytes, contentType: picture.type }
        : { body: "<!doctype html>", contentType: "text/html" }
    );
  });
}

/** Pastes a generated picture, as the browser delivers a real clipboard image. */
export async function pastePicture(page: Page, color: string) {
  await page.evaluate(async (fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 200, 100);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png")
    );
    const data = new DataTransfer();
    data.items.add(new File([blob], "pasted.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  }, color);
}

/** How many pictures are drawn from their bytes, as opposed to icons or empty frames. */
export function drawnPictures(page: Page) {
  return page
    .getByTestId("canvas")
    .locator("image")
    .evaluateAll(
      (nodes) =>
        nodes.filter((node) =>
          (node.getAttribute("href") ?? node.getAttribute("xlink:href") ?? "").startsWith("blob:")
        ).length
    );
}

export async function open(context: BrowserContext, room = "", join = false, status = "Connected") {
  if (!traced.has(context)) {
    await context.tracing.start({ screenshots: true, snapshots: true });
    traced.add(context);
  }
  await serveFixtures(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Browser error:", error.message);
  });
  await page.goto(join ? siteUrl : `${siteUrl}#room=${room}`);
  if (join) {
    await page.getByLabel("Room link or code", { exact: true }).fill(`${siteUrl}#room=${room}`);
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
  await page.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Enter");
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

export async function exported(page: Page): Promise<{
  objects: Item[];
  views: View[];
  /** The file as downloaded, for importing it again. */
  text: string;
}> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export document", exact: true }).click();
  const download = await pending;
  const text = await readFile((await download.path())!, "utf8");
  // An empty canvas keeps the file's ids, so journeys see the items as the room has them.
  const copy = new CanvasDocument();
  importDocument(copy, text);
  const result = { objects: copy.list(), views: [...copy.views.values()], text };
  copy.destroy();
  return result;
}

export async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + x, bounds.y + y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + x + dx, bounds.y + y + dy, { steps: 10 });
  await page.mouse.up();
}
