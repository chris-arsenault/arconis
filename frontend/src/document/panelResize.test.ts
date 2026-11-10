import { expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";
import { panelResizeChanges, resizedPanelContents } from "./panelResize";
import { authoredLook } from "./appearance";
import { LanguageSession } from "../language/session";
import { serializeDocument, importDocument } from "../files/canvasFile";

it("scales nested ink, shapes, text, pictures and internal routes once, preserving item identity", () => {
  const doc = new CanvasDocument();
  doc.create("frame", 100, 100, { id: "panel", width: 200, height: 100, scaleContents: true });
  doc.create("frame", 110, 110, {
    id: "inner",
    inside: "panel",
    width: 50,
    height: 40,
    scaleContents: true,
  });
  doc.create("drawing", 0, 0, {
    id: "ink",
    inside: "inner",
    points: [
      [120, 120],
      [130, 130],
    ],
    look: { lineWidth: 3, scale: 0.5 },
  });
  doc.create("text", 120, 120, {
    id: "text",
    inside: "panel",
    width: 40,
    height: 20,
    name: "Keep me",
  });
  doc.create("picture", 160, 120, { id: "picture", inside: "panel", width: 20, height: 20 });
  doc.create("node", 200, 120, { id: "shape", inside: "panel", width: 20, height: 20 });
  doc.create("line", 0, 0, {
    id: "route",
    inside: "panel",
    from: "text",
    to: "shape",
    points: [
      [170, 130],
      [180, 140],
    ],
  });
  const before = doc.list(),
    root = doc.get("panel")!;
  const after = before.map((item) =>
    item.id === "panel" ? { ...item, width: 400, height: 200 } : item
  );
  const changes = panelResizeChanges(before, after, authoredLook);
  expect(new Set(changes.map((item) => item.id)).size).toBe(6);
  const change = (id: string) => changes.find((item) => item.id === id)!;
  expect(change("inner").geometry).toMatchObject({ x: 120, y: 120, width: 100, height: 80 });
  expect(change("ink").geometry.points).toEqual([
    [140, 140],
    [160, 160],
  ]);
  expect(change("ink").look.scale).toBe(1);
  expect(change("text").geometry).toMatchObject({ x: 140, y: 140, width: 80, height: 40 });
  expect(change("picture").geometry).toMatchObject({ x: 220, y: 140, width: 40, height: 40 });
  expect(change("route").geometry.points).toEqual([
    [240, 160],
    [260, 180],
  ]);
  expect(resizedPanelContents(before, root, { ...root, scaleContents: false, width: 400 })).toEqual(
    []
  );
  doc.destroy();
});

it("round-trips the panel property and applies MCP resizing in one undoable write", () => {
  const doc = new CanvasDocument();
  const agent = new LanguageSession(doc, "Artist");
  expect(
    agent.write(
      'frame p at 0,0 size 200,200 scale-contents title top padding 0 { note n "Text" at 20,20 size 40,20; drawing d points 20,60 80,60 }'
    )
  ).toContain("Done");
  const original = doc.get("n")!;
  const panel = doc.get("p")!;
  expect(agent.write(`edit p size ${panel.width * 2},${panel.height * 2}`)).toContain("Done");
  expect(doc.get("n")).toMatchObject({
    x: original.x * 2 - panel.x,
    y: original.y * 2 - panel.y,
    width: 80,
    height: 40,
    look: { scale: 2 },
  });
  expect(doc.get("d")?.points).toEqual([
    [40 - panel.x, 120 - panel.y],
    [160 - panel.x, 120 - panel.y],
  ]);
  const saved = serializeDocument(doc);
  expect(saved).toContain("scale-contents");
  const copy = new CanvasDocument();
  importDocument(copy, saved);
  expect(copy.get("p")?.scaleContents).toBe(true);
  expect(copy.get("n")).toMatchObject({ width: 80, height: 40 });
  agent.undoLast();
  expect(doc.get("n")).toEqual(original);
  expect(agent.write("edit p scale-contents off size 600,600")).toContain("Done");
  expect(doc.get("n")).toEqual(original);
  copy.destroy();
  doc.destroy();
});

it("composes separate axis edits without distorting pictures or compounding paint", () => {
  const doc = new CanvasDocument();
  doc.create("frame", 0, 0, { id: "panel", width: 200, height: 100, scaleContents: true });
  doc.create("picture", 20, 20, { id: "picture", inside: "panel", width: 40, height: 20 });
  doc.create("text", 80, 20, { id: "text", inside: "panel", width: 40, height: 20 });
  const before = doc.list(),
    panel = doc.get("panel")!;
  const width = { ...panel, width: 400 };
  const first = resizedPanelContents(before, panel, width);
  for (const change of first) {
    doc.patch(change.id, change.geometry);
    doc.patchLook(change.id, change.look);
  }
  const final = { ...width, height: 200 };
  const sequential = resizedPanelContents(doc.list(), width, final);
  const together = resizedPanelContents(before, panel, final);
  for (const expected of together) {
    const actual = sequential.find((item) => item.id === expected.id)!;
    expect(actual.geometry.x).toBeCloseTo(expected.geometry.x, 4);
    expect(actual.geometry.y).toBeCloseTo(expected.geometry.y, 4);
    expect(actual.geometry.width).toBeCloseTo(expected.geometry.width, 4);
    expect(actual.geometry.height).toBeCloseTo(expected.geometry.height, 4);
    expect(actual.look.scale).toBeCloseTo(2);
  }
  const picture = sequential.find((item) => item.id === "picture")!;
  expect(picture.geometry.width / picture.geometry.height).toBeCloseTo(2);
  doc.destroy();
});

it("upgrades old room Drawing holders to ordinary scalable frames without replacing ids or ink", () => {
  const old = new Y.Doc();
  const record = new Y.Map<unknown>();
  old.getMap("items").set("earth", record);
  record.set("type", "sketch");
  record.set("name", new Y.Text("Earth"));
  record.set("look", new Y.Map());
  const doc = new CanvasDocument();
  Y.applyUpdate(doc.doc, Y.encodeStateAsUpdate(old));
  expect(doc.get("earth")).toMatchObject({
    id: "earth",
    type: "frame",
    name: "Earth",
    scaleContents: true,
    look: { fill: "none" },
  });
  expect(doc.items.get("earth")?.get("type")).toBe("frame");
  doc.destroy();
  old.destroy();
});
