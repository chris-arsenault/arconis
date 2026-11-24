import type { Command } from "./actions";
import type { Project } from "./project";
import { cell } from "./tableTransfer";
import { fieldTypes, readDataset, type Dataset } from "./dataset";
import { findDocument } from "./fileActions";
import { get, values, type Args } from "./commands";

type Fields = Dataset["schema"]["fields"];
function pair(value: string) {
  const i = value.indexOf("=");
  if (i < 1) throw new Error("Use FIELD=VALUE.");
  return [value.slice(0, i), value.slice(i + 1)];
}
function row(fields: Fields, args: string[]) {
  return Object.fromEntries(
    args.map((arg) => {
      if (!arg.includes("=")) return [arg, null];
      const [k, v] = pair(arg);
      return cell(fields, k, v);
    })
  );
}
function define(a: Args, target: string): Command {
  const fields = Object.fromEntries(
    values(a, "field").map((spec) => {
      const [name, type] = pair(spec);
      if (!fieldTypes.includes(type as (typeof fieldTypes)[number]))
        throw new Error(`Unknown type: ${type}`);
      return [name, { type: type as (typeof fieldTypes)[number] }];
    })
  ) as Fields;
  for (const spec of values(a, "allow")) {
    const [name, value] = pair(spec);
    const [, parsed] = cell(fields, name, value);
    fields[name].allowed ??= [];
    fields[name].allowed.push(parsed);
  }
  for (const spec of values(a, "description")) {
    const [name, value] = pair(spec);
    if (!Object.hasOwn(fields, name)) throw new Error(`Unknown field: ${name}`);
    fields[name].description = value;
  }
  return {
    operation: "dataset_define",
    args: {
      path: target,
      title: get(a, "title") ?? target,
      tags: values(a, "tag"),
      schema: { keys: values(a, "key"), fields },
    },
  };
}
export function datasetCommand(project: Project, a: Args): Command {
  const [, action, target, ...cells] = a.words;
  if (!target) throw new Error("Supply the dataset path.");
  if (action === "define") return define(a, target);
  const doc = findDocument(project, target);
  if (doc.kind !== "dataset") throw new Error("Select a dataset.");
  const dataset = readDataset(doc.body ?? "");
  const fields = dataset.schema.fields;
  if (action === "set") return setCommand(target, fields, cells);
  return queryCommand(a, action, target, fields);
}
function queryCommand(a: Args, action: string, target: string, fields: Fields): Command {
  if (action === "read" || action === "schema")
    return {
      operation: "dataset_read",
      args: {
        target,
        where: row(fields, values(a, "where")),
        missing: values(a, "missing"),
        columns: values(a, "column"),
        offset: Number(get(a, "offset") ?? 0),
        limit: action === "schema" ? 0 : Number(get(a, "limit") ?? 25),
      },
    };
  throw new Error("Use dataset define, schema, read, set, import, or export.");
}

function setCommand(target: string, fields: Fields, cells: string[]): Command {
  const groups: string[][] = [[]];
  for (const value of cells) {
    if (value === "--next-row") groups.push([]);
    else groups.at(-1)?.push(value);
  }
  return {
    operation: "dataset_fill",
    args: { target, items: groups.map((group) => row(fields, group)) },
  };
}
