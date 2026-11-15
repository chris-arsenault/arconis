import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, more, objectCount, open } from "./browserHarness";

/** Use the overlapping painted shapes, not their label boxes, to test the visible stack. */
async function clickOverlap(page: Page) {
  await page.keyboard.press("Escape");
  const shapes = page.getByTestId("canvas");
  const a = (await shapes.locator('svg [fill="#abcdef"]').first().boundingBox())!;
  const b = (await shapes.locator('svg [fill="#fedcba"]').first().boundingBox())!;
  const x = (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;
  const y = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
  await page.mouse.click(x, y);
}

it("keeps spatial file order independent of visible stacking through collaboration, reorder and reimport", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const room = createRoomId();
    const a = await open(first, room);
    const b = await open(second, room);
    await a.getByLabel("Import file").setInputFiles({
      name: "stacked.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(`arconis 1
node high "Upper" at 100,100 size 300,240 fill #abcdef z 10
node low "Lower" at 180,200 size 300,240 fill #fedcba z -5
`),
    });
    await expect.poll(() => objectCount(b)).toBe(2);
    for (const page of [a, b]) {
      await clickOverlap(page);
      await expect
        .poll(() => page.getByLabel("Object x", { exact: true }).inputValue())
        .toBe("100");
    }
    await more(a, "Send to back");
    const order = () =>
      b
        .getByTestId("canvas")
        .locator('svg [fill="#abcdef"], svg [fill="#fedcba"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("fill")));
    await expect.poll(order).toEqual(["#abcdef", "#fedcba"]);
    await clickOverlap(b);
    await expect.poll(() => b.getByLabel("Object x", { exact: true }).inputValue()).toBe("180");
    const behind = await exported(b);
    const reopened = await open(second, createRoomId());
    await reopened.getByLabel("Import file").setInputFiles({
      name: "reopened.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(behind.text),
    });
    await expect.poll(() => objectCount(reopened)).toBe(2);
    await clickOverlap(reopened);
    await expect
      .poll(() => reopened.getByLabel("Object x", { exact: true }).inputValue())
      .toBe("180");
    // Upper's top-left corner is exposed even while Lower covers its label.
    const upper = (await a
      .getByTestId("canvas")
      .locator('svg [fill="#abcdef"]')
      .first()
      .boundingBox())!;
    await a.mouse.click(upper.x + 20, upper.y + 20);
    await more(a, "Bring to front");
    await expect.poll(order).toEqual(["#fedcba", "#abcdef"]);
    await clickOverlap(b);
    await expect.poll(() => b.getByLabel("Object x", { exact: true }).inputValue()).toBe("100");
    const front = await exported(b);
    expect(front.objects.find((item) => item.id === "low")?.order).toBe(-5);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
