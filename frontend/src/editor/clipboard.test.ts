import { describe, expect, it } from "vitest";
import { looksLikeLanguage } from "./clipboard";
import { isOutline, outlineOf, pasteStatements } from "./pasteAs";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { branchChildren } from "../document/relations";

function written(text: string, document = new CanvasDocument()) {
  let created: string[] = [];
  document.doc.transact(() => {
    created = writeStatements(document, parse(text), { author: "Test" }).created;
  }, LOCAL);
  return { document, created };
}

describe("telling canvas language from plain text", () => {
  it("accepts files and statements that declare items, and refuses prose", () => {
    expect(looksLikeLanguage('arconis 1\ntitle "x"\nnode a "A" at 0,0 size 160,90')).toBe(true);
    expect(
      looksLikeLanguage('node api "Orders" service\nnode db "Orders" database below api')
    ).toBe(true);
    // A line between ids is language; whether the ids exist is the writer's to say.
    expect(looksLikeLanguage("a -> b")).toBe(true);
    expect(looksLikeLanguage("Hello world")).toBe(false);
    expect(looksLikeLanguage("- milk\n- eggs")).toBe(false);
    expect(looksLikeLanguage("")).toBe(false);
  });
});

describe("pasting plain text as objects", () => {
  const OUTLINE = "Plan\n  Research\n    Interviews\n  Build\n- Ship";

  it("reads indentation, bullets and numbering into an outline", () => {
    expect(outlineOf(OUTLINE)).toEqual([
      { text: "Plan", depth: 0 },
      { text: "Research", depth: 1 },
      { text: "Interviews", depth: 2 },
      { text: "Build", depth: 1 },
      { text: "Ship", depth: 0 },
    ]);
    expect(outlineOf("1. one\n2) two\n\n* three")).toEqual([
      { text: "one", depth: 0 },
      { text: "two", depth: 0 },
      { text: "three", depth: 0 },
    ]);
    expect(isOutline(OUTLINE)).toBe(true);
    expect(isOutline("a\nb")).toBe(false);
  });

  it("writes notes in rows, one per line", () => {
    const { document } = written(pasteStatements("milk\neggs\nbread", "notes").join("\n"));
    const notes = document.list().filter((item) => item.type === "note");
    expect(notes.map((note) => note.name)).toEqual(["milk", "eggs", "bread"]);
    expect(new Set(notes.map((note) => note.y)).size).toBe(1);
  });

  it("writes a tree from the outline, tidied, with the first line as its root", () => {
    const { document } = written(pasteStatements(OUTLINE, "tree").join("\n"));
    const items = document.list();
    const named = (name: string) => items.find((item) => item.name === name)!;
    const children = (name: string) => branchChildren(items, named(name).id).map((c) => c.name);
    expect(children("Plan")).toEqual(["Research", "Build", "Ship"]);
    expect(children("Research")).toEqual(["Interviews"]);
    expect(children("Ship")).toEqual([]);
  });

  it("branches every top-level line from a chosen topic instead", () => {
    const base = written('node root "Root" at 0,0');
    written(pasteStatements("a\n  b\nc", "tree", "root").join("\n"), base.document);
    const items = base.document.list();
    const children = (id: string) => branchChildren(items, id).map((c) => c.name);
    expect(children("root")).toEqual(["a", "c"]);
    expect(children(items.find((item) => item.name === "a")!.id)).toEqual(["b"]);
  });

  it("keeps a text block's lines and Markdown as one item", () => {
    const { document } = written(pasteStatements("# Title\n\nBody *here*", "text").join("\n"));
    const [text] = document.list();
    expect(text.type).toBe("text");
    expect(text.name).toBe("# Title\n\nBody *here*");
    expect(text.look.textFit).toBe("height");
  });
});
