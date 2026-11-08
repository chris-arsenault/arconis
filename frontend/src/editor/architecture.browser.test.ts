import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { serializeDocument } from "../files/canvasFile";
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

it("native deletion removes held items, incident routes and line anchors, and Undo restores them", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  const peer = await open(await browser.newContext(), new URL(page.url()).hash.slice(6));
  const document = new CanvasDocument();
  document.create("frame", 40, 40, { id: "holder", name: "Holder", width: 400, height: 300 });
  document.create("note", 100, 120, { id: "child", name: "Child", inside: "holder" });
  document.create("node", 650, 120, { id: "outside", name: "Outside" });
  document.create("line", 0, 0, { id: "route", from: "child", to: "outside" });
  document.create("node", 520, 160, { id: "anchor", onLine: "route", width: 14, height: 14 });
  document.create("note", 520, 260, { id: "held", name: "Held", inside: "anchor" });
  const content = serializeDocument(document);
  document.destroy();
  await page.getByLabel("Import file", { exact: true }).setInputFiles({
    name: "relations.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await expect.poll(() => objectCount(peer)).toBe(6);
  await row(page, "Holder").click();
  await page.keyboard.press("Delete");
  await expect.poll(() => objectCount(page)).toBe(1);
  await expect.poll(() => objectCount(peer)).toBe(1);
  expect((await exported(page)).objects.map((item) => item.id)).toEqual(["outside"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => objectCount(peer)).toBe(6);
  expect(
    (await exported(page)).objects.map((item) => item.id).sort((a, b) => a.localeCompare(b))
  ).toEqual(["anchor", "child", "held", "holder", "outside", "route"]);
  expect(errors).toEqual([]);
});

it("zooming into a line changes only the viewport without creating a canonical anchor", async () => {
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    createRoomId()
  );
  await add(page, "Rectangle (R)", "Client", 100, 100);
  await add(page, "Rectangle (R)", "Server", 700, 100);
  await row(page, "Client").click();
  await row(page, "Server").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await selectConnector(page);
  const before = await exported(page);
  await page.getByRole("button", { name: "Zoom in (Z)", exact: true }).click();
  await expect
    .poll(async () => Number.parseFloat((await page.getByTestId("zoom-level").textContent())!))
    .toBeGreaterThan(100);
  expect((await exported(page)).text).toBe(before.text);
  expect(await objectCount(page)).toBe(3);
  expect(errors).toEqual([]);
});
