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

  // Comments open on the key into a modal above the object, here and for the peer.
  await a.getByTestId("canvas").press("Shift+c");
  await a.getByLabel("Add a comment", { exact: true }).fill("Is this <b>right</b>?");
  await a.keyboard.press("Enter");
  await expect.poll(() => row(a, /💬1/).count()).toBe(1);
  await expect.poll(() => row(b, /💬1/).count()).toBe(1);

  await row(b, "Payments").click();
  await b.getByTestId("canvas").press("Shift+c");
  await threads(b).getByText("Is this <b>right</b>?").waitFor();
  await b.getByLabel(/^Reply to /).fill("Yes");
  await b.keyboard.press("Enter");
  await threads(a).getByText("Yes", { exact: true }).waitFor();

  await a.getByRole("button", { name: "Resolve thread", exact: true }).click();
  await expect.poll(() => row(b, /💬/).count()).toBe(0);

  await a.reload();
  await row(a, "Payments").click();
  await a.getByTestId("canvas").press("Shift+c");
  // Resolved threads fold away until asked for.
  await a.getByTestId("comment-modal").getByRole("button", { name: "1 resolved" }).click();
  await threads(a).getByText("Yes", { exact: true }).waitFor();
  expect(errors).toEqual([]);
});
