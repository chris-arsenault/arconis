import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  browser,
  dockPanel,
  drawInto,
  errors,
  exported,
  markupBar,
  open,
  selectDrawing,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const panel = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workspace panels" })
    .getByRole("button", { name, exact: true });

/** Whether a side panel shows every control without scrolling sideways or spilling out. */
function fits(page: Page, side: string) {
  return page.locator(side).evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return (
      node.scrollWidth <= node.clientWidth &&
      [...node.querySelectorAll("button, input, select")]
        .filter((entry) => entry.getClientRects().length)
        .every((entry) => entry.getBoundingClientRect().right <= bounds.right + 1)
    );
  });
}

async function drawStroke(page: Page) {
  await drawInto(page, "markup");
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + 170, canvas.y + 350);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 370, canvas.y + 410, { steps: 10 });
  await page.mouse.up();
}

it("gives libraries a consistent disclosure and keeps document navigation in its own tasks", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  expect(await page.locator(".left-rail details > summary").allTextContents()).toEqual([
    "Basics",
    "Architecture",
    "Screens",
    "Infrastructure",
    "Technology",
    "AWS",
    "Azure",
    "Google Cloud",
  ]);
  expect(await page.getByLabel("View name", { exact: true }).count()).toBe(0);
  expect(await page.getByRole("button", { name: "Add slide", exact: true }).count()).toBe(0);
  const architecture = page.locator("details[aria-label='Architecture']");
  await architecture.locator("summary").click();
  await page.reload();
  expect(await architecture.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
  await architecture.locator("summary").click();
  await page.locator("details[aria-label='AWS'] > summary").click();
  await page.getByRole("button", { name: "Icon: AWS Lambda", exact: true }).waitFor();
  await page.locator("details[aria-label='AWS'] > summary").click();
  await page.getByLabel("Search stencils", { exact: true }).fill("lambda");
  await page.getByRole("button", { name: "Icon: AWS Lambda", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 280, y: 180 } });
  expect((await exported(page)).objects[0].icon).toBe("aws:AWS-Lambda");
  // The document's panels are on the right, and leave the stencils where they were.
  await dockPanel(page, "Navigate");
  await page.getByLabel("View name", { exact: true }).fill("Overview");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  await dockPanel(page, "Slides");
  await page.getByText("No slides yet.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Add slide", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 90, y: 90 } });
  await page.getByRole("button", { name: "Present deck", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/dock-slides.png" });
  await dockPanel(page, "Navigate");
  await page.getByRole("button", { name: "Overview", exact: true }).waitFor();
  expect(await page.getByLabel("Search stencils", { exact: true }).isVisible()).toBe(true);
  await page.screenshot({ path: "test-results/dock-navigate.png" });
  expect(errors).toEqual([]);
  await context.close();
});

it("saves and recalls a visible brush preset without a hidden modifier gesture", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await panel(page, "Draw").click();
  await page.getByRole("button", { name: "Vector", exact: true }).click();
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await page.getByLabel("Stroke color", { exact: true }).fill("#1971c2");
  await page.getByLabel("Stroke width", { exact: true }).fill("10");
  await page.getByLabel("Stroke width", { exact: true }).press("Enter");
  await page.getByText("Saved brushes", { exact: true }).click();
  await page.getByRole("button", { name: "Replace saved brush 1", exact: true }).click();
  await page.getByRole("button", { name: "Use saved brush 3", exact: true }).click();
  expect(
    await page.getByRole("button", { name: "Marker", exact: true }).getAttribute("aria-pressed")
  ).toBe("true");
  await page.getByRole("button", { name: "Use saved brush 1", exact: true }).click();
  expect(await page.getByLabel("Stroke color", { exact: true }).inputValue()).toBe("#1971c2");
  expect(await page.getByLabel("Stroke width", { exact: true }).inputValue()).toBe("10");
  expect(
    await page.getByRole("button", { name: "Arrow", exact: true }).getAttribute("aria-pressed")
  ).toBe("true");
  await page.reload();
  await panel(page, "Draw").click();
  await page.getByText("Saved brushes", { exact: true }).click();
  await page.getByRole("button", { name: "Use saved brush 1", exact: true }).click();
  expect(await page.getByLabel("Stroke width", { exact: true }).inputValue()).toBe("10");
  await page.screenshot({ path: "test-results/rail-brushes.png" });
  expect(errors).toEqual([]);
  await context.close();
});

