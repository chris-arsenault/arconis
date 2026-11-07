import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  browser,
  errors,
  open,
  add,
  row,
  exported,
  objectCount,
  groupLabel,
} from "./browserHarness";

async function shapePosition(page: Page) {
  // Poll rendered geometry, keeping file downloads for the actual export checks.
  const rectangle = page
    .getByTestId("canvas")
    .locator('svg rect[fill="#ffffff"][pointer-events="all"]');
  return rectangle.evaluate((element) => [
    Number(element.getAttribute("x")) - 60,
    Number(element.getAttribute("y")) - 60,
  ]);
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
  await groupLabel(page).click();
  const x = Number(await page.getByLabel("Object x", { exact: true }).inputValue());
  await page.getByLabel("Object x", { exact: true }).fill(String(x + 100));
  expect(await shapePosition(page)).toEqual([250, 180]);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  const copy = await exported(page);
  expect(
    copy.objects
      .filter((item) => item.name === "Grouped shape")
      .map((item) => item.x)
      .sort((left, right) => left - right)
  ).toEqual([250, 278]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await groupLabel(page).click();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  expect(await shapePosition(page)).toEqual([250, 180]);
  expect(await objectCount(page)).toBe(2);
}

/** A group holding a shape, a note, a routed line between them and a drawing, in world units. */
const GROUPED_FILE = `arconis 1
group g "Group" at 100,120 size 500,400 {
  node shape "Shape" at 140,170 size 160,90
  note n "Note" at 360,320 size 190,170
  drawing d "Drawing" points 130,420 200,450 300,420
}
shape -> n "Path" as path via 330,200 330,320 in g
`;

it("moves grouped routes and drawings with their group, through duplicate, undo and reload", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "grouped.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(GROUPED_FILE),
  });
  await expect.poll(() => objectCount(page)).toBe(5);
  const named = (items: { name: string }[], name: string) =>
    items.find((item) => item.name === name) as (typeof items)[number] & Record<string, unknown>;
  const before = await exported(page);
  expect(named(before.objects, "Shape")).toMatchObject({ x: 140, y: 170 });
  expect(named(before.objects, "Path").points).toEqual([
    [330, 200],
    [330, 320],
  ]);
  await row(page, "Group").click();
  await page.getByLabel("Object x", { exact: true }).fill("180");
  await page.getByLabel("Object y", { exact: true }).fill("160");
  const moved = await exported(page);
  expect(named(moved.objects, "Shape")).toMatchObject({ x: 220, y: 210 });
  expect(named(moved.objects, "Path").points).toEqual([
    [410, 240],
    [410, 360],
  ]);
  expect(named(moved.objects, "Drawing").points).toEqual([
    [210, 460],
    [280, 490],
    [380, 460],
  ]);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  const copies = (await exported(page)).objects.filter((item) => item.name === "Path");
  expect(copies.map((item) => item.x)).toEqual([0, 0]);
  expect(copies.map((item) => item.points[0][0]).sort((a, b) => a - b)).toEqual([410, 438]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await row(page, "Group").click();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await page.reload();
  await expect.poll(() => objectCount(page)).toBe(4);
  const restored = await exported(page);
  expect(named(restored.objects, "Path")).toMatchObject({ x: 0, y: 0 });
  expect(named(restored.objects, "Path").points).toEqual([
    [410, 240],
    [410, 360],
  ]);
  expect(named(restored.objects, "Drawing").points).toEqual([
    [210, 460],
    [280, 490],
    [380, 460],
  ]);
  expect(errors).toEqual([]);
  await context.close();
});
