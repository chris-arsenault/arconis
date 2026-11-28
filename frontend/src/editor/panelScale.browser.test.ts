import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { connectAgent } from "./browserMcp";
import { browser, drag, exported, open, openSettings } from "./browserHarness";

it("shares a panel magnification and a physical cut between MCP and two browsers", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1600, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  const agent = await connectAgent();
  try {
    await agent.call("open_room", { room });
    expect(
      await agent.call("write", {
        statements: [
          'scale 12 represents 1 "in"',
          'part rail board stock "2x4" length "12.5 in"',
          'node overview "Rail" depicts rail face at 80,40',
          'frame detail "Shelf detail" at 100,200 size 900,450 { node closeup "Rail detail" depicts rail face at 130,250 }',
        ].join("\n"),
      })
    ).toContain("Done");
    await expect
      .poll(async () => (await exported(peer)).objects.find((v) => v.id === "closeup")?.width)
      .toBe(150);
    await page.getByTestId("canvas").click({ position: { x: 175, y: 272 } });
    const factor = page.getByRole("spinbutton", {
      name: "Panel drawing magnification",
      exact: true,
    });
    await factor.fill("4");
    await factor.press("Enter");
    await expect
      .poll(async () => (await exported(peer)).objects.find((v) => v.id === "closeup")?.width)
      .toBe(600);
    const read = () => agent.call("read", { items: ["closeup"] });
    expect(await read()).toContain("panel-scale 48 represents 1");
    expect(await read()).toContain("Cut · qty 1");
    // The enlarged board begins at world (220,400), with the camera translated by (60,60).
    await page.getByTestId("canvas").click({ position: { x: 320, y: 490 } });
    const width = page.getByRole("textbox", { name: "Object width", exact: true });
    expect(await width.inputValue()).toBe("12.5");
    await width.fill("13");
    await width.press("Enter");
    await expect
      .poll(async () => (await exported(peer)).objects.find((v) => v.id === "overview")?.width)
      .toBe(156);
    await expect.poll(read).toContain("size 624,168");
    expect(await read()).toContain("13 in × 3.5 in");
    await readDetailInMillimetres(peer);
    expect(await width.inputValue()).toBe("13");
    await measureShelfDetail(page);
    await expect
      .poll(async () => (await exported(peer)).objects.find((v) => v.id === "closeup")?.width)
      .toBe(312);
    await page.getByRole("button", { name: "Select (V)", exact: true }).click();
    await drag(page, 340, 490, 100, -320);
    await expect
      .poll(async () => (await exported(peer)).objects.find((v) => v.id === "closeup"))
      .toMatchObject({ inside: "", width: 156 });
    expect(await read()).toContain("Cut · qty 1");
  } finally {
    await agent.close();
    await page.context().close();
    await peer.context().close();
  }
});

async function readDetailInMillimetres(peer: Page) {
  await peer.getByTestId("canvas").click({ position: { x: 320, y: 490 } });
  await openSettings(peer);
  await peer.getByLabel("Display unit", { exact: true }).selectOption("mm");
  await peer.getByRole("button", { name: "Close settings", exact: true }).click();
  const zoom = peer.getByTestId("zoom-level");
  const before = await zoom.textContent();
  await peer.getByTestId("canvas").focus();
  await peer.keyboard.press("ControlOrMeta+=");
  await expect.poll(() => zoom.textContent()).not.toBe(before);
  expect(await peer.getByLabel("Object width", { exact: true }).inputValue()).toBe("330.2");
}

async function measureShelfDetail(page: Page) {
  await openSettings(page);
  await page.getByLabel("Fixed grid distance", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Set fixed grid", exact: true }).click();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.getByRole("button", { name: "Measure distance", exact: true }).click();
  const canvas = page.getByTestId("canvas");
  const point = (x: number) => canvas.click({ position: { x, y: 350 }, modifiers: ["Alt"] });
  await point(120);
  await point(400);
  const label = page.getByLabel("Measured distance", { exact: true });
  expect(await label.textContent()).toBe("280 u");
  expect(await label.isDisabled()).toBe(true);
  // Crossing into sheet space on the second click retains the first click's 48-unit interval.
  await canvas.click({ position: { x: 400, y: 350 } });
  await canvas.click({ position: { x: 131, y: 350 } });
  expect(await label.textContent()).toBe("288 u");
  await point(400);
  await point(448);
  expect(await label.textContent()).toBe("1 in");
  await label.click();
  const real = page.getByLabel("Real length of the measured line", { exact: true });
  await real.fill("2 in");
  await real.press("Enter");
  expect(await label.textContent()).toBe("2 in");
}
