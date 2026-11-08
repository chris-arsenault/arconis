import { expect, it } from "vitest";
import { browser, open, exported, errors } from "./browserHarness";
import { createRoomId } from "../collaboration/room";

it("projects clipped, gradient Drawing contents into slide templates without creating canonical copies", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  await page.getByLabel("Import file").setInputFiles({
    name: "template-drawing.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
    slide template "Template" deck pitch 0 at 0,0 size 500,300 {
      sketch sketch "Diagram" at 40,40 size 300,200 {
        drawing stroke points 50,50 380,50 380,160 50,160 50,50 closed fill #ff0000 gradient #0000ff
      }
    }
    slide page "Page" deck pitch 1 at 600,0 size 500,300`),
  });
  await expect.poll(async () => (await exported(page)).objects.length).toBe(4);
  const canvas = page.getByTestId("canvas");
  await expect.poll(() => canvas.locator("defs.ink-clips clipPath").count()).toBe(2);
  await expect.poll(() => canvas.locator("defs.ink-gradients linearGradient").count()).toBe(2);
  const clips = await canvas
    .locator("g[clip-path]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("clip-path")));
  expect(clips.some((clip) => clip?.includes("underlay:page:sketch"))).toBe(true);
  const before = await exported(page);
  await page.mouse.wheel(0, -100);
  await page.keyboard.press("Escape");
  expect((await exported(page)).text).toBe(before.text);
  expect(errors).toEqual([]);
});
