import { afterEach, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument } from "../files/canvasFile";
import { printCanvas } from "./printer";
import { LanguageSession } from "./session";
import { sectionForInsertion } from "../files/section";

const documents: CanvasDocument[] = [];
afterEach(() => documents.splice(0).forEach((document) => document.destroy()));
function canvas() {
  const document = new CanvasDocument();
  documents.push(document);
  return document;
}

it("orders by Y then X within layer and holder groups, independently of insertion, identities and z", () => {
  const make = (reversed: boolean) => {
    const document = canvas();
    document.layers.set("top", { name: "Top", order: 1, locked: false });
    const entries = [
      {
        id: "holder",
        type: "frame" as const,
        name: "Holder",
        x: 400,
        y: 50,
        inside: "",
        layer: "",
      },
      { id: "right", type: "node" as const, name: "Right", x: 300, y: 0, inside: "", layer: "" },
      { id: "left", type: "node" as const, name: "Left", x: 0, y: 0, inside: "", layer: "" },
      {
        id: "bottom",
        type: "node" as const,
        name: "Bottom",
        x: 0,
        y: 100,
        inside: "holder",
        layer: "",
      },
      {
        id: "inner",
        type: "node" as const,
        name: "Inner",
        x: 100,
        y: 60,
        inside: "holder",
        layer: "",
      },
      {
        id: "layered",
        type: "node" as const,
        name: "Layered",
        x: -100,
        y: -100,
        inside: "",
        layer: "top",
      },
    ];
    const ids = new Map(
      entries.map((item, index) => [item.id, reversed ? `id${entries.length - index}` : item.id])
    );
    for (const entry of reversed ? [...entries].reverse() : entries) {
      document.create(entry.type, entry.x, entry.y, {
        ...entry,
        id: ids.get(entry.id),
        inside: ids.get(entry.inside) ?? "",
        order: 0,
      });
    }
    return printCanvas(document)
      .split("\n")
      .filter((line) => /^\s*(node|frame) /.test(line))
      .map((line) => /"([^"]+)"/.exec(line)![1]);
  };
  expect(make(false)).toEqual(["Left", "Right", "Holder", "Inner", "Bottom", "Layered"]);
  expect(make(true)).toEqual(make(false));
});

it("uses path/target geometry for drawings and highlights, and endpoint/bend bounds for links", () => {
  const document = canvas();
  importDocument(
    document,
    `arconis 1
node a at 0,300 z 0
node b at 200,300 z 1
node c at 0,600 z 2
node d at 200,600 z 3
drawing stroke workspace points 400,-100 500,-50 z 4
highlight outline workspace target c z 5
a -> b as upper z 6 label-at 0,999
c -> d as lower z 7 label-at 0,-999
c -> d as bend z 8 via 50,-200`
  );
  const text = printCanvas(document);
  expect(text.indexOf("drawing stroke")).toBeLessThan(text.indexOf("node a"));
  expect(text.indexOf("highlight outline")).toBeGreaterThan(text.indexOf("node b"));
  expect(text.indexOf("highlight outline")).toBeLessThan(text.indexOf("node c"));
  expect(text.indexOf("as bend")).toBeLessThan(text.indexOf("as upper"));
  expect(text.indexOf("as upper")).toBeLessThan(text.indexOf("as lower"));
  const copy = canvas();
  importDocument(copy, text);
  expect(printCanvas(copy)).toBe(text);
  expect(copy.list()).toEqual(document.list());
});

