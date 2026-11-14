import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, objectCount, open, row } from "./browserHarness";
import { textEditor, closeTextEditor } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const sourceField = (page: Page) => page.getByLabel("Object text", { exact: true });
const picker = (page: Page) => page.getByRole("group", { name: "Choose link target", exact: true });

async function importItems(page: Page, items: string) {
  await page.getByLabel("Import file").setInputFiles({
    name: "object-links.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1\n${items}\n`),
  });
  await expect.poll(() => objectCount(page)).toBe(2);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
}

async function centered(page: Page, fill: string) {
  await expect
    .poll(async () => {
      const area = (await canvas(page).boundingBox())!;
      const shape = await canvas(page)
        .locator(`path[fill="${fill}"], rect[fill="${fill}"]`)
        .first()
        .boundingBox();
      if (!shape) return Infinity;
      return (
        Math.abs(shape.x + shape.width / 2 - area.x - area.width / 2) +
        Math.abs(shape.y + shape.height / 2 - area.y - area.height / 2)
      );
    })
    .toBeLessThan(4);
}

async function findSource(page: Page) {
  await page.getByRole("button", { name: "Find and filter", exact: true }).click();
  const query = page.getByRole("textbox", { name: "Find on canvas", exact: true });
  await query.fill("Read_Note");
  await query.press("Enter");
  await page.getByRole("button", { name: "Close find", exact: true }).click();
  await centered(page, "#fff0ad");
}

