import { expect, it } from "vitest";
import type { BrowserContext, Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, objectCount, open } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const EMPTY_UPDATE = "AAA=";

interface SentFrame {
  kind: string;
  target: string;
  data: string;
}
declare global {
  interface Window {
    sentFrames: SentFrame[];
  }
}

/** Records every frame this page sends, by wrapping the browser's socket. */
async function countSends(context: BrowserContext) {
  await context.addInitScript(() => {
    window.sentFrames = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      window.sentFrames.push(JSON.parse(data as string) as SentFrame);
      send.call(this, data);
    };
  });
}
const sent = (page: Page) => page.evaluate(() => window.sentFrames);
const clearSent = (page: Page) =>
  page.evaluate(() => {
    window.sentFrames = [];
  });
const updates = (frames: SentFrame[]) =>
  frames.filter((frame) => frame.kind === "update" && frame.data !== EMPTY_UPDATE);

async function person(room: string) {
  const context = await browser.newContext(VIEWPORT);
  await countSends(context);
  return open(context, room);
}

it("has one person send the document to someone joining", async () => {
  const room = createRoomId();
  const [a, b, c] = [await person(room), await person(room), await person(room)];
  await add(a, "Rectangle (R)", "Shared", 300, 240);
  await expect.poll(() => objectCount(b)).toBe(1);
  await expect.poll(() => objectCount(c)).toBe(1);
  // Past these three's own join retries, so only the newcomer's join is counted.
  await a.waitForTimeout(7000);
  await Promise.all([a, b, c].map(clearSent));

  const joiner = await person(room);
  await expect.poll(() => objectCount(joiner)).toBe(1);
  await joiner.waitForTimeout(1000);
  const senders = await Promise.all(
    [a, b, c].map(async (page) => updates(await sent(page)).length)
  );
  expect(senders.reduce((total, count) => total + count, 0)).toBe(1);
  expect(errors).toEqual([]);
});

it("brings in what only others held, and sends it back the other way", async () => {
  const room = createRoomId();
  const a = await person(room);
  const b = await person(room);
  await add(a, "Rectangle (R)", "Held by both", 300, 200);
  await expect.poll(() => objectCount(b)).toBe(1);
  await a.context().setOffline(true);
  await add(a, "Rectangle (R)", "Made offline", 500, 200);
  await add(b, "Rectangle (R)", "Made while A was away", 300, 400);
  const c = await person(room);
  await expect.poll(() => objectCount(c)).toBe(2);
  await a.context().setOffline(false);
  for (const page of [a, b, c]) await expect.poll(() => objectCount(page)).toBe(3);
  expect(errors).toEqual([]);
});

it("sends nothing but state vectors while a room sits idle", async () => {
  const room = createRoomId();
  const a = await person(room);
  const b = await person(room);
  await add(a, "Rectangle (R)", "Quiet", 300, 240);
  await expect.poll(() => objectCount(b)).toBe(1);
  // Past the join retries, which belong to arriving rather than sitting idle.
  await a.waitForTimeout(7000);
  await clearSent(a);
  await a.waitForTimeout(31_000);
  const kinds = (await sent(a)).map((frame) => frame.kind);
  expect(kinds.filter((kind) => kind === "update" || kind === "hello")).toEqual([]);
  expect(kinds.filter((kind) => kind === "vector").length).toBeLessThanOrEqual(1);
});

it("limits a drawing transform's writes, and peers reach the final shape", async () => {
  const room = createRoomId();
  const a = await person(room);
  const b = await person(room);
  const bounds = (await a.getByTestId("canvas").boundingBox())!;
  await a.getByRole("button", { name: "Draw (P)", exact: true }).click();
  await a.mouse.move(bounds.x + 300, bounds.y + 200);
  await a.mouse.down();
  for (let step = 0; step < 40; step++)
    await a.mouse.move(bounds.x + 300 + step * 6, bounds.y + 200 + (step % 2) * 30);
  await a.mouse.up();
  await expect.poll(() => objectCount(b)).toBe(1);
  await a.waitForTimeout(200);
  await clearSent(a);

  await a.getByRole("button", { name: "Select (V)", exact: true }).click();
  await a.mouse.click(bounds.x + 300 + 6, bounds.y + 215);
  const corner = a.getByTestId("frame-se");
  await corner.waitFor();
  const box = (await corner.boundingBox())!;
  await a.mouse.move(box.x + 4, box.y + 4);
  await a.mouse.down();
  const STEPS = 120;
  for (let step = 1; step <= STEPS; step++) await a.mouse.move(box.x + 4 + step, box.y + 4 + step);
  await a.mouse.up();

  await a.waitForTimeout(200);
  const frames = updates(await sent(a));
  expect(frames.length).toBeLessThan(STEPS / 2);
  const final = (await exported(a)).objects[0].points;
  await expect.poll(async () => (await exported(b)).objects[0].points).toBe(final);
  expect(errors).toEqual([]);
});
