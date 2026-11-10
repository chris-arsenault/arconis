import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { branchChildren, branchParent, focusClosure } from "../document/relations";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import {
  connectedClone,
  deleteKeepingChildren,
  insertParent,
  promote,
  reorderSibling,
  showLevels,
} from "./treeEdits";
import { neighbour } from "./walking";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

const TREE = `
  node root "Root" at 0,300
  root => node a "A"
  a => node a1 "A1"
  a => node a2 "A2"
  root => node b "B"
  tidy root
`;

describe("walking with the arrows", () => {
  it("walks a tree by structure and loose objects by direction", () => {
    const document = canvas(`${TREE}\nnode loose "Loose" at 900,300\nnode far "Far" at 900,900`);
    const items = document.list();
    const get = (id: string) => items.find((item) => item.id === id)!;
    expect(neighbour(items, get("root"), "right")?.id).toBe("a");
    expect(neighbour(items, get("a"), "left")?.id).toBe("root");
    expect(neighbour(items, get("a"), "down")?.id).toBe("b");
    expect(neighbour(items, get("b"), "up")?.id).toBe("a");
    expect(neighbour(items, get("a1"), "down")?.id).toBe("a2");
    expect(neighbour(items, get("loose"), "down")?.id).toBe("far");
    expect(neighbour(items, get("far"), "up")?.id).toBe("loose");
    expect(neighbour(items, get("far"), "right")).toBeNull();
  });
});

describe("editing a tree from the keyboard", () => {
  it("promotes a topic to its grandparent", () => {
    const document = canvas(TREE);
    expect(promote(document, "a1")).toBe(true);
    expect(branchParent(document.list(), "a1")).toBe("root");
    expect(promote(document, "a")).toBe(false);
  });

  it("inserts a parent between a topic and its own", () => {
    const document = canvas(TREE);
    const before = document.get("a")!;
    const inserted = insertParent(document, "a");
    const items = document.list();
    expect(branchParent(items, inserted)).toBe("root");
    expect(branchParent(items, "a")).toBe(inserted);
    expect(document.get(inserted)).toMatchObject({ x: before.x, y: before.y });
    expect(document.get("a")!.x).toBeGreaterThan(before.x);
    expect(document.get("a1")!.x).toBeGreaterThan(before.x + before.width);
  });

  it("deletes a topic while its branches move up and its contents stay", () => {
    const document = canvas(`${TREE}\nnote n "Held" in a`);
    expect(deleteKeepingChildren(document, "a")).toBe(true);
    const items = document.list();
    expect(items.some((item) => item.id === "a")).toBe(false);
    expect(branchChildren(items, "root").map((child) => child.id)).toEqual(
      expect.arrayContaining(["a1", "a2", "b"])
    );
    expect(document.get("n")!.inside).toBe("");
  });

  it("swaps a topic's subtree with the sibling after it, and back", () => {
    const document = canvas(TREE);
    const aBefore = document.get("a")!.y;
    const a1Before = document.get("a1")!.y;
    expect(reorderSibling(document, "a", 1)).toBe(true);
    expect(document.get("b")!.y).toBeLessThan(document.get("a")!.y);
    expect(document.get("a1")!.y - a1Before).toBe(document.get("a")!.y - aBefore);
    expect(reorderSibling(document, "a", -1)).toBe(true);
    expect(document.get("a")!.y).toBe(aBefore);
    expect(reorderSibling(document, "a", -1)).toBe(false);
  });

  it("grows a connected copy in a direction, as a branch in a tree and a line elsewhere", () => {
    const document = canvas(`${TREE}\nnode loose "Loose" at 900,300`);
    const copy = connectedClone(document, "b", "right");
    expect(branchParent(document.list(), copy)).toBe("b");
    expect(document.get(copy)!.x).toBeGreaterThan(document.get("b")!.x);
    const other = connectedClone(document, "loose", "down");
    const line = document.list().find((item) => item.type === "line" && item.to === other);
    expect(line?.from).toBe("loose");
    expect(document.get(other)!.y).toBeGreaterThan(300);
  });

  it("shows a number of levels by folding the deeper topics", () => {
    const document = canvas(TREE);
    showLevels(document, "root", 1);
    expect(document.get("a")!.collapsed).toBe(true);
    expect(document.get("root")!.collapsed).toBe(false);
    expect(document.get("b")!.collapsed).toBe(false);
    showLevels(document, "root", 2);
    expect(document.get("a")!.collapsed).toBe(false);
  });

  it("keeps a focused item's tree, contents, references and inner lines bright", () => {
    const document = canvas(
      `${TREE}\nnode loose "Loose" at 900,300\na ..> loose as ref\nnode off "Off" at 900,900`
    );
    const bright = focusClosure(document.list(), "a");
    for (const id of ["a", "a1", "a2", "loose", "ref"]) expect(bright.has(id), id).toBe(true);
    for (const id of ["root", "b", "off"]) expect(bright.has(id), id).toBe(false);
  });
});

it("creates a dragged connected copy at its final position in one undo step", () => {
  const document = canvas('note source "Source" at 0,0');
  const copy = connectedClone(document, "source", "right", { x: 500, y: 250 });
  expect(document.get(copy)).toMatchObject({ x: 500, y: 250 });
  expect(document.list()).toHaveLength(3);
  document.undo.undo();
  expect(document.list().map((item) => item.id)).toEqual(["source"]);
  document.undo.redo();
  expect(document.get(copy)).toMatchObject({ x: 500, y: 250 });
});
