import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, drag } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const canvas = (page: Page) => page.getByTestId("canvas");
const selectedCount = (page: Page) => page.locator(".object-row.selected").count();
const emptySpot = { x: 880, y: 760 };

async function canvasOrigin(page: Page) {
  const bounds = (await canvas(page).boundingBox())!;
  return { x: bounds.x, y: bounds.y };
}

async function center(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragFrom(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
}

it("opens the text editor when double-clicking any object's body", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  const inline = page.getByLabel("Edit canvas text", { exact: true });
  const tools = [
    "Rectangle (R)",
    "Sticky note (N)",
    "Ellipse",
    "Decision (D)",
    "Service",
    "Database",
    "Cloud",
    "Person",
    "Text",
  ];
  const offsets = [
    [0.5, 0.5],
    [0.32, 0.5],
    [0.68, 0.5],
    [0.5, 0.65],
  ];
  const origin = await canvasOrigin(page);
  for (const [index, tool] of tools.entries()) {
    const x = 100 + (index % 3) * 260;
    const y = 110 + Math.floor(index / 3) * 220;
    await add(page, tool, "Label", x, y);
    await canvas(page).click({ position: emptySpot });
    const box = tool.startsWith("Sticky")
      ? { width: 190, height: 170 }
      : { width: 160, height: 90 };
    for (const selected of [false, true]) {
      for (const [dx, dy] of offsets) {
        const px = origin.x + x + box.width * dx;
        const py = origin.y + y + box.height * dy;
        await canvas(page).click({ position: emptySpot });
        if (selected) await page.mouse.click(px, py);
        await page.mouse.dblclick(px, py);
        expect(await inline.count(), `${tool} at ${dx},${dy}, selected ${selected}`).toBe(1);
        await inline.press("Escape");
      }
    }
  }
  expect(errors).toEqual([]);
  await context.close();
});

it("wraps long labels and renders peer label markup as plain text", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  const long =
    "This is a sticky note with a fairly long sentence that a person writes during a brainstorm.";
  await add(page, "Sticky note (N)", long, 220, 170);
  await add(page, "Rectangle (R)", '<img src=x onerror="window.__injected=1">', 520, 170);
  await canvas(page).click({ position: emptySpot });
  const note = canvas(page).locator("div", { hasText: long }).last();
  const box = (await note.boundingBox())!;
  expect(box.height).toBeGreaterThan(40);
  expect(box.width).toBeLessThanOrEqual(190);
  expect(await canvas(page).locator("img[src='x']").count()).toBe(0);
  expect(await page.evaluate(() => "__injected" in window)).toBe(false);
  expect(await canvas(page).locator("div", { hasText: "<img src=x" }).count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await context.close();
});

it("multi-selects on the canvas and limits the panel to shared properties", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "First", 220, 170);
  await add(page, "Rectangle (R)", "Second", 520, 170);
  await canvas(page).click({ position: emptySpot });
  await canvas(page).click({ position: { x: 300, y: 215 } });
  expect(await selectedCount(page)).toBe(1);
  await canvas(page).click({ position: { x: 600, y: 215 }, modifiers: ["Shift"] });
  expect(await selectedCount(page)).toBe(2);
  expect(await page.getByLabel("Object text", { exact: true }).count()).toBe(0);
  expect(await page.getByLabel("Object x", { exact: true }).count()).toBe(0);
  await canvas(page).click({ position: { x: 600, y: 215 }, modifiers: ["Shift"] });
  expect(await selectedCount(page)).toBe(1);
  await canvas(page).click({ position: emptySpot });
  await drag(page, 180, 130, 600, 200);
  expect(await selectedCount(page)).toBe(2);
  expect(errors).toEqual([]);
  await context.close();
});

it("connects objects by walking the pointer from a shape onto its connection handle", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Handle source", 220, 170);
  await add(page, "Sticky note (N)", "Handle target", 560, 170);
  await canvas(page).click({ position: emptySpot });
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + 300, origin.y + 215);
  await page.mouse.move(origin.x + 302, origin.y + 216);
  const handle = canvas(page).locator("image, img");
  await handle.first().waitFor();
  const box = (await handle.first().boundingBox())!;
  const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(grab.x, grab.y, { steps: 25 });
  expect(await handle.count()).toBe(1);
  await page.mouse.down();
  await page.mouse.move(origin.x + 650, origin.y + 250, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.locator(".object-row").count()).toBe(3);
  const saved = await exported(page);
  const edge = saved.objects.find((item) => item.kind === "connector")!;
  expect(saved.objects.find((item) => item.id === edge.source)?.label).toBe("Handle source");
  expect(saved.objects.find((item) => item.id === edge.target)?.label).toBe("Handle target");
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps keyboard shortcuts working after clicking interface controls", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Removed by key", 220, 170);
  await add(page, "Rectangle (R)", "Kept", 520, 170);
  await row(page, "Removed by key").click();
  await page.keyboard.press("Delete");
  await expect.poll(() => page.locator(".object-row").count()).toBe(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => page.locator(".object-row").count()).toBe(2);
  const pressed = page.locator(".tool[aria-pressed=true]");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  await page.keyboard.press("v");
  expect(await pressed.getAttribute("aria-label")).toBe("Select (V)");
  await page.getByRole("button", { name: "Ellipse", exact: true }).click();
  await page.keyboard.down("Space");
  expect(await pressed.getAttribute("aria-label")).toBe("Pan (H / Space)");
  await page.keyboard.up("Space");
  expect(await pressed.getAttribute("aria-label")).toBe("Select (V)");
  expect(errors).toEqual([]);
  await context.close();
});

