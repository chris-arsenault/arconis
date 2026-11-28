import { expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "../document/canvasDocument";
import { cutList } from "../document/woodworking";
import { contentScale } from "../document/panelScale";
import { importDocument, serializeDocument } from "../files/canvasFile";
import { LanguageSession } from "./session";

function bookshelf() {
  const doc = new CanvasDocument();
  const agent = new LanguageSession(doc, "Builder");
  expect(
    agent.write(
      [
        'scale 12 represents 1 "in"',
        'part rail board stock "2x4" length "12.5 in"',
        "node front depicts rail face at 0,0",
        'frame detail at 500,0 size 2000,1000 panel-scale 48 represents 1 "in"',
        "node closeup depicts rail face at 540,80 in detail",
        "node label right of closeup in detail",
      ].join("\n")
    )
  ).toContain("Done");
  return { doc, agent };
}

it("uses the explicit holder for layout, files, partial reads and physical edits", () => {
  const { doc, agent } = bookshelf();
  expect(doc.get("front")?.width).toBe(150);
  expect(doc.get("closeup")?.width).toBe(600);
  expect(doc.get("label")!.x).toBeGreaterThanOrEqual(1140);
  expect(agent.read({ items: ["closeup"] })).toContain(
    'use detail: panel-scale 48 represents 1 "in"'
  );
  const copy = new CanvasDocument();
  importDocument(copy, serializeDocument(doc));
  expect(copy.get("closeup")).toEqual(doc.get("closeup"));
  copy.patch("closeup", { width: 624 });
  expect(copy.get("front")?.width).toBe(156);
  expect(cutList(copy.wood.parts())[0]).toMatchObject({
    length: "13 in",
    pieces: [{ id: "rail" }],
  });
  copy.patch("closeup", { inside: "", x: 250, width: 624 });
  expect(copy.get("closeup")).toMatchObject({ x: 250, width: 156 });
});

it("enlarges existing geometry once, preserves nested detail density, and undoes the edit", () => {
  const { doc, agent } = bookshelf();
  expect(
    agent.write(
      'frame inner in detail at 800,120 size 400,400 panel-scale 24 represents 1 "in" { node nested depicts rail face at 820,180 }'
    )
  ).toContain("Done");
  const inner = doc.get("inner")!,
    nested = doc.get("nested")!,
    panel = doc.get("detail")!;
  expect(agent.write('edit detail panel-scale 96 represents 1 "in"')).toContain("Done");
  expect(doc.get("inner")!.x).toBe(panel.x + 2 * (inner.x - panel.x));
  expect(doc.get("nested")!.width).toBe(300);
  expect(doc.get("nested")!.x - doc.get("inner")!.x).toBe(nested.x - inner.x);
  expect(doc.get("closeup")!.width).toBe(1200);
  agent.undoLast();
  expect(doc.get("closeup")!.width).toBe(600);
  expect(doc.get("nested")!.x).toBe(nested.x);
  const label = doc.get("label")!;
  expect(agent.write('edit detail calibrate-panel 24 represents 1 "in"')).toContain("Done");
  expect(doc.get("label")).toMatchObject({ x: label.x, width: label.width });
  expect(doc.get("closeup")!.width).toBe(300);
  expect(agent.write("edit detail panel-scale inherit")).toContain("Done");
  expect(doc.get("closeup")!.width).toBe(150);
});

it("converges after concurrent physical and scale edits, including cached descendant reads", () => {
  const { doc, agent } = bookshelf();
  const peer = new CanvasDocument();
  Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(doc.doc));
  peer.list();
  doc.list();
  expect(agent.write('edit detail panel-scale 96 represents 1 "in"')).toContain("Done");
  peer.patch("closeup", { width: 624 });
  const update = Y.encodeStateAsUpdate(peer.doc);
  Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(doc.doc));
  Y.applyUpdate(doc.doc, update);
  for (const canvas of [doc, peer]) {
    expect(canvas.list().find((item) => item.id === "closeup")?.width).toBe(1248);
    expect(canvas.get("front")?.width).toBe(156);
  }
});

