import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { isPng, readCopy } from "../document/pngCopy";
import { add, browser, errors, exported, fixture, open, row } from "./browserHarness";
import { workspaceTools } from "./browserHarness";

it("sends guest feedback with diagnostics and no canvas content by default", async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const page = await open(context, room);
  const peer = await open(peerContext, room);
  await add(page, "Sticky note (N)", "Private content stays on the canvas", 250, 200);
  await workspaceTools(page);
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send feedback", exact: true });
  expect(
    await dialog.getByLabel("Include a screenshot of the canvas", { exact: true }).isChecked()
  ).toBe(false);
  expect(await peer.getByRole("dialog", { name: "Send feedback", exact: true }).count()).toBe(0);
  // Native dialog controls own clipboard keys, even when they are not text fields.
  await page.evaluate(() => navigator.clipboard.writeText("Outside the canvas"));
  const close = dialog.getByRole("button", { name: "Close feedback", exact: true });
  await close.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Outside the canvas");
  await close.press("ControlOrMeta+v");
  await dialog
    .getByLabel("What could be easier?", { exact: true })
    .fill("Finding the drawing tools was difficult.");
  await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
  await dialog.getByRole("status").waitFor();
  const report = fixture.feedback().find((record) => record.metadata.canvas.roomId === room)!;
  expect(report.message).toBe("Finding the drawing tools was difficult.");
  expect(report.screenshot).toBeNull();
  expect(fixture.feedbackScreenshot(report.id)).toBeUndefined();
  expect(report.metadata.canvas).toMatchObject({
    roomId: room,
    roomType: "ordinary",
    objects: 1,
    connection: "online",
    tool: "select",
  });
  expect(report.metadata.browser.viewport).toMatchObject({ width: 1440, height: 1000 });
  expect(report.metadata.browser.userAgent).toContain("Chrome");
  expect(report.metadata.revision.length).toBeGreaterThan(0);
  expect(report.metadata.page).not.toContain("#");
  expect(JSON.stringify(report)).not.toContain("Private content stays on the canvas");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Feedback", exact: true })
        .evaluate((node) => node === document.activeElement)
    )
    .toBe(true);
  expect((await exported(peer)).objects).toHaveLength(1);
  expect(errors).toEqual([]);
  await context.close();
  await peerContext.close();
});

it("uploads the standard whole-canvas PNG only with opt-in and preserves the form after an upload failure", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const page = await open(context, room);
  await add(page, "Rectangle (R)", "First object", 250, 200);
  await add(page, "Sticky note (N)", "Second object", 600, 250);
  await row(page, "First object").click();
  const zoom = await page.getByTestId("zoom-level").textContent();
  await workspaceTools(page);
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send feedback", exact: true });
  const message = dialog.getByLabel("What could be easier?", { exact: true });
  await message.fill("The selection controls overlap the label.");
  await dialog.getByLabel("Include a screenshot of the canvas", { exact: true }).check();
  await page.route("**/feedback-upload/*", (route) =>
    route.fulfill({
      status: 503,
      body: "Upload unavailable",
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  expect(await message.inputValue()).toBe("The selection controls overlap the label.");
  expect(
    fixture.feedback().filter((record) => record.metadata.canvas.roomId === room)
  ).toHaveLength(0);
  await page.unroute("**/feedback-upload/*");
  await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
  await dialog.getByRole("status").waitFor();
  const report = fixture.feedback().find((record) => record.metadata.canvas.roomId === room)!;
  expect(report.screenshot?.id).toBe(report.id);
  expect(report.metadata.canvas.selected).toBe(1);
  const png = fixture.feedbackScreenshot(report.id)!;
  expect(isPng(png)).toBe(true);
  const copy = await readCopy(png);
  expect(copy).toContain("First object");
  expect(copy).toContain("Second object");
  expect(await page.getByTestId("zoom-level").textContent()).toBe(zoom);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await workspaceTools(page);
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  expect(
    await dialog.getByLabel("Include a screenshot of the canvas", { exact: true }).isChecked()
  ).toBe(false);
  await page.keyboard.press("Escape");
  await expect.poll(() => dialog.count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});
