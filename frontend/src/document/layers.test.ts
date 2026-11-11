import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";
import { LOCAL } from "./types";
import { BASE_LAYER, hiddenByLayers, layeredStack, layerOf, lockedByLayers, byIds } from "./layers";
import { layerCommands } from "./layerCommands";
import { importDocument } from "../files/canvasFile";
import { parse } from "../language/parser";
import { printCanvas } from "../language/printer";
import { writeStatements } from "../language/writer";

function write(document: CanvasDocument, text: string) {
  document.doc.transact(() => {
    writeStatements(document, parse(text), { author: "Agent", now: 1000 });
  }, LOCAL);
}
function canvas(text: string) {
  const document = new CanvasDocument();
  write(document, text);
  return document;
}
const stack = (document: CanvasDocument) =>
  layeredStack(document.list(), document.layerList()).map((item) => item.id);

describe("layers", () => {
  it("opens a canvas without layers as one base layer, stacked as before", () => {
    const document = canvas('node a "A"\nnode b "B"\nslide s "S" deck d at 0,0');
    expect(document.layerList()).toEqual([
      { id: BASE_LAYER, name: "Workspace", order: 0, locked: false },
    ]);
    // Slides sit beneath everything, as they always were created.
    expect(stack(document)).toEqual(["s", "a", "b"]);
  });

  it("draws each layer above the ones beneath it, whatever its items' own order", () => {
    const document = canvas(`
      layer top "Top"
      node late "Late"
      node early "Early" in-layer top
      node later "Later"
      drawing mark markup points 0,0 10,10
      slide s "S" deck d
    `);
    // early was written before later, yet its layer is above the base layer.
    expect(stack(document)).toEqual(["s", "late", "later", "early", "mark"]);
    layerCommands.move(document, "top", 0);
    expect(stack(document)).toEqual(["s", "early", "late", "later", "mark"]);
  });

  it("keeps contents in their holder's layer, and the layer when they leave", () => {
    const document = canvas(`
      layer notes "Notes"
      frame f "F" in-layer notes { node inner "Inner" }
    `);
    const byId = byIds(document.list());
    expect(layerOf(document.get("inner")!, byId)).toBe("notes");
    document.patch("inner", { inside: "" });
    expect(document.get("inner")!.layer).toBe("notes");
    document.patch("inner", { inside: "f" });
    expect(document.get("inner")!.layer).toBe("");
    expect(() => write(document, "edit inner in-layer base")).toThrow(/inside "f"/);
  });

  it("hides a layer's items and the lines into them, but not slides or markup", () => {
    const document = canvas(`
      layer back "Back"
      node a "A" in-layer back
      node b "B"
      a -> b
      slide s "S" deck d
      drawing mark markup points 0,0 10,10
    `);
    const line = document.list().find((item) => item.type === "line")!;
    const hidden = hiddenByLayers(document.list(), new Set(["back"]), document.layerList());
    expect(hidden).toEqual(new Set(["a", line.id]));
  });
});

describe("layer commands", () => {
  it("merges a layer down without changing what draws above what, all undoable", () => {
    const document = canvas(`
      layer mid "Mid"
      node upper "Upper" in-layer mid
      node lower "Lower"
    `);
    document.undo.clear();
    const before = stack(document);
    expect(layerCommands.mergeDown(document, "mid")).toBe(true);
    expect(document.layerList().map((layer) => layer.id)).toEqual([BASE_LAYER]);
    expect(document.get("upper")!.layer).toBe("");
    expect(stack(document)).toEqual(before);
    document.undo.undo();
    expect(document.layerList().map((layer) => layer.id)).toEqual([BASE_LAYER, "mid"]);
    expect(document.get("upper")!.layer).toBe("mid");
  });

  it("deletes a layer with its items, never the base layer", () => {
    const document = canvas(`
      layer gone "Gone"
      frame f "F" in-layer gone { node inner "Inner" }
      node kept "Kept"
    `);
    expect(layerCommands.delete(document, BASE_LAYER)).toBe(false);
    expect(layerCommands.delete(document, "gone")).toBe(true);
    expect(document.list().map((item) => item.id)).toEqual(["kept"]);
    document.undo.undo();
    expect(document.get("inner")).not.toBeNull();
  });

  it("puts new objects in the active layer and moves only top-level items between layers", () => {
    const document = canvas('frame f "F" { node inner "Inner" }');
    const id = layerCommands.create(document, "Sketches");
    document.activeLayer = id;
    const made = document.create("node", 0, 0);
    expect(document.get(made)!.layer).toBe(id);
    expect(layerCommands.moveItems(document, ["f", "inner"], id)).toEqual(["inner"]);
    expect(document.get("f")!.layer).toBe(id);
    // A layer someone deleted gives new objects to the base layer.
    layerCommands.delete(document, id);
    expect(document.get(document.create("node", 0, 0))!.layer).toBe("");
  });

  it("converges between peers", () => {
    const [a, b] = [new CanvasDocument(), new CanvasDocument()];
    const sync = () => {
      Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)));
      Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)));
    };
    write(a, 'layer one "One"\nnode x "X" in-layer one');
    write(b, 'layer two "Two"\nnode y "Y" in-layer two');
    sync();
    expect(a.layerList()).toEqual(b.layerList());
    expect(stack(a)).toEqual(stack(b));
  });
});

