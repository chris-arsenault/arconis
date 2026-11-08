import { expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { LOCAL, type Item } from "./types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { removalClosure } from "./relations";

function fixture() {
  const document = new CanvasDocument();
  const add = (id: string, type: Item["type"], values: Partial<Item> = {}) =>
    document.insert(document.build(type, 0, 0, { id, ...values }));
  document.doc.transact(() => {
    add("holder", "frame");
    add("nested", "group", { inside: "holder" });
    add("child", "note", { inside: "nested" });
    add("outside", "node");
    add("route", "line", { from: "child", to: "outside" });
    add("anchor", "node", { onLine: "route" });
    add("held", "note", { inside: "anchor" });
    add("reference", "reference", { from: "held", to: "outside" });
    add("unrelated", "note");
  });
  document.undo.clear();
  return document;
}

it.each(["document", "language"])(
  "%s deletion shares relationship policy and restores it with Undo",
  (producer) => {
    const document = fixture();
    const before = document.list();
    if (producer === "document") document.remove(["holder"]);
    else
      document.doc.transact(
        () => writeStatements(document, parse("delete holder"), { author: "Agent" }),
        LOCAL
      );
    expect([...document.items.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      "outside",
      "unrelated",
    ]);
    document.undo.undo();
    expect(document.list()).toEqual(before);
    document.destroy();
  }
);

it("deleting a route takes its anchors and their contents, but not either endpoint", () => {
  const document = fixture();
  expect(
    [...removalClosure(document.list(), ["route"])].sort((a, b) => a.localeCompare(b))
  ).toEqual(["anchor", "held", "reference", "route"]);
  document.remove(["route"]);
  expect([...document.items.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
    "child",
    "holder",
    "nested",
    "outside",
    "unrelated",
  ]);
  document.destroy();
});
