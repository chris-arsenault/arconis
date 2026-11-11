import { afterEach, expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  baseUrl,
  browser,
  errors,
  fixture,
  objectCount,
  open,
  unfoldSource,
} from "./browserHarness";

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

it("a device-only room opens no connection, and keeps its work", async () => {
  const context = await browser.newContext();
  const sockets: string[] = [];
  const relayRequests: string[] = [];
  context.on("request", (request) => {
    if (request.url().includes(new URL(fixture.config.relayUrl).host))
      relayRequests.push(request.url());
  });
  await unfoldSource(context);
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
  await page.getByText("Room options", { exact: true }).click();
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
