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
import type { Item } from "../document/types";
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
  fixture = await startRelayFixture(new URL(siteUrl).origin);
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

const oriented = new WeakSet<BrowserContext>();

/** Makes a context arrive as a first-time visitor, so the orientation offer appears. */
export function firstVisit(context: BrowserContext) {
  oriented.add(context);
}

/** Journeys arrive as returning visitors unless they ask to see the orientation offer. */
async function skipOrientation(context: BrowserContext) {
  if (oriented.has(context)) return;
  oriented.add(context);
  await context.addInitScript(() => localStorage.setItem("arconis-orientation", "done"));
}

/** Opens a selection command through the floating toolbar and, when needed, a submenu. */
export async function more(page: Page, command: string) {
  await page.getByRole("button", { name: "More commands", exact: true }).click();
  // A menu item's name ends with its shortcut, as "Group Ctrl G".
  const escaped = command.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const item = page.getByRole("menuitem", { name: new RegExp(`^${escaped}( |$)`) });
  await page.getByRole("menu", { name: "Canvas menu", exact: true }).waitFor();
  const groups = page
    .getByRole("menu", { name: "Canvas menu", exact: true })
    .locator('button[aria-haspopup="menu"]');
  for (const group of await groups.all()) {
    if (await item.count()) break;
    if ((await group.getAttribute("aria-disabled")) === "true") continue;
    if ((page.viewportSize()?.width ?? 1440) > 650) await group.hover();
    else {
      await group.click();
      if (!(await item.count()))
        await page.getByRole("menuitem", { name: "← Back", exact: true }).click();
    }
  }
  await item.click();
}

