import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import {
  add,
  browser,
  errors,
  fixture,
  objectCount,
  open,
  row,
  pastePicture,
  drawnPictures,
} from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const EMAIL = `ada-${Date.now()}@example.com`;
const SECRET = "Private roadmap";
const PHRASE = "a long enough phrase";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Account" });
const openAccount = (page: Page) => page.locator(".account-button").click();
const press = (page: Page, name: string) =>
  dialog(page).getByRole("button", { name, exact: true }).click();

const commit = (page: Page) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/workspaces/") &&
      response.request().method() === "POST" &&
      response.status() === 200
  );

/** Signs in through the sign-in page, and comes back to the same place. */
async function signIn(page: Page, email = EMAIL, ready = "Rectangle (R)") {
  const room = new URL(page.url()).hash;
  await openAccount(page);
  await press(page, "Sign in or create an account");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: ready, exact: true }).waitFor();
  await page.locator(".account-button").filter({ hasNotText: "Sign in" }).waitFor();
  expect(new URL(page.url()).hash).toBe(room);
  expect(new URL(page.url()).search).toBe("");
}

it("signs in, saves and reopens work, handles account failure, and signs out without losing local work", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  const peer = await open(await browser.newContext(VIEWPORT), room);
  await signIn(page);
  await openAccount(page);
  await dialog(page).getByText(EMAIL, { exact: true }).waitFor();
  await dialog(page).getByLabel("Your name", { exact: true }).fill("Ada Lovelace");
  await press(page, "Save name");
  await page.getByRole("button", { name: "Close account" }).click();

  // The account's name replaces whatever was typed, for everyone in the room.
  await peer.getByRole("button", { name: "Participants" }).hover();
  await expect.poll(() => peer.getByRole("tooltip").textContent()).toContain("Ada Lovelace");

  await add(page, "Rectangle (R)", SECRET, 300, 240);
  await page.getByRole("button", { name: "Save to my account", exact: true }).click();
  await page.getByRole("button", { name: "Save now", exact: true }).waitFor();

  // A new browser with no copy, and nobody else online, opens it from the account.
  await page.context().close();
  await peer.context().close();
  const elsewhere = await open(await browser.newContext(VIEWPORT), createRoomId());
  await signIn(elsewhere);
  await openAccount(elsewhere);
  fixture.stop();
  const startsBeforeRestore = fixture.starts;
  await dialog(elsewhere).locator(".workspace-open").click();
  await expect.poll(() => row(elsewhere, SECRET).count()).toBe(1);
  await expect.poll(() => fixture.starts).toBeGreaterThan(startsBeforeRestore);
  await elsewhere.getByTestId("connection-status").filter({ hasText: "Connected" }).waitFor();
  await expect.poll(() => new URL(elsewhere.url()).hash).toBe(`#room=${room}`);
  expect(await objectCount(elsewhere)).toBe(1);
  await checkLocalCopies(elsewhere);
  await elsewhere.context().close();
  expect(errors).toEqual([]);
}, 120_000);

