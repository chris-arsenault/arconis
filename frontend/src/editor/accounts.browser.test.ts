import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { UNACTIVATED_EMAIL } from "../collaboration/accountFixture";
import { add, browser, errors, fixture, objectCount, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const EMAIL = `ada-${Date.now()}@example.com`;
const SECRET = "Private roadmap";
const PHRASE = "a long enough phrase";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Account" });
const openAccount = (page: Page) => page.locator(".account-button").click();
const press = (page: Page, name: string) =>
  dialog(page).getByRole("button", { name, exact: true }).click();

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

/** The stored copy, as the bucket holds it. */
const storedCopy = () =>
  JSON.parse(String(fixture.savedObjects().at(-1))) as { contents?: string; sealed?: string };

it("signs in through Ahara's sign-in page, names the account, and saves a workspace", async () => {
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
  await expect
    .poll(() => peer.getByRole("button", { name: "Participants" }).getAttribute("title"))
    .toContain("Ada Lovelace");

  await add(page, "Rectangle (R)", SECRET, 300, 240);
  await page.getByRole("button", { name: "Save to my account", exact: true }).click();
  await page.getByRole("button", { name: "Save now", exact: true }).waitFor();
  expect(fixture.savedObjects().length).toBe(1);
  // An ordinary room is saved as it is.
  const inner = JSON.parse(Buffer.from(storedCopy().contents!, "base64").toString()) as {
    update: string;
  };
  expect(Buffer.from(inner.update, "base64").includes(SECRET)).toBe(true);

  // A new browser with no copy, and nobody else online, opens it from the account.
  const elsewhere = await open(await browser.newContext(VIEWPORT), createRoomId());
  await signIn(elsewhere);
  await openAccount(elsewhere);
  await dialog(elsewhere).locator(".workspace-open").click();
  await expect.poll(() => row(elsewhere, SECRET).count()).toBe(1);
  await expect.poll(() => new URL(elsewhere.url()).hash).toBe(`#room=${room}`);
  expect(await objectCount(elsewhere)).toBe(1);
  expect(errors).toEqual([]);
}, 120_000);

it("refuses an account that was never activated, and says how to activate it", async () => {
  const page = await open(await browser.newContext(VIEWPORT), createRoomId());
  await openAccount(page);
  await press(page, "Sign in or create an account");
  await page.getByLabel("Email", { exact: true }).fill(UNACTIVATED_EMAIL);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog(page)
    .getByRole("alert")
    .filter({ hasText: "Activate your Arconis account" })
    .waitFor();
  await dialog(page).getByRole("button", { name: "Sign in or create an account" }).waitFor();
  expect(errors).toEqual([]);
}, 60_000);

it("saves a password room sealed, and opening it elsewhere asks for the room's password", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.goto(new URL(page.url()).origin);
  await signIn(page, `locked-${EMAIL}`, "Create a password room");
  await page.getByRole("button", { name: "Create a password room", exact: true }).click();
  await page.getByLabel("Choose a password", { exact: true }).fill(PHRASE);
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await page.getByRole("dialog", { name: "Password required" }).waitFor({ state: "detached" });
  await add(page, "Rectangle (R)", SECRET, 300, 240);
  const saved = fixture.savedObjects().length;
  await page.getByRole("button", { name: "Save to my account", exact: true }).click();
  await page.getByRole("button", { name: "Save now", exact: true }).waitFor();
  expect(fixture.savedObjects().length).toBe(saved + 1);
  // Only the room's key opens it: nothing readable is stored.
  expect(storedCopy().contents).toBeUndefined();
  expect(typeof storedCopy().sealed).toBe("string");
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
