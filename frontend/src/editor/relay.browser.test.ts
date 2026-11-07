import { afterEach, expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, baseUrl, browser, errors, fixture, objectCount, open } from "./browserHarness";

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

it("an unreachable relay changes only the status, and work merges when it returns", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(), room);
  const b = await open(await browser.newContext(), room);
  await a.route("**/control/*", (route) => route.abort());
  fixture.drop();
  await status(a).filter({ hasText: "Offline" }).waitFor();
  await add(a, "Rectangle (R)", "Made while blocked", 300, 240);
  await add(b, "Rectangle (R)", "Made elsewhere", 500, 240);
  await a.unroute("**/control/*");
  fixture.reset();
  await status(a).filter({ hasText: "Connected" }).waitFor({ timeout: 70_000 });
  await status(b).filter({ hasText: "Connected" }).waitFor({ timeout: 70_000 });
  await expect.poll(() => objectCount(a), { timeout: 15_000 }).toBe(2);
  await expect.poll(() => objectCount(b), { timeout: 15_000 }).toBe(2);
}, 120_000);

it("a device-only room opens no connection, and keeps its work", async () => {
  const context = await browser.newContext();
  const sockets: string[] = [];
  const relayRequests: string[] = [];
  context.on("request", (request) => {
    if (request.url().includes(new URL(fixture.config.relayUrl).host))
      relayRequests.push(request.url());
  });
  const page = await context.newPage();
  page.on("websocket", (socket) => {
    if (socket.url().includes(new URL(fixture.config.relayUrl).host)) sockets.push(socket.url());
  });
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__APP_CONFIG__ = ${JSON.stringify(fixture.config)};`,
    })
  );
  await page.goto(baseUrl());
  await page.getByRole("button", { name: "Work on this device only", exact: true }).click();
  await status(page).filter({ hasText: "On this device only" }).waitFor();
  expect(new URL(page.url()).hash).toMatch(/^#local=[a-f0-9]{48}$/);
  expect(await page.getByRole("button", { name: "Share room", exact: true }).count()).toBe(0);
  await add(page, "Rectangle (R)", "Private", 300, 240);
  await expect.poll(() => objectCount(page)).toBe(1);
  await page.waitForTimeout(500);
  await page.reload();
  await status(page).filter({ hasText: "On this device only" }).waitFor();
  await expect.poll(() => objectCount(page)).toBe(1);
  expect(sockets).toEqual([]);
  expect(relayRequests).toEqual([]);
  expect(fixture.starts).toBe(0);
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
