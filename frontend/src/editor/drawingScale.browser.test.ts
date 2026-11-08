import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { browser, errors, objectCount, open } from "./browserHarness";
import { createRoomId } from "../collaboration/room";
import type { Page } from "playwright";

function board() {
  const nodes = Array.from(
    { length: 1000 },
    (_, i) =>
      `node n${i} "Object ${i}" at ${(i % 40) * 180},${Math.floor(i / 40) * 110} size 150,80`
  );
  const paths = Array.from({ length: 1000 }, (_, i) => {
    const x = (i % 40) * 180,
      y = Math.floor(i / 40) * 110;
    const points = Array.from(
      { length: 100 },
      (_, p) => `${(x + p * 1.4).toFixed(2)},${(y + 45 + Math.sin(p / 4) * 35).toFixed(2)}`
    );
    return `drawing p${i} markup points ${points.join(" ")} line #6554c0 line-width 3`;
  });
  return Buffer.from(["arconis 1", ...nodes, ...paths].join("\n"));
}

async function pointerFrame(page: Page) {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="canvas"]')!;
    canvas.addEventListener(
      "pointerup",
      () => {
        canvas.dataset.pointerAt = String(performance.now());
      },
      { once: true, capture: true }
    );
  });
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.keyboard.press("p");
  await page.mouse.move(box.x + 250, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 450, box.y + 340, { steps: 12 });
  await page.mouse.up();
  return page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          resolve(
            performance.now() -
              Number(
                document.querySelector<HTMLElement>('[data-testid="canvas"]')!.dataset.pointerAt
              )
          );
        })
      )
  );
}

async function cameraSteps(page: Page) {
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    const started = performance.now();
    await page.mouse.wheel(i % 2 ? 60 : 0, i % 2 ? 0 : -60);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));
    samples.push(performance.now() - started);
  }
  return samples;
}

it("measures a mixed 1000-object, 1000-stroke board in two independent browsers without imposing runtime limits", async () => {
  const room = createRoomId(),
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, room);
  let started = performance.now();
  await page
    .getByLabel("Import file")
    .setInputFiles({ name: "drawing-scale.arconis", mimeType: "text/plain", buffer: board() });
  await expect.poll(() => objectCount(page), { timeout: 120000 }).toBe(2000);
  const importMs = performance.now() - started;
  started = performance.now();
  const other = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peer = await open(other, room);
  await expect.poll(() => objectCount(peer), { timeout: 120000 }).toBe(2000);
  const joinMs = performance.now() - started;
  const cameraMs = await cameraSteps(page);
  const pointerToFrameMs = await pointerFrame(page);
  started = performance.now();
  await expect.poll(() => objectCount(peer), { timeout: 30000 }).toBe(2001);
  const peerObservedMs = performance.now() - started;
  started = performance.now();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await pending;
  const pngMs = performance.now() - started;
  const heap = browser.browserType().name() === "chromium" ? await heapUsage(page) : null;
  const metrics = {
    browser: browser.browserType().name(),
    viewport: [1440, 1000],
    objects: 1000,
    strokes: 1000,
    pointsPerStroke: 100,
    importMs,
    joinMs,
    cameraMs,
    pointerToFrameMs,
    peerObservedMs,
    pngMs,
    heap,
  };
  await writeFile("test-results/drawing-performance.json", JSON.stringify(metrics, null, 2));
  console.log("Drawing measurements", metrics);
  expect(errors).toEqual([]);
  await context.close();
  await other.close();
}, 300000);

async function heapUsage(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    return await session.send("Runtime.getHeapUsage");
  } finally {
    await session.detach();
  }
}
