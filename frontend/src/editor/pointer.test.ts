import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { wedgeAt } from "./pointerButtons";
import { menuContextOf } from "./contextMenu";
import { changeKind, clearWaypoints, fitFrameToContents, reverseLine, swapPositions } from "./swap";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

describe("the ring's wedges", () => {
  it("counts clockwise from the top, with each wedge centred on its direction", () => {
    expect(wedgeAt(0, -10, 8)).toBe(0);
    expect(wedgeAt(10, -10, 8)).toBe(1);
    expect(wedgeAt(10, 0, 8)).toBe(2);
    expect(wedgeAt(0, 10, 8)).toBe(4);
    expect(wedgeAt(-10, 0, 8)).toBe(6);
    expect(wedgeAt(-3, -10, 8)).toBe(0);
    expect(wedgeAt(0, -10, 7)).toBe(0);
  });

  it("chooses the menu by what is selected", () => {
    const document = canvas(
      'node a "A" at 0,0\nnode b "B" at 300,0\na -> b as l\nslide s deck pitch'
    );
    const get = (id: string) => document.get(id)!;
    expect(menuContextOf([])).toBe("canvas");
    expect(menuContextOf([get("a")])).toBe("object");
    expect(menuContextOf([get("l")])).toBe("line");
    expect(menuContextOf([get("s")])).toBe("slide");
    expect(menuContextOf([get("a"), get("l")])).toBe("object");
  });
});

describe("swapping in place and the line and frame verbs", () => {
  it("changes an object's kind, keeping everything else", () => {
    const document = canvas(
      'note n "Keep me" tags x at 10,20 size 200,100\nnode r "R" at 400,0\nn -> r as l'
    );
    changeKind(document, ["n", "l"], "decision");
    expect(document.get("n")).toMatchObject({
      type: "node",
      stencil: "decision",
      name: "Keep me",
      tags: ["x"],
      x: 10,
      width: 200,
    });
    expect(document.get("l")!.from).toBe("n");
    changeKind(document, ["n"], "card");
    expect(document.get("n")).toMatchObject({ type: "card", stencil: "rectangle" });
  });

  it("swaps two objects' places with their contents", () => {
    const document = canvas(`
      frame f "F" at 0,0 size 300,200 { note inner "In" at 20,40 }
      node g "G" at 600,600 size 100,100
    `);
    const centre = (id: string) => {
      const item = document.get(id)!;
      return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    };
    const [fBefore, gBefore] = [centre("f"), centre("g")];
    const innerOffset = document.get("inner")!.x - document.get("f")!.x;
    expect(swapPositions(document, "f", "g")).toBe(true);
    expect(centre("f")).toEqual(gBefore);
    expect(centre("g")).toEqual(fBefore);
    expect(document.get("inner")!.x).toBe(document.get("f")!.x + innerOffset);
  });

  it("reverses a line and clears its bend points", () => {
    const document = canvas(
      'node a "A" at 0,0\nnode b "B" at 300,0\na.right -> b.left as l via 100,50 label-at 10,0 start-arrow open'
    );
    expect(reverseLine(document, "l")).toBe(true);
    expect(document.get("l")).toMatchObject({
      from: "b",
      to: "a",
      fromPort: [0, 0.5],
      toPort: [1, 0.5],
      look: { arrow: "open", startArrow: "arrow" },
    });
    expect(clearWaypoints(document, "l")).toBe(true);
    expect(document.get("l")).toMatchObject({ points: [], x: 0, y: 0 });
  });

  it("fits a frame around what it holds", () => {
    const document = canvas(
      'frame f "F" at 0,0 size 900,900 { node a "A" at 100,100 size 160,90 }'
    );
    expect(fitFrameToContents(document, "f")).toBe(true);
    const f = document.get("f")!;
    expect(f.x).toBeLessThan(100);
    expect(f.x + f.width).toBeGreaterThan(260);
    expect(f.width).toBeLessThan(400);
  });
});
