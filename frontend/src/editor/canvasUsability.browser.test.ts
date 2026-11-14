import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, objectCount, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1500, height: 1000 } };

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

it("shows the first search match first", async () => {
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
  expect(await row(page, /^Agenda first$/).count()).toBe(1);
  await input.press("Escape");
  expect(errors).toEqual([]);
  await context.close();
});
