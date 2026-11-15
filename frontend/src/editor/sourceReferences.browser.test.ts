import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, objectCount, open, row } from "./browserHarness";

async function references(page: Page) {
  return (await exported(page)).objects.find((item) => item.id === "box")!.sources;
}

async function sourcePanel(page: Page) {
  await row(page, "Linked item").click();
  const panel = page.locator('details[aria-label="Source references"]');
  if (!(await panel.evaluate((element: HTMLDetailsElement) => element.open)))
    await panel.locator("summary").click();
}

async function addReference(page: Page, path: string, anchor: string) {
  await page.getByLabel("New source path", { exact: true }).fill(path);
  await page.getByLabel("New source anchor", { exact: true }).fill(anchor);
  await page.getByRole("button", { name: "Add source reference", exact: true }).click();
}

it("sets source metadata without accessing source files, collaborates, undoes and preserves it across reload/export/import", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const sourceRequests: string[] = [];
  first.on("request", (request) => {
    if (request.url().includes("repo-only/")) sourceRequests.push(request.url());
  });
  try {
    const room = createRoomId();
    const a = await open(first, room);
    const b = await open(second, room);
    await a.getByLabel("Import file").setInputFiles({
      name: "linked.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from('arconis 1\nnode box "Linked item" at 100,100\n'),
    });
    await expect.poll(() => objectCount(b)).toBe(1);
    await sourcePanel(a);
    await a.getByLabel("New source path", { exact: true }).fill("../outside.ts");
    expect(
      await a.getByRole("button", { name: "Add source reference", exact: true }).isDisabled()
    ).toBe(true);
    await addReference(a, "repo-only/a.ts", "A");
    await expect.poll(() => references(b)).toEqual([{ path: "repo-only/a.ts", anchor: "A" }]);
    await sourcePanel(b);
    expect(await b.getByLabel("Source path 1", { exact: true }).inputValue()).toBe(
      "repo-only/a.ts"
    );
    await addReference(a, "repo-only/z.ts", "Z");
    await expect.poll(() => references(b)).toHaveLength(2);
    await b.getByLabel("Source anchor 1", { exact: true }).fill("UpdatedA");
    await b.getByRole("button", { name: "Save source reference 1", exact: true }).click();
    const expected = [
      { path: "repo-only/a.ts", anchor: "UpdatedA" },
      { path: "repo-only/z.ts", anchor: "Z" },
    ];
    await expect.poll(() => references(a)).toEqual(expected);
    await a.getByRole("button", { name: "Remove source reference 2", exact: true }).click();
    await expect.poll(() => references(b)).toEqual(expected.slice(0, 1));
    await a.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => references(b)).toEqual(expected);
    const saved = await exported(a);
    expect(saved.text).toContain('source "repo-only/a.ts" anchor "UpdatedA"');
    await a.screenshot({ path: "test-results/source-reference-controls.png" });
    await a.reload();
    await row(a, "Linked item").waitFor();
    await expect.poll(() => references(a)).toEqual(expected);
    const copy = await open(second, createRoomId());
    await copy.getByLabel("Import file").setInputFiles({
      name: "copy.arconis",
      mimeType: "text/plain",
      buffer: Buffer.from(saved.text),
    });
    await expect.poll(() => objectCount(copy)).toBe(1);
    expect(await references(copy)).toEqual(expected);
    expect(sourceRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
