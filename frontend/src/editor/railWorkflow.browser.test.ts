import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, selectDrawing } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const panel = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workspace panels" })
    .getByRole("button", { name, exact: true });

async function drawStroke(page: Page) {
  await panel(page, "Markup (M)").click();
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
  await panel(page, "Explore").click();
  await page.getByLabel("View name", { exact: true }).fill("Overview");
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  await panel(page, "Slides").click();
  await page.getByText("No slides yet.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Add slide", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 90, y: 90 } });
  await page.getByRole("button", { name: "Present deck", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/rail-slides.png" });
  await panel(page, "Explore").click();
  await page.getByRole("button", { name: "Overview", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/rail-explore.png" });
  expect(errors).toEqual([]);
  await context.close();
});

it("saves and recalls a visible brush preset without a hidden modifier gesture", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await panel(page, "Draw (P)").click();
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
  await panel(page, "Draw (P)").click();
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
  await selectDrawing(a);
  await a.getByLabel("Stroke color", { exact: true }).fill("#1971c2");
  await expect
    .poll(
      async () => (await exported(b)).objects.find((item) => item.type === "drawing")?.look.line
    )
    .toBe("#1971c2");
  const paths = (page: Page) => page.getByTestId("canvas").locator('path[stroke="#1971c2"]');
  await a.getByRole("checkbox", { name: "Show annotations", exact: true }).uncheck();
  await expect.poll(() => paths(a).count()).toBe(0);
  expect(await paths(b).count()).toBeGreaterThan(0);
  expect((await exported(a)).objects.length).toBe(2);
  await a.getByRole("checkbox", { name: "Show annotations", exact: true }).check();
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
      for (const task of ["Add", "Draw (P)", "Explore", "Slides"]) {
        await panel(page, task).click();
        const fits = await page.locator(".left-rail").evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return (
            node.scrollWidth <= node.clientWidth &&
            [...node.querySelectorAll("button, input, select")]
              .filter((entry) => entry.getClientRects().length)
              .every((entry) => entry.getBoundingClientRect().right <= bounds.right + 1)
          );
        });
        expect(fits).toBe(true);
        await page.screenshot({
          path: `test-results/rail-${task.split(" ")[0].toLowerCase()}-${width}-${colorScheme}.png`,
        });
      }
      await page.screenshot({ path: `test-results/rail-${width}-${colorScheme}.png` });
    }
    await page.getByRole("button", { name: "Hide panel", exact: true }).click();
    expect((await page.getByTestId("canvas").boundingBox())!.width).toBeGreaterThan(width - 70);
  }
  expect(errors).toEqual([]);
  await context.close();
});
