import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, objectCount, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1500, height: 1000 } };

async function command(page: Page, label: string) {
  await page.getByTestId("canvas").press("ControlOrMeta+k");
  await page.getByLabel("Search commands", { exact: true }).fill(label);
  await page.getByRole("option").filter({ hasText: label }).getByRole("button").click();
}

it("keeps container titles draggable when a child's copy handle would cover them", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Frame (F)", "Workshop", 120, 400);
  await add(page, "Sticky note (N)", "Plan", 180, 450);
  const before = (await exported(page)).objects;
  const title = (await row(page, /^Workshop$/).boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + title.width / 2 + 320, title.y + title.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await objectCount(page)).toBe(2);
  const after = (await exported(page)).objects;
  const dx =
    after.find((item) => item.name === "Workshop")!.x -
    before.find((item) => item.name === "Workshop")!.x;
  expect(dx).toBeGreaterThan(300);
  expect(
    after.find((item) => item.name === "Plan")!.x - before.find((item) => item.name === "Plan")!.x
  ).toBe(dx);
  expect(errors).toEqual([]);
  await context.close();
});

it("undoes a connected-copy drag in one step for both peers", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(first, room);
  await add(page, "Sticky note (N)", "Source", 220, 250);
  const peer = await open(second, room);
  const handle = (await page
    .getByRole("button", { name: "Add a connected copy right", exact: true })
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 200, handle.y + 100, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect.poll(() => objectCount(peer)).toBe(3);
  const created = (await exported(page)).objects.find(
    (item) => item.type === "note" && item.name !== "Source"
  )!;
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => objectCount(page)).toBe(1);
  await expect.poll(() => objectCount(peer)).toBe(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => objectCount(peer)).toBe(3);
  expect((await exported(peer)).objects.find((item) => item.id === created.id)).toMatchObject({
    x: created.x,
    y: created.y,
  });
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("keeps pointer-resized table columns aligned through edits, Undo and peers", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(first, room);
  await command(page, "Insert a table");
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  const peer = await open(second, room);
  await row(page, /^Column 1$/).click();
  await row(page, /^Column 1$/).click();
  const header = (await exported(page)).objects.find((item) => item.name === "Column 1")!;
  await row(page, /^Column 1$/).click();
  const handles = page.getByTestId("canvas").locator('rect[fill="#f4f2fd"]');
  const boxes = await handles.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    })
  );
  const right = Math.max(...boxes.map((box) => box.x));
  const side = boxes.filter((box) => Math.abs(box.x - right) < 1).sort((a, b) => a.y - b.y)[1];
  expect(side).toBeDefined();
  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await page.mouse.down();
  await page.mouse.move(side.x + side.width / 2 + 80, side.y + side.height / 2, { steps: 12 });
  await page.mouse.up();
  const after = (await exported(page)).objects;
  const firstColumn = after.filter((item) => item.inside === header.inside && item.x === header.x);
  expect(firstColumn).toHaveLength(3);
  expect(new Set(firstColumn.map((item) => item.width)).size).toBe(1);
  expect(firstColumn[0].width).toBeGreaterThan(header.width);
  await expect.poll(async () => (await exported(peer)).objects).toEqual(after);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await exported(page)).objects.find((item) => item.id === header.id)!.width).toBe(
    header.width
  );
  await row(page, /^Column 1$/).click();
  await command(page, "Add a table column");
  expect(
    (await exported(page)).objects
      .filter((item) => /^Column /.test(item.name))
      .map((item) => item.name)
  ).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"]);
  const tableTitle = (await row(page, /^Table/).boundingBox())!;
  const columnTitle = (await row(page, /^Column 1$/).boundingBox())!;
  expect(tableTitle.y + tableTitle.height).toBeLessThanOrEqual(columnTitle.y);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("shows the first search match first and reveals only the requested hidden object", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Sticky note (N)", "Agenda first", 200, 250);
  await add(page, "Sticky note (N)", "Agenda second", 500, 250);
  await page.getByTestId("canvas").click({ position: { x: 850, y: 750 } });
  await page.keyboard.press("ControlOrMeta+f");
  const input = page.getByRole("textbox", { name: "Find on canvas", exact: true });
  await input.pressSequentially("Agenda");
  expect(await page.getByTestId("find-count").textContent()).toBe("2 matches");
  await input.press("Enter");
  expect(await page.getByTestId("find-count").textContent()).toBe("1 of 2");
  expect(await page.getByLabel("Object text", { exact: true }).inputValue()).toBe("Agenda first");
  await input.press("Escape");
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("ControlOrMeta+Shift+h");
  await row(page, /^Agenda second$/).click();
  await page.keyboard.press("ControlOrMeta+Shift+h");
  await page.keyboard.press("ControlOrMeta+f");
  await page
    .getByRole("textbox", { name: "Find on canvas", exact: true })
    .pressSequentially("Agenda");
  await page.getByRole("button", { name: "Reveal Agenda first", exact: true }).click();
  const objects = (await exported(page)).objects;
  expect(objects.find((item) => item.name === "Agenda first")!.hidden).toBeUndefined();
  expect(objects.find((item) => item.name === "Agenda second")!.hidden).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});
