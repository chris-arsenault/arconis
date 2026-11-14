import { expect, it } from "vitest";
import type { Locator } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, drawInto, errors, exported, open, railPanel, row } from "./browserHarness";
import { textEditor, closeTextEditor } from "./browserHarness";

async function clearAndType(field: Locator, replacement: string) {
  await field.click();
  await field.press("ControlOrMeta+A");
  await field.press("Backspace");
  expect(await field.inputValue()).toBe("");
  await field.pressSequentially(replacement);
  await field.press("Tab");
  expect(await field.inputValue()).toBe(replacement);
}

it("preserves numeric drafts and undoes a completed typography edit across peers", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const room = createRoomId();
    const a = await open(first, room);
    await add(a, "Rectangle (R)", "Typography", 250, 180);
    const b = await open(second, room);
    await row(b, "Typography").click();
    await textEditor(a);
    await textEditor(b);
    const font = a.getByLabel("Font size", { exact: true });
    await font.fill("18");
    await font.press("Tab");
    await clearAndType(font, "24");
    await expect.poll(() => b.getByLabel("Font size", { exact: true }).inputValue()).toBe("24");
    expect((await exported(b)).objects[0].look.textSize).toBe(24);
    await textEditor(b);
    await (await textEditor(a)).getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => font.inputValue()).toBe("18");
    await expect.poll(() => b.getByLabel("Font size", { exact: true }).inputValue()).toBe("18");
    await clearAndType(font, "12.5");
    expect(await font.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    await a.getByText("Spacing and sizing", { exact: true }).click();
    for (const [label, replacement] of [
      ["Line height", "1.5"],
      ["Paragraph spacing", "0.25"],
      ["Text padding", "0.25"],
    ]) {
      const field = a.getByLabel(label, { exact: true });
      await clearAndType(field, replacement);
      expect(await field.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    }
    expect((await exported(a)).objects[0].look).toMatchObject({
      textSize: 12.5,
      lineHeight: 1.5,
      paragraphGap: 0.25,
      padding: 0.25,
    });
    await add(a, "Sticky note (N)", "Other typography", 600, 200);
    await textEditor(a);
    await font.fill("20");
    await font.press("Tab");
    await closeTextEditor(a);
    await a.getByTestId("canvas").click({ position: { x: 40, y: 40 } });
    await a.keyboard.press("ControlOrMeta+A");
    await textEditor(a);
    expect(await font.inputValue()).toBe("");
    await clearAndType(font, "24");
    expect((await exported(a)).objects.map((item) => item.look.textSize)).toEqual([24, 24]);
    await a.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await exported(a)).objects.map((item) => item.look.textSize)).toEqual([12.5, 20]);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});

