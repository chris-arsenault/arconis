import { expect, it } from "vitest";
import { browser, open, exported, objectCount, drag, errors } from "./browserHarness";
import { createRoomId } from "../collaboration/room";

it("keeps curved ink, brushes, arrowheads and new Drawing surfaces usable at maximum zoom", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + 400, canvas.y + 300);
  await page.mouse.wheel(0, -6000);
  await expect.poll(() => page.getByTestId("zoom-level").textContent()).toBe("100000%");
  await page.keyboard.press("p");
  await page.mouse.move(canvas.x + 430, canvas.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    await page.mouse.move(
      canvas.x + 400 + 30 * Math.cos(angle),
      canvas.y + 300 + 30 * Math.sin(angle)
    );
  }
  await page.mouse.up();
  await expect.poll(() => objectCount(page)).toBe(1);
  const ink = (await exported(page)).objects[0];
  expect(ink.points.length).toBeGreaterThan(12);
  expect(ink.look.scale).toBeLessThan(0.01);
  const widths = await page
    .getByTestId("canvas")
    .locator('path[stroke="#6554c0"]')
    .evaluateAll((paths) => paths.map((path) => Number(path.getAttribute("stroke-width"))));
  expect(widths.every((width) => width < 10)).toBe(true);
  await page.getByRole("button", { name: "New Drawing", exact: true }).click();
  const sketch = (await exported(page)).objects.find((item) => item.type === "sketch")!;
  expect(sketch.width).toBeLessThan(1);
  await page.getByLabel("Drawing geometry", { exact: true }).selectOption("arrow");
  await drag(page, 500, 400, 100, 40);
  const sizes = await page
    .getByTestId("canvas")
    .locator('path[stroke="#6554c0"]')
    .evaluateAll((paths) => paths.map((path) => path.getBoundingClientRect().width));
  expect(sizes.every((width) => width < 500)).toBe(true);
  expect(errors).toEqual([]);
});
