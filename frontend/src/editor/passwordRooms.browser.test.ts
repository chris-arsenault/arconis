import { expect, it } from "vitest";
import type { Page } from "playwright";
import { add, baseUrl, browser, errors, fixture, objectCount, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const SECRET = "Merger codename";
const PHRASE = "correct horse battery";

/** Opens a browser with sockets recorded, since what they carry is the point. */
async function visit(url = baseUrl()) {
  const context = await browser.newContext(VIEWPORT);
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__APP_CONFIG__ = ${JSON.stringify(fixture.config)};`,
    })
  );
  const page = await context.newPage();
  const frames: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => frames.push(String(payload)));
    socket.on("framereceived", ({ payload }) => frames.push(String(payload)));
  });
  await page.goto(url);
  return { page, frames };
}

const enter = async (page: Page, password: string) => {
  await page.getByLabel("Room password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Open room", exact: true }).click();
};

/** Every byte of this browser's stores, as text. */
const storedText = (page: Page) =>
  page.evaluate(async () => {
    const seen: string[] = [];
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const opening = indexedDB.open(name!);
        opening.onsuccess = () => resolve(opening.result);
      });
      for (const store of db.objectStoreNames) {
        const values = await new Promise<unknown[]>((resolve) => {
          const reading = db.transaction(store).objectStore(store).getAll();
          reading.onsuccess = () => resolve(reading.result as unknown[]);
        });
        for (const value of values)
          seen.push(
            value instanceof Uint8Array
              ? new TextDecoder("latin1").decode(value)
              : JSON.stringify(value)
          );
      }
      db.close();
    }
    return seen.join("\n");
  });

it("encrypts on the wire and on disk, and opens only with the password", async () => {
  const a = await visit();
  await a.page.getByRole("button", { name: "Create a password room", exact: true }).click();
  await a.page.getByLabel("Choose a password", { exact: true }).fill(PHRASE);
  await a.page.getByRole("button", { name: "Create room", exact: true }).click();
  await a.page.getByTestId("connection-status").filter({ hasText: "Connected" }).waitFor();
  expect(a.page.url()).toMatch(/#locked=[a-f0-9]{48}$/);
  await add(a.page, "Rectangle (R)", SECRET, 300, 240);

  const b = await visit(a.page.url());
  await enter(b.page, "wrong password here");
  await b.page.getByRole("alert").filter({ hasText: "not right" }).waitFor();
  expect(await objectCount(b.page)).toBe(0);
  await enter(b.page, PHRASE);
  await expect.poll(() => row(b.page, SECRET).count()).toBe(1);

  const wire = [...a.frames, ...b.frames];
  expect(wire.length).toBeGreaterThan(0);
  expect(wire.filter((frame) => frame.includes(SECRET) || frame.includes("Guest"))).toEqual([]);
  await a.page.waitForTimeout(300);
  expect(await storedText(a.page)).not.toContain(SECRET);

  await a.page.reload();
  await a.page.getByLabel("Room password", { exact: true }).waitFor();
  expect(await row(a.page, SECRET).count()).toBe(0);
  await enter(a.page, PHRASE);
  await expect.poll(() => row(a.page, SECRET).count()).toBe(1);
  expect(errors).toEqual([]);
}, 90_000);
