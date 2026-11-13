import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import {
  add,
  browser,
  errors,
  exported,
  objectCount,
  open,
  row,
  selectConnector,
} from "./browserHarness";

it("Undo removes a branch's newly required line anchor, topic and relationship together", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  await add(page, "Rectangle (R)", "Client", 100, 100);
  await add(page, "Rectangle (R)", "Server", 700, 100);
  await row(page, "Client").click();
  await row(page, "Server").click({ modifiers: ["Shift"] });
  await page.getByRole("tab", { name: "Arrange", exact: true }).click();
  await page.getByRole("button", { name: "Connect with a line", exact: true }).click();
  await selectConnector(page);
  const before = (await exported(page)).text;
  await page.getByRole("button", { name: "Add branch", exact: true }).click();
  await page.getByLabel("Edit canvas text", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await expect.poll(() => objectCount(peer)).toBe(6);
  const items = (await exported(page)).objects;
  const anchor = items.find((item) => item.onLine)!;
  expect(anchor).toBeDefined();
  expect(items.find((item) => item.type === "branch")?.from).toBe(anchor.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => objectCount(peer)).toBe(3);
  expect((await exported(page)).text).toBe(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => objectCount(peer)).toBe(6);
  expect(errors).toEqual([]);
});

it("one Undo restores both growing text typography and its fitted geometry", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  await add(page, "Text (T)", "Line one\nLine two\nLine three", 220, 170);
  await page.getByText("Spacing and sizing", { exact: true }).click();
  await page.getByLabel("Grow text height", { exact: true }).check();
  await expect.poll(async () => (await exported(page)).objects[0].look.textFit).toBe("height");
  const before = await exported(page);
  const oldHeight = before.objects[0].height;
  await page.getByLabel("Font size", { exact: true }).fill("44");
  await expect
    .poll(async () => (await exported(page)).objects[0].height)
    .toBeGreaterThan(oldHeight);
  expect((await exported(page)).objects[0].look.textSize).toBe(44);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await exported(page)).text).toBe(before.text);
  expect(errors).toEqual([]);
});

it("Markdown formatting keeps immediate source and fitted height in the same Undo step", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  await add(page, "Text (T)", "Heading", 220, 170);
  await page.getByText("Spacing and sizing", { exact: true }).click();
  await page.getByLabel("Grow text height", { exact: true }).check();
  await expect.poll(async () => (await exported(page)).objects[0].look.textFit).toBe("height");
  const before = await exported(page);
  const source = page.getByLabel("Object text", { exact: true });
  await page.getByText("Markdown tools", { exact: true }).click();
  await source.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Markdown heading", exact: true }).click();
  expect(await source.inputValue()).toBe("## Heading");
  expect((await exported(page)).objects[0].height).toBeGreaterThan(before.objects[0].height);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await exported(page)).text).toBe(before.text);
  expect(errors).toEqual([]);
});
