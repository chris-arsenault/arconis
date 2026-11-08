import { expect, it } from "vitest";
import { browser, open, exported, selectDrawing, errors } from "./browserHarness";
import { createRoomId } from "../collaboration/room";

it("rotates gradient paint with editable path geometry and restores both in one Undo", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  await page.getByLabel("Import file").setInputFiles({
    name: "gradient.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
    drawing painted markup points 150,150 350,150 350,250 150,250 150,150 closed fill #ff0000 gradient #0000ff gradient-angle 20`),
  });
  await selectDrawing(page);
  const before = (await exported(page)).objects[0];
  const frame = (await page.getByTestId("selection-frame").boundingBox())!;
  const handle = (await page.getByTestId("frame-rotate").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width + 40, frame.y + frame.height / 2, { steps: 12 });
  await page.mouse.up();
  const after = (await exported(page)).objects[0];
  expect(after.look.gradientAngle).toBeCloseTo(110, 0);
  expect(after.points).not.toEqual(before.points);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const restored = (await exported(page)).objects[0];
  expect(restored.points).toEqual(before.points);
  expect(restored.look.gradientAngle).toBe(20);
  expect(errors).toEqual([]);
});
