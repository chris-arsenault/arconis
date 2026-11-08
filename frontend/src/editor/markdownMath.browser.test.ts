import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { quote } from "../language/printer";
import { browser, errors, open, add, objectCount } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

it("keeps invalid equations editable and inserts display math from the source selection", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await add(page, "Sticky note (N)", "$\\frac{a}{$", 220, 170);
  const canvas = page.getByTestId("canvas");
  const source = page.getByLabel("Object text", { exact: true });
  expect(await source.inputValue()).toBe("$\\frac{a}{$");
  expect(await canvas.locator(".katex-error").textContent()).toContain("frac");
  await source.fill("\\frac{a}{b}");
  await source.press("ControlOrMeta+a");
  const inspector = page.getByRole("complementary", { name: "Object properties" });
  await inspector.getByText("Markdown tools", { exact: true }).click();
  await inspector.getByText("More", { exact: true }).click();
  await inspector.getByRole("button", { name: "Display equation", exact: true }).click();
  expect(await source.inputValue()).toBe("```math\n\\frac{a}{b}\n```\n");
  expect(await canvas.locator(".katex-display").count()).toBe(1);
  expect(await canvas.locator(".katex-error").count()).toBe(0);
  await source.press("ControlOrMeta+z");
  expect(await source.inputValue()).toBe("\\frac{a}{b}");
  expect(errors).toEqual([]);
  await context.close();
});

it("renders agent-authored Markdown and math during a presentation and reflects peer edits", async () => {
  const first = await browser.newContext(VIEWPORT);
  const second = await browser.newContext(VIEWPORT);
  const room = createRoomId();
  const a = await open(first, room);
  const markdown = "# Presented\n\n```rust\nfn main() {}\n```\n\n$$\nx^2\n$$";
  await a.getByLabel("Import file").setInputFiles({
    name: "math.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(
      `arconis 1\nslide s deck pitch 1 at 0,0 size 1280,720 {\ntext prose ${quote(markdown)} font serif at 80,80 size 600,500\n}\n`
    ),
  });
  await expect.poll(() => objectCount(a)).toBe(2);
  const b = await open(second, room);
  await b.getByTestId("canvas").locator("h1").dblclick();
  const peerSource = b.getByLabel("Edit canvas text", { exact: true });
  await peerSource.waitFor();
  await a.getByRole("button", { name: "Present pitch", exact: true }).click();
  await a.getByTestId("presenter").waitFor();
  expect(await a.getByTestId("canvas").locator(".katex-display").count()).toBe(1);
  expect(await a.getByTestId("canvas").locator("pre .hljs-keyword").count()).toBeGreaterThan(0);
  await peerSource.fill("# Peer update\n\n$y^2$");
  await peerSource.press("ControlOrMeta+Enter");
  await expect.poll(() => a.getByTestId("canvas").locator("h1").textContent()).toBe("Peer update");
  expect(await a.getByTestId("canvas").locator(".katex").count()).toBe(1);
  await a.keyboard.press("Escape");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
