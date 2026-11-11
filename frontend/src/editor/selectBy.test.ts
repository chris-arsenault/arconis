import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import {
  children,
  connected,
  inverted,
  nextInStack,
  sameStyle,
  sameType,
  siblings,
} from "./selectBy";
import { copyLook, defaultFields, pasteLook, setDefaultLook } from "./styleClipboard";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}
const sorted = (ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));

describe("selecting by what items share", () => {
  const document = canvas(`
    style warm fill #ffd9da
    frame f "Frame" at 0,0 {
      node a "A" at 20,40
      node b "B" decision warm at 200,40
      note n "N" fill #ffd9da at 20,200
    }
    node c "C" warm at 600,0
    node d "D" ellipse at 900,0 locked
    a -> c as ac
    c => node k "K"
    c => node k2 "K2"
  `);
  const items = document.list();
  const get = (id: string) => document.get(id)!;

  it("finds the same kind and style, leaving locked items alone", () => {
    expect(sorted(sameType(items, [get("a")]))).toEqual(["a", "c", "k", "k2"]);
    expect(sorted(sameType(items, [get("d")]))).toEqual([]);
    expect(sorted(sameStyle(items, [get("b")]))).toEqual(["b", "c"]);
  });

  it("finds children, siblings and what is connected", () => {
    expect(sorted(children(items, [get("f")]))).toEqual(["a", "b", "n"]);
    expect(sorted(children(items, [get("c")]))).toEqual(["k", "k2"]);
    expect(sorted(siblings(items, [get("a")]))).toEqual(["a", "b", "n"]);
    expect(sorted(siblings(items, [get("k")]))).toEqual(["k", "k2"]);
    expect(sorted(connected(items, [get("a")]))).toEqual(["a", "ac", "c"]);
    expect(sorted(inverted(items, [get("c")]))).toEqual(["f", "k", "k2"]);
  });

  it("steps down through a stack under a point and wraps to the top", () => {
    const stacked = canvas(`
      node lower "Low" at 0,0 size 300,300
      node mid "Mid" at 50,50 size 200,200
      node upper "Top" at 100,100 size 100,100
    `).list();
    const point = { x: 150, y: 150 };
    const get = (id: string) => stacked.find((item) => item.id === id)!;
    expect(nextInStack(stacked, [get("upper")], point)?.id).toBe("mid");
    expect(nextInStack(stacked, [get("mid")], point)?.id).toBe("lower");
    expect(nextInStack(stacked, [get("lower")], point)?.id).toBe("upper");
    expect(nextInStack(stacked, [], point)?.id).toBe("upper");
    expect(nextInStack(stacked, [], { x: 900, y: 900 })).toBeNull();
  });
});

describe("carrying a look between items", () => {
  it("pastes the copied style and look over an item's own, and seeds new items on request", () => {
    const document = canvas(`
      style warm fill #ffd9da
      node a "A" warm bold text-size 20 at 0,0
      node b "B" italic at 300,0
    `);
    copyLook(document.get("a")!);
    pasteLook(document, [document.get("b")!]);
    expect(document.get("b")).toMatchObject({ style: "warm", look: { bold: true, textSize: 20 } });
    expect(document.get("b")!.look.italic).toBeUndefined();
    expect(defaultFields("node", "rectangle")).toEqual({});
    setDefaultLook(document, document.get("a")!);
    expect(defaultFields("node", "rectangle")).toEqual({
      style: "warm",
      look: { fill: "#ffd9da", bold: true, textSize: 20 },
    });
    expect(defaultFields("node", "ellipse")).toEqual({});
  });
});
