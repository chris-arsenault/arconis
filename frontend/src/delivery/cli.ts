import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { cwd, stdin, stdout } from "node:process";
import { runDelivery, type Command } from "./actions";
import { argumentsOf, command, get, help, splitEdit, values, type Args } from "./commands";
import { datasetCommand } from "./datasetCli";
import { exportRows, importRows } from "./tableTransfer";
import { readDataset } from "./dataset";
import { fileSearch, searchDocuments } from "./search";
import { findDocument, linkArtifact } from "./fileActions";
import { fileActor, initLocal, projectRoot, withLocal } from "./local";
import { currentDocuments, type Actor, type Project } from "./project";
import { findItem } from "./workActions";
import { id } from "./work";
import { syncCli } from "./syncCli";

async function standardInput() {
  let data = "";
  for await (const chunk of stdin.setEncoding("utf8")) data += String(chunk);
  return data;
}

function importFile(a: Args): Promise<Command> {
  const path = a.words[2];
  if (!path) throw new Error("Supply a project-relative destination path.");
  const kind = get(a, "kind") ?? "design";
  const format = kind === "artifact" ? "base64" : "text";
  return readFile(get(a, "input") ?? path).then((bytes) => ({
    operation: "file_write",
    args: {
      path,
      kind,
      format,
      title: get(a, "title") ?? basename(path),
      tags: values(a, "tag"),
      body: bytes.toString(format === "base64" ? "base64" : "utf8"),
    },
  }));
}
async function runDataset(p: Project, actor: Actor, a: Args): Promise<unknown> {
  const [, action, target, input] = a.words;
  if (action !== "import" && action !== "export")
    return runDelivery(p, actor, datasetCommand(p, a));
  const doc = findDocument(p, target);
  const data = readDataset(doc.body ?? "");
  const format = get(a, "format") ?? extname(input ?? "").slice(1);
  if (action === "import") return importDataset(p, actor, target, input, format, data);
  const output = exportRows(data, format);
  if (!input || input === "-") return output;
  await writeFile(input, output, { flag: "wx" });
  return input;
}

async function importDataset(
  p: Project,
  actor: Actor,
  target: string,
  input: string,
  format: string,
  data: ReturnType<typeof readDataset>
) {
  const content = input && input !== "-" ? await readFile(input, "utf8") : await standardInput();
  return runDelivery(p, actor, {
    operation: "dataset_fill",
    args: { target, items: importRows(data, content, format) },
  });
}

function resultId(result: unknown) {
  if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string")
    throw new Error("No result was recorded.");
  return result.id;
}
async function attach(p: Project, actor: Actor, result: unknown, paths: string[]) {
  const id = resultId(result);
  for (const source of paths) {
    const name = basename(source);
    const doc = runDelivery(p, actor, {
      operation: "file_write",
      args: {
        kind: "artifact",
        format: "base64",
        title: name,
        tags: [],
        path: `evidence/${id}/${name}`,
        body: (await readFile(source)).toString("base64"),
      },
    });
    if (!doc || typeof doc !== "object" || !("document" in doc) || typeof doc.document !== "string")
      throw new Error("No artifact was recorded.");
    linkArtifact(p, actor, id, doc.document);
  }
}

async function execute(p: Project, actor: Actor, a: Args, focus: string) {
  if (a.words[0] === "dataset") return runDataset(p, actor, a);
  if (a.words[0] === "file" && a.words[1] === "search")
    return searchDocuments(
      currentDocuments(p),
      fileSearch.parse({
        query: a.words.slice(2).join(" "),
        tag: get(a, "tag"),
        limit: Number(get(a, "limit") ?? 20),
      })
    );
  if (a.words[0] === "file" && a.words[1] === "add")
    return runDelivery(p, actor, await importFile(a));
  const result = runDelivery(p, actor, command(a, focus));
  if (a.words[0] === "result" && values(a, "attach").length)
    await attach(p, actor, result, values(a, "attach"));
  return result;
}

function print(value: unknown, json: boolean) {
  if (typeof value === "string") {
    stdout.write(value.endsWith("\n") ? value : value + "\n");
    return;
  }
  if (
    !json &&
    Array.isArray(value) &&
    value.every((v) => v && typeof v === "object" && "title" in v && "status" in v)
  ) {
    for (const v of value as { number: number; title: string; status: string }[])
      stdout.write(`#${v.number}  [${v.status}] ${v.title}\n`);
    return;
  }
  stdout.write(JSON.stringify(value, null, 2) + "\n");
}
async function readFocus(path: string, project: Project) {
  const value = await readFile(path, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  });
  return value.trim() || project.root;
}
async function runLocal(root: string, actor: Actor, a: Args) {
  return withLocal(root, actor, async (project) => {
    const context = id.parse(
      get(a, "context") ?? process.env.ARCONIS_DELIVERY_CONTEXT ?? "default"
    );
    const selection = join(root, ".delivery-focus-" + context);
    const focus = await readFocus(selection, project);
    if (a.words[0] === "focus") {
      const item = findItem(project, a.words[1] ?? project.root);
      await writeFile(selection, item.id + "\n");
      return item;
    }
    if (a.words[0] !== "batch") return execute(project, actor, a, focus);
    const input = a.words[1] === "-" ? await standardInput() : a.words.slice(1).join(" ");
    const results = [];
    for (const line of input.split("\n").filter((line) => line.trim())) {
      const edit = argumentsOf(splitEdit(line));
      if (edit.words[0] === "dataset" && edit.words[1] === "export")
        throw new Error("Export outside a batch.");
      results.push(await execute(project, actor, edit, focus));
    }
    return results;
  });
}

export async function deliveryCli(argv: string[]) {
  const a = argumentsOf(argv);
  if (get(a, "help") || !a.words.length || a.words[0] === "help") {
    stdout.write(help);
    return;
  }
  const directory = get(a, "project") ?? cwd();
  const actor = fileActor();
  if (a.words[0] === "sync") {
    print(await syncCli(directory, actor, a.words[1]), true);
    return;
  }
  if (a.words[0] === "init") {
    const title = a.words[1];
    if (!title) throw new Error("Supply a project title.");
    print(await initLocal(resolve(directory), title, actor), true);
    return;
  }
  const root = await projectRoot(directory);
  print(await runLocal(root, actor, a), get(a, "json") === "true");
}
