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
import type { CanvasObject, Bookmark } from "../document/types";
import { startAppSyncFixture } from "../collaboration/appsyncFixture";

export let browser: Browser;
let server: ViteDevServer | null = null;
let baseUrl = process.env.ARCONIS_URL || "";
export const errors: string[] = [];
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

export async function open(context: BrowserContext, room = "", join = false) {
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
export async function add(page: Page, tool: string, label: string, x: number, y: number) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x, y } });
  await page.getByLabel("Object text", { exact: true }).fill(label);
}
export function row(page: Page, label: string) {
  return page.locator(".object-row").filter({ hasText: label });
}

export async function exported(
  page: Page
): Promise<{ version: number; objects: CanvasObject[]; bookmarks: Bookmark[] }> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export document", exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8")) as {
    version: number;
    objects: CanvasObject[];
    bookmarks: Bookmark[];
  };
}

export async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + x, bounds.y + y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + x + dx, bounds.y + y + dy, { steps: 10 });
  await page.mouse.up();
}
