import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
/** The room's slides in presenting order; the export lists them back to front. */
const slides = async (page: Page) =>
  (await exported(page)).objects
    .filter((item) => item.type === "slide")
    .sort((a, b) => (a.slide ?? 0) - (b.slide ?? 0));

it("places slides behind the canvas in a numbered deck, keeps their shape and takes long notes", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Pain", 400, 300);
  await add(page, "Slide", "Problem", 200, 200);
  await add(page, "Slide", "Solution", 260, 260);
  const [first, second] = await slides(page);
  expect(first).toMatchObject({ deck: "deck", slide: 1, width: 1280, height: 720 });
  expect(second).toMatchObject({ deck: "deck", slide: 2, width: 1280, height: 720 });
  // Slides sit behind everything, so the rectangle they were drawn over stays in front.
  const pain = (await exported(page)).objects.find((item) => item.name === "Pain")!;
  expect(second.order).toBeLessThan(first.order);
  expect(first.order).toBeLessThan(pain.order);
  expect(pain.inside).toBe("");
  // The label names the deck and number before the slide's name.
  await expect.poll(() => row(page, "deck · 2 Solution").count()).toBe(1);

  // Renaming the deck and renumbering from the property panel.
  await page.getByLabel("Deck", { exact: true }).fill("pitch");
  await page.getByLabel("Slide number", { exact: true }).fill("5");
  await expect.poll(() => row(page, "pitch · 5 Solution").count()).toBe(1);
  // The deck's size follows a size choice, and the width field keeps the ratio.
  await page.getByLabel("Slide size", { exact: true }).selectOption("Standard 4:3");
  await expect.poll(async () => (await slides(page))[1].height).toBe(768);
  await page.getByLabel("Object width", { exact: true }).fill("512");
  await expect.poll(async () => (await slides(page))[1].height).toBe(384);
  expect((await slides(page))[1]).toMatchObject({ deck: "pitch", slide: 5, width: 512 });

  // The rail lists each deck and flies to a slide.
  const decks = page.getByTestId("deck");
  await expect.poll(() => decks.count()).toBe(2);
  await decks.filter({ hasText: "pitch" }).getByRole("button", { name: "5 · Solution" }).click();
  await expect.poll(() => page.getByTestId("zoom-level").textContent()).not.toBe("100%");
  expect(await page.getByTestId("selection-count").textContent()).toBe("Slide");

  // Speaker notes: a comment of several lines, broken with Shift Enter.
  const box = page.getByLabel("Add a comment", { exact: true });
  await box.pressSequentially("Open with the pain.");
  await box.press("Shift+Enter");
  await box.pressSequentially("Then pause.");
  await box.press("Enter");
  const note = page.getByTestId("comment-thread").locator("p");
  await expect.poll(() => note.textContent()).toBe("Open with the pain.\nThen pause.");
  await expect.poll(() => row(page, /💬1/).count()).toBe(1);

  // Clicking empty canvas inside a slide selects the slide, as with a frame.
  await canvas(page).click({ position: { x: 300, y: 500 } });
  expect(errors).toEqual([]);
  await context.close();
});

it("presents a deck with the chrome gone, moving by key and button, with notes and live edits", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(VIEWPORT), room);
  const b = await open(await browser.newContext(VIEWPORT), room);
  await add(a, "Slide", "Problem", 100, 100);
  await add(a, "Slide", "Solution", 300, 300);
  await a.getByLabel("Add a comment", { exact: true }).fill("Land the ask.");
  await a.keyboard.press("Enter");
  await expect.poll(() => b.getByTestId("deck").count()).toBe(1);

  await a.getByRole("button", { name: "Present deck", exact: true }).click();
  await a.getByTestId("presenter").waitFor();
  expect(await a.getByRole("banner").count()).toBe(0);
  expect(await a.getByLabel("Tools and stencils").count()).toBe(0);
  expect(await a.getByLabel("Object properties").count()).toBe(0);
  expect(await a.getByTestId("connection-status").count()).toBe(0);
  await expect.poll(() => a.getByTestId("slide-position").textContent()).toBe("1 / 2");
  // The slide fills the window's width or height, keeping its proportions.
  const stage = (await canvas(a).boundingBox())!;
  const mask = () => a.getByTestId("presenter-mask").boundingBox();
  await expect
    .poll(async () => {
      const box = (await mask())!;
      return Math.abs(box.width - stage.width) < 4 || Math.abs(box.height - stage.height) < 4;
    })
    .toBe(true);
  const box = (await mask())!;
  expect(box.width / box.height).toBeCloseTo(1280 / 720, 2);

  // Arrows and the bar move within the deck; editor shortcuts are off.
  await a.keyboard.press("ArrowRight");
  await expect.poll(() => a.getByTestId("slide-position").textContent()).toBe("2 / 2");
  await a.keyboard.press("ArrowRight");
  expect(await a.getByTestId("slide-position").textContent()).toBe("2 / 2");
  await a.getByRole("button", { name: "Speaker notes", exact: true }).click();
  await a.getByTestId("presenter-notes").getByText("Land the ask.").waitFor();
  await a.getByRole("button", { name: "Previous slide", exact: true }).click();
  await expect.poll(() => a.getByTestId("slide-position").textContent()).toBe("1 / 2");
  await a.getByTestId("presenter-notes").getByText("No comments on this slide.").waitFor();
  await a.keyboard.press("n");

  // A peer's edit on the shown slide appears during the presentation.
  await add(b, "Rectangle (R)", "Live", 400, 300);
  await expect.poll(() => row(a, "Live").count()).toBe(1);

  await a.keyboard.press("Escape");
  await expect.poll(() => a.getByTestId("presenter").count()).toBe(0);
  expect(await a.getByRole("banner").count()).toBe(1);
  await a.getByTestId("zoom-level").waitFor();
  expect(
    await a.getByRole("button", { name: "Sticky note (N)" }).getAttribute("aria-pressed")
  ).toBe("false");
  expect(errors).toEqual([]);
  await a.context().close();
  await b.context().close();
});