/** Continues the saved-work journey using the restored browser and its existing account copy. */
async function checkLocalCopies(page: Page) {
  await page.getByRole("link", { name: "Arconis home", exact: true }).click();
  const work = page.getByRole("region", { name: "Saved work browser" }).first();
  await work.getByText("Private account copy", { exact: true }).waitFor();
  await work.getByRole("button", { name: /^Open local/ }).waitFor();
  await page.route("**/api/workspaces", (route) =>
    route.fulfill({ status: 503, json: { error: "Account is offline" } })
  );
  await page.reload();
  await work.getByRole("alert").getByText("Account is offline", { exact: true }).waitFor();
  await work.getByRole("button", { name: /^Open local/ }).click();
  await row(page, SECRET).waitFor();
  await page.unroute("**/api/workspaces");
  await openAccount(page);
  await dialog(page).getByRole("button", { name: "Delete Untitled canvas", exact: true }).click();
  await page.getByRole("button", { name: "Save to my account", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close account", exact: true }).click();
  await Promise.all([
    commit(page),
    page.getByRole("button", { name: "Save to my account", exact: true }).click(),
  ]);
  await openAccount(page);
  await press(page, "Sign out");
  await page.getByRole("button", { name: "Create a room", exact: true }).waitFor();
  expect(await work.getByText("Private account copy", { exact: true }).count()).toBe(0);
  await work.getByRole("button", { name: /^Open local/ }).waitFor();
  const retained = work.getByRole("listitem").filter({
    has: page.getByRole("button", { name: /^Open local/ }),
  });
  await retained.getByRole("button", { name: /^Remove local/ }).click();
  await expect.poll(() => work.getByRole("button", { name: /^Open local/ }).count()).toBe(0);
}

it("recovers an older saved copy into an independent room that a fresh peer can join", async () => {
  const context = await browser.newContext(VIEWPORT);
  const peerContext = await browser.newContext(VIEWPORT);
  try {
    const page = await open(context, createRoomId());
    await signIn(page, `history-${EMAIL}`);
    await add(page, "Rectangle (R)", "Before deletion", 300, 240);
    await pastePicture(page, "blue");
    await expect.poll(() => drawnPictures(page)).toBe(1);
    await Promise.all([
      commit(page),
      page.getByRole("button", { name: "Save to my account", exact: true }).click(),
    ]);
    const originalUrl = page.url();
    await page.getByTestId("canvas").click({ position: { x: 620, y: 440 } });
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await expect.poll(() => objectCount(page)).toBe(0);
    await Promise.all([
      commit(page),
      page.getByRole("button", { name: "Save now", exact: true }).click(),
    ]);
    await openAccount(page);
    await dialog(page)
      .getByRole("button", { name: /^History of / })
      .click();
    const history = dialog(page).getByRole("region", { name: "Saved-copy history", exact: true });
    await expect.poll(() => history.getByRole("button", { name: /^Recover / }).count()).toBe(2);
    await history
      .getByRole("button", { name: /^Recover / })
      .last()
      .click();
    await row(page, "Before deletion").waitFor();
    expect(page.url()).not.toBe(originalUrl);
    const roomId = new URL(page.url()).hash.slice("#room=".length);
    const peer = await open(peerContext, roomId);
    await row(peer, "Before deletion").waitFor();
    await expect.poll(() => drawnPictures(peer)).toBe(1);
    await page.goto(originalUrl);
    await page.getByRole("button", { name: "Rectangle (R)", exact: true }).waitFor();
    expect(await objectCount(page)).toBe(0);
  } finally {
    await context.close();
    await peerContext.close();
  }
}, 120_000);

it("inserts a private selection on another device without replacing the destination", async () => {
  const source = await open(await browser.newContext(VIEWPORT), createRoomId());
  const target = await open(await browser.newContext(VIEWPORT), createRoomId());
  try {
    const email = `layouts-${EMAIL}`;
    await signIn(source, email);
    await add(source, "Rectangle (R)", "Reusable idea", 300, 240);
    await pastePicture(source, "red");
    await expect.poll(() => drawnPictures(source)).toBe(1);
    await source.getByTestId("canvas").click({ position: { x: 620, y: 440 } });
    await source.keyboard.press("Control+a");
    await source.getByRole("button", { name: "My layouts", exact: true }).click();
    const library = (page: Page) => page.getByRole("dialog", { name: "My layouts", exact: true });
    await library(source).getByLabel("Layout name", { exact: true }).fill("Diagram");
    await library(source)
      .getByRole("button", { name: "Save selected layout", exact: true })
      .click();
    await library(source).getByRole("button", { name: "Insert Diagram", exact: true }).waitFor();
    await signIn(target, email);
    await target.getByLabel("Canvas title", { exact: true }).fill("Destination title");
    await target.getByLabel("Canvas title", { exact: true }).press("Enter");
    await add(target, "Sticky note (N)", "Keep me", 300, 240);
    await target.getByRole("button", { name: "My layouts", exact: true }).click();
    await library(target).getByRole("button", { name: "Insert Diagram", exact: true }).click();
    await row(target, "Reusable idea").waitFor();
    await expect.poll(() => drawnPictures(target)).toBe(1);
    expect(await objectCount(target)).toBe(3);
    expect(await target.getByLabel("Canvas title", { exact: true }).inputValue()).toBe(
      "Destination title"
    );
    await target.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => objectCount(target)).toBe(1);
    await row(target, "Keep me").waitFor();
    await target.getByRole("button", { name: "My layouts", exact: true }).click();
    await library(target)
      .getByLabel("Layout name for Diagram", { exact: true })
      .fill("Saved diagram");
    await library(target).getByRole("button", { name: "Rename layout", exact: true }).click();
    await library(target)
      .getByRole("button", { name: "Insert Saved diagram", exact: true })
      .waitFor();
    await library(target)
      .getByRole("button", { name: "Delete Saved diagram", exact: true })
      .click();
    await expect
      .poll(() =>
        library(target)
          .getByRole("button", { name: /^Insert / })
          .count()
      )
      .toBe(0);
  } finally {
    await source.context().close();
    await target.context().close();
  }
}, 120_000);

it("creates and saves a password room, then reopens it on another browser through the password gate", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.goto(new URL(page.url()).origin);
  await signIn(page, `locked-${EMAIL}`, "Create a password room");
  await page.getByRole("button", { name: "Create a password room", exact: true }).click();
  await page.getByLabel("Choose a password", { exact: true }).fill(PHRASE);
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await page.getByRole("dialog", { name: "Password required" }).waitFor({ state: "detached" });
  await add(page, "Rectangle (R)", SECRET, 300, 240);
  await page.getByRole("button", { name: "Save to my account", exact: true }).click();
  await page.getByRole("button", { name: "Save now", exact: true }).waitFor();
  await context.close();

  const elsewhere = await open(await browser.newContext(VIEWPORT), createRoomId());
  await signIn(elsewhere, `locked-${EMAIL}`);
  await openAccount(elsewhere);
  await dialog(elsewhere).locator(".workspace-open", { hasText: "Password room" }).click();
  await elsewhere.getByLabel("Room password", { exact: true }).fill(PHRASE);
  await elsewhere.getByRole("button", { name: "Open room", exact: true }).click();
  await expect.poll(() => row(elsewhere, SECRET).count()).toBe(1);
  expect(errors).toEqual([]);
}, 120_000);
