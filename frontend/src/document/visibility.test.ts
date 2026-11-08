import { describe, expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { foldedBy, hiddenIds, holdsOthers, taskCounts, visibleItems } from "./relations";
import { LOCAL } from "./types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}
const sorted = (ids: Iterable<string>) => [...ids].sort((a, b) => a.localeCompare(b));
const ids = (items: { id: string }[]) => sorted(items.map((item) => item.id));

describe("hidden and collapsed items", () => {
  const TREE = `
    frame f "Frame" at 0,0 {
      node a "A"
      node b "B" below a
    }
    node c "C" at 600,0
    node root "Root" at 0,600
    root => node k1 "K1"
    k1 => node k2 "K2"
    a -> c as ac
    c -> root as cr
  `;

  it("hides an item with its contents and the lines touching them, keeping its holder", () => {
    const document = canvas(`${TREE}\nedit a hidden`);
    expect(sorted(hiddenIds(document.list()))).toEqual(["a", "ac"]);
    const drawn = ids(visibleItems(document.list()));
    expect(drawn).not.toContain("a");
    expect(drawn).not.toContain("ac");
    expect(drawn).toContain("f");
    expect(drawn).toContain("b");
    expect(drawn).toContain("cr");
  });

  it("hides a holder with everything inside it", () => {
    const document = canvas(`${TREE}\nedit f hidden`);
    const drawn = ids(visibleItems(document.list()));
    expect(drawn).not.toContain("f");
    expect(drawn).not.toContain("a");
    expect(drawn).not.toContain("b");
    expect(drawn).not.toContain("ac");
    expect(drawn).toContain("c");
  });

  it("folds a collapsed holder's contents and a collapsed topic's branches away, not the item", () => {
    const document = canvas(`${TREE}\nedit f collapsed\nedit root collapsed`);
    const items = document.list();
    expect(sorted(foldedBy(items, "f"))).toEqual(["a", "ac", "b"]);
    const foldedTopics = [...foldedBy(items, "root")];
    expect(foldedTopics).toContain("k1");
    expect(foldedTopics).toContain("k2");
    expect(foldedTopics).not.toContain("root");
    expect(foldedTopics).not.toContain("cr");
    const drawn = ids(visibleItems(items));
    expect(drawn).toEqual(["c", "cr", "f", "root"]);
  });

  it("knows which items hold or head others", () => {
    const items = canvas(TREE).list();
    expect(holdsOthers(items, "f")).toBe(true);
    expect(holdsOthers(items, "root")).toBe(true);
    expect(holdsOthers(items, "k1")).toBe(true);
    expect(holdsOthers(items, "k2")).toBe(false);
    expect(holdsOthers(items, "c")).toBe(false);
  });
});

describe("task counts", () => {
  it("rolls tasks up to every holder and topic above them, once each", () => {
    const document = canvas(`
      frame f "Frame" at 0,0 {
        note a "A" task done
        note b "B" task open below a
        frame inner "Inner" below b { note c "C" task done }
      }
      node root "Root" at 0,900
      root => node t1 "T1" task open
      t1 => node t2 "T2" task done
      root => a
    `);
    const counts = taskCounts(document.list());
    expect(counts.get("f")).toEqual({ done: 2, total: 3 });
    expect(counts.get("inner")).toEqual({ done: 1, total: 1 });
    // The root heads t1 and t2 through branches, and a through a branch into the frame.
    expect(counts.get("root")).toEqual({ done: 2, total: 3 });
    expect(counts.get("t1")).toEqual({ done: 1, total: 1 });
    expect(counts.has("a")).toBe(false);
  });
});
