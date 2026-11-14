import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, dockPanel, errors, exported, open, row } from "./browserHarness";

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
  await page.getByLabel("Slide number", { exact: true }).press("Tab");
  await expect.poll(() => row(page, "pitch · 5 Solution").count()).toBe(1);
  // The deck's size follows a size choice, and the width field keeps the ratio.
  await page.getByLabel("Slide size", { exact: true }).selectOption("Standard 4:3");
  await expect.poll(async () => (await slides(page))[1].height).toBe(768);
  await page.getByLabel("Object width", { exact: true }).fill("512");
  await expect.poll(async () => (await slides(page))[1].height).toBe(384);
  expect((await slides(page))[1]).toMatchObject({ deck: "pitch", slide: 5, width: 512 });

  // The rail lists each deck and flies to a slide.
  await dockPanel(page, "Slides");
  const decks = page.getByTestId("deck");
  await expect.poll(() => decks.count()).toBe(2);
  await decks.filter({ hasText: "pitch" }).getByRole("button", { name: "5 · Solution" }).click();
  await expect.poll(() => page.getByTestId("zoom-level").textContent()).not.toBe("1×");
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  expect(await page.getByTestId("selection-count").textContent()).toBe("Slide");

  // Speaker notes: a comment of several lines, broken with Shift Enter, in the comments modal.
  await canvas(page).press("Shift+c");
  const box = page.getByLabel("Add speaker notes", { exact: true });
  await box.pressSequentially("Open with the pain.");
  await box.press("Shift+Enter");
  await box.pressSequentially("Then pause.");
  await box.press("Enter");
  const note = page.getByTestId("comment-thread").locator("p");
  await expect.poll(() => note.textContent()).toBe("Open with the pain.\nThen pause.");
  await page.getByRole("button", { name: "1 open comment on Solution", exact: true }).waitFor();
  await canvas(page).press("Escape");

  // Clicking empty canvas inside a slide selects the slide, as with a frame.
  await canvas(page).click({ position: { x: 300, y: 500 } });
  await expect.poll(() => page.getByTestId("selection-count").textContent()).toBe("Slide");
  await canvas(page).press("Escape");

  // A slide is a viewport: what is placed on it stays free, and moving the slide leaves it.
  await add(page, "Rectangle (R)", "Framed", 500, 450);
  const framed = async () => (await exported(page)).objects.find((item) => item.name === "Framed")!;
  const placed = await framed();
  expect(placed.inside).toBe("");
  await dockPanel(page, "Slides");
  await page.getByTestId("deck").getByRole("button", { name: "1 · Problem" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByLabel("Object x", { exact: true }).fill("9000");
  await page.getByLabel("Object x", { exact: true }).press("Tab");
  await expect.poll(async () => (await slides(page)).some((slide) => slide.x === 9000)).toBe(true);
  expect(await framed()).toMatchObject({ x: placed.x, y: placed.y, inside: "" });
  expect(errors).toEqual([]);
  await context.close();
});

it("presents a deck with the chrome gone, moving by key and button, with notes and live edits", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(VIEWPORT), room);
  const b = await open(await browser.newContext(VIEWPORT), room);
  await add(a, "Slide", "Problem", 100, 100);
  await add(a, "Slide", "Solution", 300, 300);
  await canvas(a).press("Shift+c");
  await a.getByLabel("Add speaker notes", { exact: true }).fill("Land the ask.");
  await a.keyboard.press("Enter");
  await expect.poll(() => a.getByTestId("comment-thread").count()).toBe(1);
  await canvas(a).press("Escape");
  await dockPanel(b, "Slides");
  await expect.poll(() => b.getByTestId("deck").count()).toBe(1);

  await dockPanel(a, "Slides");
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
  await a.getByTestId("presenter-notes").getByText("No speaker notes on this slide.").waitFor();
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

it("draws a template under the deck's slides, where nothing can touch it, and presents without it", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Slide", "Body", 100, 100);
  // The deck's second slide moves well clear of the first before the first becomes the template.
  await add(page, "Slide", "Layout", 200, 200);
  await page.getByLabel("Object x", { exact: true }).fill("3000");
  await dockPanel(page, "Slides");
  await page.getByTestId("deck").getByRole("button", { name: "2 · Layout" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByRole("checkbox", { name: "Template under the deck's slides" }).check();
  await expect.poll(() => row(page, "deck · template Layout").count()).toBe(1);
  await dockPanel(page, "Slides");
  await expect.poll(() => page.getByRole("button", { name: "Template · Layout" }).count()).toBe(1);
  // Text placed on the template appears again on the other slide.
  await add(page, "Text (T)", "Acme", 700, 600);
  // Bring both slides into the viewport before checking both painted copies.
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  await expect.poll(() => row(page, "Acme").count()).toBe(2);
  const objects = (await exported(page)).objects;
  expect(objects.filter((item) => item.name === "Acme")).toHaveLength(1);
  // The template is a viewport too: it frames the text rather than holding it.
  expect(objects.find((item) => item.name === "Acme")!.inside).toBe("");

  // On the other slide the copy cannot be picked: clicking it selects the slide beneath.
  await dockPanel(page, "Slides");
  await page.getByTestId("deck").getByRole("button", { name: "1 · Body" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect.poll(() => page.getByTestId("selection-count").textContent()).toBe("Slide");
  await page.keyboard.press("Escape");
  const copies = row(page, "Acme");
  const stage = (await canvas(page).boundingBox())!;
  // The flight to the slide has to land before the copy's place on screen is known: the template's
  // own text sweeps across the window on the way, so wait for a copy that holds still.
  const onScreen = async () => {
    const boxes = await Promise.all([copies.nth(0).boundingBox(), copies.nth(1).boundingBox()]);
    return (
      boxes.find((box) => box && box.x > stage.x && box.x + box.width < stage.x + stage.width) ??
      null
    );
  };
  let last: Awaited<ReturnType<typeof onScreen>> = null;
  await expect
    .poll(async () => {
      const now = await onScreen();
      const still = now !== null && last !== null && now.x === last.x && now.y === last.y;
      last = now;
      return still;
    })
    .toBe(true);
  const copy = last!;
  await page.mouse.click(copy.x + copy.width / 2, copy.y + copy.height / 2);
  await expect.poll(() => page.getByTestId("selection-count").textContent()).toBe("Slide");
  const body = (await exported(page)).objects.find((item) => item.name === "Body")!;
  expect(Number(await page.getByLabel("Object x", { exact: true }).inputValue())).toBe(body.x);
  expect((await exported(page)).objects).toHaveLength(3);

  // Presenting skips the template and shows its text on the slide.
  await dockPanel(page, "Slides");
  await page.getByRole("button", { name: "Present deck", exact: true }).click();
  await page.getByTestId("presenter").waitFor();
  await expect.poll(() => page.getByTestId("slide-position").textContent()).toBe("1 / 1");
  await expect.poll(() => row(page, "Acme").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.getByTestId("presenter").count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});
