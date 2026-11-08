import { describe, expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { LOCAL } from "./types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { balancedSides, layoutTree } from "./treeLayout";
import { branchNumbers } from "./relations";
import { layeredLayout } from "../editor/graphLayout";
import { tidyGrid } from "../editor/layoutCommands";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

const TREE = `
  node root "Root" at 0,300
  root => node b "Bravo"
  root => node a "Alpha"
  a => node a1 "A1"
  a => node a2 "A2"
`;

describe("laying out a tree", () => {
  it("puts every branch on one side, or beneath, normally or compactly", () => {
    const items = canvas(TREE).list();
    const get = (id: string) => items.find((item) => item.id === id)!;
    const right = layoutTree(items, "root", { direction: "right", compact: false, sorted: false });
    expect(right.get("a")!.x).toBeGreaterThan(get("root").x + get("root").width);
    expect(right.get("a1")!.x).toBeGreaterThan(right.get("a")!.x);
    const left = layoutTree(items, "root", { direction: "left", compact: false, sorted: false });
    expect(left.get("a")!.x + get("a").width).toBeLessThan(get("root").x);
    const down = layoutTree(items, "root", { direction: "down", compact: false, sorted: false });
    expect(down.get("a")!.y).toBeGreaterThan(get("root").y + get("root").height);
    expect(down.get("a1")!.y).toBeGreaterThan(down.get("a")!.y);
    expect(down.get("a1")!.x).toBeLessThan(down.get("a2")!.x);
    const compact = layoutTree(items, "root", { direction: "right", compact: true, sorted: false });
    expect(compact.get("a")!.x).toBeLessThan(right.get("a")!.x);
  });

  it("sorts branches by name when asked and balances them across both sides", () => {
    const items = canvas(TREE).list();
    const sorted = layoutTree(items, "root", { direction: "right", compact: false, sorted: true });
    expect(sorted.get("a")!.y).toBeLessThan(sorted.get("b")!.y);
    const unsorted = layoutTree(items, "root", {
      direction: "right",
      compact: false,
      sorted: false,
    });
    expect(unsorted.get("b")!.y).toBeLessThan(unsorted.get("a")!.y);
    const sides = balancedSides(items, "root");
    const root = items.find((item) => item.id === "root")!;
    const [first, second] = ["b", "a"].map((id) => sides.get(id)!);
    expect(first.x).toBeGreaterThan(root.x);
    expect(second.x).toBeLessThan(root.x);
  });

  it("reads tidy's direction, compact and sorted in the language", () => {
    const document = canvas(`${TREE}\ntidy root down sorted`);
    const get = (id: string) => document.get(id)!;
    expect(get("a").y).toBeGreaterThan(get("root").y);
    expect(get("a").x).toBeLessThan(get("b").x);
    expect(() => canvas(`${TREE}\ntidy root sideways`)).toThrow(/sides\|right\|left\|down/);
  });

  it("numbers branches under a numbered topic in the order they sit", () => {
    const document = canvas(`${TREE}\nedit root numbered\ntidy root right sorted`);
    const numbers = branchNumbers(document.list());
    expect(numbers.get("a")).toBe("1");
    expect(numbers.get("a1")).toBe("1.1");
    expect(numbers.get("a2")).toBe("1.2");
    expect(numbers.get("b")).toBe("2");
    expect(numbers.has("root")).toBe(false);
  });
});

describe("laying out loose objects and graphs", () => {
  it("tidies a selection into a grid in reading order", () => {
    const document = canvas(`
      node a "A" at 0,0
      node b "B" at 900,10
      node c "C" at 400,500
      node d "D" at 20,900
    `);
    tidyGrid(document, ["a", "b", "c", "d"]);
    const get = (id: string) => document.get(id)!;
    expect(get("a").y).toBe(get("b").y);
    expect(get("b").x).toBeGreaterThan(get("a").x);
    expect(get("c").y).toBeGreaterThan(get("a").y);
    expect(get("c").x).toBe(get("a").x);
    expect(get("d").x).toBe(get("b").x);
  });

  it("layers a connected graph left to right along its lines", () => {
    const document = canvas(`
      node a "A" at 0,0
      node b "B" at 0,200
      node c "C" at 0,400
      a -> b
      b -> c
    `);
    const moves = layeredLayout(document.list(), ["a", "b", "c"]);
    expect(moves.get("a")!.x).toBeLessThan(moves.get("b")!.x);
    expect(moves.get("b")!.x).toBeLessThan(moves.get("c")!.x);
    expect(Math.abs(moves.get("a")!.y - moves.get("c")!.y)).toBeLessThan(1);
  });
});
