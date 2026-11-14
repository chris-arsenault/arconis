import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, drag, errors, exported, open, row } from "./browserHarness";
import { openSettings } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
async function zoom(page: Page, scale: number) {
  await page.getByTestId("zoom-level").click();
  await page.getByLabel("Zoom multiplier", { exact: true }).fill(String(scale));
  await page.getByLabel("Zoom multiplier", { exact: true }).press("Enter");
}

it("shares calibration, converts geometry and preserves physical measurements through zoom and files", async () => {
  const a = await browser.newContext(VIEWPORT),
    b = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(a, room);
  await page.locator(".name-prompt").getByRole("button", { name: "Done", exact: true }).click();
  await add(page, "Rectangle (R)", "Measured room", 300, 250);
  const before = (await exported(page)).objects;
  const peer = await open(b, room);
  await openSettings(page);
  await page.getByLabel("Scale preset", { exact: true }).selectOption("House");
  await expect.poll(() => page.getByTestId("scale-distance").textContent()).toBe("1 m");
  await expect.poll(() => peer.getByTestId("scale-distance").textContent()).toBe("1 m");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  expect((await exported(page)).objects).toEqual(before);
  await row(page, "Measured room").click();
  await expect
    .poll(() => page.getByLabel("Object width", { exact: true }).inputValue())
    .toBe("1.6");
  await page.getByLabel("Object width", { exact: true }).fill("240 cm");
  await page.getByLabel("Object width", { exact: true }).press("Enter");
  await expect
    .poll(() => page.getByLabel("Object width", { exact: true }).inputValue())
    .toBe("2.4");
  await row(peer, "Measured room").click();
  await expect
    .poll(() => peer.getByLabel("Object width", { exact: true }).inputValue())
    .toBe("2.4");
  await openSettings(page);
  await page.getByLabel("Display unit", { exact: true }).selectOption("mm");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  expect(await page.getByLabel("Object width", { exact: true }).inputValue()).toBe("2400");
  expect(await peer.getByLabel("Object width", { exact: true }).inputValue()).toBe("2.4");
  await page.getByRole("button", { name: "Measure distance", exact: true }).click();
  await drag(page, 600, 520, 100, 0);
  await expect
    .poll(() => page.getByLabel("Measured distance", { exact: true }).textContent())
    .toBe("1 m");
  await zoom(page, 2);
  expect(await page.getByLabel("Measured distance", { exact: true }).textContent()).toBe("1 m");
  // The length sits at the middle of the measured line, not in a panel of its own.
  const line = (await page.locator(".distance-overlay line").boundingBox())!;
  const length = (await page.getByLabel("Measured distance", { exact: true }).boundingBox())!;
  expect(Math.abs(length.x + length.width / 2 - (line.x + line.width / 2))).toBeLessThan(2);
  expect(Math.abs(length.y + length.height / 2 - (line.y + line.height / 2))).toBeLessThan(2);
  // Clicking the length and typing the real one calibrates the canvas from this line.
  await page.getByLabel("Measured distance", { exact: true }).click();
  const real = page.getByLabel("Real length of the measured line", { exact: true });
  await real.fill("nonsense");
  await real.press("Enter");
  expect(await real.getAttribute("aria-invalid")).toBe("true");
  await real.fill("3");
  await real.press("Enter");
  await expect
    .poll(() => page.getByLabel("Measured distance", { exact: true }).textContent())
    .toBe("3 m");
  await page.screenshot({ path: "test-results/measure-line.png" });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  expect(await page.locator(".distance-overlay").count()).toBe(0);
  const saved = await exported(page);
  expect(saved.text).toContain('scale 100 represents 3 "m"');
  expect(saved.objects.find((item) => item.name === "Measured room")!.width).toBe(240);
  await page.screenshot({ path: "test-results/calibrated-scale.png" });
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});

it("uses a fixed electronics pitch, keeps keyboard measurements stable and undoes calibration", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await openSettings(page);
  await page.getByLabel("Scale preset", { exact: true }).selectOption("Electronics");
  await page.getByLabel("Fixed grid distance", { exact: true }).fill("2.54");
  await page.getByRole("button", { name: "Set fixed grid", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("grid-spacing").textContent())
    .toBe("Grid spacing: 2.54 mm");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.getByRole("button", { name: "Measure distance", exact: true }).click();
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const measured = await page.getByLabel("Measured distance", { exact: true }).textContent();
  expect(measured).not.toBe("0 mm");
  await zoom(page, 0.5);
  expect(await page.getByLabel("Measured distance", { exact: true }).textContent()).toBe(measured);
  // Escape clears the measurement, then puts the tool away.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Measure distance", exact: true })
        .getAttribute("aria-pressed")
    )
    .toBe("false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await exported(page)).text).not.toContain("scale ");
  await context.close();
});

it("keeps exact typed, button and shortcut zoom around the same center", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await zoom(page, 2 ** -20);
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => page.getByTestId("zoom-level").textContent()).toBe("0.000001907×");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ControlOrMeta+-");
  await expect.poll(() => page.getByTestId("zoom-level").textContent()).toBe("9.537e-7×");
  await zoom(page, 2 ** 20);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await page.getByTestId("zoom-level").textContent()).toBe("1049000×");
  await page.keyboard.press("Shift+0");
  await expect.poll(() => page.getByTestId("zoom-level").textContent()).toBe("1×");
  await context.close();
});

it("resizes tiny geometry far from the origin at maximum zoom and round-trips it", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.locator(".name-prompt").getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Import file").setInputFiles({
    name: "distant.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(
      'arconis 1\nnode far "Distant detail" at 1000000000,1000000000 size 0.00016,0.00009 scale 0.000001\n'
    ),
  });
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByRole("textbox", { name: "Find on canvas", exact: true }).fill("far");
  await page.getByRole("textbox", { name: "Find on canvas", exact: true }).press("Enter");
  await page.getByRole("textbox", { name: "Find on canvas", exact: true }).press("Escape");
  await zoom(page, 2 ** 20);
  await row(page, "Distant detail").click();
  const before = (await exported(page)).objects[0];
  await page.getByRole("button", { name: "Grid and snapping", exact: true }).click();
  const handles = await page
    .getByTestId("canvas")
    .locator('rect[fill="#f4f2fd"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })
    );
  const right = Math.max(...handles.map((box) => box.x));
  const side = handles.filter((box) => Math.abs(box.x - right) < 1).sort((a, b) => a.y - b.y)[1];
  expect(side).toBeDefined();
  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await page.mouse.down();
  await page.mouse.move(side.x + side.width / 2 + 40, side.y + side.height / 2, { steps: 8 });
  await page.mouse.up();
  const saved = await exported(page);
  const changePixels = (saved.objects[0].width - before.width) * 2 ** 20;
  expect(changePixels).toBeGreaterThan(38);
  expect(changePixels).toBeLessThan(42);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await exported(page)).objects[0].width).toBe(before.width);
  await writeFile(
    "test-results/zoom-precision.json",
    JSON.stringify({
      worldOrigin: 1e9,
      zoom: 2 ** 20,
      pointerResizePixels: 40,
      measuredResizePixels: changePixels,
    })
  );
  await context.close();
});
