import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { historyEntries, labelHistory } from "./history";
import { treeAsMarkdown } from "./exportCommands";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";

describe("history people can read", () => {
  it("labels each undo step by what it did, newest first, and lists redo steps", () => {
    const document = new CanvasDocument();
    const stop = labelHistory(document);
    const id = document.create("note", 0, 0, { name: "Plan" });
    document.undo.stopCapturing();
    document.patch(id, { x: 100, y: 40 });
    document.undo.stopCapturing();
    document.editText(id, "Plan B");
    document.undo.stopCapturing();
    document.patchLook(id, { fill: "#ffd9da" });
    document.undo.stopCapturing();
    document.remove([id]);
    const before = historyEntries(document);
    // Each label reads the name the object had when the step was made.
    expect(before.undo).toEqual([
      "Delete 1 object",
      "Restyle Plan B",
      "Edit text of Plan B",
      "Move Plan",
      "Add Plan",
    ]);
    document.undo.undo();
    document.undo.undo();
    const after = historyEntries(document);
    expect(after.undo).toEqual(["Edit text of Plan B", "Move Plan", "Add Plan"]);
    // Redo steps say what redoing does, naming the object that undoing brought back.
    expect(after.redo).toEqual(["Restyle Plan B", "Delete Plan B"]);
    stop();
  });
});

describe("a tree as Markdown", () => {
  it("writes an indented list in the order the branches sit", () => {
    const document = new CanvasDocument();
    document.doc.transact(
      () =>
        writeStatements(
          document,
          parse(`
            node root "Plan" at 0,300
            root => node a "Research"
            a => node a1 "Interviews"
            root => node b "Build"
            tidy root right
          `),
          { author: "" }
        ),
      LOCAL
    );
    expect(treeAsMarkdown(document.list(), "root")).toBe(
      "- Plan\n  - Research\n    - Interviews\n  - Build"
    );
  });
});
