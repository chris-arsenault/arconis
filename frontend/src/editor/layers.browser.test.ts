import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, drawInto, errors, exported, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
/** The layer browser's rows, top first. */
const names = (page: Page) => page.locator('[data-testid="layer"] .layer-name').allTextContents();
const layersTab = (page: Page) => page.getByRole("button", { name: "Layers", exact: true }).click();
const object = async (page: Page, name: string) =>
  (await exported(page)).objects.find((item) => item.name === name);

async function stroke(page: Page, start: [number, number], end: [number, number]) {
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + start[0], canvas.y + start[1]);
  await page.mouse.down();
  await page.mouse.move(canvas.x + end[0], canvas.y + end[1], { steps: 12 });
  await page.mouse.up();
}

it("organises a shared canvas in layers, with hiding local to each person", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(VIEWPORT), room);
  const b = await open(await browser.newContext(VIEWPORT), room);
  await add(a, "Rectangle (R)", "Base box", 300, 300);

  // A new layer, renamed in place, receives the next object.
  await layersTab(a);
  await a.getByRole("button", { name: "New layer", exact: true }).click();
  await a.locator('[data-testid="layer"] .layer-name', { hasText: "Layer 2" }).dblclick();
  await a.getByLabel("New name for Layer 2", { exact: true }).fill("Notes");
  await a.getByLabel("New name for Layer 2", { exact: true }).press("Enter");
  await expect.poll(() => names(a)).toEqual(["Markup", "Notes", "Workspace"]);
  await add(a, "Rectangle (R)", "Note box", 700, 300);
  const notes = (await object(a, "Note box"))!.layer!;
  expect(notes).toBeTruthy();
  expect((await object(a, "Base box"))!.layer).toBeUndefined();

  // The other person sees the layers, and hiding one changes only their view.
  await layersTab(b);
  await expect.poll(() => names(b)).toEqual(["Markup", "Notes", "Workspace"]);
  await b.getByRole("button", { name: "Hide Notes", exact: true }).click();
  await expect.poll(() => row(b, "Note box").count()).toBe(0);
  expect(await row(b, "Base box").count()).toBe(1);
  expect(await row(a, "Note box").count()).toBe(1);

  // Order by dragging a row onto another, and with the toolbar.
  await layersTab(a);
  await a.locator('[data-layer="base"]').dragTo(a.locator(`[data-layer="${notes}"]`));
  await expect.poll(() => names(b)).toEqual(["Markup", "Workspace", "Notes"]);
  await a.locator('[data-testid="layer"] .layer-name', { hasText: "Notes" }).click();
  await a.getByRole("button", { name: "Move Notes up", exact: true }).click();
  await expect.poll(() => names(b)).toEqual(["Markup", "Notes", "Workspace"]);

  // Moving an object into the hidden layer hides it for that person; Properties moves it back.
  await row(a, "Base box").click();
  await a.getByRole("button", { name: "Move selection to Notes", exact: true }).click();
  await expect.poll(() => row(b, "Base box").count()).toBe(0);
  await a.getByLabel("Object layer", { exact: true }).selectOption({ label: "Workspace" });
  await expect.poll(() => row(b, "Base box").count()).toBe(1);

  // Merging keeps the objects and removes the layer, so its objects show again for everyone.
  await layersTab(a);
  await a.getByRole("button", { name: "Merge Notes down", exact: true }).click();
  await expect.poll(() => names(b)).toEqual(["Markup", "Workspace"]);
  await expect.poll(() => row(b, "Note box").count()).toBe(1);
  expect((await object(b, "Note box"))!.layer).toBeUndefined();

  // Deleting a layer removes its objects for everyone; Undo brings them back.
  await a.getByRole("button", { name: "New layer", exact: true }).click();
  await row(a, "Note box").click();
  await layersTab(a);
  await a.getByRole("button", { name: "Move selection to Layer 2", exact: true }).click();
  await a.getByRole("button", { name: "Delete Layer 2", exact: true }).click();
  await expect.poll(() => row(b, "Note box").count()).toBe(0);
  await a.getByTestId("canvas").press("ControlOrMeta+z");
  await expect.poll(() => row(b, "Note box").count()).toBe(1);
  await expect.poll(() => names(a)).toEqual(["Markup", "Layer 2", "Workspace"]);

  // Markup tools draw into markup whatever layer is chosen.
  await a.locator('[data-testid="layer"] .layer-name', { hasText: "Layer 2" }).click();
  await drawInto(a, "markup");
  await stroke(a, [200, 600], [420, 640]);
  await expect
    .poll(async () => (await exported(b)).objects.filter((item) => item.markup).length)
    .toBe(1);
  const ink = (await exported(a)).objects.find((item) => item.markup)!;
  expect(ink.layer).toBeUndefined();
  expect(errors).toEqual([]);
});

it("reaches every layer action in the narrow layout", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 390, height: 844 } }),
    createRoomId()
  );
  await layersTab(page);
  await page.getByRole("button", { name: "New layer", exact: true }).click();
  await expect.poll(() => names(page)).toEqual(["Markup", "Layer 2", "Workspace"]);
  for (const name of ["Rename Layer 2", "Move Layer 2 down", "Merge Layer 2 down", "Hide Layer 2"])
    expect(await page.getByRole("button", { name, exact: true }).isVisible()).toBe(true);
  await page.getByRole("button", { name: "Delete Layer 2", exact: true }).click();
  await expect.poll(() => names(page)).toEqual(["Markup", "Workspace"]);
  expect(errors).toEqual([]);
});
