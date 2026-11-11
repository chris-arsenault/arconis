import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, open, railPanel } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

/** What the one clock on the canvas reads. */
const reading = (page: Page) => page.getByTestId("canvas").locator("[data-clock]").textContent();
const seconds = (text: string | null) => {
  const [minutes, rest] = (text ?? "").split(":").map(Number);
  return minutes * 60 + rest;
};

it("places a timer that everyone sees count down, pause, reset and finish", async () => {
  const a = await browser.newContext(VIEWPORT);
  const b = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const page = await open(a, room);
  const peer = await open(b, room);

  // The Shapes panel places a five-minute timer, selected with its controls showing.
  await railPanel(page, "Shapes");
  await page.getByRole("button", { name: "Clock", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 500, y: 400 } });
  await expect.poll(() => reading(page)).toBe("5:00");
  await expect.poll(() => reading(peer)).toBe("5:00");
  const controls = page.getByRole("region", { name: "Clock", exact: true });

  // A typed length sets the timer; nonsense is refused and changes nothing.
  const length = controls.getByLabel("Timer length", { exact: true });
  await length.fill("soon");
  await length.press("Enter");
  expect(await length.getAttribute("aria-invalid")).toBe("true");
  await length.fill("1:00");
  await length.press("Enter");
  await expect.poll(() => reading(peer)).toBe("1:00");

  // Starting it runs it for both people; each browser counts for itself.
  const counting = { timeout: 5000 };
  await controls.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(async () => seconds(await reading(peer)), counting).toBeLessThan(60);
  await expect.poll(async () => seconds(await reading(page)), counting).toBeLessThan(60);
  const running = (await exported(page)).objects[0].clock!;
  expect(running).toMatchObject({ kind: "timer", duration: 60 });
  expect(running.started).toBeGreaterThan(0);

  // Pausing holds the same reading for both, and counting sends nothing more.
  await controls.getByRole("button", { name: "Pause", exact: true }).click();
  const held = await reading(page);
  await expect.poll(() => reading(peer)).toBe(held);
  await page.waitForTimeout(1200);
  expect(await reading(page)).toBe(held);
  expect(await reading(peer)).toBe(held);

  // A short timer runs out: it stops at zero and is marked finished for both.
  await length.fill("2");
  await length.press("Enter");
  await expect.poll(() => reading(peer)).toBe("0:02");
  await controls.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(() => reading(peer), { timeout: 8000 }).toBe("0:00");
  await expect
    .poll(() => peer.getByTestId("canvas").locator("[data-clock].clock-done").count())
    .toBe(1);
  await page.screenshot({ path: "test-results/clock.png" });
  // A timer that has run out offers Start again, which begins a fresh countdown.
  await controls.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(async () => seconds(await reading(peer)), counting).toBeGreaterThan(0);
  expect(await page.getByTestId("selection-count").textContent()).toBe("Clock");

  // Reset returns it to its length, stopped.
  await controls.getByRole("button", { name: "Reset", exact: true }).click();
  await expect.poll(() => reading(peer)).toBe("0:02");
  expect((await exported(page)).objects[0].clock).toEqual({
    kind: "timer",
    duration: 2,
    started: 0,
    elapsed: 0,
  });
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});

it("switches a clock between the time of day, a stopwatch and a timer, and restyles it", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await railPanel(page, "Shapes");
  await page.getByRole("button", { name: "Clock", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 500, y: 400 } });
  const controls = page.getByRole("region", { name: "Clock", exact: true });

  // A stopwatch counts up from zero once started, from the palette as well as the panel.
  await controls.getByRole("radio", { name: "Stopwatch", exact: true }).check();
  await expect.poll(() => reading(page)).toBe("0:00");
  await page.getByTestId("canvas").press("ControlOrMeta+k");
  await page.getByLabel("Search commands", { exact: true }).fill("Start the clock");
  await page.keyboard.press("Enter");
  await expect.poll(async () => seconds(await reading(page)), { timeout: 5000 }).toBeGreaterThan(0);
  await controls.getByRole("button", { name: "Pause", exact: true }).waitFor();

  // The time of day has nothing to start or reset.
  await controls.getByRole("radio", { name: "Clock", exact: true }).check();
  await expect.poll(() => reading(page)).toMatch(/^\d\d:\d\d:\d\d$/);
  expect(await controls.getByRole("button", { name: "Start", exact: true }).count()).toBe(0);
  expect(await controls.getByLabel("Timer length", { exact: true }).count()).toBe(0);

  // A look is ordinary appearance on the object.
  await controls.getByRole("button", { name: "Dark", exact: true }).click();
  await expect
    .poll(async () => (await exported(page)).objects[0].look)
    .toMatchObject({ fill: "#1f2433", textColor: "#ffffff" });
  expect((await exported(page)).text).toContain("clock time");
  expect(errors).toEqual([]);
  await context.close();
});
