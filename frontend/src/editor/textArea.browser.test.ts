import { expect, it } from "vitest";
import type { Page } from "playwright";
import { browser, errors, objectCount, open } from "./browserHarness";

const DOCUMENT = `arconis 1
note compact "Transport: TLS + WSS\\nSession: peer to peer" at 80,100 size 260,64 fill #fff0ad
node box "Rectangle: TLS + WSS\\nSession: peer to peer" at 400,100 size 260,64 fill #e0eaff align left valign top
text plain "Free text: TLS + WSS\\nSession: peer to peer" at 80,240 size 300,80 fill #e8f0e8 align left valign top
note explicit "Explicit spacing" at 400,240 size 260,80 padding 20 fill #ffeedd
note short "Short note" at 80,380 size 260,40 fill #e7dafa
card card "Card without an icon" at 400,380 size 260,64 fill #e0f0f0
frame frame "Frame title" at 80,520 size 260,100 fill #e8e8f4 align left
band band "Section heading" at 400,520 size 260,40 fill #f4e8e8 align left
`;
const FIXTURES = [
  { text: "Transport:", fill: "#fff0ad", padding: 8 },
  { text: "Rectangle:", fill: "#e0eaff", padding: 8 },
  { text: "Free text:", fill: "#e8f0e8", padding: 4 },
  { text: "Explicit spacing", fill: "#ffeedd", padding: 20 },
  { text: "Short note", fill: "#e7dafa", padding: 8 },
  { text: "Card without an icon", fill: "#e0f0f0", padding: 8 },
  { text: "Frame title", fill: "#e8e8f4", padding: 4 },
  { text: "Section heading", fill: "#f4e8e8", padding: 8 },
];

function measureLabels(page: Page) {
  return page
    .getByTestId("canvas")
    .locator(".canvas-markdown")
    .evaluateAll((labels) =>
      labels.map((label) => {
        const block = label.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        const glyphs = range.getBoundingClientRect();
        const clips = [];
        let parent = label.parentElement;
        while (parent && parent.tagName !== "foreignObject") {
          if (["hidden", "clip"].includes(getComputedStyle(parent).overflowY)) {
            const box = parent.getBoundingClientRect();
            clips.push({ top: box.top, bottom: box.bottom });
          }
          parent = parent.parentElement;
        }
        return {
          text: label.textContent,
          block: { x: block.x, y: block.y, width: block.width, height: block.height },
          glyphs: { y: glyphs.y, bottom: glyphs.bottom, height: glyphs.height },
          clips,
        };
      })
    );
}

it("uses compact object interiors without clipping a short label", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    await page.getByLabel("Import file").setInputFiles({
      name: "text-area.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(DOCUMENT),
    });
    await expect.poll(() => objectCount(page)).toBe(8);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await page.getByTestId("zoom-level").click();
    await page.getByLabel("Zoom percent", { exact: true }).fill("100");
    await page.getByLabel("Zoom percent", { exact: true }).press("Enter");
    const measured = await measureLabels(page);
    expect(measured).toHaveLength(8);
    expect(
      measured.find((label) => label.text?.startsWith("Transport:"))!.block.height
    ).toBeGreaterThan(35);
    await page.screenshot({ path: "test-results/text-area.png" });
    for (const { text, fill, padding } of FIXTURES) {
      const label = measured.find((label) => label.text?.startsWith(text))!;
      expect(label, text).toBeDefined();
      const shape = await page
        .getByTestId("canvas")
        .locator(`path[fill="${fill}"], rect[fill="${fill}"]`)
        .first()
        .evaluate((node: SVGGraphicsElement) => {
          // Painted geometry excludes the transparent pointer-tolerance stroke around headers.
          const box = node.getBBox();
          const matrix = node.getScreenCTM()!;
          const top = new DOMPoint(box.x, box.y).matrixTransform(matrix);
          const bottom = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(
            matrix
          );
          return { x: top.x, y: top.y, width: bottom.x - top.x, height: bottom.y - top.y };
        });
      expect(label.block.x - shape.x, text).toBeLessThanOrEqual(padding + 1);
      expect(label.block.x - shape.x).toBeGreaterThanOrEqual(padding - 1);
      expect(label.glyphs.bottom).toBeLessThanOrEqual(shape.y + shape.height - padding + 1);
      for (const clip of label.clips)
        expect(label.glyphs.bottom).toBeLessThanOrEqual(clip.bottom + 1);
    }
    await page.getByTestId("zoom-level").click();
    await page.getByLabel("Zoom percent", { exact: true }).fill("25");
    await page.getByLabel("Zoom percent", { exact: true }).press("Enter");
    const title = (await measureLabels(page)).find((label) => label.text === "Frame title")!;
    expect(title).toBeDefined();
    expect(title.glyphs.height).toBeGreaterThan(10);
    for (const clip of title.clips)
      expect(title.glyphs.bottom).toBeLessThanOrEqual(clip.bottom + 1);
    await page.screenshot({ path: "test-results/text-area-zoomed-out.png" });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
