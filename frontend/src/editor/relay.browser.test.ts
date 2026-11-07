import { afterEach, expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, fixture, objectCount, open } from "./browserHarness";

const status = (page: Page) => page.getByTestId("connection-status");
const startButton = (page: Page) =>
  page.getByRole("button", { name: "Start collaboration", exact: true });

afterEach(() => {
  fixture.reset();
  expect(errors).toEqual([]);
});

it("creating a room starts a stopped relay while editing continues", async () => {
  fixture.stop();
  fixture.setStartDelay(4000);
  const a = await open(await browser.newContext(), "", false, "Starting collaboration…");
  expect(fixture.starts).toBe(1);
  await add(a, "Rectangle (R)", "Drafted while starting", 300, 240);
  await status(a).filter({ hasText: "Connected" }).waitFor();

  const b = await open(await browser.newContext(), new URL(a.url()).hash.slice(6));
  await expect.poll(() => objectCount(b)).toBe(1);
});

it("a link with no local copy leaves the relay off, and anyone can start it", async () => {
  fixture.stop();
  const room = createRoomId();
  const a = await open(await browser.newContext(), room, false, "Collaboration off");
  expect(fixture.starts).toBe(0);
  await startButton(a).click();
  await status(a).filter({ hasText: "Connected" }).waitFor();
  expect(fixture.starts).toBe(1);
  await expect.poll(() => startButton(a).count()).toBe(0);
});

it("reloading a saved room starts the relay, and an open tab does not", async () => {
  const context = await browser.newContext();
  const room = createRoomId();
  const a = await open(context, room);
  await add(a, "Rectangle (R)", "Saved", 300, 240);
  await expect.poll(() => objectCount(a)).toBe(1);
  // y-indexeddb writes asynchronously, so let the update reach the local copy.
  await a.waitForTimeout(500);

  fixture.stop();
  await status(a).filter({ hasText: "Collaboration off" }).waitFor();
  const before = fixture.starts;
  await a.mouse.move(400, 300);
  await a.mouse.move(420, 320);
  await a.waitForTimeout(1500);
  expect(fixture.starts).toBe(before);

  const b = await context.newPage();
  await b.goto(a.url());
  await status(b).filter({ hasText: "Connected" }).waitFor();
  expect(fixture.starts).toBe(before + 1);
});

it("three separate edits start the relay, and fewer do not", async () => {
  fixture.stop();
  const room = createRoomId();
  const a = await open(await browser.newContext(), room, false, "Collaboration off");
  await add(a, "Rectangle (R)", "One", 300, 200);
  await a.waitForTimeout(2100);
  await add(a, "Rectangle (R)", "Two", 500, 200);
  await a.waitForTimeout(2100);
  expect(fixture.starts).toBe(0);
  await add(a, "Rectangle (R)", "Three", 300, 400);
  await status(a).filter({ hasText: "Connected" }).waitFor();
  expect(fixture.starts).toBe(1);
});

it("work done while the relay is off merges when it returns", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(), room);
  const b = await open(await browser.newContext(), room);
  fixture.stop();
  await status(a).filter({ hasText: "Collaboration off" }).waitFor();
  await status(b).filter({ hasText: "Collaboration off" }).waitFor();
  await add(a, "Rectangle (R)", "From A", 300, 200);
  await add(b, "Rectangle (R)", "From B", 500, 400);

  await startButton(a).click();
  await status(a).filter({ hasText: "Connected" }).waitFor();
  await status(b).filter({ hasText: "Connected" }).waitFor();
  await expect.poll(() => objectCount(a)).toBe(2);
  await expect.poll(() => objectCount(b)).toBe(2);
});

it("at the limit, people see collaboration is off and keep working", async () => {
  const room = createRoomId();
  const context = await browser.newContext();
  const a = await open(context, room);
  fixture.stop("limit");
  await status(a).filter({ hasText: "Collaboration off until next month" }).waitFor();
  expect(await startButton(a).count()).toBe(0);
  await add(a, "Rectangle (R)", "Still works", 300, 240);
  await expect.poll(() => objectCount(a)).toBe(1);
  await a.waitForTimeout(500);

  await a.reload();
  await status(a).filter({ hasText: "Collaboration off until next month" }).waitFor();
  await expect.poll(() => objectCount(a)).toBe(1);
});
