import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { transferInk } from "./inkTransfer";
import { highlightObject, recolorInk } from "./inkCommands";
import { DrawingPreferences } from "./drawingPreferences";
import { highlighted } from "../document/ink";
import { changeInkStyle } from "./inkStyle";

it("moves markup into a layer and back without changing points, paint or ids, with Undo", () => {
  const canvas = new CanvasDocument();
  canvas.layers.set("earth", { name: "Earth", order: 1 });
  canvas.create("drawing", 0, 0, {
    id: "land",
    markup: true,
    points: [
      [10, 20],
      [110, 70],
    ],
    look: { strokeOpacity: 30, lineWidth: 16 },
  });
  const original = canvas.get("land")!;
  expect(transferInk(canvas, [original], false, "earth")).toBe(true);
  expect(canvas.get("land")).toMatchObject({
    id: "land",
    markup: false,
    layer: "earth",
    inside: "",
    points: original.points,
    look: original.look,
  });
  expect(canvas.list()).toHaveLength(1);
  canvas.undo.undo();
  expect(canvas.get("land")).toEqual(original);
  transferInk(canvas, [canvas.get("land")!], false, "earth");
  transferInk(canvas, [canvas.get("land")!], true, "earth");
  expect(canvas.get("land")).toMatchObject({
    markup: true,
    inside: "",
    points: original.points,
    look: original.look,
  });
  expect(canvas.get("land")?.layer).toBe("");
  canvas.destroy();
});

it("preserves connector eligibility and locked ink when transferring to markup", () => {
  const canvas = new CanvasDocument();
  canvas.create("drawing", 0, 0, {
    id: "ink",
    points: [
      [0, 0],
      [20, 20],
    ],
  });
  canvas.create("node", 100, 100, { id: "node" });
  canvas.create("line", 0, 0, { id: "wire", from: "ink", to: "node" });
  expect(transferInk(canvas, [canvas.get("ink")!], true, "base")).toBe(false);
  expect(canvas.get("ink")?.markup).toBe(false);
  canvas.remove(["wire"]);
  canvas.patch("ink", { locked: true });
  transferInk(canvas, [canvas.get("ink")!], true, "base");
  expect(canvas.get("ink")?.markup).toBe(false);
  canvas.destroy();
});

it("recolors ink without changing a selected workspace object", () => {
  const canvas = new CanvasDocument();
  const node = canvas.create("node", 0, 0, { look: { line: "#112233" } });
  const ink = canvas.create("drawing", 0, 0, {
    markup: true,
    points: [
      [0, 0],
      [10, 10],
    ],
  });
  const before = canvas.get(node);
  recolorInk(canvas, canvas.list(), "#ff0000");
  expect(canvas.get(node)).toEqual(before);
  expect(canvas.get(ink)?.look.line).toBe("#ff0000");
  canvas.undo.undo();
  expect(canvas.get(ink)?.look.line).toBeUndefined();
  canvas.destroy();
});

it("keeps attached outlines independent in Draw and Markup and transfers their style and target", () => {
  const canvas = new CanvasDocument();
  canvas.layers.set("earth", { name: "Earth", order: 1 });
  canvas.activeLayer = "earth";
  canvas.create("node", 100, 100, { id: "earth" });
  const settings = new DrawingPreferences().settings;
  highlightObject(canvas, "earth", settings, false);
  highlightObject(canvas, "earth", settings, true);
  const outlines = canvas.list().filter((item) => item.type === "highlight");
  expect(outlines).toHaveLength(2);
  const targets = new Map(canvas.list().map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const item of outlines) expect(highlighted(item, targets, seen).look.line).not.toBe("none");
  const markup = outlines.find((item) => item.markup)!;
  changeInkStyle(canvas, [markup], { color: "#e64980" });
  transferInk(canvas, [canvas.get(markup.id)!], false, "earth");
  expect(canvas.get(markup.id)).toMatchObject({
    target: "earth",
    markup: false,
    layer: "earth",
    look: { line: "#e64980" },
  });
  canvas.undo.undo();
  expect(canvas.get(markup.id)).toMatchObject({ target: "earth", markup: true });
  canvas.destroy();
});
