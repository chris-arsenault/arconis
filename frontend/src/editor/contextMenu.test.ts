import { describe, expect, it } from "vitest";
import { menuGroups, ringEntries } from "./contextMenu";
import type { CommandContext } from "./registry";
import { CanvasDocument } from "../document/canvasDocument";
import type { Item } from "../document/types";
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

describe("the command ring", () => {
  it("lays an object's ring out as a compass: branch north, relate east, delete south, tag west", () => {
    const { document, items } = notes(1);
    const ring = ringEntries(context(items, document), null);
    expect(ring.map((entry) => entry?.id ?? null)).toEqual([
      "structure.branch",
      "ring.colour",
      "structure.relate",
      "comments.open",
      "edit.delete",
      "ring.more",
      "fields.tag",
      "ring.shape",
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
    expect(ring[5]).toMatchObject({ id: "ring.more", more: true });
  });

  it("offers creation and navigation on empty canvas, not view settings", () => {
    const document = new CanvasDocument();
    const ids = ringEntries(context([], document), null).map((entry) => entry?.id);
    expect(ids.slice(0, 3)).toEqual(["create.noteHere", "create.textHere", "create.frameHere"]);
    expect(ids).not.toContain("view.grid");
    expect(ids).not.toContain("view.references");
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
    expect(marker?.submenu).toHaveLength(10);
    expect(groups.flat().map((entry) => entry.id)).toContain("fields.tag");
  });

  it("folds alignment into a submenu once several objects are selected", () => {
    const { document, items } = notes(3);
    const entries = menuGroups(context(items, document)).flat();
    const align = entries.find((entry) => entry.label === "Align");
    expect(align?.submenu?.map((entry) => entry.id)).toContain("arrange.align.left");
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