describe("layers in the canvas language", () => {
  it("round-trips a file, the base layer's place included", () => {
    const document = canvas(`
      layer under "Under"
      layer over "Over"
      node a "A" in-layer under
      node b "B"
      node c "C" in-layer over
      a -> c in-layer over
    `);
    layerCommands.move(document, BASE_LAYER, 2);
    layerCommands.rename(document, BASE_LAYER, "Diagram");
    const text = printCanvas(document);
    expect(text).toContain(
      'layer under "Under"\nlayer over "Over"\nlayer base "Diagram" above over'
    );
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(copy.layerList().map((layer) => [layer.id, layer.name])).toEqual([
      ["under", "Under"],
      ["over", "Over"],
      [BASE_LAYER, "Diagram"],
    ]);
    expect(printCanvas(copy)).toBe(text);
  });

  it("declares, moves, renames, merges and deletes layers", () => {
    const document = canvas(`
      layer a "A"
      layer b "B" below a
      layer a "Renamed"
      node x "X" in-layer b
      node y "Y" in-layer a
    `);
    expect(document.layerList().map((layer) => layer.id)).toEqual([BASE_LAYER, "b", "a"]);
    write(document, "layer b above a\nmerge a into b");
    expect(document.layerList().map((layer) => layer.id)).toEqual([BASE_LAYER, "b"]);
    expect(document.get("y")!.layer).toBe("b");
    write(document, "delete layer b");
    expect(document.list()).toHaveLength(0);
  });

  it("refuses unknown layers, markup in a layer and removing the base layer", () => {
    const document = canvas('node a "A"');
    expect(() => write(document, "edit a in-layer nowhere")).toThrow(/no layer "nowhere"/);
    expect(() => write(document, "drawing d markup in-layer base points 0,0 1,1")).toThrow(
      /belong to no layer/
    );
    expect(() => write(document, "delete layer base")).toThrow(/base layer stays/);
    expect(() => write(document, "merge base into base")).toThrow(/base layer stays/);
  });

  it("carries a copied item's layer, and leaves the room's own layers alone when opened", () => {
    const source = canvas('layer notes "Notes"\nnode a "A" in-layer notes\nnode b "B"');
    const copied = printCanvas(source, { ids: ["a"] });
    expect(copied).toContain('layer notes "Notes"');
    const room = canvas('layer notes "Mine"');
    importDocument(room, copied);
    expect(room.layerList().find((layer) => layer.id === "notes")!.name).toBe("Mine");
    expect(room.list()[0].layer).toBe("notes");
  });
});

