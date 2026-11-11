import { afterEach, expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  baseUrl,
  browser,
  drag,
  drawnPictures,
  errors,
  exported,
  exportPng,
  fixture,
  objectCount,
  open,
  pastePicture,
  unfoldSource,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

afterEach(() => fixture.reset());

const pictureOf = async (page: Page) =>
  (await exported(page)).objects.find((item) => item.type === "picture");
const drawnImages = (page: Page) => ({ count: () => drawnPictures(page) });
function uploadedPictures(page: Page) {
  const hashes: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PUT" && url.pathname.startsWith("/upload/"))
      hashes.push(url.pathname.slice("/upload/".length));
  });
  return hashes;
}

it("uploads a pasted picture once, and peers and late joiners load it", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(VIEWPORT), room);
  const b = await open(await browser.newContext(VIEWPORT), room);
  const uploads = uploadedPictures(a);
  await pastePicture(a, "#d04040");
  await expect.poll(() => objectCount(b)).toBe(1);
  await expect.poll(() => uploads.length).toBe(1);
  const hash = uploads[0];
  await expect.poll(() => fixture.uploadsOf(hash)).toBe(1);
  await expect.poll(() => drawnImages(b).count()).toBe(1);

  // Moving and resizing sync as metadata, with no more bytes.
  const before = await pictureOf(a);
  await a.keyboard.press("Escape");
  const bounds = (await a.getByTestId("canvas").boundingBox())!;
  await drag(a, bounds.width / 2, bounds.height / 2, 60, 40);
  await expect.poll(async () => (await pictureOf(b))?.x).not.toBe(before!.x);
  expect(fixture.uploadsOf(hash)).toBe(1);

  const late = await open(await browser.newContext(VIEWPORT), room);
  await expect.poll(() => drawnImages(late).count()).toBe(1);
  await late.reload();
  await expect.poll(() => drawnImages(late).count()).toBe(1);
  expect(fixture.uploadsOf(hash)).toBe(1);
  expect(errors).toEqual([]);
});

it("keeps a picture local while the relay is off, and uploads when it returns", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(VIEWPORT), room);
  const uploads = uploadedPictures(a);
  fixture.stop();
  await a.getByTestId("connection-status").filter({ hasText: "Collaboration off" }).waitFor();
  await pastePicture(a, "#40d040");
  await expect.poll(() => drawnImages(a).count()).toBe(1);
  expect(uploads).toHaveLength(0);
  await a.getByRole("button", { name: "Start collaboration", exact: true }).click();
  await a.getByTestId("connection-status").filter({ hasText: "Connected" }).waitFor();
  await expect.poll(() => uploads.length).toBe(1);
  await expect.poll(() => fixture.uploadsOf(uploads[0])).toBe(1);
  expect(errors).toEqual([]);
});

it("explains a full store, and the picture still works here", async () => {
  const storedBefore = fixture.storedPictures().length;
  fixture.setStorageFull(true);
  const a = await open(await browser.newContext(VIEWPORT), createRoomId());
  await pastePicture(a, "#4040d0");
  await a.getByTestId("sync-status").filter({ hasText: "Picture storage is full" }).waitFor();
  await expect.poll(() => drawnImages(a).count()).toBe(1);
  expect(fixture.storedPictures()).toHaveLength(storedBefore);
  expect(errors).toEqual([]);
});

it("keeps a device-only room's pictures off the network, through reload and files", async () => {
  const context = await browser.newContext(VIEWPORT);
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__APP_CONFIG__ = ${JSON.stringify(fixture.config)};`,
    })
  );
  await unfoldSource(context);
  const page = await context.newPage();
  const uploads = uploadedPictures(page);
  await page.goto(baseUrl());
  await page.getByText("Room options", { exact: true }).click();
  await page.getByRole("button", { name: "Work on this device only", exact: true }).click();
  await page.getByTestId("connection-status").filter({ hasText: "On this device only" }).waitFor();
  await pastePicture(page, "#d0d040");
  await expect.poll(() => drawnImages(page).count()).toBe(1);
  await page.reload();
  await expect.poll(() => drawnImages(page).count()).toBe(1);
  expect(uploads).toHaveLength(0);
  expect(errors).toEqual([]);
});

it("carries a picture in an exported file to a browser without it", async () => {
  const a = await open(await browser.newContext(VIEWPORT), createRoomId());
  await pastePicture(a, "#40d0d0");
  await expect.poll(() => drawnImages(a).count()).toBe(1);
  const pending = a.waitForEvent("download");
  await exportPng(a);
  const { readFile } = await import("node:fs/promises");
  const png = await readFile(await (await pending).path());

  const b = await open(await browser.newContext(VIEWPORT), createRoomId());
  await add(b, "Rectangle (R)", "Existing", 100, 100);
  await b.getByLabel("Import file").setInputFiles({
    name: "canvas.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect.poll(() => drawnImages(b).count()).toBe(1);
  expect(errors).toEqual([]);
});
