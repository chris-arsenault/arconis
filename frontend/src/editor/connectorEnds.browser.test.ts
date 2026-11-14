import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { add, browser, errors, exported, open, row, selectConnector } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

const line = async (page: Page) => (await exported(page)).objects.find((item) => item.id === "l")!;

async function choose(page: Page, end: "Line start" | "Line end", head: string) {
  await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
  await page
    .getByRole("listbox", { name: end })
    .getByRole("option", { name: head, exact: true })
    .click();
}

it("sets each connector end's head on its own, swaps them and reverses the line", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "ends.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
node a "Customer" at 0,0 size 140,70
node b "Order" at 420,0 size 140,70
a -> b as l`),
  });
  await row(page, "Order").waitFor();
  await selectConnector(page);

  // Both ends carry heads, chosen independently from draw.io's kinds of end.
  await choose(page, "Line start", "Only one");
  await page.getByRole("button", { name: "Line end: Arrow", exact: true }).click();
  await page.screenshot({ path: "test-results/connector-ends-menu.png" });
  await page.getByRole("option", { name: "Zero or many", exact: true }).click();
  await expect
    .poll(async () => (await line(page)).look)
    .toMatchObject({ startArrow: "only-one", arrow: "zero-or-many" });
  await page.screenshot({ path: "test-results/connector-ends.png" });

  // No head is one of the choices.
  await choose(page, "Line end", "None");
  await expect.poll(async () => (await line(page)).look.arrow).toBe("none");
  await choose(page, "Line end", "Diamond");

  // Swapping trades the heads; the line stays attached the same way.
  await page.getByRole("button", { name: "Swap arrowheads", exact: true }).click();
  await expect
    .poll(async () => (await line(page)).look)
    .toMatchObject({ startArrow: "diamond", arrow: "only-one" });
  expect(await line(page)).toMatchObject({ from: "a", to: "b" });

  // Reversing turns the line around, so each head is now drawn at the other object.
  await page.getByRole("button", { name: "Reverse", exact: true }).click();
  await expect.poll(async () => (await line(page)).from).toBe("b");
  expect((await line(page)).look).toMatchObject({ startArrow: "diamond", arrow: "only-one" });
  expect(errors).toEqual([]);
  await context.close();
});

it("aligns text within a shape from Properties", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Aligned", 400, 300);
  const properties = page.locator(".inspector");
  await properties.getByRole("button", { name: "Align text left", exact: true }).click();
  await properties.getByRole("button", { name: "Align text to bottom", exact: true }).click();
  await expect
    .poll(async () => (await exported(page)).objects[0].look)
    .toMatchObject({ align: "left", valign: "bottom" });
  expect(
    await properties
      .getByRole("button", { name: "Align text left", exact: true })
      .getAttribute("aria-pressed")
  ).toBe("true");
  await page.screenshot({ path: "test-results/text-alignment.png" });
  expect(errors).toEqual([]);
  await context.close();
});