describe("layer locks and the room's defaults", () => {
  it("locks a layer for everyone, covering what its items hold and nothing else", () => {
    const document = canvas(`
      layer plan "Plan"
      frame room "Room" in-layer plan { node desk "Desk" }
      node loose "Loose"
      drawing mark markup points 0,0 10,10`);
    expect(lockedByLayers(document.list(), document.layerList()).size).toBe(0);
    expect(layerCommands.lock(document, "plan", true)).toBe("");
    expect(document.layerList().find((layer) => layer.id === "plan")!.locked).toBe(true);
    const held = [...lockedByLayers(document.list(), document.layerList())];
    held.sort((a, b) => a.localeCompare(b));
    expect(held).toEqual(["desk", "room"]);
    // Renaming and moving a locked layer keep it locked.
    layerCommands.rename(document, "plan", "Floor plan");
    layerCommands.move(document, "plan", 0);
    expect(document.layerList()[0]).toMatchObject({ id: "plan", name: "Floor plan", locked: true });
    document.undo.undo();
    document.undo.undo();
    document.undo.undo();
    expect(document.layerList().find((layer) => layer.id === "plan")!.locked).toBe(false);
  });

  it("starts each person on the room's default layer until they choose or contribute", () => {
    const document = canvas('layer ideas "Ideas"\nlayer plan "Plan"');
    expect(document.activeLayer).toBe(BASE_LAYER);
    expect(layerCommands.makeDefault(document, "ideas")).toBe("");
    expect(document.defaultLayer()).toBe("ideas");
    expect(document.activeLayer).toBe("ideas");
    // Someone who has not contributed follows a change of default.
    layerCommands.makeDefault(document, "plan");
    expect(document.activeLayer).toBe("plan");
    // Contributing settles their layer, so a later change does not move them.
    const made = document.create("node", 0, 0);
    expect(document.get(made)!.layer).toBe("plan");
    layerCommands.makeDefault(document, "ideas");
    expect(document.activeLayer).toBe("plan");
    // Their own choice stands the same way.
    document.activeLayer = BASE_LAYER;
    expect(document.activeLayer).toBe(BASE_LAYER);
    // Deleting the default returns newcomers to the base layer.
    layerCommands.delete(document, "ideas");
    expect(document.defaultLayer()).toBe(BASE_LAYER);
  });

  it("never leaves new objects going into a locked layer", () => {
    const document = canvas('layer ideas "Ideas"\nlayer plan "Plan"');
    layerCommands.makeDefault(document, "ideas");
    // The default cannot be locked, and a locked layer cannot become the default.
    expect(layerCommands.lock(document, "ideas", true)).toContain("default");
    expect(document.layerList().find((layer) => layer.id === "ideas")!.locked).toBe(false);
    layerCommands.lock(document, "plan", true);
    expect(layerCommands.makeDefault(document, "plan")).toContain("locked");
    expect(document.defaultLayer()).toBe("ideas");
    // A person working in a layer someone then locks falls back to the default.
    layerCommands.lock(document, "plan", false);
    document.activeLayer = "plan";
    layerCommands.lock(document, "plan", true);
    expect(document.activeLayer).toBe("ideas");
    expect(document.get(document.create("node", 0, 0))!.layer).toBe("ideas");
  });

  it("names the jump point a room opens on, until the mark or the object is gone", () => {
    const document = canvas('node start "Start here" jump\nnode other "Other"');
    expect(document.opening()).toBe("");
    document.setOpening("start");
    expect(document.opening()).toBe("start");
    // The opening view is one of the jump points: without the mark the room opens at the origin.
    document.patch("start", { jump: false });
    expect(document.opening()).toBe("");
    document.patch("start", { jump: true });
    expect(document.opening()).toBe("start");
    document.items.delete("start");
    expect(document.opening()).toBe("");
  });
});

describe("layer locks and the room's defaults in the canvas language", () => {
  it("writes and round-trips locked layers, the default layer and the opening view", () => {
    const document = canvas(`
      layer plan "Plan" locked
      layer ideas "Ideas" default
      node start "Start here" in-layer ideas
      opening start`);
    expect(document.layerList().find((layer) => layer.id === "plan")!.locked).toBe(true);
    expect(document.defaultLayer()).toBe("ideas");
    expect(document.opening()).toBe("start");
    // The opening object is listed with the jump points.
    expect(document.get("start")!.jump).toBe(true);
    const text = printCanvas(document);
    expect(text).toContain('layer plan "Plan" locked');
    expect(text).toContain('layer ideas "Ideas" default');
    expect(text.trimEnd().endsWith("opening start")).toBe(true);
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(copy.layerList()).toEqual(document.layerList());
    expect(copy.defaultLayer()).toBe("ideas");
    expect(copy.opening()).toBe("start");

    // A selection copied out carries neither of the room's own settings.
    expect(printCanvas(document, { ids: ["start"] })).not.toContain("default");
    expect(printCanvas(document, { ids: ["start"] })).not.toContain("opening");

    write(document, "layer plan locked off\nlayer base default\nopening none");
    expect(document.layerList().find((layer) => layer.id === "plan")!.locked).toBe(false);
    expect(document.defaultLayer()).toBe(BASE_LAYER);
    expect(document.opening()).toBe("");
    // The language still edits a locked layer's items: the lock guards the pointer only.
    write(document, 'layer plan locked\nnode desk "Desk" in-layer plan\nedit desk "Standing desk"');
    expect(document.get("desk")!.name).toBe("Standing desk");
  });

  it("refuses a locked default, an unknown opening object, and keeps a room's own settings on import", () => {
    const document = canvas('layer ideas "Ideas" default\nnode here "Here"\nopening here');
    expect(() => write(document, "layer ideas locked")).toThrow(/default/);
    expect(() => write(document, 'layer plan "Plan" locked default')).toThrow(/default/);
    expect(() => write(document, "opening nowhere")).toThrow(/no item "nowhere"/);
    expect(document.layerList().some((layer) => layer.id === "plan")).toBe(false);
    // A file opened into this room adds its content but not its default layer or opening view.
    importDocument(
      document,
      'arconis 1\nlayer theirs "Theirs" default\nnode there "There"\nopening there'
    );
    expect(document.get("there")).not.toBeNull();
    expect(document.defaultLayer()).toBe("ideas");
    expect(document.opening()).toBe("here");
  });
});
