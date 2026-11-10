import { expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { authoredLook, effectiveAppearance } from "../document/appearance";
import { transformObjects } from "../document/transform";
import { printCanvas } from "../language/printer";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { objectStyle } from "./styles";
import { changeSelectionLook, changeSelectionStyle } from "./commands";
import { EditorController } from "./controller";
import { POINTER_COMMANDS } from "./pointerCommands";
import { setDefaultLook } from "./styleClipboard";
import { initialUi } from "./ui";

it("translates semantic typography once without turning defaults into authored rotations", () => {
  const canvas = new CanvasDocument();
  const item = canvas.build("frame", 0, 0, {
    look: { scale: 0.001, bold: false, italic: true, underline: true, textSize: 20, padding: 8 },
  });
  expect(effectiveAppearance(item)).toMatchObject({
    bold: false,
    italic: true,
    textSize: 20,
    padding: 8,
  });
  expect(objectStyle(item)).toMatchObject({
    fontStyle: 6,
    fontSize: 0.02,
    spacing: 0.008,
    fontFamily: "Inter, system-ui, sans-serif",
  });
  expect(objectStyle(item).rotation).toBeUndefined();
  expect(item.look).toEqual({
    scale: 0.001,
    bold: false,
    italic: true,
    underline: true,
    textSize: 20,
    padding: 8,
  });
  canvas.destroy();
});

it("keeps language-authored geometry sparse while rendering and transforms enforce vendor behavior", () => {
  const canvas = new CanvasDocument();
  writeStatements(
    canvas,
    parse('node vendor "Cloud" icon aws:AWS-Lambda at 0,0 size 80,40 rotate 45'),
    { author: "Agent" }
  );
  const item = canvas.get("vendor")!;
  expect(item).toMatchObject({ width: 80, height: 40, look: { rotation: 45 } });
  expect(objectStyle(item).rotation).toBeUndefined();
  expect(objectStyle(item)).toMatchObject({ aspect: "fixed", rotatable: false });
  const result = transformObjects([item], {
    anchor: { x: 0, y: 0 },
    scaleX: 3,
    scaleY: 2,
    angle: 90,
  });
  expect(result.get("vendor")).toMatchObject({ width: 160, height: 80, rotation: 0 });
  expect(printCanvas(canvas)).toContain("rotate 45");
  expect(canvas.get("vendor")?.look).toEqual({ rotation: 45 });
  canvas.destroy();
});

it("uses named rotation in collective transforms while preserving item overrides", () => {
  const canvas = new CanvasDocument();
  canvas.setStyle("turned", { rotation: 30 });
  const a = canvas.create("node", 0, 0, { style: "turned" });
  const b = canvas.create("node", 200, 0, { style: "turned", look: { rotation: 10 } });
  const result = transformObjects(
    canvas.list(),
    { anchor: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, angle: 15 },
    (item) => authoredLook(item, canvas.namedStyle(item.style))
  );
  expect(result.get(a)?.rotation).toBe(45);
  expect(result.get(b)?.rotation).toBe(25);
  expect(canvas.get(a)?.look).toEqual({});
  canvas.destroy();
});

it("changes a mixed selection atomically with one local undo step", () => {
  const canvas = new CanvasDocument();
  const a = canvas.create("note", 0, 0);
  const b = canvas.create("text", 200, 0);
  let updates = 0;
  canvas.doc.on("update", () => updates++);
  changeSelectionLook(canvas, canvas.list(), { bold: true, textColor: "#123456" });
  expect(updates).toBe(1);
  expect(canvas.list().map((item) => item.look)).toEqual([
    { bold: true, textColor: "#123456" },
    { bold: true, textColor: "#123456" },
  ]);
  canvas.undo.undo();
  expect(canvas.get(a)?.look).toEqual({});
  expect(canvas.get(b)?.look).toEqual({});
  changeSelectionStyle(canvas, canvas.list(), "shared");
  canvas.undo.undo();
  expect(canvas.list().map((item) => item.style)).toEqual(["", ""]);
  canvas.destroy();
});

it("uses the same defaults and zoom policy for rail and context creation while preserving placement", () => {
  const canvas = new CanvasDocument();
  const source = canvas.create("note", 4000, 0, { look: { fill: "#123456", bold: true } });
  setDefaultLook(canvas, canvas.get(source)!);
  const holder = canvas.create("frame", 100, 100, { width: 3000, height: 3000 });
  const editor = {
    document: canvas,
    element: { clientWidth: 1200, clientHeight: 800 },
    graph: { view: { scale: 0.25, translate: { x: 0, y: 0 } } },
    armedIcon: { key: "lucide:Server", title: "Armed icon" },
    armedScreen: { name: "Armed screen", width: 500, height: 300 },
    ui: initialUi(),
    slideValues: () => ({}),
    select: vi.fn(),
    setTool: vi.fn(),
    edit: vi.fn(),
    add: EditorController.prototype.add,
  } as unknown as EditorController;
  const rail = canvas.get(editor.add("note", { x: 500, y: 500, anchor: "corner" }, null, null))!;
  editor.ui.menu = {
    at: { x: 0, y: 0 },
    world: { x: 120, y: 300 },
    ring: false,
    wedge: null,
    subRing: null,
  };
  POINTER_COMMANDS.find((command) => command.id === "create.noteHere")!.run({
    editor,
    selected: [],
    items: canvas.list(),
  });
  const created = canvas.list().at(-1)!;
  expect(rail.look).toMatchObject({ fill: "#123456", bold: true, scale: 4 });
  expect(created.look).toEqual(rail.look);
  expect(created).toMatchObject({ inside: holder, name: "Your idea here", icon: "" });
  expect(created.width).toBe(rail.width);
  expect(created.height).toBe(rail.height);
  expect(created.x + created.width / 2).toBe(120);
  expect(created.y + created.height / 2).toBe(300);
  expect(rail).toMatchObject({ x: 500, y: 500 });
  canvas.destroy();
});
