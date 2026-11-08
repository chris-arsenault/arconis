import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  browser,
  drag,
  errors,
  exported,
  objectCount,
  open,
  row,
  selectConnector,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const emptySpot = { x: 880, y: 800 };

const objects = async (page: Page) => (await exported(page)).objects;
const named = async (page: Page, label: string) =>
  (await objects(page)).find((item) => item.name === label)!;
const branches = (items: Awaited<ReturnType<typeof objects>>) =>
  items.filter((item) => item.type === "branch");
const action = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** Whether a label is drawn on the canvas right now. */
const drawn = (page: Page, text: string) =>
  canvas(page)
    .getByText(text)
    .count()
    .then((count) => count > 0);

async function zoomOut(page: Page, steps: number) {
  const bounds = (await canvas(page).boundingBox())!;
  await page.mouse.move(bounds.x + 700, bounds.y + 500);
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, 200);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await page.waitForTimeout(100);
}

async function typeTopic(page: Page, text: string) {
  const editor = page.getByLabel("Edit canvas text", { exact: true });
  await editor.waitFor();
  await editor.fill(text);
}

it("culls small objects by zoom, reveals held detail on zooming in, and still fits", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Auth service", 300, 300);
  await row(page, "Auth service").click();
  await action(page, "Zoom in (Z)").click();
  await page.waitForTimeout(600);
  const zoomed = Number.parseFloat((await page.getByTestId("zoom-level").textContent())!);
  expect(zoomed).toBeGreaterThan(300);

  // A sticky placed while zoomed in lands inside the object, at this zoom's size.
  await page.getByRole("button", { name: "Sticky note (N)", exact: true }).click();
  await canvas(page).click({ position: { x: 700, y: 500 } });
  await typeTopic(page, "Token rotation");
  await page.keyboard.press("Escape");
  const detail = await named(page, "Token rotation");
  const host = await named(page, "Auth service");
  expect(detail.inside).toBe(host.id);
  expect(detail.width).toBeLessThan(host.width);
  expect(await drawn(page, "Token rotation")).toBe(true);

  await canvas(page).click({ position: emptySpot });
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  await page.waitForTimeout(200);
  // The whole object fills most of the window, so its detail is still visible here.
  await zoomOut(page, 14);
  await expect.poll(() => drawn(page, "Token rotation")).toBe(false);
  // Nothing was lost, and an object's label says it holds more.
  expect(await objectCount(page)).toBe(2);

  // Zoomed out until everything has vanished, Fit still finds it.
  await zoomOut(page, 40);
  await expect.poll(() => drawn(page, "Auth service")).toBe(false);
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  await expect.poll(() => drawn(page, "Auth service")).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

it("nests by dropping onto any larger object, and moving the parent moves children", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  const peer = await open(await browser.newContext(VIEWPORT), room);
  await add(page, "Rectangle (R)", "Child", 100, 100);
  await canvas(page).click({ position: emptySpot });
  await page.getByRole("button", { name: "Screen: Phone, 390 by 844", exact: true }).click();
  await canvas(page).click({ position: { x: 500, y: 120 } });
  await expect.poll(() => objectCount(page)).toBe(2);
  const phone = await named(page, "Phone");
  expect([phone.width, phone.height]).toEqual([390, 844]);

  await canvas(page).click({ position: emptySpot });
  await drag(page, 180, 145, 460, 60);
  await expect.poll(async () => (await named(page, "Child")).inside).toBe(phone.id);

  const before = await named(page, "Child");
  await drag(page, 690, 135, 100, 40);
  await expect.poll(async () => (await named(page, "Phone")).x).toBe(phone.x + 100);
  const after = await named(page, "Child");
  expect([after.x, after.y]).toEqual([before.x + 100, before.y + 40]);
  await expect.poll(async () => (await named(peer, "Child")).x).toBe(after.x);
  expect(errors).toEqual([]);
});

it("builds a tree from the keyboard alone, which peers see the same way", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  const peer = await open(await browser.newContext(VIEWPORT), room);
  await add(page, "Rectangle (R)", "Root", 100, 300);
  await canvas(page).focus();
  await page.keyboard.press("Tab");
  await typeTopic(page, "First");
  await page.keyboard.press("Alt+Enter");
  await expect
    .poll(() => page.getByLabel("Edit canvas text", { exact: true }).inputValue())
    .toBe("");
  await typeTopic(page, "Second");
  await page.keyboard.press("Tab");
  await typeTopic(page, "Deep");
  await page.keyboard.press("Escape");
  await expect.poll(() => objectCount(page)).toBe(7);

  const items = await objects(page);
  const id = (label: string) => items.find((item) => item.name === label)!.id;
  const edges = branches(items).map((edge) => [edge.from, edge.to]);
  expect(edges).toEqual(
    expect.arrayContaining([
      [id("Root"), id("First")],
      [id("Root"), id("Second")],
      [id("Second"), id("Deep")],
    ])
  );
  await expect.poll(() => objectCount(peer)).toBe(7);
  expect(await drawn(peer, "Deep")).toBe(true);

  // Enter keeps its meaning on a topic: it edits, and adds a line while editing.
  await canvas(page).focus();
  await page.keyboard.press("Enter");
  const editor = page.getByLabel("Edit canvas text", { exact: true });
  await expect.poll(() => editor.inputValue()).toBe("Deep");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect.poll(() => editor.inputValue()).toBe("Deep\n");
  await page.keyboard.press("Escape");
  expect(await objectCount(page)).toBe(7);
  expect(errors).toEqual([]);
});

