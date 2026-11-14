import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, objectCount, open, row } from "./browserHarness";

const viewport = { viewport: { width: 1440, height: 1000 } };

it("changes object type across peers and navigates property tabs and shallow menus by keyboard", async () => {
  const first = await browser.newContext(viewport);
  const second = await browser.newContext(viewport);
  try {
    const room = createRoomId();
    const page = await open(first, room);
    const peer = await open(second, room);
    await add(page, "Rectangle (R)", "Keep this object", 300, 200);
    await row(peer, "Keep this object").waitFor();
    const before = (await exported(page)).objects[0];
    await page.getByLabel("Object type", { exact: true }).selectOption("ellipse");
    await expect.poll(async () => (await exported(peer)).objects[0].stencil).toBe("ellipse");
    expect((await exported(peer)).objects[0]).toMatchObject({ id: before.id, name: before.name });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await exported(peer)).objects[0].stencil).toBe("rectangle");
    await page.getByRole("tab", { name: "Design", exact: true }).click();
    await page.getByRole("tab", { name: "Design", exact: true }).press("ArrowRight");
    expect(
      await page.getByRole("tab", { name: "Arrange", exact: true }).getAttribute("aria-selected")
    ).toBe("true");
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    await page.getByLabel("New property name", { exact: true }).fill("owner");
    await page.getByLabel("New property value", { exact: true }).fill("Team");
    await page.getByRole("button", { name: "Add property", exact: true }).click();
    await expect
      .poll(async () => (await exported(peer)).objects[0].properties)
      .toEqual({ owner: "Team" });
    await page.getByRole("tab", { name: "Design", exact: true }).click();
    expect(await page.getByRole("button", { name: "More", exact: true }).count()).toBe(0);
    await page.screenshot({ path: "test-results/organized-properties-desktop.png" });
    await row(page, "Keep this object").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Canvas menu", exact: true });
    expect(await menu.getByRole("menuitem").count()).toBeLessThanOrEqual(15);
    const arrange = menu.getByRole("menuitem", { name: "Arrange", exact: true });
    await arrange.press("ArrowRight");
    const submenu = page.getByRole("menu", { name: "Arrange", exact: true });
    await submenu.waitFor();
    const bounds = (await submenu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(canvas.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    await page.screenshot({ path: "test-results/organized-context-menu.png" });
    await page.keyboard.press("ArrowLeft");
    expect(await submenu.count()).toBe(0);
    expect(await arrange.evaluate((node) => document.activeElement === node)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await menu.count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});

it("creates a separate canvas without clearing the original and keeps File navigation usable on a narrow screen", async () => {
  const context = await browser.newContext(viewport);
  const peerContext = await browser.newContext(viewport);
  try {
    const room = createRoomId();
    const page = await open(context, room);
    const peer = await open(peerContext, room);
    await add(page, "Sticky note (N)", "Original canvas", 300, 200);
    await row(peer, "Original canvas").waitFor();
    const original = page.url();
    expect(await page.locator(".topbar .account-button").count()).toBe(1);
    expect(
      await page.getByRole("button", { name: "Create another room", exact: true }).count()
    ).toBe(0);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByText("A separate canvas; this one is kept", { exact: true }).waitFor();
    await page.getByRole("menuitem", { name: "New canvas", exact: true }).click();
    await expect.poll(() => page.url()).not.toBe(original);
    await expect.poll(() => objectCount(page)).toBe(0);
    await row(peer, "Original canvas").waitFor();
    await page.goBack();
    await row(page, "Original canvas").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "File", exact: true }).click();
    const menu = page.getByRole("menu", { name: "File", exact: true });
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "test-results/organized-file-menu-mobile.png" });
    await page.getByRole("menuitem", { name: "Join room…", exact: true }).click();
    await page.getByRole("dialog", { name: "Join a room", exact: true }).waitFor();
    await page.screenshot({ path: "test-results/organized-join-room-mobile.png" });
    const closeBounds = (await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .boundingBox())!;
    expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Close dialog", exact: true }).click();
    expect(page.url()).toBe(original);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await peerContext.close();
  }
});
