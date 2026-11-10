import { expect, it } from "vitest";
import type { Page } from "playwright";
import {
  add,
  browser,
  dockPanel,
  drawInto,
  errors,
  open,
  railPanel,
  selectDrawing,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const CONTROLS =
  "button, a[href], input:not([type=hidden]), select, textarea, summary, " +
  "[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option]";

/**
 * Visible controls whose help zone would show no sentence. Mirrors `helpDetail`: a form field
 * and its label may carry the sentence for each other.
 */
async function unexplained(page: Page, surface: string) {
  const missing = await page.evaluate((selector) => {
    const detail = (element: Element | null | undefined) =>
      element?.getAttribute("data-hint-detail") ?? "";
    return [...document.querySelectorAll(selector)]
      .filter((element) => {
        if (!(element instanceof HTMLElement) || !element.checkVisibility()) return false;
        const ignored = ".help-zone, .visually-hidden, [aria-label='Shared canvas']";
        if (element.closest(ignored)) return false;
        const field =
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement;
        const partner = field ? element.labels?.[0] : null;
        const owner = element.closest("label");
        return !detail(element) && !detail(partner) && !detail(owner);
      })
      .map(
        (element) =>
          element.getAttribute("data-hint") ||
          element.getAttribute("aria-label") ||
          element.textContent?.trim().slice(0, 40) ||
          element.outerHTML.slice(0, 80)
      );
  }, CONTROLS);
  return missing.map((name) => `${surface}: ${name}`);
}

/** Reports each unexplained control once, under the first surface where it appeared. */
class UniqueList {
  private readonly seen = new Map<string, string>();
  push(...entries: string[]) {
    for (const entry of entries) {
      const name = entry.slice(entry.indexOf(": ") + 2);
      if (!this.seen.has(name)) this.seen.set(name, entry);
    }
  }
  entries() {
    return [...this.seen.values()];
  }
}

it("gives every visible control on the main surfaces a help sentence", async () => {
  const context = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context);
    const missing = new UniqueList();
    missing.push(...(await unexplained(page, "workspace")));
    for (const panel of ["Draw", "Shapes"] as const) {
      await railPanel(page, panel);
      missing.push(...(await unexplained(page, `rail ${panel}`)));
    }
    for (const panel of ["Layers", "Slides", "Navigate"] as const) {
      await dockPanel(page, panel);
      missing.push(...(await unexplained(page, `dock ${panel}`)));
    }
    // Markup's bar, then an annotation selected so the property panel shows its ink controls.
    await drawInto(page, "markup");
    missing.push(...(await unexplained(page, "Markup bar")));
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    await page.mouse.move(canvas.x + 200, canvas.y + 500);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 360, canvas.y + 540, { steps: 8 });
    await page.mouse.up();
    await selectDrawing(page, [], "markup");
    await page.getByRole("button", { name: "Move to content layer", exact: true }).waitFor();
    missing.push(...(await unexplained(page, "selected annotation")));
    await page.keyboard.press("Escape");
    await add(page, "Sticky note (N)", "Explain me", 420, 300);
    missing.push(...(await unexplained(page, "selected note")));

    await page.getByRole("button", { name: "File", exact: true }).click();
    missing.push(...(await unexplained(page, "File menu")));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    missing.push(...(await unexplained(page, "Settings")));
    await page.getByRole("button", { name: "Close settings", exact: true }).click();

    await page.getByRole("button", { name: "Participants", exact: true }).click();
    missing.push(...(await unexplained(page, "Participants")));
    await page.getByRole("button", { name: "Participants", exact: true }).click();

    await page.getByText("Find and filter", { exact: true }).click();
    missing.push(...(await unexplained(page, "Find")));
    await page.keyboard.press("Escape");

    await page.mouse.click(420, 300, { button: "right" });
    await page.getByRole("menu").first().waitFor();
    missing.push(...(await unexplained(page, "context menu")));
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor();
    missing.push(...(await unexplained(page, "palette")));
    await page.keyboard.press("Escape");

    expect(missing.entries()).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
