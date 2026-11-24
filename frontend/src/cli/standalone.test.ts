import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";

const exec = promisify(execFile);
let root = "";
let bundle = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "arconis-standalone-"));
  bundle = join(root, "arconis.mjs");
  await build({
    entryPoints: [resolve("src/cli/main.ts")],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    outfile: bundle,
    logLevel: "silent",
  });
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

it("runs normal shell commands outside the repo without dependencies, registration or credentials", async () => {
  const path = join(root, "shell.arconis");
  const run = (...args: string[]) =>
    exec(process.execPath, [bundle, ...args], { cwd: root, env: { PATH: process.env.PATH } });
  expect((await run("--help")).stdout).toContain("No MCP setup");
  await run(
    "--file",
    path,
    "--create",
    "write",
    "--statements",
    'node api "Standalone" at 0,100 z -5 source "src/api.ts" anchor "API"\nnode earlier "Earlier" at 0,0 z 20 source "src/"'
  );
  expect((await run("--file", path, "read")).stdout).toContain("Standalone");
  const before = await readFile(path, "utf8");
  expect(before.indexOf("node earlier")).toBeLessThan(before.indexOf("node api"));
  expect(before).toContain('node api "Standalone" z -5');
  expect(before).toContain('source "src/api.ts" anchor "API"');
  expect((await run("--file", path, "read")).stdout).toContain('source "src/api.ts" anchor "API"');
  await run("--file", path, "write", "--statements", "edit api z -5");
  expect(await readFile(path, "utf8")).toBe(before);
  await expect(run("--file", path, "write", "--statements", "invalid ???")).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(before);
  const exported = join(root, "export.arconis");
  await run("--file", path, "export_document", "--output", exported);
  expect(await readFile(exported, "utf8")).toBe(before);
  expect((await run("list_stencils", "--args", '{"query":"aws lambda"}')).stdout).toContain("aws:");
});

it("offers the same canvas operations through optional stdio MCP and releases its lock", async () => {
  const path = join(root, "mcp.arconis");
  const client = new Client({ name: "local-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle, "mcp", "--file", path, "--create"],
    cwd: root,
    env: { PATH: process.env.PATH ?? "" },
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("import_document");
    const result = await client.callTool({
      name: "write",
      arguments: {
        statements:
          'node m "MCP" at 0,100 z -2 source "src/model.ts" anchor "Model"\nnode n at 0,0 z 5',
      },
    });
    expect(result.isError).toBe(false);
    expect(await readFile(path, "utf8")).toContain('node m "MCP"');
    const text = await readFile(path, "utf8");
    expect(text.indexOf("node n")).toBeLessThan(text.indexOf("node m"));
    expect(text).toContain('node m "MCP" z -2');
    expect(text).toContain('source "src/model.ts" anchor "Model"');
    await client.callTool({ name: "undo", arguments: {} });
    expect(await readFile(path, "utf8")).not.toContain("node m");
  } finally {
    await client.close();
  }
  await expect(readFile(`${path}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
});

it("carries a linked work handoff, screenshot and guidance to another offline directory", async () => {
  let project = join(root, "city");
  const run = (...args: string[]) =>
    exec(process.execPath, [bundle, "delivery", "--project", project, ...args], { cwd: root });
  await run("init", "City");
  await run(
    "entry",
    "add",
    "boundary",
    "Full district coverage",
    "--attribution",
    "user_requirement"
  );
  await writeFile(join(project, "layout.arconis"), 'arconis 1\nnode bazaar "Grand Bazaar"\n');
  await run(
    "file",
    "add",
    "layout.arconis",
    "--input",
    join(project, "layout.arconis"),
    "--kind",
    "diagram"
  );
  await run(
    "dataset",
    "define",
    "districts.dataset.json",
    "--key",
    "Name",
    "--field",
    "Name=string"
  );
  await run("dataset", "set", "districts.dataset.json", "Name=Grand Bazaar");
  await run(
    "work",
    "add",
    "Districts",
    "--from",
    "layout.arconis#bazaar",
    "--from",
    'districts.dataset.json#["Grand Bazaar"]'
  );
  await run("work", "status", "Districts", "in_progress");
  await run("focus", "Districts", "--context", "designer");
  expect((await run("current", "--context", "designer")).stdout).toContain(
    "Full district coverage"
  );
  await checkNumberedEntry(run);
  const before = await readFile(join(project, "delivery.json"), "utf8");
  await expect(
    run("batch", 'work edit Districts --next "Invalid batch"\nwork read Missing')
  ).rejects.toThrow();
  expect(await readFile(join(project, "delivery.json"), "utf8")).toBe(before);
  await writeFile(join(root, "comparison.png"), Buffer.from("fixture evidence"));
  await run("result", "Districts", "Site review", "--attach", join(root, "comparison.png"));
  await run("feedback", "Districts", "--accepted", "Roads", "--remaining", "Parks");
  const relocated = join(root, "relocated");
  await rename(project, relocated);
  project = relocated;
  expect((await run("link", "list", "layout.arconis#bazaar")).stdout).toContain("Districts");
  const view = (await run("review", "Districts")).stdout;
  expect(view).toContain('"accepted": "Roads"');
  expect(view).toContain('"remaining": "Parks"');
  expect(view).toContain("Full district coverage");
});
async function checkNumberedEntry(run: (...args: string[]) => Promise<{ stdout: string }>) {
  await run("entry", "add", "requirement", "Distinct neighborhoods", "--target", "Districts");
  await run(
    "entry",
    "add",
    "example",
    "Market ward",
    "--illustrates",
    "#2",
    "--target",
    "Districts"
  );
  const review = (await run("work", "read", "Districts")).stdout;
  expect(review).toContain("Distinct neighborhoods");
  expect(review).toContain("Market ward");
}
