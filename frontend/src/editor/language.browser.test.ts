import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, objectCount, open, row } from "./browserHarness";

const ARRANGED = `arconis 1
frame f "Steps" row gap 20 at 0,0 size 600,138 {
  node a "First" at 24,24 size 160,90
  node b "Second" at 204,24 size 160,90
  node c "Third" at 384,24 size 160,90
}
a -> c as hop around
`;

it("keeps a frame's row arranged as people drag its items", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "steps.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(ARRANGED),
  });
  await expect.poll(() => objectCount(page)).toBe(5);
  const first = (await row(page, "First").boundingBox())!;
  const third = (await row(page, "Third").boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width + 40, third.y + third.height / 2, { steps: 12 });
  await page.mouse.up();
  const order = async () => {
    const { objects } = await exported(page);
    return objects
      .filter((item) => item.inside === "f" && item.type !== "line")
      .sort((left, right) => left.x - right.x)
      .map((item) => [item.name, item.x, item.y]);
  };
  // Below the frame's header, in the order they now sit.
  await expect.poll(order).toEqual([
    ["Second", 24, 40],
    ["Third", 204, 40],
    ["First", 384, 40],
  ]);
  expect(errors).toEqual([]);
  await context.close();
});