it("validates dimensions while retaining signed coordinates, expressions and zero line width", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context, createRoomId());
    await add(page, "Rectangle (R)", "Geometry", 250, 180);
    const width = page.getByLabel("Object width", { exact: true });
    const before = Number(await width.inputValue());
    await width.fill("-10");
    await width.press("Tab");
    expect(await width.getAttribute("aria-invalid")).toBe("true");
    expect(await width.inputValue()).toBe("-10");
    expect((await exported(page)).objects[0].width).toBe(before);
    await width.fill("240");
    await width.press("Enter");
    expect((await exported(page)).objects[0].width).toBe(240);
    const x = page.getByLabel("Object x", { exact: true });
    await clearAndType(x, "-12.5");
    await x.fill("100+20");
    await x.press("Enter");
    expect(await x.inputValue()).toBe("120");
    await width.fill("nonsense");
    await width.press("Enter");
    expect(await width.getAttribute("aria-invalid")).toBe("true");
    expect(await width.inputValue()).toBe("nonsense");
    await width.press("Escape");
    expect(await width.inputValue()).toBe("240");
    await page.getByRole("tab", { name: "Design", exact: true }).click();
    const line = page.getByLabel("Line width", { exact: true });
    await clearAndType(line, "0");
    await page.getByTestId("canvas").click({ position: { x: 40, y: 40 } });
    await row(page, "Geometry").click();
    await page.getByRole("tab", { name: "Design", exact: true }).click();
    expect(await line.inputValue()).toBe("0");
    await line.press("ArrowUp");
    await line.press("Tab");
    expect(await line.inputValue()).toBe("1");
    expect((await exported(page)).objects[0].look.lineWidth).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("allows empty deck and slide-number drafts without inserting fallback prefixes", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context, createRoomId());
    await add(page, "Slide", "Planning slide", 250, 180);
    await clearAndType(page.getByLabel("Deck", { exact: true }), "Roadmap");
    await clearAndType(page.getByLabel("Slide number", { exact: true }), "12");
    expect((await exported(page)).objects[0]).toMatchObject({ deck: "Roadmap", slide: 12 });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("keeps brush and gradient-angle drafts editable with valid native constraints", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context, createRoomId());
    await drawInto(page, "content");
    await page.getByRole("button", { name: "Vector", exact: true }).click();
    const brush = page.getByLabel("Stroke width", { exact: true });
    expect(await brush.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    await clearAndType(brush, "0.5");
    await page.getByText("Fill gradient", { exact: true }).click();
    await clearAndType(page.getByLabel("Gradient angle", { exact: true }), "-45");
    await railPanel(page, "Shapes");
    await drawInto(page, "content");
    expect(await brush.inputValue()).toBe("0.5");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("uses the same decimal increments for native mouse spinners and keyboard arrows", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context, createRoomId());
    await add(page, "Rectangle (R)", "Spacing steps", 250, 180);
    await textEditor(page);
    await page.getByText("Spacing and sizing", { exact: true }).click();
    for (const [label, start, result] of [
      ["Line height", "1.35", "1.4"],
      ["Line height", "1.234", "1.284"],
      ["Paragraph spacing", "0.25", "0.35"],
      ["Text padding", "0.25", "1.25"],
    ]) {
      const field = page.getByLabel(label, { exact: true });
      await field.fill(start);
      await field.press("Tab");
      expect(await field.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
      await field.hover();
      const bounds = (await field.boundingBox())!;
      await page.mouse.click(bounds.x + bounds.width - 7, bounds.y + bounds.height / 4);
      expect(await field.inputValue()).toBe(result);
      await field.press("Tab");
      await field.fill(start);
      await field.press("Tab");
      await field.press("ArrowUp");
      await field.press("Tab");
      expect(await field.inputValue()).toBe(result);
      expect(await field.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("preserves a real link named mixed and can clear different links in one selection", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context, createRoomId());
    const source = [
      "arconis 1",
      'node a "Alpha" link "https://a.example" at 100,100 size 160,90',
      'node b "Beta" link "https://b.example" at 450,100 size 160,90',
      'node mixed "Target" at 450,400 size 160,90',
      'node origin "Internal source" link mixed at 100,400 size 160,90',
    ].join("\n");
    await page.getByLabel("Import file").setInputFiles({
      name: "mixed-links.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(source),
    });
    await row(page, /^Internal source$/).click();
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    expect(await page.getByLabel("Link", { exact: true }).inputValue()).toBe("mixed");
    await page.getByRole("button", { name: "Go to linked item", exact: true }).click();
    await page.getByRole("tab", { name: "Design", exact: true }).click();
    expect(await page.locator(".inspector-name").textContent()).toBe("Target");
    await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
    await row(page, /^Alpha$/).click();
    await row(page, /^Beta$/).click({ modifiers: ["Shift"] });
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    expect(await page.getByLabel("Link", { exact: true }).getAttribute("placeholder")).toBe(
      "Mixed links"
    );
    await page.getByRole("button", { name: "Clear links", exact: true }).click();
    const cleared = (await exported(page)).objects;
    expect(cleared.filter((item) => ["a", "b"].includes(item.id)).map((item) => item.link)).toEqual(
      ["", ""]
    );
    expect(cleared.find((item) => item.id === "origin")?.link).toBe("mixed");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    const restored = (await exported(page)).objects;
    expect(restored.find((item) => item.id === "a")?.link).toBe("https://a.example");
    expect(restored.find((item) => item.id === "b")?.link).toBe("https://b.example");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

it("explains invalid property names and lets people correct and save them", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context, createRoomId());
    await add(page, "Rectangle (R)", "Property validation", 250, 180);
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    const name = page.getByLabel("New property name", { exact: true });
    const addProperty = page.getByRole("button", { name: "Add property", exact: true });
    await name.fill("service owner");
    await page.getByLabel("New property value", { exact: true }).fill("Alice");
    expect(await addProperty.isDisabled()).toBe(true);
    expect(await name.getAttribute("aria-invalid")).toBe("true");
    const feedback = page.getByText(
      "Start with a letter or underscore; use letters, digits, underscores or hyphens.",
      { exact: true }
    );
    // The error describes the field, beside the help zone's sentence about it.
    expect((await name.getAttribute("aria-describedby"))?.split(" ")).toContain(
      await feedback.getAttribute("id")
    );
    await name.fill("service-owner");
    expect(await name.getAttribute("aria-invalid")).toBe(null);
    expect(await addProperty.isEnabled()).toBe(true);
    await addProperty.click();
    expect((await exported(page)).objects[0].properties).toEqual({ "service-owner": "Alice" });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
