import { afterEach, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { importDocument } from "../files/canvasFile";
import { sectionForInsertion } from "../files/section";
import { parse } from "./parser";
import { printCanvas } from "./printer";
import { writeStatements } from "./writer";
import { LanguageSession } from "./session";

const documents: CanvasDocument[] = [];
afterEach(() => documents.splice(0).forEach((document) => document.destroy()));
function canvas(text = "") {
  const document = new CanvasDocument();
  documents.push(document);
  if (text) write(document, text);
  return document;
}
function write(document: CanvasDocument, text: string) {
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
}

it("adds unique path/anchor pairs, sorts them, removes exact pairs and clears without touching ordinary links", () => {
  const document = canvas(
    'node a source "src/z.ts" source "src/a.ts" anchor "Type" source "src/a.ts" anchor "Type" source "src/a.ts" anchor "Other" source "src/folder/" link "https://example.com"'
  );
  expect(document.get("a")?.sources).toEqual([
    { path: "src/a.ts", anchor: "Other" },
    { path: "src/a.ts", anchor: "Type" },
    { path: "src/folder/", anchor: "" },
    { path: "src/z.ts", anchor: "" },
  ]);
  write(document, 'edit a "Renamed" source "src/a.ts" anchor "Other" off');
  expect(document.get("a")?.sources).toHaveLength(3);
  write(document, "edit a source none");
  expect(document.get("a")).toMatchObject({ sources: [], link: "https://example.com" });
});

it("round trips references, keeps copies external to canvas id remapping, and changes only the edited line", () => {
  const source = canvas(
    'frame f at 0,0 size 600,400 { node a at 100,100 source "src/model.ts" anchor "a" }\nnode b at 800,0 source "src/model.ts" anchor "a"\na -> b as wire source "src/model.ts" anchor "a"'
  );
  const text = printCanvas(source);
  const restored = canvas();
  importDocument(restored, text);
  expect(printCanvas(restored)).toBe(text);
  expect(restored.list()).toEqual(source.list());
  write(restored, 'edit a source "src/model.ts" anchor "b"');
  const changed = printCanvas(restored).split("\n");
  expect(text.split("\n").filter((line, index) => line !== changed[index])).toHaveLength(1);
  const target = canvas("node a\nnode f\nnode b\nnode wire");
  const created = importDocument(target, text);
  for (const item of target.list().filter((item) => created.includes(item.id))) {
    if (item.type !== "frame")
      expect(item.sources).toEqual([{ path: "src/model.ts", anchor: "a" }]);
  }
  const section = canvas();
  importDocument(section, sectionForInsertion(text, section));
  expect(
    section
      .list()
      .filter((item) => item.type !== "frame")
      .every((item) => item.sources[0]?.anchor === "a")
  ).toBe(true);
});

it("refuses invalid metadata atomically while accepting nonexistent repository targets", () => {
  const document = canvas('node a source "not present/模块.ts" anchor "SomeType.member"');
  const before = printCanvas(document);
  for (const path of [
    "/home/person/code.ts",
    "../code.ts",
    "src/../code.ts",
    "C:/code.ts",
    "https://example.com/file",
    "src//code.ts",
    "src\\code.ts",
  ]) {
    expect(() => write(document, `edit a "Changed" source ${JSON.stringify(path)}`)).toThrow(
      "repository-relative"
    );
    expect(printCanvas(document)).toBe(before);
  }
  expect(() => write(document, 'style code source "src/code.ts"')).toThrow("only look");
  const session = new LanguageSession(document, "Agent");
  try {
    session.read();
    expect(session.write('edit a source "another.ts"')).toContain("Done");
    session.undoLast();
    expect(printCanvas(document)).toBe(before);
  } finally {
    session.destroy();
  }
});

it("opens older records without sources and ignores malformed peer entries without trusting source paths", () => {
  const document = canvas('node source "" at 0,0');
  const stored = document.items.get("source")!;
  stored.delete("sources");
  expect(document.get("source")?.sources).toEqual([]);
  stored.set("sources", [
    { path: "/etc/passwd", anchor: "" },
    { path: "src/good.ts", anchor: "" },
    null,
    { path: "src/no-anchor.ts" },
  ]);
  expect(document.get("source")?.sources).toEqual([{ path: "src/good.ts", anchor: "" }]);
  const copy = canvas();
  importDocument(copy, printCanvas(document));
  expect(copy.get("source")?.sources).toEqual(document.get("source")?.sources);
});