it("moves a topic with its branches, alone with Alt, and tidies a tree", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await add(page, "Rectangle (R)", "Root", 100, 300);
  await canvas(page).focus();
  await page.keyboard.press("Tab");
  await typeTopic(page, "Child");
  await page.keyboard.press("Escape");
  await expect.poll(() => objectCount(page)).toBe(3);
  const before = await named(page, "Child");
  const start = await named(page, "Root");

  await canvas(page).click({ position: emptySpot });
  await drag(page, 180, 345, 0, 100);
  await expect.poll(async () => (await named(page, "Root")).y).toBe(start.y + 100);
  expect((await named(page, "Child")).y).toBe(before.y + 100);

  await canvas(page).click({ position: emptySpot });
  await page.keyboard.down("Alt");
  await drag(page, 180, 445, 0, 100);
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await named(page, "Root")).y).toBe(start.y + 200);
  expect((await named(page, "Child")).y).toBe(before.y + 100);

  await row(page, "Root").click();
  await page
    .getByLabel("Object properties")
    .getByRole("button", { name: "Tidy branches", exact: true })
    .click();
  const root = await named(page, "Root");
  await expect
    .poll(async () => {
      const child = await named(page, "Child");
      return child.y + child.height / 2;
    })
    .toBe(root.y + root.height / 2);
  expect(errors).toEqual([]);
});

it("refers between topics without a line, follows it, and can show it", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  await add(page, "Rectangle (R)", "Billing", 100, 100);
  await add(page, "Rectangle (R)", "Invoices", 900, 600);
  await canvas(page).click({ position: emptySpot });
  await row(page, "Billing").click();
  await row(page, "Invoices").click({ modifiers: ["Shift"] });
  await action(page, "Add reference").click();
  await expect.poll(() => objectCount(page)).toBe(3);
  const lines = () =>
    canvas(page).locator('path[stroke-dasharray], path[stroke="#a797cc"]').count();
  expect(await lines()).toBe(0);

  await canvas(page).click({ position: emptySpot });
  await row(page, /Billing/).click();
  await page.getByRole("button", { name: /→ Invoices/ }).click();
  await page.waitForTimeout(600);
  await expect
    .poll(() => page.getByLabel("Object text", { exact: true }).inputValue())
    .toBe("Invoices");
  await expect.poll(() => page.getByRole("button", { name: /← Billing/ }).count()).toBe(1);

  await action(page, "Reference lines").click();
  await expect.poll(lines).toBeGreaterThan(0);
  await action(page, "Reference lines").click();
  await expect.poll(lines).toBe(0);

  await page.getByRole("button", { name: "Remove reference to Billing", exact: true }).click();
  await expect.poll(() => objectCount(page)).toBe(2);
  expect(errors).toEqual([]);
});

it("lets a line be a topic, whose anchor and branches follow the line", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  const peer = await open(await browser.newContext(VIEWPORT), room);
  await add(page, "Rectangle (R)", "Client", 100, 100);
  await add(page, "Rectangle (R)", "Server", 700, 100);
  await canvas(page).click({ position: emptySpot });
  await row(page, "Client").click();
  await row(page, "Server").click({ modifiers: ["Shift"] });
  await action(page, "Connect").click();
  await canvas(page).click({ position: emptySpot });
  await selectConnector(page);
  await page.keyboard.press("Tab");
  await typeTopic(page, "Protocol notes");
  await page.keyboard.press("Escape");
  await expect.poll(() => objectCount(page)).toBe(6);

  const items = await objects(page);
  const line = items.find((item) => item.type === "line")!;
  const anchor = items.find((item) => item.onLine === line.id)!;
  const notes = items.find((item) => item.name === "Protocol notes")!;
  expect(branches(items)[0]).toMatchObject({ from: anchor.id, to: notes.id });

  await canvas(page).click({ position: emptySpot });
  const server = await named(page, "Server");
  await drag(page, 780, 145, 0, 300);
  await expect.poll(async () => (await named(page, "Server")).y).toBe(server.y + 300);
  // A right-angled route's midpoint can shift along either axis, depending on its segments.
  const anchorAt = async () => {
    const { x, y } = (await objects(page)).find((item) => item.id === anchor.id)!;
    return x + y;
  };
  await expect.poll(anchorAt).not.toBe(anchor.x + anchor.y);
  const moved = (await objects(page)).find((item) => item.id === anchor.id)!;
  expect(notes.onLine).toBe("");
  expect(notes.width).toBeGreaterThan(anchor.width);
  const expectedX = notes.x + moved.x - anchor.x;
  await expect.poll(async () => (await named(page, "Protocol notes")).x).toBe(expectedX);
  await expect.poll(async () => (await named(peer, "Protocol notes")).x).toBe(expectedX);

  // Removing the line takes its anchor and anything held there.
  await selectConnector(page);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await objects(page)).some((item) => item.id === anchor.id))
    .toBe(false);
  expect(errors).toEqual([]);
});
