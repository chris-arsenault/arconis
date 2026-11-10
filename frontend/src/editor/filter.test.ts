import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { absorbShorthand, applyShorthand } from "../document/shorthand";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { EMPTY_FILTER, filterChoices, filterMatches, toggled } from "./filter";
import { gatherIntoFrame } from "./gather";
import { brightSet } from "./highlighting";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}
const sorted = (ids: Iterable<string>) => [...ids].sort((a, b) => a.localeCompare(b));

describe("shorthand typed into labels", () => {
  it("turns #tags, a leading checkbox and :markers into fields and takes them out of the name", () => {
    expect(absorbShorthand("[] Ship it #api #v2 :p1", { tags: ["old"] })).toEqual({
      name: "Ship it",
      fields: { tags: ["old", "api", "v2"], marker: "p1", task: "open" },
    });
    expect(absorbShorthand("[x] Done", { tags: [] })).toEqual({
      name: "Done",
      fields: { task: "done" },
    });
    expect(absorbShorthand("Plain text with a # sign and an email@x", { tags: [] })).toBeNull();
    expect(absorbShorthand("#api", { tags: ["api"] })).toBeNull();
    expect(absorbShorthand("Price :p9 is not a marker", { tags: [] })).toBeNull();
  });

  it("applies to an item when its edit finishes", () => {
    const document = canvas('note n "Buy milk #errand" at 0,0');
    expect(applyShorthand(document, "n")).toBe(true);
    expect(document.get("n")).toMatchObject({ name: "Buy milk", tags: ["errand"] });
    expect(applyShorthand(document, "n")).toBe(false);
  });
});

describe("filtering and gathering", () => {
  const document = canvas(`
    note a "A" tags api task open at 0,0
    note b "B" tags api, v2 marker p1 at 300,0
    note c "C" task done at 600,0
    frame f "Frame" at 0,400 { note d "D" tags api }
    a -> b as ab
    b -> c as bc
  `);
  const items = document.list();

  it("offers the canvas's values and keeps matches bright with the lines among them", () => {
    expect(filterChoices(items)).toEqual({
      tags: ["api", "v2"],
      markers: ["p1"],
      tasks: ["open", "done"],
      authors: [],
    });
    const byTag = toggled(EMPTY_FILTER, "tags", "api");
    expect(sorted(filterMatches(items, byTag))).toEqual(["a", "ab", "b", "d"]);
    const both = toggled(byTag, "tasks", "open");
    expect(sorted(filterMatches(items, both))).toEqual(["a"]);
    expect(toggled(byTag, "tags", "api")).toEqual(EMPTY_FILTER);
    expect(brightSet(items, null, EMPTY_FILTER)).toBeNull();
    expect(sorted(brightSet(items, "f", byTag)!)).toEqual(["d"]);
  });

  it("gathers matches into a grid frame to the right of everything", () => {
    const frame = gatherIntoFrame(document, ["a", "b", "d"], "API");
    const gathered = document.get(frame)!;
    expect(gathered).toMatchObject({
      type: "frame",
      name: "API",
      arrange: { how: "grid", columns: 2 },
    });
    for (const id of ["a", "b", "d"]) expect(document.get(id)!.inside).toBe(frame);
    expect(gathered.x).toBeGreaterThan(600);
    expect(document.get("b")!.x).toBeGreaterThan(document.get("a")!.x);
    expect(document.get("d")!.y).toBeGreaterThan(document.get("a")!.y);
    expect(gatherIntoFrame(document, ["ab"])).toBe("");
  });
});
