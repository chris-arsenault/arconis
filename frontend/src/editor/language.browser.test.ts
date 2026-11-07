import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { createRoomId } from "../collaboration/room";
import { LanguageSession } from "../language/session";
import { printCanvas } from "../language/printer";
import { REFERENCE_DIAGRAM } from "../language/referenceDiagram";
import { browser, errors, objectCount, open } from "./browserHarness";

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
