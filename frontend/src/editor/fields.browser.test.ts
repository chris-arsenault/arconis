import { it, expect } from "vitest";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, drag, exported, objectCount } from "./browserHarness";

it("locks, hides, collapses, tags and tracks the editor of objects from the panel", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Frame (F)", "Lanes", 300, 200);
  await add(page, "Sticky note (N)", "Inside", 360, 300);
  await add(page, "Rectangle (R)", "Loose", 900, 200);
  const canvas = page.getByTestId("canvas");

  // Locking keeps a drag from moving the object; the object can still be clicked to unlock.
  await row(page, "Loose").click();
  const before = (await exported(page)).objects.find((item) => item.name === "Loose")!;
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await drag(page, 910, 210, 120, 80);
  const locked = (await exported(page)).objects.find((item) => item.name === "Loose")!;
  expect(locked.locked).toBe(true);
  expect(locked.x).toBe(before.x);
  expect(locked.y).toBe(before.y);
  await expect
    .poll(() => page.getByTestId("edited-by").textContent())
    .toContain("Last edited by Guest");
  await row(page, "Loose").click();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await drag(page, 910, 210, 120, 80);
  const moved = (await exported(page)).objects.find((item) => item.name === "Loose")!;
  expect(moved.locked).toBe(false);
  expect(moved.x).toBeGreaterThan(before.x);

  // Tags, a marker and a task use object chrome without changing the text's layout.
  await row(page, "Loose").click();
  const labelBefore = await row(page, "Loose").boundingBox();
  await page.getByLabel("Add a tag", { exact: true }).fill("api, v2");
  await page.getByLabel("Add a tag", { exact: true }).press("Enter");
  await page.getByLabel("Marker", { exact: true }).selectOption("p1");
  await page.getByLabel("Task", { exact: true }).selectOption("open");
  await page
    .getByTestId("object-metadata")
    .getByRole("button", { name: "Highlight tag api", exact: true })
    .waitFor();
  await page
    .getByTestId("object-metadata")
    .getByRole("button", { name: "Highlight Priority 1", exact: true })
    .waitFor();
  expect(await row(page, "Loose").textContent()).toBe("Loose");
  expect(await row(page, "Loose").boundingBox()).toEqual(labelBefore);
  const tagged = (await exported(page)).objects.find((item) => item.name === "Loose")!;
  expect(tagged).toMatchObject({ tags: ["api", "v2"], marker: "p1", task: "open" });
  expect((await exported(page)).text).toContain("tags api, v2 marker p1 task open");

  // Collapsing a frame folds its contents away and shows how many; expanding brings them back.
  await row(page, "Lanes").click();
  await page.getByRole("button", { name: "Collapse", exact: true }).click();
  await expect.poll(() => row(page, "Inside").count()).toBe(0);
  await row(page, /▸1/).waitFor();
  expect(await objectCount(page)).toBe(3);
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await row(page, "Inside").waitFor();

  // Hiding takes the object off the canvas; the hidden count brings it back.
  await row(page, "Inside").click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect.poll(() => row(page, "Inside").count()).toBe(0);
  expect(await objectCount(page)).toBe(3);
  await page.getByRole("button", { name: "Show 1 hidden object", exact: true }).click();
  await row(page, "Inside").waitFor();
  await canvas.click({ position: { x: 40, y: 40 } });
  expect(errors).toEqual([]);
  await context.close();
});