it("imports a selected panel or detached view without overwriting the destination scale", () => {
  const { doc } = bookshelf();
  const copy = new CanvasDocument();
  copy.setCalibration({ world: 24, distance: 1, unit: "in" });
  importDocument(copy, serializeDocument(doc, ["detail"]));
  expect(copy.get("closeup")?.width).toBe(600);
  expect(copy.calibration()?.world).toBe(24);
  const ids = importDocument(copy, serializeDocument(doc, ["closeup"]));
  expect(copy.get(ids[0])).toMatchObject({ width: 300, inside: "" });
  expect(copy.calibration()?.world).toBe(24);
});

it("keeps old keyword IDs and rejects an invalid panel edit atomically", () => {
  const { doc, agent } = bookshelf();
  expect(agent.write('node panel-scale "Old ID"')).toContain("Done");
  const before = serializeDocument(doc);
  expect(agent.write('edit closeup panel-scale 10 represents 1 "in"')).toContain(
    "Nothing was changed"
  );
  expect(agent.write('edit detail panel-scale -1 represents 1 "in"')).toContain(
    "Nothing was changed"
  );
  expect(serializeDocument(doc)).toBe(before);
});

it("uses physical changes earlier in a batch to place the next object", () => {
  const { doc, agent } = bookshelf();
  expect(
    agent.write('part rail board length "20 in"\nnode next right of closeup in detail')
  ).toContain("Done");
  expect(doc.get("next")!.x).toBe(doc.get("closeup")!.x + 20 * 48 + 40);
});

it("scales pending internal bends, paint and arranged spacing exactly once", () => {
  const doc = new CanvasDocument();
  const agent = new LanguageSession(doc, "Builder");
  expect(
    agent.write(
      [
        'scale 10 represents 1 "in"',
        "frame panel at 100,100 size 1000,600 scale-contents",
        "node a in panel at 200,200 size 50,50",
        "node b in panel at 350,200 size 50,50",
        "a -> b as joint in panel via 300,250 label-at 0.5,10",
        'edit panel panel-scale 20 represents 1 "in"',
      ].join("\n")
    )
  ).toContain("Done");
  expect(doc.get("joint")).toMatchObject({ points: [[500, 400]], x: 0.5, y: 10 });
  expect(doc.get("a")).toMatchObject({ x: 300, y: 300, width: 100, look: { scale: 2 } });
  expect(
    agent.write("frame rowdetail row gap 10 { node one size 50,20; node two size 50,20 }")
  ).toContain("Done");
  expect(agent.write('edit rowdetail panel-scale 30 represents 1 "in"')).toContain("Done");
  expect(doc.get("two")!.x - doc.get("one")!.x - doc.get("one")!.width).toBe(30);
  const row = doc.get("one")!;
  expect(agent.write('edit rowdetail calibrate-panel 60 represents 1 "in"')).toContain("Done");
  expect(doc.get("one")).toMatchObject({ x: row.x, y: row.y, width: row.width });
  const copy = new CanvasDocument();
  importDocument(copy, serializeDocument(doc));
  expect(copy.get("rowdetail")?.panelPaddingScale).toBe(3);
});

it("applies a border resize and drawing magnification once each", () => {
  const doc = new CanvasDocument();
  const agent = new LanguageSession(doc, "Builder");
  expect(
    agent.write(
      'scale 10 represents 1 "in"\nframe detail at 0,0 size 500,500 scale-contents { node mark at 100,100 size 10,20 }'
    )
  ).toContain("Done");
  expect(agent.write('edit detail size 1000,1000 panel-scale 20 represents 1 "in"')).toContain(
    "Done"
  );
  expect(doc.get("mark")).toMatchObject({
    x: 400,
    y: 400,
    width: 40,
    height: 80,
    look: { scale: 4 },
  });
});

it("falls back to the sheet for missing or cyclic holders", () => {
  const root = { world: 12, distance: 1, unit: "in" };
  const cycle = { type: "group" as const, inside: "group", panelCalibration: null };
  for (const holder of ["group", "missing"])
    expect(contentScale(holder, root, (id) => (id === "group" ? cycle : undefined))).toEqual({
      owner: "",
      calibration: root,
    });
});
