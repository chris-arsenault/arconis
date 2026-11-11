import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, objectCount } from "./browserHarness";

/** Pastes text the way the browser delivers a clipboard, since tests cannot read a real one. */
async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  }, text);
}

it("copies the selection as canvas language and pastes it at the pointer or in place", async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Origin", 300, 200);
  await add(page, "Sticky note (N)", "Second", 560, 200);
  const canvas = page.getByTestId("canvas");
  const before = (await exported(page)).objects;

  // Copy both, then paste under the pointer: two more objects, centred where the pointer is.
  await row(page, "Origin").click();
  await row(page, "Second").click({ modifiers: ["Shift"] });
  await canvas.press("ControlOrMeta+c");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^arconis 1\n/);
  expect(copied).toContain('"Origin"');
  await canvas.hover({ position: { x: 700, y: 700 } });
  await canvas.press("ControlOrMeta+v");
  await expect.poll(() => objectCount(page)).toBe(4);
  const pasted = (await exported(page)).objects.filter(
    (item) => !before.some((original) => original.id === item.id)
  );
  expect(pasted.map((item) => item.name).sort((a, b) => a.localeCompare(b))).toEqual([
    "Origin",
    "Second",
  ]);
  expect(Math.min(...pasted.map((item) => item.y))).toBeGreaterThan(before[0].y + 200);

  // Paste in place keeps the copied positions.
  await canvas.press("ControlOrMeta+Shift+v");
  await expect.poll(() => objectCount(page)).toBe(6);
  const inPlace = (await exported(page)).objects.filter(
    (item) => item.name === "Origin" && item.x === before[0].x && item.y === before[0].y
  );
  expect(inPlace).toHaveLength(2);

  // Plain text: one line becomes a text block; several lines ask, and notes come out in a row.
  await canvas.click({ position: { x: 40, y: 40 } });
  await canvas.hover({ position: { x: 700, y: 500 } });
  await pasteText(page, "Just a caption");
  await row(page, "Just a caption").waitFor();
  await pasteText(page, "milk\neggs\nbread");
  await page.getByRole("button", { name: "3 notes", exact: true }).click();
  await row(page, "eggs").waitFor();
  const notes = (await exported(page)).objects.filter((item) => item.type === "note");
  expect(notes.map((note) => note.name)).toEqual(expect.arrayContaining(["milk", "eggs", "bread"]));

  // An outline becomes a tree under the selected topic.
  await row(page, "Just a caption").click();
  await pasteText(page, "Research\n  Interviews\nBuild");
  await page.getByRole("button", { name: /Branches under/ }).click();
  await row(page, "Interviews").waitFor();
  const saved = (await exported(page)).objects;
  const caption = saved.find((item) => item.name === "Just a caption")!;
  const research = saved.find((item) => item.name === "Research")!;
  expect(
    saved.some(
      (item) => item.type === "branch" && item.from === caption.id && item.to === research.id
    )
  ).toBe(true);

  // Cut removes what it copied.
  await row(page, "bread").click();
  await canvas.press("ControlOrMeta+x");
  await expect.poll(() => row(page, "bread").count()).toBe(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"bread"');
  expect(errors).toEqual([]);
  await context.close();
});

it("pastes and imports other tools' diagrams and outlines as editable objects", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  const canvas = page.getByTestId("canvas");
  await canvas.hover({ position: { x: 700, y: 500 } });

  // A pasted Mermaid flowchart is offered first as the diagram it describes.
  await pasteText(page, "flowchart LR\n  A[Plan] -->|then| B{Ready?}\n  B --> C[(Store)]");
  const offer = page.getByRole("button", { name: "Mermaid diagram", exact: true });
  await offer.waitFor();
  expect(await offer.evaluate((button) => button === document.activeElement)).toBe(true);
  await offer.click();
  await row(page, "Ready?").waitFor();
  const pasted = (await exported(page)).objects;
  const plan = pasted.find((item) => item.name === "Plan")!;
  const ready = pasted.find((item) => item.name === "Ready?")!;
  expect(ready.stencil).toBe("decision");
  expect(pasted.find((item) => item.name === "Store")?.stencil).toBe("database");
  expect(
    pasted.find((item) => item.type === "line" && item.from === plan.id && item.to === ready.id)
      ?.name
  ).toBe("then");
  expect(plan.x).toBeLessThan(ready.x);
  // One undo takes the whole diagram back out.
  await canvas.press("ControlOrMeta+z");
  await expect.poll(() => objectCount(page)).toBe(0);

  // The same text can still be kept as plain text.
  await pasteText(page, "flowchart LR\n  A --> B");
  await page.getByRole("button", { name: "One text block", exact: true }).click();
  await expect.poll(() => objectCount(page)).toBe(1);

  // Import reads a D2 file by its name and an OPML outline by its content.
  await page.getByLabel("Import file").setInputFiles({
    name: "services.d2",
    mimeType: "text/plain",
    buffer: Buffer.from("web: Web app\nweb -> queue: enqueues\nqueue.shape: cylinder"),
  });
  await row(page, "Web app").waitFor();
  await page.getByLabel("Import file").setInputFiles({
    name: "trip.opml",
    mimeType: "text/xml",
    buffer: Buffer.from(
      '<opml version="2.0"><body><outline text="Trip"><outline text="Pack"/><outline text="Book"/></outline></body></opml>'
    ),
  });
  await row(page, "Pack").waitFor();
  const imported = (await exported(page)).objects;
  expect(imported.find((item) => item.name === "queue")?.stencil).toBe("database");
  expect(imported.some((item) => item.type === "line" && item.name === "enqueues")).toBe(true);
  expect(imported.filter((item) => item.type === "branch")).toHaveLength(2);

  // Text that is not a diagram this reads says so and adds nothing.
  await page.getByLabel("Import file").setInputFiles({
    name: "plan.mmd",
    mimeType: "text/plain",
    buffer: Buffer.from("gantt\n  title Plan"),
  });
  await page.getByText(/Only Mermaid flowcharts/).waitFor();
  expect((await exported(page)).objects).toHaveLength(imported.length);
  expect(errors).toEqual([]);
  await context.close();
});
