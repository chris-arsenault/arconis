import { describe, expect, it } from "vitest";
import type { CanvasObject } from "./types";
import {
  LINE_ANCHOR,
  alignOffsets,
  anchorOf,
  branchChildren,
  branchDescendants,
  branchParent,
  branchPlacement,
  containedDescendants,
  distributeOffsets,
  movedWithContents,
  orphanedAnchors,
  referencesOf,
  remapStyle,
  tidyBranch,
  worldBounds,
} from "./relations";

function box(id: string, x = 0, y = 0, extras: Partial<CanvasObject> = {}): CanvasObject {
  return {
    id,
    kind: "rectangle",
    label: id,
    x,
    y,
    width: 100,
    height: 50,
    parent: "",
    source: "",
    target: "",
    points: "[]",
    order: 0,
    style: {},
    ...extras,
  };
}
const link = (source: string, target: string, relation = "branch") =>
  box(`${source}-${target}`, 0, 0, {
    kind: "connector",
    source,
    target,
    style: { relation },
  });

describe("trees", () => {
  it("finds parents, ordered children and all descendants", () => {
    const items = [
      box("root"),
      box("low", 200, 100),
      box("high", 200, 0),
      box("deep", 400, 0),
      link("root", "low"),
      link("root", "high"),
      link("high", "deep"),
    ];
    expect(branchChildren(items, "root").map((item) => item.id)).toEqual(["high", "low"]);
    expect(branchParent(items, "deep")).toBe("high");
    expect(branchParent(items, "root")).toBe("");
    expect(branchDescendants(items, "root").sort((a, b) => a.localeCompare(b))).toEqual([
      "deep",
      "high",
      "low",
    ]);
  });

  it("survives a cycle that concurrent edits created", () => {
    const items = [box("a"), box("b"), link("a", "b"), link("b", "a")];
    expect(branchDescendants(items, "a")).toEqual(["b"]);
    expect(tidyBranch(items, "a").has("a")).toBe(false);
  });

  it("ignores plain connectors and references when walking a tree", () => {
    const items = [box("a"), box("b"), box("c"), link("a", "b", "reference")];
    items.push(box("line", 0, 0, { kind: "connector", source: "a", target: "c" }));
    expect(branchChildren(items, "a")).toEqual([]);
  });

  it("places a new branch beyond its parent and below earlier children", () => {
    const parent = box("parent", 0, 100);
    const first = branchPlacement([parent], parent, { width: 100, height: 50 });
    expect(first.x).toBeGreaterThan(parent.x + parent.width);
    expect(first.y).toBe(100);
    const child = box("child", first.x, first.y);
    const items = [parent, child, link("parent", "child")];
    expect(branchPlacement(items, parent, { width: 100, height: 50 }).y).toBeGreaterThan(150);
  });

  it("keeps growing leftward on a branch that already goes left", () => {
    const root = box("root", 500, 0);
    const left = box("left", 200, 0);
    const placed = branchPlacement([root, left, link("root", "left")], left, {
      width: 100,
      height: 50,
    });
    expect(placed.towardLeft).toBe(true);
    expect(placed.x).toBeLessThan(left.x);
  });
});

describe("tidying", () => {
  const items = [
    box("root", 500, 200),
    box("right1", 700, 0),
    box("right2", 700, 50),
    box("rightDeep", 900, 0),
    box("left", 100, 100),
    link("root", "right1"),
    link("root", "right2"),
    link("right1", "rightDeep"),
    link("root", "left"),
  ];

  it("keeps the root still, each child on its side, and siblings apart", () => {
    const placed = tidyBranch(items, "root");
    expect(placed.has("root")).toBe(false);
    expect(placed.get("right1")!.x).toBeGreaterThan(600);
    expect(placed.get("left")!.x).toBeLessThan(500);
    expect(placed.get("rightDeep")!.x).toBeGreaterThan(placed.get("right1")!.x);
    expect(placed.get("right2")!.y).toBeGreaterThan(placed.get("right1")!.y + 50);
  });

  it("gives every peer the same layout, whatever order they hold objects in", () => {
    const reversed = [...items].reverse();
    expect([...tidyBranch(reversed, "root")].sort(([a], [b]) => a.localeCompare(b))).toEqual(
      [...tidyBranch(items, "root")].sort(([a], [b]) => a.localeCompare(b))
    );
  });
});