it("keeps unique-position label/style diffs local and moves only the moved statement without renumbering", () => {
  const document = canvas();
  for (let index = 19; index >= 0; index--)
    document.create("node", index * 200, 0, { id: `n${index}`, name: `Node ${index}` });
  const before = printCanvas(document);
  expect(printCanvas(document)).toBe(before);
  document.patch("n4", { name: "Renamed", look: { fill: "#abcdef" } });
  const changed = printCanvas(document);
  expect(
    before.split("\n").filter((line, index) => line !== changed.split("\n")[index])
  ).toHaveLength(1);
  const orders = document.list().map(({ id, order }) => [id, order]);
  document.patch("n4", { y: 100 });
  const moved = printCanvas(document);
  expect(moved.split("\n").filter((line) => !line.startsWith("node n4 "))).toEqual(
    changed.split("\n").filter((line) => !line.startsWith("node n4 "))
  );
  expect(document.list().map(({ id, order }) => [id, order])).toEqual(orders);
  const copy = canvas();
  importDocument(copy, moved);
  expect(printCanvas(copy)).toBe(moved);
});

it("uses the same layer-aware spatial order for partial agent reads", () => {
  const document = canvas();
  importDocument(
    document,
    `arconis 1
layer top "Top"
node upper at 0,-100 in-layer top z 0
node low at 0,100 z 1
node first at 100,0 z 2`
  );
  const session = new LanguageSession(document, "Test");
  try {
    const text = session.read({ items: ["upper", "low", "first"] });
    expect(text.indexOf("node first")).toBeLessThan(text.indexOf("node low"));
    expect(text.indexOf("node low")).toBeLessThan(text.indexOf("node upper"));
  } finally {
    session.destroy();
  }
});

it("preserves equal-z library stacking when every source identity changes", () => {
  const source = canvas();
  source.create("node", 0, 0, { id: "a", name: "Back", order: 0 });
  source.create("node", 0, 0, { id: "b", name: "Front", order: 0 });
  const destination = canvas();
  importDocument(destination, sectionForInsertion(printCanvas(source), destination));
  expect(destination.list().map((item) => item.name)).toEqual(["Back", "Front"]);
});

it("uses unselected holders and endpoints for spatial ordering without including them in partial reads", () => {
  const document = canvas();
  importDocument(
    document,
    `arconis 1
layer top "Top"
frame f at 0,0 size 600,400 in-layer top {
  node early at 20,20 z 0
  node later at 200,200 z 1
}
node base at 20,500 z 2
node far at 20,500 in-layer top z 3
early -> later as highwire z 3
later -> far as lowwire z 4 in-layer top`
  );
  const session = new LanguageSession(document, "Test");
  try {
    const children = session.read({ items: ["early", "base"] });
    expect(children.indexOf("node base")).toBeLessThan(children.indexOf("node early"));
    expect(children).not.toContain("frame f");
    const links = session.read({ items: ["lowwire", "highwire"] });
    expect(links.indexOf("as highwire")).toBeLessThan(links.indexOf("as lowwire"));
    expect(links).not.toContain("node early");
  } finally {
    session.destroy();
  }
});

it("resolves coincident positions by type, label, z and remaining content, retaining drawing order only for identical ties", () => {
  const make = (reverse: boolean) => {
    const document = canvas();
    const entries = [
      { id: "f", type: "node" as const, name: "Same", order: 4, look: { fill: "#bbbbbb" } },
      { id: "e", type: "node" as const, name: "Same", order: 4, look: { fill: "#aaaaaa" } },
      { id: "d", type: "node" as const, name: "Same", order: 3, look: {} },
      { id: "b", type: "node" as const, name: "Alpha", order: 0, look: {} },
      { id: "a", type: "node" as const, name: "Alpha", order: 0, look: {} },
      { id: "c", type: "card" as const, name: "Zebra", order: 10, look: {} },
    ];
    for (const item of reverse ? [...entries].reverse() : entries)
      document.create(item.type, 0, 0, item);
    return printCanvas(document);
  };
  expect(make(false)).toBe(make(true));
  const lines = make(false).split("\n");
  expect(
    lines.filter((line) => /^(node|card) /.test(line)).map((line) => line.split(" ")[1])
  ).toEqual(["c", "a", "b", "d", "e", "f"]);
});
