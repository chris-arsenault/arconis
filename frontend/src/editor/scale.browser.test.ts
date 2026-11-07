import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, objectCount, open } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const OBJECTS = 3000;

it("stays usable with thousands of objects, including for someone joining late", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  await add(page, "Rectangle (R)", "Template", 100, 100);
  const saved = await exported(page);
  const template = saved.objects[0];
  const objects = Array.from({ length: OBJECTS }, (_, index) => ({
    ...template,
    id: `object-${index}`,
    label: `Object ${index}`,
    x: (index % 60) * 200,
    y: Math.floor(index / 60) * 120,
    order: index,
  }));
  await page.getByLabel("Import file").setInputFiles({
    name: "large.arconis",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "arconis", ...saved, objects })),
  });
  await expect.poll(() => objectCount(page), { timeout: 120_000 }).toBe(OBJECTS + 1);

  let started = performance.now();
  const joiner = await open(await browser.newContext(VIEWPORT), room);
  await expect.poll(() => objectCount(joiner), { timeout: 120_000 }).toBe(OBJECTS + 1);
  const joinTime = performance.now() - started;

  const bounds = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(bounds.x + 400, bounds.y + 300);
  const STEPS = 5;
  started = performance.now();
  for (let step = 0; step < STEPS; step++) {
    await page.mouse.wheel(0, step % 2 ? 100 : -100);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  const stepTime = (performance.now() - started) / STEPS;

  await add(joiner, "Sticky note (N)", "Edit at scale", 400, 300);
  await expect.poll(() => objectCount(page), { timeout: 30_000 }).toBe(OBJECTS + 2);

  // Loose bounds for headless software rendering, which catch a collapse rather than tune speed.
  expect(joinTime).toBeLessThan(60_000);
  expect(stepTime).toBeLessThan(1000);
  expect(errors).toEqual([]);
}, 300_000);