describe("references and lines", () => {
  it("lists references in both directions", () => {
    const items = [box("a"), box("b"), link("a", "b", "reference"), link("a", "b")];
    expect(referencesOf(items, "a")).toEqual([{ id: "a-b", other: "b", outgoing: true }]);
    expect(referencesOf(items, "b")[0]).toMatchObject({ other: "a", outgoing: false });
  });

  it("finds a line's anchor, and anything left behind when the line goes", () => {
    const anchor = box("dot", 0, 0, { style: { [LINE_ANCHOR]: "line" } });
    const held = box("held", 0, 0, { parent: "dot" });
    const line = box("line", 0, 0, { kind: "connector" });
    expect(anchorOf([anchor, line], "line")).toBe(anchor);
    expect(orphanedAnchors([anchor, held, line])).toEqual([]);
    expect(orphanedAnchors([anchor, held])).toEqual(["dot", "held"]);
  });

  it("rewrites an anchor's line when objects get new identifiers", () => {
    const ids = new Map([["old", "new"]]);
    expect(remapStyle({ [LINE_ANCHOR]: "old", fillColor: "red" }, ids)).toEqual({
      [LINE_ANCHOR]: "new",
      fillColor: "red",
    });
    expect(remapStyle({ fillColor: "red" }, ids)).toEqual({ fillColor: "red" });
    expect(remapStyle({ [LINE_ANCHOR]: "gone" }, ids)).toEqual({ [LINE_ANCHOR]: "" });
  });
});

describe("containment and bounds", () => {
  it("walks nesting at any depth", () => {
    const items = [box("a"), box("b", 0, 0, { parent: "a" }), box("c", 0, 0, { parent: "b" })];
    expect(containedDescendants(items, "a")).toEqual(["b", "c"]);
  });

  it("moves contents and drawings along with their parent", () => {
    const items = [
      box("a"),
      box("b", 5, 5, { parent: "a" }),
      box("s", 0, 0, { kind: "stroke", parent: "a", points: "[[1,1]]" }),
      box("other", 9, 9),
    ];
    expect(movedWithContents(items, "a", 10, 20)).toEqual([
      { id: "a", values: { x: 10, y: 20 } },
      { id: "b", values: { x: 15, y: 25 } },
      { id: "s", values: { points: "[[11,21]]" } },
    ]);
  });

  it("measures objects and drawings", () => {
    const items = [box("a", 10, 10), box("s", 0, 0, { kind: "stroke", points: "[[300,0],[0,5]]" })];
    expect(worldBounds(items)).toEqual({ x: 0, y: 0, width: 300, height: 60 });
    expect(worldBounds([])).toBeNull();
  });
});

describe("alignment", () => {
  const boxes = [box("a", 0, 0), box("b", 50, 100, { width: 200 }), box("c", 500, 40)];

  it.each([
    ["left", "c", { dx: -500, dy: 0 }],
    ["right", "a", { dx: 500, dy: 0 }],
    ["center", "a", { dx: 250, dy: 0 }],
    ["top", "b", { dx: 0, dy: -100 }],
    ["bottom", "a", { dx: 0, dy: 100 }],
    ["middle", "a", { dx: 0, dy: 50 }],
  ] as const)("aligns to the %s", (mode, id, expected) => {
    expect(alignOffsets(boxes, mode).get(id)).toEqual(expected);
  });

  it("evens gaps, leaving the ends in place", () => {
    const row = [box("a", 0), box("b", 150), box("c", 1000)];
    const offsets = distributeOffsets(row, "horizontal");
    expect(offsets.get("a")).toEqual({ dx: 0, dy: 0 });
    expect(offsets.get("c")).toEqual({ dx: 0, dy: 0 });
    expect(offsets.get("b")!.dx).toBe(500 - 150);
    const column = [box("a", 0, 0), box("b", 0, 20), box("c", 0, 200)];
    expect(distributeOffsets(column, "vertical").get("b")!.dy).toBe(100 - 20);
  });
});
