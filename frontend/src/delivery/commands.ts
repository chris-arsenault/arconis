import type { Command } from "./actions";
import { entryEdit, workEdit } from "./work";

export const help = `Arconis Delivery · offline design and work tracking

arconis delivery init "City design"
arconis delivery work add "District morphology" --outcome "Legible neighborhoods"
arconis delivery work read "District morphology"
arconis delivery work edit "District morphology" --next "Preserve the approved outline"
arconis delivery work status "District morphology" in_progress --note "Reviewing the catalog"\narconis delivery work move "District morphology" --after "Site survey"
arconis delivery focus "District morphology"
arconis delivery current
arconis delivery review
arconis delivery entry add boundary "Keep the stencil" --attribution user_requirement --target "District morphology"
arconis delivery result "District morphology" "First render" --attach ./city.png
arconis delivery feedback "District morphology" --accepted "Road layout" --remaining "Interior parks"
arconis delivery file add docs/city.md --kind design --title "City design"
arconis delivery file add docs/districts.dataset.json --kind dataset
arconis delivery file add docs/layout.arconis --kind diagram
arconis delivery file list --kind design --tag lore
arconis delivery file search "district coverage" --tag lore
arconis delivery file read docs/city.md --section "City outline"
arconis delivery file edit docs/city.md "City outline" "Keep the settled shape."
arconis delivery dataset define docs/inventory.dataset.json --key Name --field Name=string --field Draft=boolean
arconis delivery dataset set docs/inventory.dataset.json "Name=Grand bazaar" Draft=true
arconis delivery dataset read docs/inventory.dataset.json --where "Name=Grand bazaar"
arconis delivery link add "work:District morphology" 'docs/inventory.dataset.json#Grand bazaar' --purpose basis
arconis delivery link list docs/inventory.dataset.json
arconis delivery batch -   (one ordinary edit per line)
arconis sync [SERVER_PROJECT_URL]

Use --project DIR to select the project. Use --context NAME for independent focus.\nReads include live ancestor guidance.
Link the governing design sections, dataset rows and diagram objects at handoff.
Attach evidence to the result it evaluates. Use work history or file history to inspect earlier records.
`;