/** Opens the header's File menu, where export and import live. */
export async function fileMenu(page: Page) {
  const button = page.getByRole("button", { name: "File", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

/** Exports the selection or the canvas as a PNG through the File menu. */
export async function exportPng(page: Page) {
  await closeTextEditor(page);
  await fileMenu(page);
  await page.getByRole("menuitem", { name: "Export PNG", exact: true }).click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
}

export async function open(context: BrowserContext, room = "", join = false, status = "Connected") {
  if (!traced.has(context)) {
    await context.tracing.start({ screenshots: true, snapshots: true });
    traced.add(context);
  }
  await serveFixtures(context);
  await skipOrientation(context);
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
  await page.getByRole("navigation", { name: "Workspace panels" }).waitFor();
  await page.getByTestId("connection-status").filter({ hasText: status }).waitFor();
  return page;
}

/** Changes the right-button mode through Settings, as a person does. */
export async function setContextWheel(page: Page, enabled: boolean) {
  await openSettings(page);
  await page
    .getByRole("checkbox", { name: "Enable context wheel", exact: true })
    .setChecked(enabled);
  await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .getByRole("button", { name: "Done", exact: true })
    .click();
}

export async function workspaceTools(page: Page) {
  const menu = page.locator(".header-tools");
  if (!(await menu.evaluate((node: HTMLDetailsElement) => node.open)))
    await menu.locator("summary").first().click();
}

export async function openSettings(page: Page) {
  await workspaceTools(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

/** Open the full editor through its visible launcher. No sidebar source field is used. */
export async function textEditor(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Edit text", exact: true });
  if (!(await dialog.count())) {
    const inspector = page.getByRole("button", { name: "Edit text", exact: true });
    if (await inspector.isVisible()) await inspector.click();
    else await page.getByRole("button", { name: "Open text editor", exact: true }).click();
    await dialog.waitFor();
  }
  return dialog;
}

export async function closeTextEditor(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Edit text", exact: true });
  if (await dialog.count()) await dialog.getByRole("button", { name: "Done", exact: true }).click();
}

/** Shows one of the left rail's panels: Shapes or Draw. */
export async function railPanel(page: Page, name: "Shapes" | "Draw") {
  await page
    .getByRole("navigation", { name: "Workspace panels" })
    .getByRole("button", { name, exact: true })
    .click();
}
/** Shows one of the right dock's document panels, leaving it open if it already is. */
export async function dockPanel(page: Page, name: "Layers" | "Slides" | "Navigate") {
  const tabs = page.getByRole("navigation", { name: "Document panels" });
  if (!(await tabs.isVisible()))
    await page.getByRole("button", { name: /^(Document panels|Object properties)$/ }).click();
  const tab = tabs.getByRole("button", { name, exact: true });
  if ((await tab.getAttribute("aria-pressed")) !== "true") await tab.click();
}
export async function add(page: Page, tool: string, label: string, x: number, y: number) {
  await closeTextEditor(page);
  if (tool === "Slide") await dockPanel(page, "Slides");
  else await railPanel(page, "Shapes");
  await page
    .getByRole("button", { name: tool === "Slide" ? "Add slide" : tool, exact: true })
    .click();
  await page.getByTestId("canvas").click({ position: { x, y } });
  const inline = page.getByLabel("Edit canvas text", { exact: true });
  if (!(await inline.count())) await page.keyboard.press("Enter");
  await inline.fill(label);
  await inline.press("ControlOrMeta+Enter");
  if ((page.viewportSize()?.width ?? 1440) <= 1100)
    await page.getByRole("button", { name: "Object properties", exact: true }).click();
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
  if (await heading.count()) return heading.textContent();
  const type = page.getByLabel("Object type", { exact: true });
  if (await type.count()) return type.locator("option:checked").textContent();
  return "";
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
/** Markup's bar, which shows while Markup is armed. */
export function markupBar(page: Page) {
  return page.getByRole("toolbar", { name: "Markup", exact: true });
}
/** Arms Draw from the rail's Draw panel, or Markup from the tool row, as a person does. */
export async function drawInto(page: Page, target: "content" | "markup") {
  if (target === "content") return railPanel(page, "Draw");
  await page.getByRole("button", { name: "Markup (M)", exact: true }).click();
  await markupBar(page).waitFor();
}
/**
 * Lassos the first default-coloured ink path. Annotations are lassoed from Markup's bar and
 * content ink from the Draw panel; unsaid, it is an annotation while Markup is armed.
 */
export async function selectDrawing(
  page: Page,
  modifiers: "Shift"[] = [],
  target?: "markup" | "content"
) {
  const box = await page
    .getByTestId("canvas")
    .locator('path[stroke="#6554c0"], path[stroke="#e03131"]')
    .first()
    .boundingBox();
  if (!box) throw new Error("No visible ink path to lasso.");
  const markup = target ? target === "markup" : (await markupBar(page).count()) > 0;
  if (markup) {
    await drawInto(page, "markup");
    await markupBar(page).getByRole("button", { name: "Select annotations", exact: true }).click();
  } else {
    await railPanel(page, "Draw");
    await page.getByRole("button", { name: "Select ink", exact: true }).click();
  }
  if (modifiers.length) await page.keyboard.down("Shift");
  await page.mouse.move(box.x - 12, box.y - 12);
  await page.mouse.down();
  for (const [x, y] of [
    [box.x + box.width + 12, box.y - 12],
    [box.x + box.width + 12, box.y + box.height + 12],
    [box.x - 12, box.y + box.height + 12],
    [box.x - 12, box.y - 12],
  ])
    await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  if (modifiers.length) await page.keyboard.up("Shift");
}

export async function exported(
  page: Page,
  annotations = true
): Promise<{
  objects: Item[];
  /** The file as downloaded, for importing it again. */
  text: string;
}> {
  await closeTextEditor(page);
  const pending = page.waitForEvent("download");
  await fileMenu(page);
  await page.getByRole("menuitem", { name: "Export document", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Include canvas annotations", exact: true })
    .setChecked(annotations);
  await page.getByRole("button", { name: "Export document", exact: true }).click();
  const download = await pending;
  const text = await readFile(await download.path(), "utf8");
  // An empty canvas keeps the file's ids, so journeys see the items as the room has them.
  const copy = new CanvasDocument();
  importDocument(copy, text);
  const result = { objects: copy.list(), text };
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
