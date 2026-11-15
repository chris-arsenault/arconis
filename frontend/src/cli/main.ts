import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { CANVAS_OPERATIONS, toolResult } from "../agents/operations";
import { FileActions } from "./actions";
import { serveLocalMcp } from "./mcp";

const HELP = `Arconis CLI — local .arconis editing through ordinary shell commands.
Requires Node 24+. No MCP setup, account, browser or server required.

node arconis.mjs --file diagram.arconis --create write --statements 'node api "API"'
node arconis.mjs --file diagram.arconis read
node arconis.mjs --file diagram.arconis write --statements-file change.canvas
node arconis.mjs --file diagram.arconis import_document --input other.arconis
node arconis.mjs --file diagram.arconis export_document --output copy.arconis
node arconis.mjs --file diagram.arconis session
node arconis.mjs --file diagram.arconis mcp  (optional stdio MCP)

Actions: ${CANVAS_OPERATIONS.map((action) => action.name).join(", ")}
Use --args '<JSON>' for action arguments (items, inside, area, topic, query, etc.).
session reads one JSON object per line: {"action":"write","args":{"statements":"node a"}}
Each session mutation commits before responding; undo is available within that session.
One-shot commands do not retain undo history. --json prints structured results.
Exports are readable copies. Local commands never upload your file.
`;

function options() {
  return parseArgs({
    allowPositionals: true,
    options: {
      file: { type: "string" },
      create: { type: "boolean" },
      args: { type: "string" },
      statements: { type: "string" },
      "statements-file": { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
}

async function session(actions: FileActions) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { action: string; args: unknown };
      if (typeof request.action !== "string") throw new Error("Expected {action, args}.");
      const value = await actions.call(request.action, request.args ?? {});
      process.stdout.write(`${JSON.stringify(toolResult(value))}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ isError: true, error: error instanceof Error ? error.message : String(error) })}\n`
      );
    }
  }
}

async function main() {
  const { values, positionals } = options();
  if (values.help || !positionals.length) {
    process.stdout.write(HELP);
    return;
  }
  if (positionals.length !== 1) throw new Error("Expected one action. Use --help.");
  const name = positionals[0];
  validateOptions(name, values);
  const actions = new FileActions();
  const cleanup = () => {
    void actions.close().finally(() => process.exit());
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
  let serving = false;
  try {
    if (values.file) await actions.open(values.file, values.create);
    if (name === "mcp") {
      await serveLocalMcp(actions);
      serving = true;
      return;
    }
    if (name === "session") {
      await session(actions);
      return;
    }
    const input = await argumentsFor(values);
    const result = await actions.call(name, input);
    if (toolResult(result).isError) process.exitCode = 1;
    await outputResult(actions, values, result);
  } finally {
    if (!serving) await actions.close();
  }
}

function validateOptions(name: string, values: ReturnType<typeof options>["values"]) {
  if (values.output && name !== "export_document")
    throw new Error("--output is only supported for export_document.");
  if (values.create && !values.file) throw new Error("--create requires --file.");
}

async function outputResult(
  actions: FileActions,
  values: ReturnType<typeof options>["values"],
  result: unknown
) {
  if (values.output) {
    await writeFile(values.output, await exportedContent(actions, result), { flag: "wx" });
  } else
    process.stdout.write(
      `${values.json || typeof result !== "string" ? JSON.stringify(result) : result}\n`
    );
}

async function exportedContent(actions: FileActions, first: unknown) {
  let chunk = first as { content: string; next_offset: number | null };
  const parts = [chunk.content];
  while (chunk.next_offset !== null) {
    chunk = (await actions.call("export_document", { offset: chunk.next_offset })) as typeof chunk;
    parts.push(chunk.content);
  }
  return parts.join("");
}

async function argumentsFor(values: ReturnType<typeof options>["values"]) {
  const parsed: unknown = values.args ? JSON.parse(values.args) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("--args must be a JSON object.");
  return {
    ...parsed,
    ...(values.statements ? { statements: values.statements } : {}),
    ...(values["statements-file"]
      ? { statements: await readFile(values["statements-file"], "utf8") }
      : {}),
    ...(values.input ? { content: await readFile(values.input, "utf8") } : {}),
  };
}

void main().catch((error: unknown) => {
  process.stderr.write(`Arconis: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