export interface Args {
  words: string[];
  flags: Map<string, string[]>;
}
const booleans = new Set(["json", "history", "retired", "help"]);
function optionValue(args: string[], index: number, key: string) {
  const supplied = args.at(index);
  if (!supplied || supplied.startsWith("--")) throw new Error(`--${key} requires a value.`);
  return supplied;
}
export function argumentsOf(args: string[]): Args {
  const words: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--next-row" || !arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const key = arg.slice(2, eq < 0 ? arg.length : eq);
    let value = "true";
    if (eq >= 0) value = arg.slice(eq + 1);
    else if (!booleans.has(key)) value = optionValue(args, ++i, key);
    flags.set(key, [...(flags.get(key) ?? []), value]);
  }
  return { words, flags };
}
export const values = (a: Args, k: string) => a.flags.get(k) ?? [];
export const get = (a: Args, k: string) => values(a, k).at(-1);
const need = (v: string | undefined, label: string) => {
  if (v === undefined || v === "") throw new Error(`Supply ${label}.`);
  return v;
};
const simple = (operation: string, args: Record<string, unknown> = {}): Command => ({
  operation,
  args,
});
const fieldName = (key: string) => key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
function fields(a: Args, schema: typeof workEdit | typeof entryEdit) {
  return Object.fromEntries(
    Array.from(a.flags).flatMap(([key, data]) => {
      const name = fieldName(key);
      if (!Object.hasOwn(schema.shape, name)) return [];
      const last = data.at(-1) ?? "";
      return [fieldPair(name, data, last)];
    })
  );
}
function fieldPair(
  name: string,
  data: string[],
  last: string
): [string, string | string[] | boolean | null] {
  if (["basis", "dependsOn", "followsUp", "successors", "anchors"].includes(name))
    return [name, data.flatMap((value) => value.split(","))];
  if (["retired", "provisional"].includes(name)) return [name, last === "true"];
  if (["parent", "answer", "goal", "illustrates", "result"].includes(name) && last === "none")
    return [name, null];
  return [name, last];
}
function work(a: Args, focus: string): Command {
  const [, action, first, second] = a.words;
  const target = first ?? focus;
  if (action === "list") return simple("work_list", { history: get(a, "history") === "true" });
  if (action === "read") return simple("work_read", { target });
  if (action === "history") return simple("work_history", { target: first });
  if (action === "add")
    return simple("work_add", {
      title: need(first, "a title"),
      parent: get(a, "under"),
      fields: fields(a, workEdit),
      from: values(a, "from"),
    });
  if (action === "status")
    return simple("work_edit", {
      target,
      fields: { status: need(second, "a status"), note: get(a, "note") },
    });
  if (action === "edit") return simple("work_edit", { target, fields: fields(a, workEdit) });
  if (action === "move") return simple("work_move", { target, after: get(a, "after") });
  throw new Error("Use work list, read, add, edit, status, move or history.");
}
function entry(a: Args, focus: string): Command {
  const [, action, first, second] = a.words;
  const target = get(a, "target") ?? focus;
  if (action === "add")
    return simple("entry_add", { target, kind: first, text: second, fields: fields(a, entryEdit) });
  if (action === "edit")
    return simple("entry_edit", { target, entry: first, fields: fields(a, entryEdit) });
  throw new Error("Use entry add or edit.");
}
function links(a: Args): Command {
  const [, action, from, to] = a.words;
  if (action === "list") return simple("link_list", { target: from });
  if (action === "add" || action === "remove")
    return simple(`link_${action}`, { from, to, purpose: get(a, "purpose") ?? "reference" });
  throw new Error("Use link add, list or remove.");
}
function files(a: Args): Command {
  const [, action, target, section, body] = a.words;
  if (action === "list") return simple("file_list", { kind: get(a, "kind"), tag: get(a, "tag") });
  if (action === "read") return simple("file_read", { target, section: get(a, "section") });
  if (action === "edit") return simple("design_edit", { target, section, body });
  if (action === "history" || action === "delete") return simple(`file_${action}`, { target });
  throw new Error("Use file add, list, search, read, edit, delete or history.");
}
export function command(a: Args, focus: string): Command {
  const [family] = a.words;
  if (family === "work") return work(a, focus);
  if (family === "entry") return entry(a, focus);
  if (family === "link") return links(a);
  if (family === "file") return files(a);
  return handoff(a, focus);
}

function handoff(a: Args, focus: string): Command {
  const [family, first, second] = a.words;
  if (family === "current" || family === "review")
    return simple("work_read", { target: first ?? focus, review: family === "review" });
  if (family === "result")
    return simple("result_add", { target: first ?? focus, observation: second });
  if (family === "feedback")
    return simple("review_add", {
      target: first ?? focus,
      result: get(a, "result"),
      accepted: get(a, "accepted"),
      remaining: get(a, "remaining"),
    });
  throw new Error("Use delivery --help to see commands.");
}
export function splitEdit(line: string) {
  const tokens: string[] = [];
  const word = /(?:[^\s'"]|"(?:[^"\\]|\\.)*"|'[^']*')+/y;
  let offset = 0;
  while (offset < line.length) {
    while (/\s/.test(line.charAt(offset)) && offset < line.length) offset++;
    if (offset === line.length) break;
    word.lastIndex = offset;
    const matched = word.exec(line);
    if (!matched) throw new Error("Unclosed quote in batch edit.");
    tokens.push(
      matched[0].replace(
        /"((?:[^"\\]|\\.)*)"|'([^']*)'/g,
        (_m, double: string | undefined, single: string | undefined) =>
          single ?? (double ?? "").replace(/\\(["\\])/g, "$1")
      )
    );
    offset = word.lastIndex;
  }
  return tokens;
}
