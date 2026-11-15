import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { FileActions } from "./actions";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "arconis-file-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "diagram.arconis");
  const actions = new FileActions();
  cleanups.push(() => actions.close());
  await actions.open(path, true);
  return { path, actions };
}

it("persists shared canvas writes and undoes them in a foreground file session", async () => {
  const { path, actions } = await workspace();
  await actions.call("write", { statements: 'node a "First" at 10,20' });
  expect(await readFile(path, "utf8")).toContain('node a "First"');
  await actions.call("read");
  await actions.call("write", { statements: 'edit a "Second"' });
  expect(await readFile(path, "utf8")).toContain('node a "Second"');
  await actions.call("undo");
  expect(await readFile(path, "utf8")).toContain('node a "First"');
  const before = await readFile(path, "utf8");
  const refused = await actions.call("write", { statements: "bogus ???" });
  expect(refused).toContain("Nothing was changed");
  expect(await readFile(path, "utf8")).toBe(before);
});

it("refuses external revisions and concurrent cooperating sessions without overwriting", async () => {
  const { path, actions } = await workspace();
  await actions.call("write", { statements: "node a" });
  const other = new FileActions();
  await expect(other.open(path)).rejects.toThrow("active Arconis session");
  const outside = 'arconis 1\nnode external "External" at 0,0\n';
  await writeFile(path, outside);
  await expect(actions.call("write", { statements: "node b" })).rejects.toThrow("changed outside");
  expect(await readFile(path, "utf8")).toBe(outside);
  await actions.close();
  await other.open(path);
  expect(await other.call("read")).toContain("External");
  await other.close();
});

it("imports and exports portable content through shared operations, including undo", async () => {
  const { path, actions } = await workspace();
  await actions.call("write", { statements: "node retained" });
  await actions.call("import_document", {
    content: 'arconis 1\nnode imported "Imported" at 400,0\n',
  });
  expect(await readFile(path, "utf8")).toContain("node imported");
  expect(await actions.call("read")).not.toContain("Others changed");
  const exported = (await actions.call("export_document")) as { content: string };
  expect(exported.content).toBe(await readFile(path, "utf8"));
  await actions.call("undo");
  expect(await readFile(path, "utf8")).not.toContain("node imported");
});
