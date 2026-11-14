import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const threads = (page: Page) => page.getByTestId("comment-thread");

it("shares a thread with peers, marks the object, and survives reload", async () => {
  const room = createRoomId();
  const a = await open(await browser.newContext(VIEWPORT), room);
  const b = await open(await browser.newContext(VIEWPORT), room);
  await add(a, "Rectangle (R)", "Payments", 300, 240);
  await expect.poll(() => row(b, "Payments").count()).toBe(1);
  const labelBefore = await row(a, "Payments").boundingBox();

  // Comments open on the key into a modal above the object, here and for the peer.
  await a.getByTestId("canvas").press("Shift+c");
  await a.getByLabel("Add a comment", { exact: true }).fill("Is this <b>right</b>?");
  await a.keyboard.press("Enter");
  await a.getByRole("button", { name: "1 open comment on Payments", exact: true }).waitFor();
  await b.getByRole("button", { name: "1 open comment on Payments", exact: true }).waitFor();
  expect(await row(a, "Payments").textContent()).toBe("Payments");
  expect(await row(a, "Payments").boundingBox()).toEqual(labelBefore);

  await row(b, "Payments").click();
  await b.getByTestId("canvas").press("Shift+c");
  await threads(b).getByText("Is this <b>right</b>?").waitFor();
  await threads(b)
    .getByRole("button", { name: /^Reply to thread by / })
    .click();
  await b.getByLabel(/^Reply to /).fill("Yes");
  await b.keyboard.press("Enter");
  await threads(a).getByText("Yes", { exact: true }).waitFor();
  const discussion = threads(a).first();
  const deletion = (await discussion
    .getByRole("button", { name: /^Delete comment by / })
    .first()
    .boundingBox())!;
  const resolution = (await discussion
    .getByRole("button", { name: "Resolve thread", exact: true })
    .boundingBox())!;
  const text = (await discussion
    .getByText("Is this <b>right</b>?", { exact: true })
    .boundingBox())!;
  expect(deletion.width).toBeLessThanOrEqual(32);
  expect(deletion.height).toBeLessThanOrEqual(32);
  expect(Math.abs(deletion.y - resolution.y)).toBeLessThanOrEqual(2);
  expect(deletion.x - (resolution.x + resolution.width)).toBeLessThanOrEqual(8);
  expect(text.y - (deletion.y + deletion.height)).toBeLessThanOrEqual(8);
  await a.screenshot({ path: "test-results/comments-thread-actions.png" });

  await a.getByRole("button", { name: "Resolve thread", exact: true }).click();
  await expect
    .poll(() => b.getByRole("button", { name: "1 open comment on Payments", exact: true }).count())
    .toBe(0);

  await a.reload();
  await row(a, "Payments").click();
  await a.getByTestId("canvas").press("Shift+c");
  // Resolved threads fold away until asked for.
  await a.getByTestId("comment-modal").getByRole("button", { name: "1 resolved" }).click();
  await threads(a).getByText("Yes", { exact: true }).waitFor();
  expect(errors).toEqual([]);
});

it("keeps long discussions scrollable while the composer and object context stay visible", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Architecture decision", 350, 240);
  await page.getByTestId("canvas").press("Shift+c");
  const modal = page.getByTestId("comment-modal");
  for (let index = 0; index < 3; index++) {
    await modal
      .getByLabel("Add a comment", { exact: true })
      .fill(`${index + 1}. ${"Review the boundary and the deployment implications. ".repeat(35)}`);
    await modal.getByRole("button", { name: "Post comment", exact: true }).click();
  }
  await expect.poll(() => threads(page).count()).toBe(3);
  const scroll = modal.locator(".comment-discussions");
  expect(await scroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  const before = (await modal.boundingBox())!;
  const composer = (await modal.getByLabel("Add a comment", { exact: true }).boundingBox())!;
  expect(composer.y).toBeGreaterThan(before.y);
  expect(composer.y + composer.height).toBeLessThan(before.y + before.height);
  await modal.getByText("Architecture decision", { exact: true }).waitFor();
  const area = (await page.getByTestId("canvas").boundingBox())!;
  expect(before.x).toBeGreaterThanOrEqual(area.x);
  expect(before.y + before.height).toBeLessThanOrEqual(area.y + area.height);
  await scroll.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await modal.getByLabel("Add a comment", { exact: true }).boundingBox()).toEqual(composer);
  await page.screenshot({ path: "test-results/comments-long-discussion.png" });
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps long tags and comment controls inside a narrow canvas without changing object text", async () => {
  const context = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Service", 60, 190);
  const before = await row(page, "Service").textContent();
  await page
    .getByLabel("Add a tag", { exact: true })
    .fill("architecture-platform-runtime-contract, api");
  await page.getByLabel("Add a tag", { exact: true }).press("Enter");
  await page.getByLabel("Marker", { exact: true }).selectOption("star");
  await page.getByRole("button", { name: "Close properties", exact: true }).click();
  const chrome = page.getByTestId("object-metadata");
  await chrome.waitFor();
  const bounds = (await chrome.boundingBox())!;
  const tag = (await chrome
    .getByRole("button", {
      name: "Highlight tag architecture-platform-runtime-contract",
      exact: true,
    })
    .boundingBox())!;
  expect(tag.x + tag.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(await row(page, "Service").textContent()).toBe(before);
  await page.getByTestId("canvas").press("Shift+c");
  const modal = page.getByTestId("comment-modal");
  await modal.getByLabel("Add a comment", { exact: true }).fill("Check this service contract.");
  await modal.getByRole("button", { name: "Post comment", exact: true }).click();
  const area = (await page.getByTestId("canvas").boundingBox())!;
  const discussion = (await modal.boundingBox())!;
  expect(discussion.x).toBeGreaterThanOrEqual(area.x);
  expect(discussion.x + discussion.width).toBeLessThanOrEqual(area.x + area.width);
  await page.screenshot({ path: "test-results/comments-narrow.png" });
  expect(errors).toEqual([]);
  await context.close();
});
