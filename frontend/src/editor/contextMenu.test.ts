import { describe, expect, it } from "vitest";
import { menuGroups, MODE_WEDGE, MORE_WEDGE, ringEntries, SUB_RINGS } from "./contextMenu";
import { chooseRingMode } from "./ringModes";
import type { CommandContext } from "./registry";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type Item } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import type { EditorController } from "./controller";
import { EMPTY_FILTER } from "./filter";

/** A context over a document with no graph; the ring and menu need only the selection. */
function context(selected: Item[], document: CanvasDocument): CommandContext {
  return {
    editor: {
      document,
      grid: { visible: false },
      referencesVisible: false,
      history: { canGoBack: () => false, canGoForward: () => false },
      filter: EMPTY_FILTER,
      ui: { palette: false, find: false, filter: false, pasteAs: null, capture: null, menu: null },
      focus: null,
      room: null,
      tool: "select",
    } as unknown as EditorController,
    selected,
    items: document.list(),
  };
}

function notes(count: number) {
  const document = new CanvasDocument();
  const items = Array.from({ length: count }, (_, index) =>
    document.get(document.create("note", index * 300, 0, { name: `N${index}` }))!
  );
  return { document, items };
}

const ids = (ring: ReturnType<typeof ringEntries>) => ring.map((entry) => entry?.id ?? null);

/** The same context with another tool armed. */
function inTool(base: CommandContext, tool: string): CommandContext {
  return { ...base, editor: { ...base.editor, tool } as unknown as EditorController };
}

describe("the command ring", () => {
  it("lays an object's ring out as a compass around Mode west and the menu south-west", () => {
    const { document, items } = notes(1);
    expect(ids(ringEntries(context(items, document), null))).toEqual([
      "structure.branch",
      "ring.colour",
      "structure.relate",
      "comments.open",
      "edit.delete",
      "ring.more",
      "ring.mode",
      "fields.tag",
    ]);
  });

  it("shows short names on wedges while keeping each command's full label", () => {
    const { document, items } = notes(1);
    const [branch] = ringEntries(context(items, document), null);
    expect(branch).toMatchObject({ label: "Add branch", short: "Branch" });
  });

  it("leaves a wedge empty, not shifted, when its command does not apply", () => {
    const { document, items } = notes(3);
    const ring = ringEntries(context(items, document), null);
    expect(ring[0]).toBeNull();
    expect(ring[4]?.id).toBe("edit.delete");
    expect(ring[5]).toMatchObject({ id: "ring.more", kind: "more" });
  });

  it("offers creation and navigation on empty canvas, not view settings", () => {
    const document = new CanvasDocument();
    const canvas = ids(ringEntries(context([], document), null));
    expect(canvas.slice(0, 3)).toEqual(["create.noteHere", "create.textHere", "create.frameHere"]);
    expect(canvas).not.toContain("view.grid");
    expect(canvas).not.toContain("view.references");
  });
});

describe("the ring's modes", () => {
  it("keeps Mode west and the menu south-west on every ring, in every mode", () => {
    const document = new CanvasDocument();
    document.doc.transact(
      () =>
        writeStatements(
          document,
          parse('node a "A" at 0,0\nnode b "B" at 300,0\na -> b as l\nslide s deck pitch'),
          { author: "" }
        ),
      LOCAL
    );
    const [note, line, slide] = ["a", "l", "s"].map((id) => document.get(id)!);
    for (const selected of [[], [note], [line], [slide]])
      for (const tool of ["select", "draw", "markup", "connect", "rectangle", "pan"]) {
        const ring = ringEntries(inTool(context(selected, document), tool), null);
        expect(ring).toHaveLength(8);
        expect(ring[MORE_WEDGE]).toMatchObject({ id: "ring.more", kind: "more" });
        expect(ring[MODE_WEDGE]).toMatchObject({ id: "ring.mode", kind: "ring" });
      }
  });

  it("offers the five modes one stroke from Mode, Back in its place, the current one marked", () => {
    const { document } = notes(0);
    const base = inTool(context([], document), "draw");
    const modes = ringEntries(base, "ring.mode", MODE_WEDGE);
    expect(ids(modes)).toEqual([
      "mode.Draw",
      "mode.Markup",
      null,
      null,
      "mode.Connect",
      "mode.Add",
      "ring.back",
      "mode.Select",
    ]);
    expect(modes.filter((entry) => entry?.kind === "mode" && entry.current)).toHaveLength(1);
    expect(modes[0]).toMatchObject({ kind: "mode", mode: "Draw", current: true });
    // A shape waiting to be placed is the Add mode.
    const adding = ringEntries(inTool(base, "database"), "ring.mode", MODE_WEDGE);
    expect(adding[5]).toMatchObject({ mode: "Add", current: true });
  });

  it("shows a mode's own tools wherever the button is pressed", () => {
    const { document, items } = notes(1);
    for (const selected of [[], items]) {
      const base = context(selected, document);
      expect(ids(ringEntries(inTool(base, "draw"), null)).slice(0, 5)).toEqual([
        "draw.freehand",
        "draw.eyedropper",
        "ring.vector",
        "draw.lasso",
        "ring.erasers",
      ]);
      expect(ids(ringEntries(inTool(base, "markup"), null))[0]).toBe("markup.pen");
      expect(ids(ringEntries(inTool(base, "note"), null))[7]).toBe("ring.stencils");
    }
    // Connect has no tools of its own, so its ring is still about what was pressed.
    expect(ids(ringEntries(inTool(context(items, document), "connect"), null))[4]).toBe(
      "edit.delete"
    );
  });
});

