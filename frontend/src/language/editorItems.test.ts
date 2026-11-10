import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument } from "../files/canvasFile";
import { LOCAL } from "../document/types";
import { reflowArrangements } from "../editor/arrangements";
import { parse } from "./parser";
import { printCanvas } from "./printer";
import { writeStatements } from "./writer";

function write(document: CanvasDocument, text: string) {
  document.doc.transact(() => writeStatements(document, parse(text), { author: "Agent" }), LOCAL);
}
function canvas(text: string) {
  const document = new CanvasDocument();
  write(document, text);
  return document;
}
const get = (document: CanvasDocument, id: string) => document.get(id)!;
const xs = (document: CanvasDocument, ids: string[]) => ids.map((id) => get(document, id).x);

describe("arrows at both ends", () => {
  it("writes <-> as an arrow at each end, and prints it back the same way", () => {
    const document = canvas(
      'node a "A" at 0,0\nnode b "B" at 400,0\na <-> b as both\na -> b as one start-arrow open'
    );
    expect(get(document, "both").look).toEqual({ startArrow: "arrow" });
    expect(get(document, "one").look).toEqual({ startArrow: "open" });
    const text = printCanvas(document);
    expect(text).toContain("a <-> b as both");
    expect(text).toContain("a -> b as one start-arrow open");
  });
});

describe("trees written in one go", () => {
  it("places each branch under the one before it and tidies the tree it is building", () => {
    const document = canvas(`
      node root "Root" at 0,300
      root => node a "A"
      a => node a1 "A1"
      a => node a2 "A2"
      root => node b "B"
      tidy root
    `);
    const [a, a1, a2, b] = ["a", "a1", "a2", "b"].map((id) => get(document, id));
    expect(a1.y).toBeLessThan(a2.y);
    expect(a.y).toBeLessThan(b.y);
    expect(a1.x).toBeGreaterThan(a.x + a.width);
    expect(b.x).toBe(a.x);
  });
});

describe("shared trunks", () => {
  it("runs a fan-out through a junction placed between its start and ends", () => {
    const document = canvas(`
      node api "API" at 0,100
      node bus "Bus" at 600,0
      node logic "Logic" at 600,300
      api -> bus "Async", logic "Sync" shared dashed
    `);
    const junction = document.list().find((item) => item.stencil === "junction")!;
    const api = get(document, "api");
    expect(junction.x).toBeGreaterThan(api.x + api.width);
    expect(junction.x + junction.width).toBeLessThan(600);
    expect(junction.y + junction.height / 2).toBe(api.y + api.height / 2);
    const lines = document.list().filter((item) => item.type === "line");
    expect(lines).toHaveLength(3);
    const trunk = lines.find((line) => line.from === "api")!;
    expect(trunk).toMatchObject({ to: junction.id, look: { arrow: "none", dashed: true } });
    expect(lines.filter((line) => line.from === junction.id).map((line) => line.name)).toEqual([
      "Async",
      "Sync",
    ]);
  });

  it("asks for a fan-out", () => {
    expect(() => canvas('node a "A"\nnode b "B"\na -> b shared')).toThrow(/fan out/);
  });
});

describe("routing around items", () => {
  const WALLED = 'node a "A" at 0,0\nnode wall "Wall" at 250,-100 size 60,300\nnode b "B" at 500,0';

  it("places a line's points around what is between its ends, once", () => {
    const document = canvas(`${WALLED}\na -> b as l around`);
    const line = get(document, "l");
    expect(line.look).toEqual({});
    expect(line.fromPort).toEqual([1, 0.5]);
    expect(line.toPort).toEqual([0, 0.5]);
    // A cornered line keeps a point mid-way along each segment; one passes above or below the wall.
    expect(line.points.some(([, y]) => y < -100 || y > 200)).toBe(true);
    const text = printCanvas(document);
    expect(text).toMatch(/a\.right -> b\.left as l via /);
    expect(text).not.toContain("around");
  });

  it("keeps a diagonal line's corners as its points, for people to drag", () => {
    const document = canvas(`${WALLED}\na -> b as l path diagonal around`);
    const { points, look } = get(document, "l");
    expect(look.path).toBe("diagonal");
    for (let index = 1; index < points.length; index++) {
      const [[x1, y1], [x2, y2]] = [points[index - 1], points[index]];
      expect(x1 === x2 || y1 === y2).toBe(true);
    }
  });
});

describe("arranged frames", () => {
  const ROW = `
    frame f "Row" at 0,0 row gap 20 {
      node a "A"
      node b "B"
      node c "C"
    }
  `;

  it("keep their arrangement, and print it", () => {
    const document = canvas(ROW);
    expect(get(document, "f").arrange).toEqual({ how: "row", gap: 20, align: "center" });
    expect(printCanvas(document)).toMatch(/frame f "Row" row gap 20 at /);
  });

  it("place new members after the rest and close gaps when one goes", () => {
    const document = canvas(ROW);
    const [a, b] = xs(document, ["a", "b"]);
    write(document, 'node d "D" in f');
    expect(get(document, "d").x).toBe(get(document, "c").x + 160 + 20);
    write(document, "delete b");
    expect(xs(document, ["a", "c"])).toEqual([a, b]);
    const frame = get(document, "f");
    expect(frame.x + frame.width).toBe(get(document, "d").x + 160 + 24);
  });

  it("reorder a member moved to another place, for agents and for people", () => {
    const document = canvas(ROW);
    const slots = xs(document, ["a", "b", "c"]);
    write(document, "edit a at 500,40");
    expect(xs(document, ["b", "c", "a"])).toEqual(slots);
    document.patch("c", { x: -100 });
    reflowArrangements(document);
    expect(xs(document, ["c", "b", "a"])).toEqual(slots);
  });

  it("stay as a file wrote them, and free stops arranging", () => {
    const document = canvas(ROW);
    get(document, "a");
    const text = printCanvas(document).replace(/node a "A" at -?[\d.]+,/, 'node a "A" at 900,');
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(get(copy, "a").x).toBe(900);
    write(document, "edit f free\nedit a at 500,40");
    expect(get(document, "a").x).toBe(500);
  });
});