it("follows Markdown object links in the same canvas, keeps ids through renames, and returns with view Back", async () => {
  const context = await browser.newContext(VIEWPORT);
  const peerContext = await browser.newContext(VIEWPORT);
  try {
    const room = createRoomId();
    const page = await open(context, room);
    const markdown =
      "[Read Storage](canvas://Store_A)\n[Alias](local://Store_A)\n[Missing](canvas://Deleted)\n[Invalid](canvas://../bad)";
    await importItems(
      page,
      `node Read_Note ${JSON.stringify(markdown)} at 100,100 size 380,180 fill #fff0ad
node Store_A "Storage" at 1600,1000 size 180,100 fill #d9e9ff`
    );
    const peer = await open(peerContext, room);
    const peerLink = canvas(peer).getByRole("link", { name: "Read Storage", exact: true });
    await peerLink.waitFor();
    const peerBefore = (await peerLink.boundingBox())!;
    await findSource(page);
    const url = page.url();
    await canvas(page).press("h");
    await canvas(page).getByRole("link", { name: "Read Storage", exact: true }).click();
    expect((await exported(page)).objects.find((item) => item.id === "Read_Note")!.name).toBe(
      markdown
    );
    await canvas(page).press("v");
    await canvas(page).getByRole("link", { name: "Read Storage", exact: true }).click();
    await expect.poll(() => page.locator(".inspector-name").textContent()).toBe("Storage");
    await centered(page, "#d9e9ff");
    await textEditor(page);
    await sourceField(page).fill("Storage renamed");
    await sourceField(page).press("ControlOrMeta+Enter");
    await closeTextEditor(page);
    await canvas(page).press("ControlOrMeta+[");
    await centered(page, "#fff0ad");
    await canvas(page).getByRole("link", { name: "Missing", exact: true }).click();
    await expect
      .poll(() => page.getByTestId("sync-status").textContent())
      .toContain("no longer exists");
    await canvas(page).getByRole("link", { name: "Invalid", exact: true }).click();
    await expect
      .poll(() => page.getByTestId("sync-status").textContent())
      .toContain("Invalid object link");
    await canvas(page).getByRole("link", { name: "Alias", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.locator(".inspector-name").textContent()).toBe("Storage renamed");
    await centered(page, "#d9e9ff");
    expect(page.url()).toBe(url);
    expect(context.pages()).toHaveLength(1);
    const peerAfter = (await peerLink.boundingBox())!;
    expect(peerAfter.x).toBeCloseTo(peerBefore.x, 0);
    expect(peerAfter.y).toBeCloseTo(peerBefore.y, 0);
    expect((await exported(page)).objects.find((item) => item.id === "Read_Note")!.name).toBe(
      markdown
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await peerContext.close();
  }
});

async function startInlineLink(page: Page) {
  const inline = page.getByLabel("Edit canvas text", { exact: true });
  await inline.press("ControlOrMeta+a");
  await page
    .locator(".inline-markdown-panel")
    .getByRole("button", { name: "Insert canvas object link", exact: true })
    .click();
  await picker(page).waitFor();
  return inline;
}

it("inserts by clicking an unnamed object, cancels without leaving text, and preserves a peer's edits during search", async () => {
  const context = await browser.newContext(VIEWPORT);
  const peerContext = await browser.newContext(VIEWPORT);
  try {
    const room = createRoomId();
    const page = await open(context, room);
    await importItems(
      page,
      `node Read_Note "Read storage" at 100,160 size 320,160 fill #fff0ad
node Target "" at 680,330 size 180,90 fill #d9e9ff`
    );
    const peer = await open(peerContext, room);
    await row(page, "Read storage").dblclick();
    const inline = await startInlineLink(page);
    await page.screenshot({ path: "test-results/markdown-object-link-picker.png" });
    await canvas(page).locator('path[fill="#d9e9ff"], rect[fill="#d9e9ff"]').first().click();
    await expect.poll(() => picker(page).count()).toBe(0);
    expect(await inline.inputValue()).toBe("[Read storage](canvas://Target)");
    await canvas(peer).getByRole("link", { name: "Read storage", exact: true }).waitFor();
    expect(await objectCount(page)).toBe(2);
    await inline.press("ControlOrMeta+z");
    expect(await inline.inputValue()).toBe("Read storage");
    await startInlineLink(page);
    await page.keyboard.press("Escape");
    expect(await inline.inputValue()).toBe("Read storage");
    expect(await picker(page).count()).toBe(0);
    await startInlineLink(page);
    await canvas(page).click({ position: { x: 850, y: 700 }, button: "right" });
    expect(await picker(page).count()).toBe(0);
    expect(await page.getByRole("menu", { name: "Canvas commands", exact: true }).count()).toBe(0);
    await startInlineLink(page);
    await picker(page).getByRole("button", { name: "Search objects", exact: true }).click();
    const search = picker(page).getByRole("combobox", {
      name: "Search canvas objects",
      exact: true,
    });
    await search.fill("Target");
    await row(peer, "Read storage").click();
    await textEditor(peer);
    await sourceField(peer).focus();
    await sourceField(peer).press("Home");
    await sourceField(peer).pressSequentially("Before ");
    await sourceField(peer).press("ControlOrMeta+Enter");
    await expect.poll(() => inline.inputValue()).toBe("Before Read storage");
    await search.press("Enter");
    expect(await inline.inputValue()).toBe("Before [Read storage](canvas://Target)");
    await expect
      .poll(() => sourceField(peer).inputValue())
      .toBe("Before [Read storage](canvas://Target)");
    expect(await picker(page).count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await peerContext.close();
  }
});

it("inserts a named link at an empty caret from the text editor and follows its preview on touch", async () => {
  const context = await browser.newContext({
    viewport: { width: 900, height: 900 },
    hasTouch: true,
  });
  try {
    const page = await open(context, createRoomId());
    await importItems(
      page,
      `node Read_Note "Plan " at 100,160 size 320,160 fill #fff0ad
node Target "Database" at 680,330 size 180,90 tags storage fill #d9e9ff`
    );
    await row(page, /^Plan$/).tap();
    await page.getByRole("button", { name: "Object properties", exact: true }).tap();
    const inspector = await textEditor(page);
    await sourceField(page).focus();
    await sourceField(page).press("End");
    await inspector.getByRole("button", { name: "Insert canvas object link", exact: true }).tap();
    await picker(page)
      .getByRole("combobox", { name: "Search canvas objects", exact: true })
      .fill("#storage");
    await picker(page)
      .getByRole("combobox", { name: "Search canvas objects", exact: true })
      .press("Enter");
    expect(await sourceField(page).inputValue()).toBe("Plan [Database](canvas://Target)");
    await inspector.getByRole("button", { name: "Preview", exact: true }).tap();
    await inspector
      .getByLabel("Markdown preview", { exact: true })
      .getByRole("link", { name: "Database", exact: true })
      .tap();
    await expect.poll(() => page.locator(".inspector-name").textContent()).toBe("Database");
    await centered(page, "#d9e9ff");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("navigates to a drawing's painted geometry instead of its unused box coordinates", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context, createRoomId());
    await importItems(
      page,
      `node Read_Note "[Review route](canvas://Route)" at 100,100 size 380,180 fill #fff0ad
drawing Route "Route target" points 1600,1000 2000,1000 line #c04030 line-width 4`
    );
    await findSource(page);
    await canvas(page).getByRole("link", { name: "Review route", exact: true }).click();
    await expect
      .poll(async () => {
        const area = (await canvas(page).boundingBox())!;
        const route = await canvas(page).locator('path[stroke="#c04030"]').first().boundingBox();
        if (!route) return Infinity;
        return (
          Math.abs(route.x + route.width / 2 - area.x - area.width / 2) +
          Math.abs(route.y + route.height / 2 - area.y - area.height / 2)
        );
      })
      .toBeLessThan(20);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
