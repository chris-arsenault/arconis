import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  baseUrl,
  browser,
  dockPanel,
  errors,
  fileMenu,
  open,
  openSettings,
  railPanel,
  row,
  serveFixtures,
  textEditor,
  workspaceTools,
} from "./browserHarness";

type Visit = (surface: string, show: () => Promise<unknown>) => Promise<void>;

/**
 * Finds compact controls that a container stretched across a whole line: checkboxes and radios
 * wider than their glyph or stacked away from their own label text, and icon-only buttons far
 * wider than tall. Segmented controls hide their radios with opacity, so those are skipped.
 * Runs in the page, so every helper lives inside it.
 */
function stretchedControls() {
  const shown = (node: Element) => {
    const box = node.getBoundingClientRect();
    const visible = node.checkVisibility({
      visibilityProperty: true,
      opacityProperty: true,
      contentVisibilityAuto: true,
    });
    return box.width > 0 && box.height > 0 && visible;
  };
  const name = (node: Element) =>
    [
      node.tagName.toLowerCase(),
      node.getAttribute("aria-label"),
      node.closest("label")?.textContent?.trim().slice(0, 40),
      node.parentElement?.className,
    ]
      .filter(Boolean)
      .join(" | ");
  const firstLine = (label: Element) => {
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.textContent?.trim()) text = walker.nextNode();
    if (!text) return undefined;
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getClientRects()[0];
  };
  const choice = (input: HTMLInputElement) => {
    const box = input.getBoundingClientRect();
    const found = box.width > 28 ? [`wide ${input.type}: ${name(input)}`] : [];
    const label = input.closest("label");
    const line = label ? firstLine(label) : undefined;
    if (line && (line.top >= box.bottom || line.bottom <= box.top))
      found.push(`stacked ${input.type}: ${name(input)}`);
    return found;
  };
  const iconButton = (button: HTMLElement) => {
    const box = button.getBoundingClientRect();
    const wide = !button.innerText.trim() && box.width > Math.max(44, box.height * 1.6);
    return wide ? [`wide icon button ${Math.round(box.width)}px: ${name(button)}`] : [];
  };
  const choices = [
    ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'),
  ];
  const buttons = [...document.querySelectorAll<HTMLElement>("button, [role='button']")];
  return [...choices.filter(shown).flatMap(choice), ...buttons.filter(shown).flatMap(iconButton)];
}

/** Opens every collapsed section in the property panel so its controls are measured. */
async function expandInspector(page: Page) {
  const panel = page.locator(".inspector");
  if (!(await panel.isVisible()))
    await page.getByRole("button", { name: "Object properties", exact: true }).click();
  for (const toggle of await panel.locator('[aria-expanded="false"]').all())
    if (await toggle.isVisible()) await toggle.click();
}

/** On a phone the property sheet covers the canvas; close it before pointing at objects. */
async function pick(page: Page, label: string, options: Parameters<Page["click"]>[1] = {}) {
  const close = page.getByRole("button", { name: "Close properties", exact: true });
  if ((page.viewportSize()?.width ?? 1440) <= 650 && (await close.isVisible())) await close.click();
  await row(page, label).click(options);
}

/** Selects an object by its canvas label, then shows its properties. */
async function inspect(page: Page, label: string) {
  await pick(page, label);
  await expandInspector(page);
}

/** Gives the canvas the tags, properties, links, comments and relations that add remove buttons. */
async function annotateObjects(page: Page) {
  await add(page, "Rectangle (R)", "Payments", 120, 220);
  await add(page, "Sticky note (N)", "Idea", 120, 420);
  await inspect(page, "Payments");
  await page.getByLabel("Add a tag", { exact: true }).fill("api");
  await page.getByLabel("Add a tag", { exact: true }).press("Enter");
  await page.getByLabel("New property name", { exact: true }).fill("owner");
  await page.getByLabel("New property value", { exact: true }).fill("Team");
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  await page.getByLabel("Link", { exact: true }).fill("https://example.com");
  await page.getByLabel("Link", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Mark as jump point", exact: true }).click();
  await page.getByRole("button", { name: "Add a comment", exact: true }).click();
  await page.getByLabel("Add a comment", { exact: true }).fill("Check the contract.");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
}

async function objectSurfaces(page: Page, visit: Visit) {
  await visit("comments", () => page.getByTestId("comment-modal").waitFor());
  await pick(page, "Idea");
  await pick(page, "Payments", { modifiers: ["Shift"] });
  await expandInspector(page);
  await page.getByRole("button", { name: "Relate these two", exact: true }).click();
  await visit("two selected", () => expandInspector(page));
  await visit("rectangle properties", () => inspect(page, "Payments"));
  await visit("text editor", async () => {
    await inspect(page, "Payments");
    await textEditor(page);
  });
  await visit("note properties", () => inspect(page, "Idea"));
  await add(page, "Clock", "Clock", 120, 620);
  await visit("clock properties", () => expandInspector(page));
  await visit("context menu", () => pick(page, "Idea", { button: "right" }));
  await add(page, "Slide", "Intro", 240, 560);
  await visit("slide properties", () => expandInspector(page));
}

async function workspaceSurfaces(page: Page, visit: Visit) {
  const menuItem = (name: string) => async () => {
    await fileMenu(page);
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const tool = (name: string) => async () => {
    await workspaceTools(page);
    await page.getByRole("button", { name, exact: true }).click();
  };
  await visit("layers", async () => {
    await dockPanel(page, "Layers");
    await page.getByRole("button", { name: "New layer", exact: true }).click();
  });
  await visit("navigate", () => dockPanel(page, "Navigate"));
  await visit("slides", () => dockPanel(page, "Slides"));
  await visit("file menu", () => fileMenu(page));
  await visit("export document", menuItem("Export document"));
  await visit("export png", menuItem("Export PNG"));
  await visit("tools menu", () => workspaceTools(page));
  await visit("settings", () => openSettings(page));
  await visit("feedback", tool("Feedback"));
  await visit("help", tool("Help"));
  await visit("share", () => page.getByRole("button", { name: "Share room", exact: true }).click());
  await visit("find", () =>
    page.getByRole("button", { name: "Find and filter", exact: true }).click()
  );
  await visit("my canvases", async () => {
    await page.goto(baseUrl());
    await page.getByText("Room options", { exact: true }).click();
  });
}

/** Walks the app's panels, dialogs and menus at one size and returns every stretched control. */
async function auditAt(width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    await serveFixtures(context);
    const page = await open(context, createRoomId());
    page.setDefaultTimeout(8000);
    const findings: string[] = [];
    const visit: Visit = async (surface, show) => {
      await show();
      await page.waitForTimeout(100);
      for (const finding of await page.evaluate(stretchedControls))
        findings.push(`${width}px ${surface}: ${finding}`);
      for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
      const sheet = page.getByRole("button", { name: "Close properties", exact: true });
      if (width <= 650 && (await sheet.isVisible())) await sheet.click();
    };
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await visit("shapes rail", () => railPanel(page, "Shapes"));
    await visit("draw rail", () => railPanel(page, "Draw"));
    await railPanel(page, "Shapes");
    await annotateObjects(page);
    await objectSurfaces(page, visit);
    await workspaceSurfaces(page, visit);
    return findings;
  } finally {
    await context.close();
  }
}

it("keeps checkboxes beside their labels and icon buttons compact on every surface", async () => {
  const findings = [...(await auditAt(1440, 1000)), ...(await auditAt(390, 844))];
  expect(findings).toEqual([]);
  expect(errors).toEqual([]);
}, 240_000);
