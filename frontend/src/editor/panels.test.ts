import { afterEach, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { containerAt } from "./panels";

let document: CanvasDocument;
afterEach(() => document.destroy());

const SMALL = { width: 10, height: 10 };

it("places an item inside the smallest larger item at that point", () => {
  document = new CanvasDocument();
  const outer = document.create("frame", 0, 0, { width: 500, height: 500 });
  const inner = document.create("node", 100, 100, { width: 100, height: 100 });
  expect(containerAt(document, 150, 150, SMALL)).toBe(inner);
  expect(containerAt(document, 300, 300, SMALL)).toBe(outer);
  expect(containerAt(document, 900, 900, SMALL)).toBe("");
});

it("accepts any item as a container, but never one that is not larger, nor a band", () => {
  document = new CanvasDocument();
  const note = document.create("note", 0, 0, { width: 100, height: 100 });
  expect(containerAt(document, 50, 50, SMALL)).toBe(note);
  expect(containerAt(document, 50, 50, { width: 100, height: 100 })).toBe("");
  expect(containerAt(document, 50, 50, { width: 200, height: 200 })).toBe("");
  document.create("band", 1000, 0, { width: 500, height: 500 });
  expect(containerAt(document, 1050, 50, SMALL)).toBe("");
});

it("ignores drawings", () => {
  document = new CanvasDocument();
  document.create("drawing", 0, 0, {
    width: 500,
    height: 500,
    points: [
      [0, 0],
      [500, 500],
    ],
  });
  expect(containerAt(document, 50, 50, SMALL)).toBe("");
});

it("keeps a child's world position when held by an ordinary item", () => {
  document = new CanvasDocument();
  const box = document.create("node", 100, 100, { width: 300, height: 300 });
  const child = document.create("note", 150, 160, { inside: box, width: 20, height: 20 });
  expect(document.get(child)).toMatchObject({ x: 150, y: 160, inside: box });
});

it("removes what a line anchor holds along with its line", () => {
  document = new CanvasDocument();
  const [a, b] = [document.create("node", 0, 0), document.create("node", 500, 0)];
  const line = document.create("line", 0, 0, { from: a, to: b });
  const dot = document.create("node", 250, 0, { stencil: "ellipse", onLine: line });
  const held = document.create("note", 250, 0, { inside: dot });
  document.remove([line]);
  expect(document.get(dot)).toBeNull();
  expect(document.get(held)).toBeNull();
  expect(document.get(a)).not.toBeNull();
});
