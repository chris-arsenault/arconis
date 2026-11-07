import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, fixture, objectCount, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };
const EMAIL = `ada-${Date.now()}@example.com`;
const PHRASE = "a long enough phrase";
const SECRET = "Private roadmap";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Account" });
const openAccount = (page: Page) => page.locator(".account-button").click();
const fill = (page: Page, label: string, value: string) =>
  dialog(page).getByLabel(label, { exact: true }).fill(value);
const press = (page: Page, name: string) =>
  dialog(page).getByRole("button", { name, exact: true }).click();

async function signUp(page: Page) {
  await openAccount(page);
  await press(page, "Create an account");
  await fill(page, "Your name", "Ada Lovelace");
  await fill(page, "Email", EMAIL);
  await fill(page, "Password", PHRASE);
  await press(page, "Create account");
  await fill(page, "Activation code", "000000");
  await press(page, "Activate");
  await dialog(page).getByRole("alert").filter({ hasText: "Invalid code" }).waitFor();
  await fill(page, "Activation code", "123456");
  await press(page, "Activate");
}

async function signIn(page: Page) {
  await fill(page, "Email", EMAIL);
  await fill(page, "Password", PHRASE);
  await press(page, "Sign in");
  await dialog(page).getByText("Sign out", { exact: true }).waitFor();
}

it("signs up with email activation, shows the account's name, and saves a workspace encrypted", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(VIEWPORT), room);
  const peer = await open(await browser.newContext(VIEWPORT), room);
  await signUp(page);
  await signIn(page);
  await page.getByRole("button", { name: "Close account" }).click();

  // The account's name replaces whatever was typed, for everyone in the room.
  await expect
    .poll(() => peer.getByRole("button", { name: "Change your name" }).getAttribute("title"))
    .toContain("Ada Lovelace");

  await add(page, "Rectangle (R)", SECRET, 300, 240);
  await page.getByRole("button", { name: "Save to my account", exact: true }).click();
  await page.getByRole("button", { name: "Save now", exact: true }).waitFor();
  expect(fixture.savedObjects().length).toBe(1);
  expect(fixture.savedObjects()[0].includes(SECRET)).toBe(false);

  // A new browser with no copy, and nobody else online, opens it from the account.
  const elsewhere = await open(await browser.newContext(VIEWPORT), createRoomId());
  await openAccount(elsewhere);
  await signIn(elsewhere);
  await dialog(elsewhere).locator(".workspace-open").click();
  await expect.poll(() => row(elsewhere, SECRET).count()).toBe(1);
  await expect.poll(() => new URL(elsewhere.url()).hash).toBe(`#room=${room}`);
  expect(await objectCount(elsewhere)).toBe(1);
  expect(errors).toEqual([]);
}, 120_000);
