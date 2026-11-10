import { expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { CanvasDocument } from "../document/canvasDocument";
import { serializeDocument } from "../files/canvasFile";
import { createRoomId } from "../collaboration/room";
import { browser, open, objectCount, exported } from "./browserHarness";

function mixedCanvas() {
  const document = new CanvasDocument();
  document.doc.transact(() => {
    for (let i = 0; i < 100; i++) {
      const x = (i % 10) * 440 + 40;
      const y = Math.floor(i / 10) * 320 + 40;
      const from = document.create("node", x, y, {
        id: `service-${i}`,
        name: `Service ${i + 1}`,
        width: 160,
        height: 80,
      });
      const to = document.create("node", x + 220, y, {
        name: `Worker ${i + 1}`,
        width: 160,
        height: 80,
      });
      document.create("note", x, y + 135, {
        name: `**Design note ${i + 1}**\n\nHandles requests and stores events.`,
        width: 180,
        height: 140,
      });
      document.create("text", x + 220, y + 135, {
        name: `### Queue ${i + 1}\n\n- Receive events\n- Process work\n- Record outcome`,
        width: 180,
        height: 140,
      });
      document.create("line", 0, 0, { from, to, name: `dispatch ${i + 1}` });
    }
  });
  const text = serializeDocument(document);
  document.destroy();
  return text;
}

it("reuses HTML label contents while panning and zooming a 500-item canvas", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "performance.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(mixedCanvas()),
  });
  await expect.poll(() => objectCount(page)).toBe(500);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  // Import fits the document. Return to readable labels before tracking the existing DOM.
  await page.getByTestId("zoom-level").click();
  const zoom = page.getByLabel("Zoom multiplier", { exact: true });
  await zoom.fill("1");
  await zoom.press("Enter");
  await page.getByRole("button", { name: "Fit canvas", exact: true }).focus();
  await page.evaluate(() => {
    const canvas = document.querySelector("[data-testid=canvas]")!;
    const viewport = canvas.getBoundingClientRect();
    const label = [...canvas.querySelectorAll(".canvas-markdown")].find((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.right > viewport.left &&
        bounds.left < viewport.right &&
        bounds.bottom > viewport.top &&
        bounds.top < viewport.bottom
      );
    });
    if (!label) throw new Error("Readable labels did not render");
    label.setAttribute("data-retained-label", "true");
  });
  const canvas = page.getByTestId("canvas");
  const bounds = (await canvas.boundingBox())!;
  await page.evaluate(() => {
    window.addEventListener(
      "wheel",
      () => {
        const began = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            performance.measure("canvas-navigation", { start: began, end: performance.now() })
          )
        );
      },
      { capture: true }
    );
  });
  await page.mouse.move(bounds.x + 400, bounds.y + 650);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(bounds.x + 600, bounds.y + 700, { steps: 12 });
  await page.mouse.up({ button: "middle" });
  await page.mouse.wheel(12.5, 4.5);
  await page.mouse.wheel(0, -60);
  for (const delta of [60, -60, 120, -120, 60, -60]) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(75);
  }
  await expect.poll(() => canvas.locator("[data-retained-label]").count()).toBe(1);
  expect(await objectCount(page)).toBe(500);
  const navigation = await page.evaluate(() =>
    performance.getEntriesByName("canvas-navigation").map((entry) => entry.duration)
  );
  await writeFile(
    "test-results/navigation-performance.json",
    JSON.stringify({ objects: 500, wheelToTwoAnimationFramesMs: navigation })
  );
  await context.close();
});

it("edits a 500-item canvas through real input and converges with an independent browser", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const page = await open(first, room);
  await page.getByLabel("Import file").setInputFiles({
    name: "performance.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(mixedCanvas()),
  });
  await expect.poll(() => objectCount(page)).toBe(500);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  const peer = await open(second, room);
  await expect.poll(() => objectCount(peer)).toBe(500);
  await page.getByTestId("zoom-level").click();
  const zoom = page.getByLabel("Zoom multiplier", { exact: true });
  await zoom.fill("1");
  await zoom.press("Enter");
  // Fit kept the world center; navigate to the first object through the standard Find UI.
  await page.keyboard.press("Control+f");
  const find = page.getByRole("textbox", { name: "Find on canvas", exact: true });
  await find.fill("service-0");
  await find.press("Enter");
  await find.press("Escape");
  const field = page.getByLabel("Object text", { exact: true });
  await field.click();
  await field.press("End");
  const started = performance.now();
  await page.keyboard.type(" edited");
  await field.press("Tab");
  await page.getByLabel("Object width", { exact: true }).fill("200");
  await page
    .getByRole("toolbar", { name: "Selection toolbar", exact: true })
    .getByRole("button", { name: "Fill #d9e9ff", exact: true })
    .click();
  const own = await exported(page);
  await expect.poll(async () => (await exported(peer)).text).toBe(own.text);
  expect(own.objects.find((item) => item.id === "service-0")).toMatchObject({
    name: "Service 1 edited",
    width: 200,
    look: { fill: "#d9e9ff" },
  });
  await writeFile(
    "test-results/interaction-performance.json",
    JSON.stringify({ objects: 500, editingAndConvergenceMs: performance.now() - started })
  );
  // An export must paint the full scene even when most objects are outside this view.
  const canvas = page.getByTestId("canvas");
  await canvas.press("Escape");
  await canvas.press("ControlOrMeta+k");
  const search = page.getByLabel("Search commands", { exact: true });
  await search.fill("Export canvas as SVG");
  const pending = page.waitForEvent("download");
  await search.press("Enter");
  const svg = await readFile(await (await pending).path(), "utf8");
  const painted = await page.evaluate((source) => {
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    return [...parsed.querySelectorAll(".canvas-markdown")].map((label) => label.textContent);
  }, svg);
  expect(painted).toEqual(expect.arrayContaining(["Service 100", "Worker 100"]));
  await first.close();
  await second.close();
});
