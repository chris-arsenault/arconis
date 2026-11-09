import { describe, expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { effectiveAppearance } from "./appearance";
import { describeLayout, layoutReport } from "./layoutReport";

function report(document: CanvasDocument) {
  const all = document.list();
  return layoutReport(all, all, (item) =>
    effectiveAppearance(item, document.namedStyle(item.style))
  );
}

describe("a layout check", () => {
  it("finds overlapping boxes, objects outside their holder and text with no room", () => {
    const document = new CanvasDocument();
    const frame = document.create("frame", 0, 0, {
      id: "f",
      name: "Frame",
      width: 300,
      height: 200,
    });
    document.create("node", 20, 40, { id: "a", name: "A", inside: frame });
    document.create("node", 100, 60, { id: "b", name: "B", inside: frame });
    document.create("node", 250, 150, { id: "out", name: "Out", inside: frame });
    document.create("note", 500, 0, {
      id: "wordy",
      name: "A sentence long enough that it cannot possibly fit inside a box this small",
      width: 120,
      height: 40,
    });
    document.create("note", 800, 0, { id: "fine", name: "Short", width: 190, height: 170 });
    const found = report(document);
    expect(found.overlaps.map(([a, b]) => [a.id, b.id])).toEqual([["a", "b"]]);
    expect(found.escapes.map(({ item, holder }) => [item.id, holder.id])).toEqual([["out", "f"]]);
    expect(found.overflows.map(({ item }) => item.id)).toEqual(["wordy"]);
    expect(found.overflows[0].needed).toBeGreaterThan(40);
    const text = describeLayout(found, 6).join("\n");
    expect(text).toContain("// Layout check: 6 objects looked at.");
    expect(text).toContain('a "A" and b "B"');
    expect(text).toContain('out "Out" sticks out of f');
    expect(text).toContain("Text that may not fit (1, estimated)");
    document.destroy();
  });

  it("leaves holders and their contents, lines, bands and hidden objects out", () => {
    const document = new CanvasDocument();
    const frame = document.create("frame", 0, 0, {
      id: "f",
      name: "Frame",
      width: 400,
      height: 200,
    });
    const a = document.create("node", 20, 40, { id: "a", name: "A", inside: frame });
    const b = document.create("node", 220, 40, { id: "b", name: "B", inside: frame });
    document.create("line", 0, 0, { id: "l", from: a, to: b, inside: frame });
    document.create("band", 0, 0, { id: "band", name: "Over", width: 400, height: 300 });
    document.create("node", 20, 40, { id: "ghost", name: "Hidden", hidden: true });
    const found = report(document);
    expect(found.overlaps).toEqual([]);
    expect(found.escapes).toEqual([]);
    expect(found.overflows).toEqual([]);
    expect(describeLayout(found, 6).at(-1)).toContain("Nothing to report");
    document.destroy();
  });

  it("ignores slide viewports and content hidden or folded through an ancestor", () => {
    const document = new CanvasDocument();
    document.create("slide", 0, 0, { id: "view", width: 1280, height: 720 });
    document.create("node", 20, 40, { id: "shown", name: "Visible" });
    document.create("frame", 500, 0, { id: "hidden", hidden: true });
    document.create("note", 20, 40, {
      id: "hidden_child",
      inside: "hidden",
      name: "X".repeat(200),
    });
    document.create("frame", 800, 0, { id: "folded", collapsed: true });
    document.create("note", 20, 40, {
      id: "folded_child",
      inside: "folded",
      name: "X".repeat(200),
    });
    expect(report(document)).toEqual({ overlaps: [], escapes: [], overflows: [] });
    document.destroy();
  });
});
