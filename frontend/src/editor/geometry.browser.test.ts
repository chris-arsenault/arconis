import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported } from "./browserHarness";
import { CanvasDocument } from "../document/canvasDocument";

async function shapePosition(page: Page) {
  const saved = await exported(page);
  const shape = saved.objects.find((item) => item.label === "Grouped shape")!;
  let x = shape.x;
  let y = shape.y;
  let parent = shape.parent;
  if (saved.version === 1) {
    while (parent) {
      const group = saved.objects.find((item) => item.id === parent)!;
      x += group.x;
      y += group.y;
      parent = group.parent;
    }
  }
  return [x, y];
}

it("keeps world geometry when a peer groups while another moves offline", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Grouped shape", 220, 170);
  await a.getByLabel("Object x", { exact: true }).fill("100");
  await a.getByLabel("Object y", { exact: true }).fill("100");
  await add(a, "Sticky note (N)", "Companion", 500, 300);
  const b = await open(second, room);
  await row(b, "Grouped shape").waitFor();
  await row(b, "Grouped shape").click();
  await first.setOffline(true);
  await row(a, "Grouped shape").click();
  await row(a, "Companion").click({ modifiers: ["Shift"] });
  await a.getByRole("button", { name: "Group", exact: true }).click();
  await b.getByLabel("Object x", { exact: true }).fill("150");
  await b.getByLabel("Object y", { exact: true }).fill("180");
  await first.setOffline(false);
  await expect.poll(() => shapePosition(a), { timeout: 45000 }).toEqual([150, 180]);
  await expect.poll(() => shapePosition(b), { timeout: 45000 }).toEqual([150, 180]);
  await moveDuplicateUngroup(a);
  await expect.poll(() => shapePosition(b), { timeout: 45000 }).toEqual([250, 180]);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

async function moveDuplicateUngroup(page: Page) {
  await page.locator('.object-row[title="Group"]').click();
  const x = Number(await page.getByLabel("Object x", { exact: true }).inputValue());
  await page.getByLabel("Object x", { exact: true }).fill(String(x + 100));
  expect(await shapePosition(page)).toEqual([250, 180]);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  const copy = await exported(page);
  expect(
    copy.objects
      .filter((item) => item.label === "Grouped shape")
      .map((item) => item.x)
      .sort((left, right) => left - right)
  ).toEqual([250, 278]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator('.object-row[title="Group"]').click();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  expect(await shapePosition(page)).toEqual([250, 180]);
  expect(await page.locator(".object-row").count()).toBe(2);
}

function legacyFile() {
  const document = new CanvasDocument();
  const group = document.create("group", 100, 120, {
    label: "Legacy group",
    width: 500,
    height: 400,
  });
  const shape = document.create("rectangle", 40, 50, { parent: group, label: "Legacy shape" });
  const note = document.create("sticky", 260, 200, { parent: group, label: "Legacy note" });
  document.create("connector", 0, 0, {
    parent: group,
    source: shape,
    target: note,
    label: "Legacy path",
    points: "[[230,80],[230,200]]",
  });
  document.create("stroke", 0, 0, {
    parent: group,
    label: "Legacy drawing",
    points: "[[30,300],[100,330],[200,300]]",
  });
  const result = JSON.stringify({ format: "arconis", version: 1, objects: document.list() });
  document.destroy();
  return result;
}

it("moves legacy grouped routes and drawings once, then preserves them through undo and reload", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "legacy.arconis",
    mimeType: "application/json",
    buffer: Buffer.from(legacyFile()),
  });
  await expect.poll(() => page.locator(".object-row").count()).toBe(5);
  const before = await exported(page);
  expect(before.version).toBe(2);
  expect(before.objects.find((item) => item.label === "Legacy shape")).toMatchObject({
    x: 140,
    y: 170,
  });
  expect(before.objects.find((item) => item.label === "Legacy path")?.points).toBe(
    "[[330,200],[330,320]]"
  );
  await row(page, "Legacy group").click();
  await page.getByLabel("Object x", { exact: true }).fill("180");
  await page.getByLabel("Object y", { exact: true }).fill("160");
  const moved = await exported(page);
  expect(moved.objects.find((item) => item.label === "Legacy shape")).toMatchObject({
    x: 220,
    y: 210,
  });
  expect(moved.objects.find((item) => item.label === "Legacy path")?.points).toBe(
    "[[410,240],[410,360]]"
  );
  expect(moved.objects.find((item) => item.label === "Legacy drawing")?.points).toBe(
    "[[210,460],[280,490],[380,460]]"
  );
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  const copies = (await exported(page)).objects.filter((item) => item.label === "Legacy path");
  expect(copies.map((item) => item.x)).toEqual([0, 0]);
  expect(
    copies.map((item) => item.points).sort((left, right) => left.localeCompare(right))
  ).toEqual(["[[410,240],[410,360]]", "[[438,268],[438,388]]"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await row(page, "Legacy group").click();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await page.reload();
  await expect.poll(() => page.locator(".object-row").count()).toBe(4);
  const restored = await exported(page);
  expect(restored.objects.find((item) => item.label === "Legacy path")).toMatchObject({
    x: 0,
    y: 0,
  });
  expect(restored.objects.find((item) => item.label === "Legacy path")?.points).toBe(
    "[[410,240],[410,360]]"
  );
  expect(restored.objects.find((item) => item.label === "Legacy drawing")?.points).toBe(
    "[[210,460],[280,490],[380,460]]"
  );
  expect(errors).toEqual([]);
  await context.close();
});
