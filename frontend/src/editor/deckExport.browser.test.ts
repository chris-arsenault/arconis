import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, dockPanel, errors, fileMenu, open } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

/** A template with a footer, two slides with one box each, and a box on no slide. */
const DECK = `arconis 1
slide master "Master" deck talk 0 at 0,-1000
slide one "Problem" deck talk 1 at 0,0
slide two "Answer" deck talk 2 at 2000,0
node footer "Footer text" at 100,-400 size 300,60 fill #00ff00
node first "First point" at 200,200 size 300,120 fill #ff0000
node second "Second point" at 2200,200 size 300,120 fill #0000ff
node stray "Off the slides" at 5000,5000 size 200,100 fill #ffff00`;

const importText = (page: Page, text: string) =>
  page.getByLabel("Import file").setInputFiles({
    name: "deck.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });

async function importDeck(page: Page) {
  await importText(page, DECK);
  await page.getByTestId("canvas").locator('[fill="#ff0000"]').first().waitFor();
  await page.getByTestId("canvas").press("Escape");
}

it("exports a deck as one HTML file that shows its slides in order", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await importDeck(page);
  await dockPanel(page, "Slides");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export talk as HTML", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/ - talk\.html$/);
  const html = await readFile(await download.path(), "utf8");

  // The file opens on its own, with nothing to load, and shows the first slide.
  const viewer = await context.newPage();
  const requests: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  await viewer.setContent(html);
  const slides = viewer.locator("section.slide");
  expect(await slides.count()).toBe(2);
  await expect.poll(() => viewer.locator("#count").textContent()).toBe("1 / 2");
  const shown = viewer.locator("section.slide.shown");
  await expect.poll(() => shown.getAttribute("aria-label")).toBe("Slide 1: Problem");
  expect(await shown.locator('[fill="#ff0000"]').count()).toBeGreaterThan(0);
  expect(await shown.getByText("First point").isVisible()).toBe(true);
  // Each slide carries the template's content and only what lies on it; outlines are gone.
  expect(await shown.locator('[fill="#00ff00"]').count()).toBeGreaterThan(0);
  expect(await shown.locator('[fill="#0000ff"]').count()).toBe(0);
  // The slide that is not shown draws nothing over the one that is.
  expect(await viewer.locator('[fill="#0000ff"]').first().isVisible()).toBe(false);
  expect(await viewer.locator('[fill="#ffff00"]').count()).toBe(0);
  expect(await viewer.getByText("Problem").count()).toBe(0);
  // The slide fills the window's width, keeping its shape.
  const box = (await shown.locator("svg").first().boundingBox())!;
  expect(box.width).toBeGreaterThan(1300);

  // Keys and buttons move through the deck and stop at its ends.
  await viewer.keyboard.press("ArrowRight");
  await expect.poll(() => shown.getAttribute("aria-label")).toBe("Slide 2: Answer");
  expect(await shown.getByText("Second point").isVisible()).toBe(true);
  expect(await viewer.getByText("First point").isVisible()).toBe(false);
  expect(await viewer.getByRole("button", { name: "Next slide" }).isDisabled()).toBe(true);
  await viewer.getByRole("button", { name: "Previous slide" }).click();
  await expect.poll(() => viewer.locator("#count").textContent()).toBe("1 / 2");
  expect(requests.filter((url) => !url.startsWith("data:") && url !== "about:blank")).toEqual([]);

  // The canvas is as it was: slide outlines are back and nothing is being presented.
  expect(await page.getByTestId("presenter").count()).toBe(0);
  await expect.poll(() => page.getByTestId("canvas").getByText("Problem").count()).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps the File menu's deck export listed, and asks which deck when there are several", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  // With no slides the export is listed, greyed out, and choosing it does nothing.
  await fileMenu(page);
  const item = page.getByRole("menuitem", { name: "Export deck as HTML", exact: true });
  expect(await item.getAttribute("aria-disabled")).toBe("true");
  await item.click({ force: true });
  expect(await page.getByRole("dialog").count()).toBe(0);
  expect(await item.isVisible()).toBe(true);
  await page.keyboard.press("Escape");

  // With one deck it exports that deck at once.
  await importDeck(page);
  const only = page.waitForEvent("download");
  await fileMenu(page);
  expect(await item.getAttribute("aria-disabled")).toBe("false");
  await item.click();
  const html = await readFile(await (await only).path(), "utf8");
  expect(html).toContain('aria-label="Slide 2: Answer"');

  // With a second deck it asks which, in deck order.
  await importText(page, 'arconis 1\nslide extra "Extra" deck other 1 at 0,3000');
  await dockPanel(page, "Slides");
  await expect.poll(() => page.getByTestId("deck").count()).toBe(2);
  await fileMenu(page);
  await item.click();
  const dialog = page.getByRole("dialog", { name: "Export which deck?" });
  await dialog.waitFor();
  expect(await dialog.locator(".deck-choices button").allTextContents()).toEqual([
    "other1 slide",
    "talk2 slides",
  ]);
  // Escape leaves without exporting; choosing a deck downloads that deck.
  await page.keyboard.press("Escape");
  await expect.poll(() => dialog.count()).toBe(0);
  await fileMenu(page);
  await item.click();
  const chosen = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^other/ }).click();
  expect((await chosen).suggestedFilename()).toMatch(/ - other\.html$/);
  await expect.poll(() => dialog.count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});
