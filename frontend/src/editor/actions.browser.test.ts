import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, row } from "./browserHarness";
import { textEditor } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

it("publishes title and subtitle fields at their completion boundaries", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Metadata", 220, 170);
  const b = await open(second, room);
  await row(b, "Metadata").click();
  await a.getByLabel("Canvas title", { exact: true }).fill("Completed title");
  await a.waitForTimeout(150);
  expect(await b.getByLabel("Canvas title", { exact: true }).inputValue()).toBe("Untitled canvas");
  await a.getByLabel("Canvas title", { exact: true }).press("Enter");
  await expect
    .poll(() => b.getByLabel("Canvas title", { exact: true }).inputValue())
    .toBe("Completed title");
  await textEditor(a);
  await textEditor(b);
  await a.getByLabel("Object subtitle", { exact: true }).fill("Completed subtitle");
  await a.waitForTimeout(150);
  expect(await b.getByLabel("Object subtitle", { exact: true }).inputValue()).toBe("");
  await a.getByLabel("Object subtitle", { exact: true }).press("Enter");
  await expect
    .poll(() => b.getByLabel("Object subtitle", { exact: true }).inputValue())
    .toBe("Completed subtitle");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("keeps typing local through join/repair, merges concurrent text and publishes on finish", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const third = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Shared", 220, 170);
  const b = await open(second, room);
  await row(b, "Shared").click();
  const sourceA = a.getByLabel("Object text", { exact: true });
  await textEditor(a);
  await textEditor(b);
  await sourceA.press("ControlOrMeta+End");
  await sourceA.pressSequentially(" local", { delay: 100 });
  expect(await row(b, /^Shared$/).count()).toBe(1);
  const c = await open(third, room);
  await row(c, /^Shared$/).waitFor();
  await b.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Home");
  await b.getByLabel("Object text", { exact: true }).pressSequentially("Peer ");
  await b.getByLabel("Object text", { exact: true }).press("ControlOrMeta+Enter");
  await expect.poll(() => sourceA.inputValue()).toBe("Peer Shared local");
  expect(await row(c, /^Peer Shared$/).count()).toBe(1);
  await sourceA.press("ControlOrMeta+Enter");
  await row(b, /^Peer Shared local$/).waitFor();
  await row(c, /^Peer Shared local$/).waitFor();
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
  await third.close();
});

it("retains unfinished text locally on reload and publishes it after the editor ends", async () => {
  const context = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(context, room);
  await add(a, "Sticky note (N)", "Before", 220, 170);
  await textEditor(a);
  await a.getByLabel("Object text", { exact: true }).fill("Recovered local edit");
  await a.reload();
  await row(a, /^Recovered local edit$/).waitFor();
  const peer = await browser.newContext(VIEWPORT);
  const b = await open(peer, room);
  await row(b, /^Recovered local edit$/).waitFor();
  expect((await exported(b)).objects[0].name).toBe("Recovered local edit");
  expect(errors).toEqual([]);
  await context.close();
  await peer.close();
});

it("publishes a collective transform on release while keeping its local preview", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "First", 220, 170);
  await add(a, "Rectangle (R)", "Second", 500, 350);
  const b = await open(second, room);
  await row(b, "Second").waitFor();
  const before = (await exported(b)).objects;
  await row(a, "First").click();
  await row(a, "Second").click({ modifiers: ["Shift"] });
  const handle = (await a.getByTestId("frame-se").boundingBox())!;
  await a.mouse.move(handle.x + 3, handle.y + 3);
  await a.mouse.down();
  await a.mouse.move(handle.x + 103, handle.y + 83, { steps: 20 });
  await a.waitForTimeout(250);
  expect((await exported(b)).objects).toEqual(before);
  await a.mouse.up();
  const after = (await exported(a)).objects;
  expect(after).not.toEqual(before);
  await expect.poll(async () => (await exported(b)).objects).toEqual(after);
  await a.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await exported(b)).objects).toEqual(before);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
