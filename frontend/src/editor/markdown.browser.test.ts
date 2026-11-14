import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, objectCount } from "./browserHarness";
import { textEditor, closeTextEditor } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const textDialog = (page: Page) => page.getByRole("dialog", { name: "Edit text", exact: true });
const source = (page: Page) => page.getByLabel("Object text", { exact: true });

it("renders Markdown, highlighted code and math, and copies their original source", async () => {
  const context = await browser.newContext({
    ...VIEWPORT,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await open(context, createRoomId());
  const markdown =
    "# Plan\n\n1. **Build**\n   - *Review*\n\n```python\ndef hello():\n    return 42\n```\n\nEnergy $E=mc^2$\n\nH<sub>2</sub>O <u>ready</u>";
  await add(page, "Sticky note (N)", markdown, 220, 170);
  await page.getByLabel("Object width", { exact: true }).fill("440");
  await page.getByLabel("Object height", { exact: true }).fill("600");
  await expect.poll(() => canvas(page).locator("h1").textContent()).toBe("Plan");
  expect(await canvas(page).locator("ol li ul li").textContent()).toContain("Review");
  expect(await canvas(page).locator("pre .hljs-keyword").first().textContent()).toBe("def");
  expect(await canvas(page).locator(".katex").count()).toBe(1);
  expect(await canvas(page).locator("sub").first().textContent()).toBe("2");
  await textEditor(page);
  await textDialog(page).getByRole("button", { name: "Preview", exact: true }).click();
  await textDialog(page).getByRole("button", { name: "Copy Markdown", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);
  await textDialog(page).getByRole("button", { name: "Copy code 1 (python)", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "def hello():\n    return 42\n"
  );
  await textDialog(page).getByRole("button", { name: "Copy plain text", exact: true }).click();
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  expect(plain).toContain("Plan");
  expect(plain).toContain("E=mc^2");
  expect(plain).not.toContain("**Build**");
  expect((await exported(page)).objects[0].name).toBe(markdown);
  expect(errors).toEqual([]);
  await context.close();
});

it("positions a label at all nine places, changes fonts and undoes whole-box style changes", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Sticky note (N)", "Alignment", 220, 170);
  await page.getByLabel("Object width", { exact: true }).fill("360");
  await page.getByLabel("Object height", { exact: true }).fill("260");
  await textEditor(page);
  const positions: Record<string, { x: number; y: number }> = {};
  for (const vertical of ["top", "middle", "bottom"]) {
    for (const horizontal of ["left", "center", "right"]) {
      const position = page.getByLabel("Text position", { exact: true });
      await position.selectOption(`${vertical}-${horizontal}`);
      expect(await position.inputValue()).toBe(`${vertical}-${horizontal}`);
      const bounds = (await row(page, "Alignment").boundingBox())!;
      positions[`${vertical}-${horizontal}`] = bounds;
    }
  }
  expect(positions["top-left"].x).toBeLessThan(positions["top-center"].x);
  expect(positions["top-center"].x).toBeLessThan(positions["top-right"].x);
  expect(positions["top-left"].y).toBeLessThan(positions["middle-left"].y);
  expect(positions["middle-left"].y).toBeLessThan(positions["bottom-left"].y);
  await page.getByLabel("Text font", { exact: true }).selectOption("serif");
  await page.getByLabel("Font size", { exact: true }).fill("24");
  const font = await row(page, "Alignment").evaluate(
    (element) => getComputedStyle(element).fontFamily
  );
  expect(font).toContain("Source Serif 4");
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await textDialog(page).getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    await page.getByRole("button", { name: "Underline", exact: true }).getAttribute("aria-pressed")
  ).toBe("false");
  expect(errors).toEqual([]);
  await context.close();
});

it("edits Markdown with keys and toolbar while list Tab takes precedence over topic creation", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Sticky note (N)", "hello", 220, 170);
  await textEditor(page);
  await source(page).focus();
  await source(page).press("ControlOrMeta+a");
  await source(page).press("ControlOrMeta+b");
  expect(await source(page).inputValue()).toBe("**hello**");
  await source(page).press("ControlOrMeta+z");
  expect(await source(page).inputValue()).toBe("hello");
  await source(page).press("ControlOrMeta+a");
  await textDialog(page).getByRole("button", { name: "Markdown underline", exact: true }).click();
  expect(await source(page).inputValue()).toBe("<u>hello</u>");
  await source(page).fill("1. First");
  await source(page).press("End");
  await source(page).press("Enter");
  await source(page).pressSequentially("Second");
  await source(page).press("Tab");
  expect(await source(page).inputValue()).toBe("1. First\n    2. Second");
  await source(page).pressSequentially(" item");
  expect(await source(page).inputValue()).toBe("1. First\n    2. Second item");
  expect(await objectCount(page)).toBe(1);
  await source(page).press("Shift+Tab");
  expect(await source(page).inputValue()).toBe("1. First\n2. Second item");
  await closeTextEditor(page);
  await canvas(page).click({ position: { x: 800, y: 700 } });
  await row(page, "First").dblclick();
  const inline = page.getByLabel("Edit canvas text", { exact: true });
  await inline.press("ControlOrMeta+a");
  await page
    .locator(".inline-markdown-panel")
    .getByRole("button", { name: "Markdown bold", exact: true })
    .click();
  expect(await inline.count()).toBe(1);
  expect(await inline.inputValue()).toContain("**");
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps Markdown tools usable with touch input in a narrower viewport", async () => {
  const context = await browser.newContext({
    viewport: { width: 900, height: 900 },
    hasTouch: true,
  });
  const page = await open(context, createRoomId());
  await add(page, "Sticky note (N)", "Touch", 180, 200);
  await textEditor(page);
  await source(page).focus();
  await source(page).press("ControlOrMeta+a");
  await textDialog(page).getByRole("button", { name: "Markdown bold", exact: true }).tap();
  expect(await source(page).inputValue()).toBe("**Touch**");
  await textDialog(page).getByRole("button", { name: "Preview", exact: true }).tap();
  expect(await textDialog(page).getByLabel("Markdown preview", { exact: true }).isVisible()).toBe(
    true
  );
  expect(errors).toEqual([]);
  await context.close();
});