it("styles a new group immediately for its creator and selects it", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Member", 220, 170);
  await add(page, "Sticky note (N)", "Other member", 500, 170);
  await row(page, "Member").first().click();
  await row(page, "Other member").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect.poll(() => canvas(page).locator("[stroke-dasharray]").count()).toBeGreaterThan(0);
  await expect.poll(() => canvas(page).locator('[fill="#f3f0fc"]').count()).toBe(1);
  expect(await canvas(page).locator('[fill="#C3D9FF"], [fill="#c3d9ff"]').count()).toBe(0);
  expect(await page.locator('.object-row.selected[title="Group"]').count()).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps the drawn shape of a freehand stroke without per-point handles", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
  const origin = await canvasOrigin(page);
  const middle = { x: origin.x + 450, y: origin.y + 350 };
  const radius = 40;
  await page.mouse.move(middle.x + radius, middle.y);
  await page.mouse.down();
  for (let step = 1; step <= 80; step++) {
    const angle = (step / 80) * Math.PI * 2;
    await page.mouse.move(middle.x + radius * Math.cos(angle), middle.y + radius * Math.sin(angle));
  }
  await page.mouse.up();
  await expect.poll(() => page.locator(".object-row").count()).toBe(1);
  const stroke = (await exported(page)).objects.find((item) => item.kind === "stroke")!;
  const points = JSON.parse(stroke.points) as [number, number][];
  expect(points.length).toBeGreaterThan(12);
  expect(points.length).toBeLessThan(81);
  const xs = points.map(([x]) => x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const ys = points.map(([, y]) => y);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  for (const [x, y] of points)
    expect(Math.abs(Math.hypot(x - cx, y - cy) - radius)).toBeLessThan(2);
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await row(page, "Drawing").click();
  await page.getByTestId("selection-frame").waitFor();
  expect(await canvas(page).locator('rect[fill="#00FF00"]').count()).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
  await context.close();
});

