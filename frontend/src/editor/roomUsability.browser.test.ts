import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  baseUrl,
  browser,
  errors,
  exported,
  fileMenu,
  open,
  row,
  serveFixtures,
  unfoldSource,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const PHRASE = "local room test phrase";

async function checkCanvasRows(page: Page) {
  const browserPanel = page.getByRole("region", { name: "Saved work browser" });
  const name = browserPanel.getByRole("button", { name: "Open local Workshop plan", exact: true });
  await name.waitFor();
  expect(await page.getByRole("heading", { name: "Your canvases", exact: true }).count()).toBe(1);
  expect(await browserPanel.getByText("Workshop plan", { exact: true }).count()).toBe(1);
  expect((await name.boundingBox())!.height).toBeLessThan(80);
  const remove = browserPanel.getByRole("button", {
    name: "Remove local Workshop plan",
    exact: true,
  });
  expect((await remove.boundingBox())!.width).toBeLessThanOrEqual(40);
  await browserPanel.getByLabel("Find saved work", { exact: true }).fill("no matching canvas");
  await browserPanel.getByText("No canvases match your search.", { exact: true }).waitFor();
  await browserPanel.getByLabel("Find saved work", { exact: true }).fill("");
  await page.screenshot({ path: "test-results/canvas-browser-desktop.png" });
}

it("allows an empty title draft and publishes one undoable replacement without stale peer writes", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  try {
    const room = createRoomId();
    const a = await open(first, room);
    const b = await open(second, room);
    const title = a.getByLabel("Canvas title", { exact: true });
    await title.click();
    await title.press("ControlOrMeta+A");
    await title.press("Backspace");
    expect(await title.inputValue()).toBe("");
    await title.pressSequentially("Draft canvas");
    expect(await title.inputValue()).toBe("Draft canvas");
    expect(await b.getByLabel("Canvas title", { exact: true }).inputValue()).toBe(
      "Untitled canvas"
    );
    await title.press("Enter");
    await expect
      .poll(() => b.getByLabel("Canvas title", { exact: true }).inputValue())
      .toBe("Draft canvas");
    await b.getByLabel("Canvas title", { exact: true }).click();
    await b.getByRole("button", { name: "File", exact: true }).click();
    await a.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(() => b.getByLabel("Canvas title", { exact: true }).inputValue())
      .toBe("Untitled canvas");
    await title.fill("Cancelled title");
    await title.press("Escape");
    expect(await title.inputValue()).toBe("Untitled canvas");
    expect(await b.getByLabel("Canvas title", { exact: true }).inputValue()).toBe(
      "Untitled canvas"
    );
    await title.press("Escape");
    await title.fill("After cancelling");
    await a.getByRole("button", { name: "File", exact: true }).click();
    await expect
      .poll(() => b.getByLabel("Canvas title", { exact: true }).inputValue())
      .toBe("After cancelling");
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});

it("reopens a retained canvas by title from home", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    await page.getByLabel("Canvas title", { exact: true }).fill("Workshop plan");
    await page.getByLabel("Canvas title", { exact: true }).press("Enter");
    await add(page, "Sticky note (N)", "Retained idea", 260, 240);
    const roomUrl = page.url();
    await page.getByRole("link", { name: "Arconis home", exact: true }).click();
    await checkCanvasRows(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const recent = page
      .getByRole("region", { name: "Saved work browser" })
      .getByRole("button", { name: "Open local Workshop plan", exact: true });
    const bounds = (await recent.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390
    );
    await page.screenshot({ path: "test-results/room-usability-home-mobile.png" });
    await page
      .getByRole("region", { name: "Saved work browser" })
      .getByRole("button", { name: "Open local Workshop plan", exact: true })
      .click();
    await row(page, /^Retained idea$/).waitFor();
    expect(page.url()).toBe(roomUrl);
    expect(await page.getByLabel("Canvas title", { exact: true }).inputValue()).toBe(
      "Workshop plan"
    );
    await page.getByRole("link", { name: "Arconis home", exact: true }).click();
    await page.evaluate(async (id) => {
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open(`arconis-room:${id}`);
        opening.onerror = () => reject(opening.error ?? new Error("Opening room storage failed"));
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction("updates", "readwrite");
          transaction.objectStore("updates").clear();
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("Reading room storage failed"));
        };
      });
    }, new URL(roomUrl).hash.slice("#room=".length));
    await page.reload();
    const work = page.getByRole("region", { name: "Saved work browser" });
    await work.getByText("No local copy", { exact: true }).waitFor();
    await work
      .getByRole("button", { name: "Join remembered Workshop plan", exact: true })
      .waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("leaves abandoned password gates with Cancel or Escape and preserves the previous room", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    await serveFixtures(context);
    await unfoldSource(context);
    const page = await context.newPage();
    await page.goto(baseUrl());
    await page.getByText("Room options", { exact: true }).click();
    await page.getByRole("button", { name: "Create a password room", exact: true }).click();
    await page.getByRole("dialog", { name: "Password required" }).waitFor();
    expect(
      await page
        .getByLabel("Choose a password", { exact: true })
        .evaluate((input) => document.activeElement === input)
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("button", { name: "Cancel joining", exact: true })
        .evaluate((button) => document.activeElement === button)
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Create a room", exact: true }).waitFor();
    await page.getByRole("button", { name: "Create a room", exact: true }).click();
    await add(page, "Sticky note (N)", "Keep this idea", 260, 240);
    const previousUrl = page.url();
    await page.getByRole("button", { name: "Join another room", exact: true }).click();
    await page
      .getByLabel("Room link or code", { exact: true })
      .fill(`${baseUrl()}#locked=${createRoomId()}`);
    await page.getByRole("button", { name: "Join room", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Password required" })
      .getByRole("button", { name: "Cancel joining" })
      .click();
    await row(page, /^Keep this idea$/).waitFor();
    expect(page.url()).toBe(previousUrl);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("explains portable exports and reopens password rooms without exposing protected titles", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    await serveFixtures(context);
    await unfoldSource(context);
    const page = await context.newPage();
    await page.goto(baseUrl());
    await page.getByText("Room options", { exact: true }).click();
    await page.getByRole("button", { name: "Create a password room", exact: true }).click();
    await page.getByLabel("Choose a password", { exact: true }).fill(PHRASE);
    await page.getByRole("button", { name: "Create room", exact: true }).click();
    await page.getByRole("dialog", { name: "Password required" }).waitFor({ state: "detached" });
    await page.getByLabel("Canvas title", { exact: true }).fill("Secret acquisition");
    await page.getByLabel("Canvas title", { exact: true }).press("Enter");
    await add(page, "Sticky note (N)", "Readable portable copy", 260, 240);
    await fileMenu(page);
    await page
      .getByText(
        "Exports are readable copies without the room password. PNGs include editable canvas content.",
        { exact: true }
      )
      .waitFor();
    expect((await exported(page)).text).toContain("Readable portable copy");
    const index = await page.evaluate(() => localStorage.getItem("arconis:recent-rooms"));
    expect(index).not.toContain("Secret acquisition");
    expect(index).not.toContain(PHRASE);
    await page.getByRole("link", { name: "Arconis home", exact: true }).click();
    await page
      .getByRole("region", { name: "Saved work browser" })
      .getByRole("button", { name: "Open local Password room", exact: true })
      .click();
    await page.getByLabel("Room password", { exact: true }).waitFor();
    expect(await row(page, /^Readable portable copy$/).count()).toBe(0);
    await page.getByRole("button", { name: "Cancel joining", exact: true }).click();
    await page.getByRole("button", { name: "Create a room", exact: true }).waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
