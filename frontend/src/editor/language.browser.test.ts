import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { createRoomId } from "../collaboration/room";
import { LanguageSession } from "../language/session";
import { printCanvas } from "../language/printer";
import { REFERENCE_DIAGRAM } from "../language/referenceDiagram";
import {
  browser,
  errors,
  exported,
  objectCount,
  open,
  row,
  selectConnector,
} from "./browserHarness";

const ARRANGED = `arconis 1
frame f "Steps" row gap 20 at 0,0 size 600,138 {
  node a "First" at 24,24 size 160,90
  node b "Second" at 204,24 size 160,90
  node c "Third" at 384,24 size 160,90
}
a -> c as hop around
`;

it("keeps a frame's row arranged as people drag its items", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "steps.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(ARRANGED),
  });
  await expect.poll(() => objectCount(page)).toBe(5);
  const first = (await row(page, "First").boundingBox())!;
  const third = (await row(page, "Third").boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width + 40, third.y + third.height / 2, { steps: 12 });
  await page.mouse.up();
  const order = async () => {
    const { objects } = await exported(page);
    return objects
      .filter((item) => item.inside === "f")
      .sort((left, right) => left.x - right.x)
      .map((item) => [item.name, item.x, item.y]);
  };
  // Below the frame's header, in the order they now sit.
  await expect.poll(order).toEqual([
    ["Second", 24, 40],
    ["Third", 204, 40],
    ["First", 384, 40],
  ]);
  await page.screenshot({ path: "test-results/arranged-row.png" });
  expect(errors).toEqual([]);
  await context.close();
});

it("routes a line around items on request, leaving ordinary points", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "walled.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
node a "Start" at 0,100 size 160,90
node wall "Wall" at 300,0 size 80,300
node b "End" at 520,100 size 160,90
a -> b as hop
`),
  });
  await expect.poll(() => objectCount(page)).toBe(4);
  await selectConnector(page);
  await page.getByRole("button", { name: "Route around items" }).click();
  const hop = async () => (await exported(page)).objects.find((item) => item.id === "hop")!;
  await expect.poll(async () => (await hop()).points.length).toBeGreaterThan(0);
  const line = await hop();
  expect(line.look.path).toBeUndefined();
  // Every corner is outside the wall, above or below it.
  expect(line.points.some(([, y]) => y < 0 || y > 300)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

it("renders an architecture written in the canvas language", async () => {
  const written = new CanvasDocument();
  new LanguageSession(written, "Agent").write(REFERENCE_DIAGRAM);
  const text = printCanvas(written);
  const count = written.list().length;
  written.destroy();
  const context = await browser.newContext({ viewport: { width: 2200, height: 1400 } });
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "reference.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
  await expect.poll(() => objectCount(page)).toBe(count);
  await page.getByText("Single View", { exact: true }).waitFor();
  await page.getByText("Amazon DynamoDB", { exact: true }).first().waitFor();
  await page.screenshot({ path: "test-results/reference-architecture.png" });
  expect(errors).toEqual([]);
  await context.close();
});
