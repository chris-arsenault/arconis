import { expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { authoredLook, effectiveAppearance } from "./appearance";
import {
  canRotate,
  keepsAspectOnResize,
  keepsAspectOnTransform,
  textCanResize,
} from "./capabilities";
import type { Item, ItemType, Look } from "./types";

it.each<[ItemType, Partial<Look>]>([
  ["node", { fill: "#ffffff", textSize: 14, padding: 8 }],
  ["note", { fill: "#fff0ad", textSize: 16, padding: 8, align: "left", valign: "top" }],
  ["text", { fill: "none", textSize: 22, padding: 4 }],
  ["frame", { fill: "#eef0f5", textSize: 13, bold: true, padding: 4 }],
  ["group", { opacity: 35, dashed: true, textSize: 12 }],
  ["slide", { padding: 4, bold: true, valign: "bottom", textColor: "#5443b3" }],
  ["picture", { padding: 2, textSize: 12, valign: "top" }],
  ["reference", { path: "diagonal", arrow: "open", dashed: true }],
  ["branch", { arrow: "none", lineWidth: 2 }],
])("resolves %s defaults without authoring them", (type, expected) => {
  const canvas = new CanvasDocument();
  const id = canvas.create(type, 0, 0);
  const item = canvas.get(id)!;
  expect(effectiveAppearance(item)).toMatchObject(expected);
  expect(item.look).toEqual({});
  expect(canvas.get(id)?.look).toEqual({});
  canvas.destroy();
});

it("keeps type, stencil and title defaults distinct from authored values", () => {
  const canvas = new CanvasDocument();
  const item = canvas.build("node", 0, 0, { stencil: "icon" });
  expect(effectiveAppearance(item)).toMatchObject({
    fill: "none",
    line: "none",
    textSize: 12,
    padding: 2,
  });
  expect(effectiveAppearance({ ...item, stencil: "junction" })).toMatchObject({
    fill: "#7f8aa3",
    line: "none",
    textSize: 14,
  });
  const frame = canvas.build("frame", 0, 0);
  expect(effectiveAppearance(frame, { title: "top" })).toMatchObject({
    fill: "none",
    bold: true,
    padding: 8,
    align: "left",
  });
  canvas.destroy();
});

it("resolves explicit false, named overrides and clearing without changing either source", () => {
  const canvas = new CanvasDocument();
  const id = canvas.create("frame", 0, 0, { style: "shared", look: { bold: false, textSize: 18 } });
  canvas.setStyle("shared", { bold: true, italic: true, textSize: 24 });
  const resolve = () => effectiveAppearance(canvas.get(id)!, canvas.namedStyle("shared"));
  expect(resolve()).toMatchObject({ bold: false, italic: true, textSize: 18 });
  canvas.patchLook(id, { textSize: undefined });
  expect(resolve().textSize).toBe(24);
  expect(authoredLook(canvas.get(id)!, canvas.namedStyle("shared"))).toEqual({
    bold: false,
    italic: true,
    textSize: 24,
  });
  expect(canvas.get(id)?.look).toEqual({ bold: false });
  expect(canvas.namedStyle("shared")).toEqual({ bold: true, italic: true, textSize: 24 });
  canvas.destroy();
});

it("keeps semantic sizes unscaled and exposes mixed selection values", () => {
  const canvas = new CanvasDocument();
  const a = canvas.build("text", 0, 0, { look: { scale: 0.001, textSize: 20 } });
  const b = canvas.build("text", 0, 0, { look: { textSize: 30 } });
  expect([a, b].map((item) => effectiveAppearance(item).textSize)).toEqual([20, 30]);
  expect(effectiveAppearance(a).scale).toBe(0.001);
  canvas.destroy();
});

it("keeps gesture capabilities explicit rather than normalizing stored data", () => {
  const canvas = new CanvasDocument();
  const vendor = canvas.build("node", 0, 0, {
    stencil: "icon",
    icon: "aws:AWS-Lambda",
    look: { rotation: 45 },
  });
  expect(canRotate(vendor)).toBe(false);
  expect(keepsAspectOnResize(vendor)).toBe(true);
  expect(keepsAspectOnTransform(vendor)).toBe(true);
  expect(textCanResize(vendor)).toBe(false);
  expect(vendor.look.rotation).toBe(45);
  const picture = { ...vendor, type: "picture", icon: "" } as Item;
  expect(keepsAspectOnResize(picture)).toBe(false);
  expect(keepsAspectOnTransform(picture)).toBe(true);
  canvas.destroy();
});
