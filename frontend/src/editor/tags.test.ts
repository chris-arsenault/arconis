import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { addTags, removeTag, roomTags, sharedTags } from "./tags";
import { itemName, relateCandidates } from "./relate";

function room() {
  const document = new CanvasDocument();
  const make = (name: string, tags?: string[]) =>
    document.get(document.create("note", 0, 0, { name, tags }))!;
  return { document, make };
}

describe("tags", () => {
  it("lists the room's tags by use, then by name", () => {
    const { document, make } = room();
    make("A", ["risk", "q3"]);
    make("B", ["q3"]);
    make("C", ["alpha"]);
    expect(roomTags(document.list())).toEqual([
      { tag: "q3", count: 2 },
      { tag: "alpha", count: 1 },
      { tag: "risk", count: 1 },
    ]);
  });

  it("shows only the tags every selected item carries", () => {
    const { make } = room();
    expect(sharedTags([make("A", ["risk", "q3"]), make("B", ["q3"])])).toEqual(["q3"]);
  });

  it("adds and removes a tag across the selection as one undo step each", () => {
    const { document, make } = room();
    const items = [make("A", ["q3"]), make("B")];
    addTags(document, items, ["growth", "q3"]);
    expect(document.list().map((item) => item.tags)).toEqual([
      ["q3", "growth"],
      ["growth", "q3"],
    ]);
    removeTag(document, document.list(), "q3");
    expect(document.list().map((item) => item.tags)).toEqual([["growth"], ["growth"]]);
    document.undo.undo();
    expect(document.list().map((item) => item.tags)).toEqual([
      ["q3", "growth"],
      ["growth", "q3"],
    ]);
  });
});

describe("relating by name", () => {
  it("names an item by its label's first plain line", () => {
    const { make } = room();
    expect(itemName(make("## **Pricing** model\nmore"))).toBe("Pricing model");
    expect(itemName(make(""))).toBe("Sticky note");
  });

  it("ranks names that start with the search before names that hold it, and skips itself", () => {
    const { document, make } = room();
    const from = make("Strategy");
    make("Retention");
    make("Customer retention");
    make("Pricing");
    const names = relateCandidates(document.list(), from, "ret").map(itemName);
    expect(names).toEqual(["Retention", "Customer retention"]);
    expect(relateCandidates(document.list(), from, "").map(itemName)).not.toContain("Strategy");
  });
});