describe("the ring's sub-rings", () => {
  it("puts Back where the wedge that opened a sub-ring was, and none without one", () => {
    const { document, items } = notes(1);
    const base = context(items, document);
    const colours = ringEntries(base, "ring.colour", 1);
    expect(colours[1]).toMatchObject({ id: "ring.back", kind: "back" });
    expect(colours.filter((entry) => entry?.id.startsWith("colour."))).toHaveLength(6);
    const shapes = ringEntries(base, "ring.shape", null);
    expect(shapes.every((entry) => entry?.kind === "command")).toBe(true);
  });

  it("never nests a ring inside a sub-ring, so every command is at most two strokes", () => {
    for (const [id, slots] of Object.entries(SUB_RINGS)) {
      expect(slots.length, id).toBeLessThanOrEqual(id === "ring.shape" ? 8 : 7);
      expect(slots.filter((slot) => slot !== null && slot in SUB_RINGS)).toEqual([]);
    }
  });

  it("switches mode in one choice: Add arms the last shape placed", () => {
    const tools: string[] = [];
    const editor = {
      ui: { menu: { ring: true }, lastShape: "database" },
      setTool: (tool: string) => tools.push(tool),
      emit: () => undefined,
    } as unknown as EditorController;
    chooseRingMode(editor, "Add");
    expect(editor.ui.menu).toBeNull();
    chooseRingMode(editor, "Draw");
    chooseRingMode(editor, "Select");
    expect(tools).toEqual(["database", "draw", "select"]);
  });
});

describe("the context menu", () => {
  it("groups an object's commands by intent and folds markers into a submenu", () => {
    const { document, items } = notes(1);
    const groups = menuGroups(context(items, document));
    const ids = groups.map((group) => group.map((entry) => entry.id));
    expect(ids[0]).toEqual(["edit.text", "edit.fitText", "comments.open"]);
    expect(ids[1]).toContain("structure.relate");
    const marker = groups.flat().find((entry) => entry.label === "Marker");
    expect(marker?.kind === "submenu" && marker.submenu).toHaveLength(6);
    expect(groups.flat().map((entry) => entry.id)).toContain("fields.tag");
  });

  it("folds alignment into a submenu once several objects are selected", () => {
    const { document, items } = notes(3);
    const entries = menuGroups(context(items, document)).flat();
    const align = entries.find((entry) => entry.label === "Align");
    expect(align?.kind === "submenu" && align.submenu.map((entry) => entry.id)).toContain(
      "arrange.align.left"
    );
    expect(entries.some((entry) => entry.id === "arrange.align.left")).toBe(false);
  });

  it("relates two selected objects directly, and one through a picker", () => {
    const one = notes(1);
    const two = notes(2);
    const label = (selection: ReturnType<typeof notes>) =>
      menuGroups(context(selection.items, selection.document))
        .flat()
        .find((entry) => entry.id === "structure.relate")?.label;
    expect(label(one)).toBe("Relate to…");
    expect(label(two)).toBe("Relate these two");
  });
});
