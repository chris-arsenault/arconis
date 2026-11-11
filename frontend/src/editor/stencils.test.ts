import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { dockedFollowers } from "../document/docking";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { evaluateNumber } from "./arithmetic";
import { gapsBetween } from "./measure";
import { addTaskAfter, insertTaskList } from "./stencils";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

describe("docked frames", () => {
  const document = canvas(`
    frame a "A" at 0,0 size 200,100
    frame b "B" at 200,0 size 200,100
    frame c "C" at 0,100 size 400,100
    frame far "Far" at 900,0 size 100,100
  `);
  const items = document.list();
  const a = items.find((item) => item.id === "a")!;

  it("drags the shared edges of neighbours when one frame's edge moves", () => {
    const wider = dockedFollowers(items, a, a, { ...a, width: 250 });
    expect(wider).toEqual([{ id: "b", values: { x: 250, width: 150 } }]);
    const taller = dockedFollowers(items, a, a, { ...a, height: 120 });
    expect(taller).toEqual([{ id: "c", values: { y: 120, height: 80 } }]);
    const movedLeftEdge = dockedFollowers(
      items,
      items.find((item) => item.id === "b")!,
      { x: 200, y: 0, width: 200, height: 100 },
      { x: 240, y: 0, width: 160, height: 100 }
    );
    expect(movedLeftEdge).toEqual([{ id: "a", values: { width: 240 } }]);
  });

  it("leaves neighbours alone when a frame moves as a whole or would squash one", () => {
    expect(dockedFollowers(items, a, a, { ...a, x: 50 })).toEqual([]);
    expect(dockedFollowers(items, a, a, { ...a, width: 450 })).toEqual([]);
  });
});

describe("task lists", () => {
  it("inserts a task list whose next task slots in after the current one", () => {
    const document = new CanvasDocument();
    const list = insertTaskList(document, { x: 0, y: 0 });
    const tasks = () =>
      document
        .list()
        .filter((item) => item.inside === list)
        .sort((a, b) => a.y - b.y);
    expect(tasks().map((task) => task.task)).toEqual(["open", "open", "open"]);
    const first = tasks()[0];
    const added = addTaskAfter(document, first.id);
    expect(tasks().map((task) => task.id)[1]).toBe(added);
    expect(document.get(added)).toMatchObject({ task: "open", inside: list });
    expect(document.get(list)!.height).toBeGreaterThan(200);
  });
});

describe("measuring between objects", () => {
  it("labels the empty distance on each axis, and nothing where the boxes overlap", () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    expect(gapsBetween(a, { x: 140, y: 0, width: 100, height: 50 })).toEqual([
      { label: "40", x: 120, y: 25 },
    ]);
    expect(gapsBetween(a, { x: 0, y: 80, width: 100, height: 50 })).toEqual([
      { label: "30", x: 50, y: 65 },
    ]);
    expect(gapsBetween(a, { x: 150, y: 100, width: 100, height: 50 })).toHaveLength(2);
    expect(gapsBetween(a, { x: 50, y: 20, width: 100, height: 50 })).toEqual([]);
  });
});

describe("numeric fields", () => {
  it("reads plain numbers and arithmetic, relative to the current value when it starts with a sign", () => {
    expect(evaluateNumber("240", 100)).toBe(240);
    expect(evaluateNumber("200+40", 100)).toBe(240);
    expect(evaluateNumber("+40", 100)).toBe(140);
    expect(evaluateNumber("*2", 100)).toBe(200);
    expect(evaluateNumber("/4", 100)).toBe(25);
    expect(evaluateNumber("2*3+4", 0)).toBe(10);
    expect(evaluateNumber("-20", 100)).toBe(80);
    expect(evaluateNumber("abc", 100)).toBeNull();
    expect(evaluateNumber("", 100)).toBeNull();
  });
});