it("distinguishes local annotation visibility from shared recoloring, deletion and undo", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const b = await open(second, room);
  await add(a, "Sticky note (N)", "Keep this idea", 180, 120);
  await drawStroke(a);
  await expect.poll(async () => (await exported(b)).objects.length).toBe(2);
  // Annotating left the stencils showing and never opened the drawing controls.
  expect(await a.getByLabel("Search stencils", { exact: true }).isVisible()).toBe(true);
  expect(await a.getByText("Saved brushes", { exact: true }).count()).toBe(0);
  expect(await a.getByTestId("markup-count").textContent()).toBe("1");
  await selectDrawing(a);
  // Selected annotations are edited in the property panel, like any selection.
  await a
    .getByLabel("Object properties")
    .getByLabel("Stroke color", { exact: true })
    .fill("#1971c2");
  await expect
    .poll(
      async () => (await exported(b)).objects.find((item) => item.type === "drawing")?.look.line
    )
    .toBe("#1971c2");
  const paths = (page: Page) => page.getByTestId("canvas").locator('path[stroke="#1971c2"]');
  await drawInto(a, "markup");
  const show = markupBar(a).getByRole("button", { name: "Show annotations", exact: true });
  await show.click();
  await expect.poll(() => paths(a).count()).toBe(0);
  expect(await show.getAttribute("aria-pressed")).toBe("false");
  expect(await paths(b).count()).toBeGreaterThan(0);
  expect((await exported(a)).objects.length).toBe(2);
  await show.click();
  await expect.poll(() => paths(a).count()).toBeGreaterThan(0);
  await a.getByRole("button", { name: "Delete all annotations", exact: true }).click();
  await expect
    .poll(async () => (await exported(b)).objects.map((item) => item.name))
    .toEqual(["Keep this idea"]);
  await a.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await exported(b)).objects.length).toBe(2);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("keeps task controls within the panel in light, dark and narrow layouts", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context, createRoomId());
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect(await page.getByRole("button", { name: "Show panel", exact: true }).isVisible()).toBe(
    true
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const task of ["Shapes", "Draw"] as const) {
        await panel(page, task).click();
        expect(await fits(page, ".left-rail")).toBe(true);
        await page.screenshot({
          path: `test-results/rail-${task.toLowerCase()}-${width}-${colorScheme}.png`,
        });
      }
      for (const task of ["Layers", "Slides", "Navigate"] as const) {
        await dockPanel(page, task);
        expect(await fits(page, ".right-dock")).toBe(true);
        await page.screenshot({
          path: `test-results/dock-${task.toLowerCase()}-${width}-${colorScheme}.png`,
        });
      }
      // Fold the document panels away again, and check Markup's bar stays on the canvas.
      await page
        .getByRole("navigation", { name: "Document panels" })
        .getByRole("button", { name: "Navigate", exact: true })
        .click();
      if (width <= 1100)
        await page.getByRole("button", { name: "Close properties", exact: true }).click();
      await drawInto(page, "markup");
      const area = (await page.locator(".canvas-area").boundingBox())!;
      const bar = (await markupBar(page).boundingBox())!;
      expect(bar.x).toBeGreaterThanOrEqual(area.x);
      expect(bar.x + bar.width).toBeLessThanOrEqual(area.x + area.width + 1);
      await page.screenshot({ path: `test-results/markup-bar-${width}-${colorScheme}.png` });
      await markupBar(page).getByRole("button", { name: "Finish markup", exact: true }).click();
    }
    await panel(page, "Shapes").click();
    await page.getByRole("button", { name: "Hide panel", exact: true }).click();
    // With the panels folded the canvas has all but the two slim strips of tabs.
    expect((await page.getByTestId("canvas").boundingBox())!.width).toBeGreaterThan(width - 130);
  }
  expect(errors).toEqual([]);
  await context.close();
});
