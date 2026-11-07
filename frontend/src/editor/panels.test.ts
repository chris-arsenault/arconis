import { afterEach, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { containerAt } from "./panels";

let document: CanvasDocument;
afterEach(() => document.destroy());

const SMALL = { width: 10, height: 10 };

it("places an object inside the smallest larger object at that point", () => {
  document = new CanvasDocument();
  const outer = document.create("panel", 0, 0, { width: 500, height: 500 });
  const inner = document.create("rectangle", 100, 100, { width: 100, height: 100 });
  expect(containerAt(document, 150, 150, SMALL)).toBe(inner);
  expect(containerAt(document, 300, 300, SMALL)).toBe(outer);
  expect(containerAt(document, 900, 900, SMALL)).toBe("");
});

it("accepts any object as a container, but never one that is not larger", () => {
  document = new CanvasDocument();
  const sticky = document.create("sticky", 0, 0, { width: 100, height: 100 });
  expect(containerAt(document, 50, 50, SMALL)).toBe(sticky);
  expect(containerAt(document, 50, 50, { width: 100, height: 100 })).toBe("");
  expect(containerAt(document, 50, 50, { width: 200, height: 200 })).toBe("");
});

it("ignores lines", () => {
  document = new CanvasDocument();
  document.create("stroke", 0, 0, { width: 500, height: 500, points: "[[0,0],[500,500]]" });
  expect(containerAt(document, 50, 50, SMALL)).toBe("");
});

it("keeps a child's world position when held by an ordinary object", () => {
  document = new CanvasDocument();
  const box = document.create("rectangle", 100, 100, { width: 300, height: 300 });
  const child = document.create("sticky", 150, 160, { parent: box, width: 20, height: 20 });
  expect(document.get(child)).toMatchObject({ x: 150, y: 160, parent: box });
});

it("removes what a line anchor holds along with its line", () => {
  document = new CanvasDocument();
  const [a, b] = [document.create("rectangle", 0, 0), document.create("rectangle", 500, 0)];
  const line = document.create("connector", 0, 0, { source: a, target: b });
  const dot = document.create("ellipse", 250, 0, { style: { lineAnchor: line } });
  const held = document.create("sticky", 250, 0, { parent: dot });
  document.remove([line]);
  expect(document.get(dot)).toBeNull();
  expect(document.get(held)).toBeNull();
  expect(document.get(a)).not.toBeNull();
});
