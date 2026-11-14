import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, more, objectCount, open, row } from "./browserHarness";
import { openSettings } from "./browserHarness";

function paintedBox(page: Page, fill: string) {
  return page
    .getByTestId("canvas")
    .locator(`path[fill="${fill}"], rect[fill="${fill}"]`)
    .first()
    .evaluate((node: SVGGraphicsElement) => {
      // Ignore the invisible pointer-tolerance stroke around a painted shape.
      const box = node.getBBox();
      const matrix = node.getScreenCTM()!;
      const top = new DOMPoint(box.x, box.y).matrixTransform(matrix);
      const bottom = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
      return { x: top.x, y: top.y, width: bottom.x - top.x, height: bottom.y - top.y };
    });
}

async function checkCloudAttachment(page: Page) {
  const shape = await paintedBox(page, "#fff0ad");
  const strip = (await page.locator('.object-metadata[data-object-id="cloud"]').boundingBox())!;
  const gap = strip.y - shape.y - shape.height;
  expect(gap).toBeGreaterThanOrEqual(-1);
  expect(gap).toBeLessThanOrEqual(4);
  expect(Math.abs(strip.x + strip.width / 2 - shape.x - shape.width / 2)).toBeLessThanOrEqual(1);
}

async function setVisibility(page: Page, value: "Show" | "Selected" | "Hide") {
  await openSettings(page);
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings
    .getByRole("radiogroup", { name: "Indicators", exact: true })
    .getByRole("radio", { name: value, exact: true })
    .check();
  await settings.getByRole("button", { name: "Done", exact: true }).click();
}

async function clearCloudDetails(page: Page) {
  await page.getByLabel("Marker", { exact: true }).selectOption({ label: "None" });
  await page.getByRole("button", { name: "Remove tag edge", exact: true }).click();
  await page.getByRole("button", { name: "Remove reference to Application", exact: true }).click();
}

