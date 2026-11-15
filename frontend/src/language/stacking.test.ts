import { afterEach, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { layeredStack } from "../document/layers";
import { LOCAL } from "../document/types";
import { importDocument } from "../files/canvasFile";
import { parse } from "./parser";
import { printCanvas } from "./printer";
import { writeStatements } from "./writer";

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
const stack = (document: CanvasDocument) =>
  layeredStack(document.list(), document.layerList()).map((item) => item.id);

it("applies explicit z to objects and links, retains omitted edits and creates above explicit values", () => {
  const document = canvas(`node a at 0,0 z 20
node b at 30,30 z -2.5
a -> b as wire z 0`);
  expect(stack(document)).toEqual(["b", "wire", "a"]);
  write(document, 'edit a "Renamed"\nedit wire z 30\nnode c');
  expect(document.get("a")!.order).toBe(20);
  expect(document.get("wire")!.order).toBe(30);
  expect(document.get("c")!.order).toBeGreaterThan(30);
  const original = printCanvas(document);
  expect(() => write(document, "edit a z 2\nedit b z 1e999")).toThrow("finite");
  expect(printCanvas(document)).toBe(original);
});

it("round trips raw z independently of statement order, layers, holders, links, slides and markup", () => {
  const source = canvas(`layer top "Top"
frame f at 0,0 size 400,400 z 12 {
  node a at 20,20 z 18
  node b at 40,40 z -10
}
a -> b as wire in f z 8
node c at 0,0 in-layer top z -30
slide s at 0,0 z 100
drawing mark markup points 10,10 40,40 z -100`);
  const text = printCanvas(source);
  const copy = canvas();
  importDocument(copy, text);
  expect(stack(copy)).toEqual(stack(source));
  expect(copy.list()).toEqual(source.list());
  expect(printCanvas(copy)).toBe(text);
  const independent = canvas();
  importDocument(independent, "arconis 1\nnode front at 0,0 z 50\nnode back at 20,20 z -10");
  expect(stack(independent)).toEqual(["back", "front"]);
});

it("adds an imported stack above occupied content, preserving equal-z source ties through id remapping and undo", () => {
  const source = canvas("node a at 0,0 z -4\nnode b at 20,20 z -4\na -> b as wire z -10");
  const target = canvas("node b at 400,400 z 100");
  const created = importDocument(target, printCanvas(source));
  const imported = target.list().filter((item) => created.includes(item.id));
  expect(imported.map((item) => item.type)).toEqual(["line", "node", "node"]);
  expect(imported[1].id).toBe("a");
  expect(imported[2].id).not.toBe("b");
  expect(imported.every((item) => item.order > 100)).toBe(true);
  expect(imported[0]).toMatchObject({ from: "a", to: imported[2].id });
  expect(target.get("b")!.order).toBe(100);
  target.undo.undo();
  expect(stack(target)).toEqual(["b"]);
});

it("accepts declarations without z and the item id z with a quoted name", () => {
  const document = canvas('node a\nnode b\nnode z "Z" z 0');
  expect(document.get("a")!.order).toBe(0);
  expect(document.get("b")!.order).toBe(1);
  const copy = canvas();
  importDocument(copy, printCanvas(document));
  expect(copy.list()).toEqual(document.list());
});
