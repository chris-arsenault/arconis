import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { branchParent } from "../document/relations";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { indentUnderPrevious, outlineRows, treeRootOf, treeRoots } from "./outline";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

describe("the outline of a tree", () => {
  const document = canvas(`
    node root "Root" at 0,300
    root => node a "A"
    a => node a1 "A1"
    root => node b "B"
    node loose "Loose" at 900,900
    node other "Other" at 0,900
    other => node o1 "O1"
  `);

  it("lists rows in reading order with their depth, folding collapsed topics", () => {
    const items = document.list();
    expect(outlineRows(items, "root").map((row) => `${row.depth}:${row.item.id}`)).toEqual([
      "0:root",
      "1:a",
      "2:a1",
      "1:b",
    ]);
    expect(treeRootOf(items, "a1")).toBe("root");
    expect(treeRootOf(items, "loose")).toBe("loose");
    expect(treeRoots(items).map((root) => root.id)).toEqual(["root", "other"]);
    document.patch("a", { collapsed: true });
    expect(outlineRows(document.list(), "root").map((row) => row.item.id)).toEqual([
      "root",
      "a",
      "b",
    ]);
  });

  it("indents a topic under the sibling before it, expanding that sibling", () => {
    expect(indentUnderPrevious(document, "b")).toBe(true);
    const items = document.list();
    expect(branchParent(items, "b")).toBe("a");
    expect(document.get("a")!.collapsed).toBe(false);
    expect(indentUnderPrevious(document, "a")).toBe(false);
  });
});
