import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, exported, objectCount } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const source = (page: Page) => page.getByLabel("Object text", { exact: true });

it("retains Markdown, code, math and box styles across peer edits, local Undo and reload", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const original = "# Shared\n\n```typescript\nconst ready = true;\n```\n\n$x^2$";
  await add(a, "Sticky note (N)", original, 220, 170);
  await a.getByLabel("Object width", { exact: true }).fill("400");
  await a.getByLabel("Object height", { exact: true }).fill("420");
  await a.getByLabel("Text font", { exact: true }).selectOption("serif");
  const b = await open(second, room);
  await canvas(b).locator("h1").waitFor();
  await canvas(b).locator("h1").click();
  await expect.poll(() => source(b).inputValue()).toBe(original);
  expect(await b.getByLabel("Text font", { exact: true }).inputValue()).toBe("serif");
  await source(a).focus();
  await source(a).press("ControlOrMeta+Home");
  await source(a).press("ArrowRight");
  await source(a).press("ArrowRight");
  await source(b).press("ControlOrMeta+End");
  await source(b).pressSequentially("\nPeer");
  await source(b).press("ControlOrMeta+Enter");
  await expect.poll(() => source(a).inputValue()).toContain("Peer");
  expect(await source(a).evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(
    2
  );
  await source(a).pressSequentially("Local ");
  await source(a).press("ControlOrMeta+Enter");
  await expect.poll(() => source(b).inputValue()).toContain("Local Shared");
  await source(a).press("ControlOrMeta+z");
  await expect.poll(() => source(b).inputValue()).toContain("# Shared");
  expect(await source(b).inputValue()).toContain("Peer");
  const expected = await source(b).inputValue();
  await a.reload();
  await a.getByRole("button", { name: "Rectangle (R)", exact: true }).waitFor();
  await canvas(a).locator("h1").click();
  await expect.poll(() => source(a).inputValue()).toBe(expected);
  expect(await canvas(a).locator(".katex").count()).toBe(1);
  expect(await canvas(a).locator(".hljs-keyword").count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("grows free text on request, fits fixed boxes and preserves explicit resize mode", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Text", "Short", 220, 170);
  const options = page.getByText("Spacing and sizing", { exact: true });
  await options.click();
  await page.getByLabel("Grow text height", { exact: true }).check();
  const initial = Number(await page.getByLabel("Object height", { exact: true }).inputValue());
  await source(page).fill(
    "# Heading\n\n" +
      Array.from({ length: 12 }, (_, index) => `${index + 1}. A longer line of text`).join("\n")
  );
  await expect
    .poll(async () => Number(await page.getByLabel("Object height", { exact: true }).inputValue()))
    .toBeGreaterThan(initial);
  await page.getByLabel("Object height", { exact: true }).fill("150");
  expect(await page.getByLabel("Grow text height", { exact: true }).isChecked()).toBe(false);
  await source(page).fill("Short again");
  expect(Number(await page.getByLabel("Object height", { exact: true }).inputValue())).toBe(150);
  await page.getByRole("button", { name: "Fit to text", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel("Object height", { exact: true }).inputValue()))
    .toBeLessThan(150);
  expect(errors).toEqual([]);
  await context.close();
});

it("exports actual highlighted/math pixels with bundled fonts and reimports exact Markdown", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  const markdown =
    "# Export\n\n```python\ndef square(x):\n    return x * x\n```\n\n$$\n\\frac{a}{b}\n$$\n\n**Serif** H<sub>2</sub>O";
  await add(page, "Sticky note (N)", markdown, 220, 170);
  await page.getByLabel("Object width", { exact: true }).fill("440");
  await page.getByLabel("Object height", { exact: true }).fill("500");
  await page.getByLabel("Text font", { exact: true }).selectOption("serif");
  await page.screenshot({ path: "test-results/markdown-canvas.png" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await pending;
  const path = (await download.path())!;
  const bytes = await readFile(path);
  const colors = await imagePixels(page, bytes.toString("base64"));
  expect(colors.ink).toBeGreaterThan(300);
  expect(colors.syntax).toBeGreaterThan(15);
  await download.saveAs("test-results/markdown-export.png");
  const copy = await open(context, createRoomId());
  await copy
    .getByLabel("Import file")
    .setInputFiles({ name: "copy.png", mimeType: "image/png", buffer: bytes });
  await expect.poll(() => objectCount(copy)).toBe(1);
  const imported = (await exported(copy)).objects[0];
  expect(imported.name).toBe(markdown);
  expect(imported.look.font).toBe("serif");
  expect(await canvas(copy).locator(".katex").count()).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

async function imagePixels(page: Page, base64: string) {
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const result = document.createElement("canvas");
    result.width = image.width;
    result.height = image.height;
    const context = result.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, result.width, result.height).data;
    let ink = 0;
    let syntax = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 130) ink++;
      if (
        Math.abs(pixels[i] - 133) < 5 &&
        Math.abs(pixels[i + 1] - 69) < 5 &&
        Math.abs(pixels[i + 2] - 160) < 5
      )
        syntax++;
    }
    return { ink, syntax };
  }, base64);
}
