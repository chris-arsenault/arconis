import { canonical } from "./project";
import type { Dataset } from "./dataset";
type Fields = Dataset["schema"]["fields"];
type Row = Dataset["items"][number];
export function cell(fields: Fields, name: string, value: string): [string, Row[string]] {
  if (!Object.hasOwn(fields, name)) throw new Error(`Unknown field: ${name}`);
  const cell = fields[name].type === "string" ? JSON.stringify(value) : value;
  return [name, JSON.parse(cell) as Row[string]];
}
function csvRows(content: string) {
  const token = /"(?:[^"]|"")*"|[^",\r\n]+|,|\r\n|[\r\n]/y;
  const rows: string[][] = [];
  let offset = 0;
  let line: string[] = [];
  let value = "";
  while (offset < content.length) {
    token.lastIndex = offset;
    const match = token.exec(content);
    if (!match) throw new Error("Invalid CSV.");
    const field = match[0];
    offset = token.lastIndex;
    if (field === ",") {
      line.push(value);
      value = "";
      continue;
    }
    if (field.startsWith("\n") || field.startsWith("\r")) {
      rows.push([...line, value]);
      line = [];
      value = "";
      continue;
    }
    value = field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field;
  }
  if (line.length || value) rows.push([...line, value]);
  return rows;
}
export function importRows(data: Dataset, content: string, format: string) {
  if (format === "jsonl")
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Row);
  if (format !== "csv") throw new Error("Use CSV or JSONL.");
  const [header, ...rows] = csvRows(content.replace(/^\uFEFF/, ""));
  if (!header || new Set(header).size !== header.length)
    throw new Error("CSV needs unique column headers.");
  return rows.map((values) => {
    if (values.length !== header.length) throw new Error("CSV columns do not match the header.");
    return Object.fromEntries(
      header.flatMap((name, i) =>
        values[i] === "" ? [] : [cell(data.schema.fields, name, values[i])]
      )
    );
  });
}
export function exportRows(data: Dataset, format: string) {
  if (format === "jsonl") return data.items.map((row) => JSON.stringify(row)).join("\n") + "\n";
  if (format !== "csv") throw new Error("Use CSV or JSONL.");
  const fields = Object.keys(data.schema.fields);
  const quote = (text: string) =>
    /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  return (
    [
      fields.map(quote).join(","),
      ...data.items.map((row) =>
        fields
          .map((field) => {
            return quote(valueText(row, field));
          })
          .join(",")
      ),
    ].join("\n") + "\n"
  );
}
function valueText(row: Row, field: string) {
  if (!Object.hasOwn(row, field)) return "";
  const value = row[field];
  return typeof value === "string" ? value : canonical(value).trimEnd();
}