it("attaches comment, relationship and marker badges to a cloud's painted edge", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const room = createRoomId();
    const page = await open(context, room);
    await page.getByLabel("Import file").setInputFiles({
      name: "attached-details.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(`arconis 1
node cloud "TLS / WAF / Load\\nbalancer" cloud at 100,120 size 260,160 fill #fff0ad tags edge marker star
node app "Application" at 530,140 size 160,90
node clients "Clients" at 140,450 size 160,90
cloud ..> app as related
clients -> cloud as incoming
`),
    });
    await expect.poll(() => objectCount(page)).toBe(5);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await row(page, /^TLS/).click();
    await page.getByTestId("canvas").press("Shift+c");
    await page.getByLabel("Add a comment", { exact: true }).fill("Check the TLS boundary.");
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await page.getByRole("button", { name: "Close comments", exact: true }).click();
    const peer = await open(peerContext, room);
    const strip = page.locator('.object-metadata[data-object-id="cloud"]');
    await peer.getByRole("button", { name: /^1 open comment on TLS/ }).waitFor();
    for (const zoom of [100, 75, 125]) {
      await page.getByTestId("zoom-level").click();
      await page.getByLabel("Zoom multiplier", { exact: true }).fill(String(zoom / 100));
      await page.getByLabel("Zoom multiplier", { exact: true }).press("Enter");
      if (zoom === 100) await page.screenshot({ path: "test-results/attached-cloud-details.png" });
      await checkCloudAttachment(page);
    }
    await checkCloudAttachment(peer);
    await strip.getByRole("button", { name: /^Show 1 relationships/ }).click();
    await page
      .getByRole("list", { name: "Related items" })
      .filter({ hasText: "Application" })
      .waitFor();
    await strip.getByRole("button", { name: "Highlight Star", exact: true }).click();
    await page.getByRole("button", { name: "Close find", exact: true }).click();
    await strip.getByRole("button", { name: /^1 open comment on TLS/ }).click();
    await page
      .getByTestId("comment-modal")
      .getByText("Check the TLS boundary.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Close comments", exact: true }).click();
    await clearCloudDetails(page);
    await page.getByTestId("zoom-level").click();
    await page.getByLabel("Zoom multiplier", { exact: true }).fill("1");
    await page.getByLabel("Zoom multiplier", { exact: true }).press("Enter");
    await page.getByTestId("canvas").click({ position: { x: 800, y: 700 } });
    await expect.poll(() => strip.getByRole("button").count()).toBe(1);
    await checkCloudAttachment(page);
    await page.screenshot({ path: "test-results/attached-cloud-comment.png" });
    const area = (await page.getByTestId("canvas").boundingBox())!;
    await page.mouse.move(area.x + 750, area.y + 650);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(area.x + 790, area.y + 680, { steps: 6 });
    await checkCloudAttachment(page);
    await page.mouse.up({ button: "middle" });
    await checkCloudAttachment(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await peerContext.close();
  }
});

it("keeps attached badges and connected-copy handles clickable without reserving a metadata lane", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    await add(page, "Rectangle (R)", "Compact details", 260, 60);
    await page
      .getByRole("toolbar", { name: "Selection toolbar" })
      .getByRole("button", { name: "Fill #d9e9ff", exact: true })
      .click();
    await page
      .getByLabel("Add a tag", { exact: true })
      .fill("architecture-platform-runtime-contract, api");
    await page.getByLabel("Add a tag", { exact: true }).press("Enter");
    await page.getByLabel("Marker", { exact: true }).selectOption("star");
    const strip = (await page.getByTestId("object-metadata").boundingBox())!;
    const shape = await paintedBox(page, "#d9e9ff");
    expect(strip.y - shape.y - shape.height).toBeLessThanOrEqual(4);
    await page.screenshot({ path: "test-results/attached-rectangle-details.png" });
    const down = page.getByRole("button", { name: "Add a connected copy down", exact: true });
    const attachedDot = (await down.boundingBox())!;
    await setVisibility(page, "Hide");
    expect(await page.getByTestId("object-metadata").count()).toBe(0);
    expect((await down.boundingBox())!.y).toBeLessThan(attachedDot.y - 10);
    await setVisibility(page, "Show");
    for (const side of ["up", "right", "down", "left"]) {
      const dot = page.getByRole("button", { name: `Add a connected copy ${side}`, exact: true });
      expect(
        await dot.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          );
        })
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Add a connected copy down", exact: true }).click();
    await expect.poll(() => objectCount(page)).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

async function checkSavedSettingsOnPhone(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  expect(
    await settings
      .getByRole("radiogroup", { name: "Indicators", exact: true })
      .getByRole("radio", { name: "Selected", exact: true })
      .isChecked()
  ).toBe(true);
  const box = (await settings.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/indicator-settings-mobile.png" });
  await settings.getByRole("button", { name: "Done", exact: true }).click();
}

it("remembers one indicator visibility without changing a peer's view", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const room = createRoomId();
    const page = await open(context, room);
    await add(page, "Rectangle (R)", "Display preferences", 300, 250);
    await page.getByLabel("Add a tag", { exact: true }).fill("runtime");
    await page.getByLabel("Add a tag", { exact: true }).press("Enter");
    await page.getByLabel("Marker", { exact: true }).selectOption("star");
    await page.getByTestId("canvas").press("Shift+c");
    await page.getByLabel("Add a comment", { exact: true }).fill("Still available when hidden.");
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await page.getByRole("button", { name: "Close comments", exact: true }).click();
    const peer = await open(peerContext, room);
    await peer
      .getByRole("button", { name: "1 open comment on Display preferences", exact: true })
      .waitFor();
    const comments = page.getByRole("button", {
      name: "1 open comment on Display preferences",
      exact: true,
    });
    const marker = page.getByRole("button", { name: "Highlight Star", exact: true });
    const tags = page.getByRole("button", { name: "Highlight tag runtime", exact: true });
    await openSettings(page);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const indicators = settings.getByRole("radiogroup", { name: "Indicators", exact: true });
    await indicators.getByRole("radio", { name: "Show", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    expect(await indicators.getByRole("radio", { name: "Selected", exact: true }).isChecked()).toBe(
      true
    );
    await page.screenshot({ path: "test-results/indicator-settings-desktop.png" });
    await page.keyboard.press("Escape");
    await settings.waitFor({ state: "hidden" });
    expect(
      await page
        .getByRole("button", { name: "Settings", exact: true })
        .evaluate((node) => node === document.activeElement)
    ).toBe(true);
    expect(await comments.count()).toBe(1);
    expect(await marker.count()).toBe(1);
    expect(await tags.count()).toBe(1);
    await page.getByTestId("canvas").click({ position: { x: 850, y: 700 } });
    expect(await comments.count()).toBe(0);
    expect(await marker.count()).toBe(0);
    expect(await tags.count()).toBe(0);
    expect(
      await peer
        .getByRole("button", { name: "1 open comment on Display preferences", exact: true })
        .count()
    ).toBe(1);
    expect(await peer.getByRole("button", { name: "Highlight Star", exact: true }).count()).toBe(1);
    await row(page, "Display preferences").click();
    expect(await marker.count()).toBe(1);
    expect(await tags.textContent()).toBe("runtime");
    await page.reload();
    await row(page, "Display preferences").waitFor();
    expect(await comments.count()).toBe(0);
    expect(await marker.count()).toBe(0);
    expect(await tags.count()).toBe(0);
    await checkSavedSettingsOnPhone(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await peerContext.close();
  }
});

it("paints indicators with their object and raises them only while selected", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await open(context);
    await page.getByLabel("Import file").setInputFiles({
      name: "stacked-details.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(`arconis 1
node back "Behind" at 100,100 size 220,100 fill #d9e9ff tags runtime marker star
node front "In front" at 180,190 size 200,90 fill #ffd8d8
`),
    });
    await expect.poll(() => objectCount(page)).toBe(2);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    const marker = page.getByRole("button", { name: "Highlight Star", exact: true });
    const receivesPointer = () =>
      marker.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        );
      });
    await expect.poll(receivesPointer).toBe(false);
    await row(page, "Behind").click();
    await expect.poll(receivesPointer).toBe(true);
    await marker.click({ button: "right" });
    await expect.poll(() => row(page, /^Behind$/).count()).toBe(1);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "test-results/indicator-selected-stacking.png" });
    await page.getByTestId("canvas").click({ position: { x: 850, y: 700 } });
    await expect.poll(receivesPointer).toBe(false);
    await row(page, "Behind").click();
    await more(page, "Bring to front");
    await page.getByTestId("canvas").click({ position: { x: 850, y: 700 } });
    await expect.poll(receivesPointer).toBe(true);
    await row(page, "In front").click();
    await more(page, "Bring to front");
    await page.getByTestId("canvas").click({ position: { x: 850, y: 700 } });
    await expect.poll(receivesPointer).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
