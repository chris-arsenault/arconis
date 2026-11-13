import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import {
  add,
  browser,
  dockPanel,
  errors,
  exported,
  open,
  row,
  selectConnector,
  setContextWheel,
} from "./browserHarness";

const desktop = { viewport: { width: 1440, height: 1000 } };

it("keeps custom-property drafts current with peers without untouched blur overwrites", async () => {
  const first = await browser.newContext(desktop);
  const second = await browser.newContext(desktop);
  const room = createRoomId();
  const a = await open(first, room);
  const b = await open(second, room);
  await add(a, "Rectangle (R)", "Service", 220, 200);
  await a.getByRole("tab", { name: "Data", exact: true }).click();
  await a.getByLabel("New property name", { exact: true }).fill("service owner");
  expect(
    await a.getByLabel("New property name", { exact: true }).getAttribute("aria-invalid")
  ).toBe("true");
  await a
    .getByText("Start with a letter or underscore; use letters, digits, underscores or hyphens.", {
      exact: true,
    })
    .waitFor();
  await a.getByLabel("New property name", { exact: true }).fill("owner");
  await a.getByLabel("New property value", { exact: true }).fill("Alice");
  await a.getByRole("button", { name: "Add property", exact: true }).click();
  await row(b, /^Service$/).click();
  await b.getByRole("tab", { name: "Data", exact: true }).click();
  const av = a.getByLabel("Value of owner", { exact: true });
  const bv = b.getByLabel("Value of owner", { exact: true });
  await bv.fill("Bob");
  await bv.press("Tab");
  await expect.poll(() => av.inputValue()).toBe("Bob");
  await av.focus();
  await av.press("Tab");
  expect((await exported(a)).objects[0].properties?.owner).toBe("Bob");
  await av.fill("My draft");
  await bv.fill("Carol");
  await bv.press("Tab");
  await expect
    .poll(() =>
      a
        .getByText(
          "Changed elsewhere to “Carol”. Enter applies your draft; Escape uses the latest."
        )
        .count()
    )
    .toBe(1);
  await av.press("Tab");
  expect((await exported(a)).objects[0].properties?.owner).toBe("Carol");
  await av.focus();
  await av.press("Escape");
  expect(await av.inputValue()).toBe("Carol");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("includes a pending capture idea and gives the context menu exclusive keyboard ownership", async () => {
  const context = await browser.newContext(desktop);
  const page = await open(context, createRoomId());
  await page.getByTestId("canvas").click({ position: { x: 150, y: 150 } });
  await page.keyboard.press("Shift+N");
  const input = page.getByLabel("Captured note", { exact: true });
  await input.fill("Root idea");
  await input.press("Enter");
  await input.fill("Pending idea");
  await page.getByRole("button", { name: "Make a tree", exact: true }).click();
  expect(
    (await exported(page)).objects
      .filter((item) => item.type === "note")
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(["Pending idea", "Root idea"]);
  expect(await page.getByRole("button", { name: "More", exact: true }).count()).toBe(0);
  await row(page, "Root idea").click({ button: "right" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  expect(await page.getByTestId("context-menu").count()).toBe(0);
  expect(await page.getByTestId("selection-count").textContent()).toBe("Sticky note");
  expect((await exported(page)).objects.length).toBe(3);
  await page.getByTestId("canvas").click({ button: "right", position: { x: 650, y: 620 } });
  await page.getByRole("menuitem", { name: /^Add note here/ }).waitFor();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  await context.close();
});

it("shows clipped content and actual fill samples, fits explicitly and undoes across peers", async () => {
  const first = await browser.newContext(desktop);
  const second = await browser.newContext(desktop);
  const room = createRoomId();
  const a = await open(first, room);
  const b = await open(second, room);
  const text =
    "Open questions\n- Who owns the integration and its deployment?\n- What happens when the provider times out?\n- How will the team recover the queued work?";
  await add(a, "Sticky note (N)", text, 230, 230);
  const before = (await exported(a)).objects[0];
  const indicator = a.getByRole("button", {
    name: "Fit clipped text: Open questions",
    exact: true,
  });
  await indicator.hover();
  await a.getByRole("tooltip").filter({ hasText: "queued work" }).waitFor();
  const swatch = a
    .getByRole("toolbar", { name: "Selection toolbar" })
    .getByLabel("Fill #fff0ad", { exact: true });
  expect(await swatch.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    "rgb(255, 240, 173)"
  );
  await indicator.click();
  await expect
    .poll(async () => (await exported(b)).objects[0]?.height)
    .toBeGreaterThan(before.height);
  await a.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await exported(b)).objects[0]?.height).toBe(before.height);
  expect((await exported(a)).objects[0].name).toBe(text);
  const label = (await row(a, /^Open questions/).boundingBox())!;
  await setContextWheel(a, true);
  await a.mouse.move(label.x + 35, label.y + 10);
  await a.mouse.down({ button: "right" });
  await a.mouse.move(label.x + 85, label.y - 40, { steps: 8 });
  await a.mouse.up({ button: "right" });
  await a.getByTestId("command-ring").waitFor();
  expect(await a.locator(".ring-wedge circle").count()).toBe(6);
  await a.getByRole("menuitem", { name: "Fill #ffd9da", exact: true }).click();
  await expect.poll(async () => (await exported(b)).objects[0]?.look.fill).toBe("#ffd9da");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

it("puts connector controls first and distinguishes incoming, outgoing and bidirectional lines", async () => {
  const context = await browser.newContext(desktop);
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Client", 170, 160);
  await add(page, "Rectangle (R)", "API", 500, 180);
  await page.getByRole("button", { name: "Connector: click two objects (C)", exact: true }).click();
  await row(page, /^Client$/).click();
  await row(page, /^API$/).click();
  await page.getByRole("tab", { name: "Arrange", exact: true }).click();
  await row(page, /^API$/).click();
  await page
    .getByRole("list", { name: "Related items" })
    .getByText("← From", { exact: true })
    .waitFor();
  await row(page, /^Client$/).click();
  await page
    .getByRole("list", { name: "Related items" })
    .getByText("→ To", { exact: true })
    .waitFor();
  await selectConnector(page);
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  const order = await page
    .getByLabel("Object properties", { exact: true })
    .locator(".inspector-primary, .rail-section")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(
    order.findIndex((text) => text?.includes("Connector") || text?.includes("Connection"))
  ).toBeLessThan(order.findIndex((text) => text?.includes("Tags and status")));
  await page.getByLabel("Connector start arrow", { exact: true }).selectOption("arrow");
  await row(page, /^API$/).click();
  await page.getByRole("tab", { name: "Arrange", exact: true }).click();
  await page
    .getByRole("list", { name: "Related items" })
    .getByText("↔ Both ways", { exact: true })
    .waitFor();
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps editing, File actions, participants and presentation reachable after live resize", async () => {
  const first = await browser.newContext(desktop);
  const second = await browser.newContext(desktop);
  const room = createRoomId();
  const page = await open(first, room);
  await open(second, room);
  await add(page, "Sticky note (N)", "Planning", 200, 150);
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      expect((await page.getByTestId("canvas").boundingBox())!.width).toBe(width - 64);
      await page.getByRole("button", { name: "Object properties", exact: true }).click();
      await page.getByRole("button", { name: "File", exact: true }).click();
      const item = page.getByRole("menuitem", { name: "Export document", exact: true });
      const hit = await item.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        );
      });
      expect(hit).toBe(true);
      await item.click();
      await page.getByRole("button", { name: "Close properties", exact: true }).click();
    }
  }
  await page.getByRole("button", { name: "Participants", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Participants", exact: true })
    .getByRole("button", { name: /^Follow / })
    .click();
  await page.getByTestId("following").waitFor();
  await page.getByRole("button", { name: "Stop following", exact: true }).click();
  await dockPanel(page, "Slides");
  await page.getByRole("button", { name: "Add slide", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 100, y: 280 } });
  await page.getByRole("button", { name: "Object properties", exact: true }).click();
  await page.getByRole("button", { name: "Add speaker notes", exact: true }).click();
  await page
    .getByLabel("Add speaker notes", { exact: true })
    .fill(
      Array.from(
        { length: 16 },
        (_, i) => `Speaker point ${i + 1}: explain the current planning decision.`
      ).join("\n")
    );
  await page.getByLabel("Add speaker notes", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Close speaker notes", exact: true }).click();
  await page.getByRole("button", { name: "Present from here", exact: true }).click();
  await page.getByRole("button", { name: "Speaker notes", exact: true }).click();
  expect((await page.getByTestId("canvas").boundingBox())!.width).toBe(390);
  await expect
    .poll(async () => {
      const mask = (await page.getByTestId("presenter-mask").boundingBox())!;
      const notes = (await page.getByTestId("presenter-notes").boundingBox())!;
      return mask.y + mask.height <= notes.y;
    })
    .toBe(true);
  await page.screenshot({ path: "test-results/workspace-usability-presenter-mobile.png" });
  await page.getByRole("button", { name: "Close speaker notes", exact: true }).click();
  await page.getByRole("button", { name: "Leave presentation", exact: true }).click();
  expect(await page.getByTestId("presenter").count()).toBe(0);
  await page.screenshot({ path: "test-results/workspace-usability-mobile.png" });
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