it("opens a new note for typing and replaces its placeholder", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.getByRole("button", { name: "Sticky note (N)", exact: true }).click();
  await canvas(page).click({ position: { x: 300, y: 200 } });
  const inline = page.getByLabel("Edit canvas text", { exact: true });
  await inline.waitFor();
  await page.keyboard.type("Typed straight away");
  await page.keyboard.press("Escape");
  await row(page, "Typed straight away").waitFor();
  expect(await row(page, "Your idea here").count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

it("asks a link visitor for a name once and shows it to peers", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const b = await open(second, room);
  const prompt = b.getByLabel("Your name in this room", { exact: true });
  await prompt.fill("Robin");
  await prompt.press("Enter");
  await expect.poll(() => prompt.count()).toBe(0);
  const origin = await canvasOrigin(b);
  await b.mouse.move(origin.x + 400, origin.y + 300);
  await b.mouse.move(origin.x + 420, origin.y + 320, { steps: 3 });
  await a.locator(".peer-cursor", { hasText: "Robin" }).waitFor();
  await b.reload();
  await b.getByRole("button", { name: "Rectangle (R)", exact: true }).waitFor();
  expect(await prompt.count()).toBe(0);
  await b.getByRole("button", { name: "Change your name", exact: true }).click();
  expect(await prompt.inputValue()).toBe("Robin");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("stacks objects identically across peers and reorders them", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const b = await open(second, room);
  await add(a, "Rectangle (R)", "Seed", 700, 600);
  await row(b, "Seed").waitFor();
  await first.setOffline(true);
  await expect.poll(() => a.getByTestId("connection-status").textContent()).toBe("Offline");
  await add(a, "Rectangle (R)", "Under", 220, 170);
  await add(b, "Rectangle (R)", "Over", 260, 200);
  await first.setOffline(false);
  await row(a, "Over").waitFor({ timeout: 45000 });
  await row(b, "Under").waitFor({ timeout: 45000 });
  const rows = (page: Page) => page.locator(".object-row").allTextContents();
  expect(await rows(a)).toEqual(await rows(b));
  const topAtOverlap = async (page: Page) => {
    await canvas(page).click({ position: emptySpot });
    await canvas(page).click({ position: { x: 300, y: 230 } });
    return page.getByLabel("Object text", { exact: true }).inputValue();
  };
  const top = await topAtOverlap(a);
  expect(await topAtOverlap(b)).toBe(top);
  await a.keyboard.press("[");
  await expect.poll(() => topAtOverlap(a)).not.toBe(top);
  await expect.poll(() => topAtOverlap(b)).not.toBe(top);
  await row(a, top).click();
  await a.getByRole("button", { name: "To front", exact: true }).click();
  await expect.poll(() => topAtOverlap(b)).toBe(top);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("distinguishes waiting for a canvas, being alone and being in sync", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const status = (page: Page) => page.getByTestId("sync-status").textContent();
  const hint = a.getByTestId("canvas-hint");
  expect(await hint.textContent()).toContain("Looking for this canvas");
  await expect.poll(() => status(a), { timeout: 12000 }).toContain("Nobody else is online");
  expect(await hint.textContent()).toContain("appears when someone holding a copy returns");
  const b = await open(second, room);
  await expect.poll(() => status(b), { timeout: 12000 }).toBe("In sync with 1 participant");
  await expect.poll(() => status(a), { timeout: 12000 }).toBe("In sync with 1 participant");
  await first.setOffline(true);
  await expect.poll(() => status(a)).toContain("saved on this device");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("shows a peer's move and resize while the drag is still in progress", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Dragged", 220, 170);
  const b = await open(second, room);
  await row(b, "Dragged").waitFor();
  await canvas(a).click({ position: emptySpot });
  await expect.poll(() => a.locator(".peer-cursor").count()).toBeLessThan(2);
  const origin = await canvasOrigin(a);
  await a.mouse.move(origin.x + 300, origin.y + 215);
  await a.mouse.down();
  await a.mouse.move(origin.x + 450, origin.y + 325, { steps: 12 });
  await a.waitForTimeout(120);
  await a.mouse.move(origin.x + 460, origin.y + 335, { steps: 2 });
  const ghost = b.getByTestId("peer-preview");
  await ghost.first().waitFor({ timeout: 15000 });
  expect(
    await ghost.first().evaluate((node) => parseInt((node as HTMLElement).style.left))
  ).toBeGreaterThan(300);
  await a.mouse.up();
  await expect.poll(() => ghost.count(), { timeout: 15000 }).toBe(0);
  await row(b, "Dragged").click();
  await expect
    .poll(() => b.getByLabel("Object x", { exact: true }).inputValue(), { timeout: 15000 })
    .not.toBe("160");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("scales and rotates a mixed selection as one undoable step, and rotates one shape", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Scaled shape", 220, 170);
  await page.getByRole("button", { name: "Draw (P)", exact: true }).click();
  await drag(page, 500, 180, 160, 80);
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await row(page, "Scaled shape").click();
  await row(page, "Drawing").click({ modifiers: ["Shift"] });
  const before = await exported(page);
  const shapeBefore = before.objects.find((item) => item.kind === "rectangle")!;
  const pointsBefore = JSON.parse(
    before.objects.find((item) => item.kind === "stroke")!.points
  ) as [number, number][];
  await dragFrom(page, await center(page, "frame-se"), 100, 50);
  const scaled = await exported(page);
  const shapeScaled = scaled.objects.find((item) => item.kind === "rectangle")!;
  const pointsScaled = JSON.parse(
    scaled.objects.find((item) => item.kind === "stroke")!.points
  ) as [number, number][];
  expect(shapeScaled.width).toBeGreaterThan(shapeBefore.width);
  expect(pointsScaled[pointsScaled.length - 1][0]).toBeGreaterThan(
    pointsBefore[pointsBefore.length - 1][0]
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () => (await exported(page)).objects.find((item) => item.kind === "rectangle")?.width
    )
    .toBe(shapeBefore.width);
  await row(page, "Scaled shape").click();
  await row(page, "Drawing").click({ modifiers: ["Shift"] });
  await dragFrom(page, await center(page, "frame-rotate"), 160, 120);
  const rotated = await exported(page);
  const angle = Number(rotated.objects.find((item) => item.kind === "rectangle")!.style.rotation);
  expect(angle).toBeGreaterThan(10);
  await row(page, "Scaled shape").click();
  expect(await page.getByTestId("selection-frame").count()).toBe(0);
  expect(
    Number(await page.getByLabel("Object rotation", { exact: true }).inputValue())
  ).toBeCloseTo(angle, 0);
  expect(errors).toEqual([]);
  await context.close();
});

it("rotates one shape with its native handle and syncs the angle", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Turned", 220, 170);
  const b = await open(second, room);
  await row(b, "Turned").click();
  await canvas(a).click({ position: emptySpot });
  await canvas(a).click({ position: { x: 300, y: 215 } });
  const origin = await canvasOrigin(a);
  await dragFrom(a, { x: origin.x + 300, y: origin.y + 154 }, 80, 40);
  await expect
    .poll(() => b.getByLabel("Object rotation", { exact: true }).inputValue(), { timeout: 15000 })
    .not.toBe("0");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
