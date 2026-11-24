import { z } from "zod";
import { canonical } from "./project";

const cell = z.json();
export const fieldTypes = ["string", "integer", "number", "boolean", "array", "object"] as const;
const field = z.strictObject({
  type: z.enum(fieldTypes),
  description: z.string().optional(),
  allowed: z.array(cell).min(1).optional(),
});
export const datasetSchema = z.strictObject({
  schema: z.strictObject({ keys: z.array(z.string()).min(1), fields: z.record(z.string(), field) }),
  items: z.array(z.record(z.string(), cell)),
});
export type Dataset = z.infer<typeof datasetSchema>;
type Row = Dataset["items"][number];
type Cell = Row[string];

function matches(type: z.infer<typeof field>["type"], value: Cell) {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    default:
      return typeof value === type;
  }
}
export function rowKey(data: Dataset, row: Row) {
  const key = data.schema.keys.map((name) => (Object.hasOwn(row, name) ? row[name] : null));
  if (key.some((value) => value === "" || value === null)) throw new Error("Supply every row key.");
  return JSON.stringify(key);
}

function validateSchema(data: Dataset) {
  const { keys, fields } = data.schema;
  if (new Set(keys).size !== keys.length) throw new Error("Dataset keys must be unique.");
  for (const name of keys) {
    const type = Object.hasOwn(fields, name) ? fields[name].type : null;
    if (type !== "string" && type !== "integer")
      throw new Error(`Key ${name} must be a string or integer field.`);
  }
  for (const [name, spec] of Object.entries(fields)) {
    if (spec.allowed?.some((value) => !matches(spec.type, value)))
      throw new Error(`Invalid allowed values for ${name}.`);
  }
}

function validateRow(data: Dataset, row: Row) {
  for (const [name, value] of Object.entries(row)) {
    const field = Object.hasOwn(data.schema.fields, name) ? data.schema.fields[name] : null;
    if (!field || !matches(field.type, value)) throw new Error(`Invalid field or value: ${name}`);
    if (field.allowed && !field.allowed.some((choice) => canonical(choice) === canonical(value))) {
      throw new Error(`Invalid allowed value: ${name}`);
    }
  }
}

export function readDataset(body: string) {
  const data = datasetSchema.parse(JSON.parse(body) as unknown);
  validateSchema(data);
  const seen = new Set<string>();
  for (const row of data.items) {
    validateRow(data, row);
    const key = rowKey(data, row);
    if (seen.has(key)) throw new Error("Duplicate dataset key.");
    seen.add(key);
  }
  return data;
}

export function replaceSchema(body: string, schema: Dataset["schema"]) {
  return canonical(readDataset(canonical({ schema, items: readDataset(body).items })));
}

export function setRows(data: Dataset, changes: Row[]) {
  const rows = new Map(data.items.map((row) => [rowKey(data, row), row]));
  for (const change of changes) {
    const key = rowKey(data, change);
    const row = Object.fromEntries(
      Object.entries({ ...rows.get(key), ...change }).filter(([, value]) => value !== null)
    );
    for (const name of Object.keys(change)) {
      if (!Object.hasOwn(data.schema.fields, name)) throw new Error(`Unknown field: ${name}`);
    }
    validateRow(data, row);
    rows.set(key, row);
  }
  return canonical({ ...data, items: Array.from(rows.values()) });
}
export function readRows(
  data: Dataset,
  where: Row,
  missing: string[],
  columns: string[],
  offset: number,
  limit: number
) {
  for (const name of [...Object.keys(where), ...missing, ...columns]) {
    if (!Object.hasOwn(data.schema.fields, name)) throw new Error(`Unknown field: ${name}`);
  }
  const matches = data.items.filter(
    (row) =>
      Object.entries(where).every(([k, v]) => canonical(row[k]) === canonical(v)) &&
      missing.every((name) => !Object.hasOwn(row, name))
  );
  const result = matches.slice(offset, offset + limit);
  const names = new Set([...data.schema.keys, ...columns]);
  return {
    schema: data.schema,
    total: matches.length,
    items: columns.length
      ? result.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => names.has(k))))
      : result,
  };
}
