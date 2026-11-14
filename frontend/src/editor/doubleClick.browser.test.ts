import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

const shape = (page: Page, fill: string) =>
  page.getByTestId("canvas").locator(`[fill="${fill}"]`).first();

async function centre(page: Page, fill: string) {
  const box = (await shape(page, fill).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const CASES: [string, string][] = [
  [
    "a frame that holds it",
    'frame f "Panel" at 0,0 size 600,400 {\n  note n "Sticky" at 100,100 fill #ff0000\n}',
  ],
  [
    "a frame it is not in",
    'frame f "Panel" at 0,0 size 600,400\nnote n "Sticky" at 100,100 fill #ff0000 in none',
  ],
  ["a rectangle", 'node f "Panel" at 0,0 size 600,400\nnote n "Sticky" at 100,100 fill #ff0000'],
  [
    "a shape that holds it",
    'node f "Panel" at 0,0 size 600,400 {\n  note n "Sticky" at 100,100 fill #ff0000\n}',
  ],
  [
    "a group that holds it",
    'group f "Panel" at 0,0 {\n  note n "Sticky" at 100,100 fill #ff0000\n  note m "Other" at 400,100\n}',
  ],
  ["a slide", 'slide f "Panel" at 0,0\nnote n "Sticky" at 100,100 fill #ff0000'],
];

for (const [under, text] of CASES)
  it(`edits a sticky note's text on a double-click when it lies over ${under}`, async () => {
    const context = await browser.newContext(VIEWPORT);
    const page = await open(context, createRoomId());
    await page.getByLabel("Import file").setInputFiles({
      name: "over.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(`arconis 1\n${text}`),
    });
    await shape(page, "#ff0000").waitFor();
    await page.getByTestId("canvas").press("Escape");
    const at = await centre(page, "#ff0000");
    await page.mouse.dblclick(at.x, at.y);
    await page.locator(".inline-editor").waitFor({ timeout: 5000 });
    // The note is the one being typed into, and it is still the selection afterwards.
    await page.keyboard.type("!");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.locator(".inspector-name").textContent()).toContain("!");
    expect(errors).toEqual([]);
    await context.close();
  });
