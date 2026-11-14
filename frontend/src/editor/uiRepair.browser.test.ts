import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import {
  add,
  browser,
  closeTextEditor,
  dockPanel,
  errors,
  exported,
  objectCount,
  open,
  row,
  textEditor,
} from "./browserHarness";

it("gives properties the full laptop dock, keeps arrangement controls together and shares text from its own editor", async () => {
  const first = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const second = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const room = createRoomId();
    const page = await open(first, room);
    const peer = await open(second, room);
    await add(page, "Rectangle (R)", "Payment service", 180, 180);
    await add(page, "Rectangle (R)", "Database", 460, 360);
    await row(page, "Payment service").click();
    await row(page, "Database").click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await expect.poll(() => objectCount(peer)).toBe(3);
    await page.getByRole("button", { name: "Ungroup", exact: true }).click();
    await expect.poll(() => objectCount(peer)).toBe(2);
    await row(page, "Payment service").click();
    const panel = page.getByRole("complementary", { name: "Object properties", exact: true });
    const box = (await panel.boundingBox())!;
    expect(box.height).toBeGreaterThan(480);
    for (const name of ["Object width", "Object height"])
      expect(await page.getByLabel(name, { exact: true }).isVisible()).toBe(true);
    expect(await panel.getByLabel("Object text", { exact: true }).count()).toBe(0);
    expect(await panel.getByLabel("Font size", { exact: true }).count()).toBe(0);
    await page.screenshot({ path: "test-results/repaired-properties-laptop.png" });
    await dockPanel(page, "Layers");
    expect(await panel.count()).toBe(0);
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    expect((await panel.boundingBox())!.height).toBeGreaterThan(480);
    await row(peer, "Payment service").click();
    await textEditor(page);
    await textEditor(peer);
    const source = page.getByLabel("Object text", { exact: true });
    expect((await source.boundingBox())!.width).toBeGreaterThan(500);
    expect((await source.boundingBox())!.height).toBeGreaterThan(200);
    await source.fill("# Payment service\n\nA longer description with **shared text**.");
    await closeTextEditor(page);
    await expect
      .poll(() => peer.getByLabel("Object text", { exact: true }).inputValue())
      .toContain("shared text");
    await textEditor(page);
    await page.getByLabel("Font size", { exact: true }).fill("22");
    await page.getByLabel("Font size", { exact: true }).press("Tab");
    await expect.poll(() => peer.getByLabel("Font size", { exact: true }).inputValue()).toBe("22");
    await page.screenshot({ path: "test-results/repaired-text-editor-laptop.png" });
    await closeTextEditor(page);
    await closeTextEditor(peer);
    expect(
      (await exported(peer)).objects.find((item) => item.name.includes("shared text"))
    ).toBeDefined();
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});

it("uses the File home command after creating a separate canvas and preserves the original", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const other = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const room = createRoomId();
    const page = await open(context, room);
    const peer = await open(other, room);
    await add(page, "Sticky note (N)", "Original canvas", 220, 220);
    await row(peer, "Original canvas").waitFor();
    const original = page.url();
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "New canvas", exact: true }).click();
    await expect.poll(() => page.url()).not.toBe(original);
    await expect.poll(() => objectCount(page)).toBe(0);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Back to my canvases", exact: true }).click();
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await page.getByRole("button", { name: "Create a room", exact: true }).waitFor();
    expect(await peer.getByTestId("object-count").textContent()).toBe("1");
    await row(peer, "Original canvas").waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await other.close();
  }
});

it("edits and keeps longer text through the phone dialog without horizontal overflow", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await open(context);
    await add(page, "Sticky note (N)", "Phone note", 100, 180);
    await dockPanel(page, "Slides");
    await page.getByRole("button", { name: "Close properties", exact: true }).click();
    await page.getByRole("button", { name: "Object properties", exact: true }).click();
    expect(
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .getAttribute("aria-pressed")
    ).toBe("true");
    const dialog = await textEditor(page);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const source = dialog.getByLabel("Object text", { exact: true });
      await source.fill("# Phone note\n\nA longer note written on a small screen.");
      await source.press("ControlOrMeta+Enter");
      expect((await source.boundingBox())!.width).toBeGreaterThan(240);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await source.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/repaired-text-editor-${width}.png` });
    }
    await closeTextEditor(page);
    expect((await exported(page)).objects[0].name).toContain("written on a small screen");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("keeps File and context-menu controls reachable on phones and opens desktop flyouts beside their parent", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await open(context);
    for (const width of [320, 390, 650, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect((await page.locator(".topbar").boundingBox())!.height).toBeLessThanOrEqual(64);
      await page.getByRole("button", { name: "File", exact: true }).click();
      const file = (await page.getByRole("menu", { name: "File", exact: true }).boundingBox())!;
      expect(file.x).toBeGreaterThanOrEqual(0);
      expect(file.x + file.width).toBeLessThanOrEqual(width);
      expect(await page.getByRole("menuitemcheckbox").count()).toBe(0);
      await page.screenshot({ path: `test-results/repaired-file-${width}.png` });
      await page.keyboard.press("Escape");
      await page.getByTestId("canvas").click({ position: { x: 100, y: 220 }, button: "right" });
      const root = page.getByRole("menu", { name: "Canvas menu", exact: true });
      const rootBox = (await root.boundingBox())!;
      await page.getByRole("menuitem", { name: "View", exact: true }).click();
      const view = page.getByRole("menu", { name: "View", exact: true });
      const box = (await view.boundingBox())!;
      if (width <= 650) {
        expect(await root.count()).toBe(0);
        await view.getByRole("menuitem", { name: "← Back", exact: true }).click();
        await root.waitFor();
        await root.getByRole("menuitem", { name: "View", exact: true }).click();
      } else
        expect(box.x >= rootBox.x + rootBox.width || box.x + box.width <= rootBox.x).toBe(true);
      await page.screenshot({ path: `test-results/repaired-context-${width}.png` });
      await view.getByRole("menuitem", { name: /grid/ }).click();
      expect(await page.getByRole("menu").count()).toBe(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("applies annotation options to a document export rather than to the canvas", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await open(context);
    await add(page, "Rectangle (R)", "Document content", 200, 180);
    await page.getByRole("button", { name: "Markup (M)", exact: true }).click();
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    await page.mouse.move(canvas.x + 100, canvas.y + 300);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 280, canvas.y + 330, { steps: 8 });
    await page.mouse.up();
    expect((await exported(page, false)).objects.some((item) => item.markup)).toBe(false);
    expect((await exported(page)).objects.some((item) => item.markup)).toBe(true);
    expect(await objectCount(page)).toBe(2);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export PNG", exact: true }).click();
    await page.getByRole("checkbox", { name: "Include canvas annotations", exact: true }).waitFor();
    await page.screenshot({ path: "test-results/repaired-export-options.png" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
