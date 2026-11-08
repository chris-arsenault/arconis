import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type Item } from "../document/types";
import { importDocument } from "../document/files";
import { parse } from "./parser";
import { printCanvas } from "./printer";
import { writeStatements } from "./writer";
import { footprint } from "./layout";

function write(document: CanvasDocument, text: string) {
  let result!: ReturnType<typeof writeStatements>;
  document.doc.transact(() => {
    result = writeStatements(document, parse(text), { author: "Agent", now: 1000 });
  }, LOCAL);
  return result;
}
function canvas(text: string) {
  const document = new CanvasDocument();
  write(document, text);
  return document;
}
const get = (document: CanvasDocument, id: string) => document.get(id)!;
const centerX = (item: Item) => item.x + item.width / 2;
const centerY = (item: Item) => item.y + item.height / 2;

describe("items and placement", () => {
  it("creates items with the ids, names and look written", () => {
    const document = canvas(`
      style hot fill #ffd9da bold
      node api "Orders API" / "Amazon API Gateway" icon aws:Amazon-API-Gateway
      node db "Orders" database hot below api gap 60
    `);
    expect(get(document, "api")).toMatchObject({
      type: "node",
      stencil: "icon",
      icon: "aws:Amazon-API-Gateway",
      name: "Orders API",
      subtitle: "Amazon API Gateway",
      width: 64,
      height: 64,
    });
    const api = get(document, "api");
    const db = get(document, "db");
    expect(db).toMatchObject({ stencil: "database", style: "hot" });
    expect(document.namedStyle("hot")).toEqual({ fill: "#ffd9da", bold: true });
    // Below the icon's label, centered on the icon.
    expect(db.y).toBeCloseTo(footprint(api).y + footprint(api).height + 60);
    expect(centerX(db)).toBeCloseTo(centerX(api));
  });

  it("places items after the previous one, aligns them and sizes them by others", () => {
    const document = canvas(`
      node a "A" at 100,100
      node b "B"
      node c "C" below a, right with b
      node d "D" width of a height of b middle with a left of a gap 10
    `);
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => get(document, id));
    expect(b).toMatchObject({ x: 100 + 160 + 40, y: 100 });
    expect(c.x + c.width).toBe(b.x + b.width);
    expect(c.y).toBe(a.y + a.height + 40);
    expect(d.x + d.width).toBe(a.x - 10);
    expect(centerY(d)).toBe(centerY(a));
  });

  it("fits frames around their contents and arranges rows, columns and grids", () => {
    const document = canvas(`
      frame f "Layer" at 0,0 row gap 30 {
        node a "A"
        node b "B" size 100,200
        node c "C"
      }
      grid 2 g gap 10 below f {
        node d "D"
        node e "E"
        node h "H"
      }
    `);
    const [f, a, b, c] = ["f", "a", "b", "c"].map((id) => get(document, id));
    expect(a.inside).toBe("f");
    expect(b.x).toBe(a.x + a.width + 30);
    expect(c.x).toBe(b.x + b.width + 30);
    expect(centerY(a)).toBe(centerY(b));
    expect(f.x).toBe(0);
    expect(a.x).toBe(f.x + 24);
    expect(f.x + f.width).toBe(c.x + c.width + 24);
    expect(f.y + f.height).toBe(b.y + b.height + 24);
    const [d, e, h] = ["d", "e", "h"].map((id) => get(document, id));
    expect(e.x).toBe(d.x + d.width + 10);
    expect(h).toMatchObject({ x: d.x, y: d.y + d.height + 10 });
    expect(d.y).toBe(f.y + f.height + 40);
  });
});

describe("lines, changes and mistakes", () => {
  it("builds chains and fan-outs in one statement, declaring items at their ends", () => {
    const document = canvas(`
      node users "Users" person at 0,0
      users -> node cdn "CDN" service -> node r53 "DNS" "routes"
      cdn -> r53, users "back" dashed
      cdn.bottom -- r53.top as plain
      users => node idea "Idea"
    `);
    const items = document.list();
    const lines = items.filter((item) => item.type === "line");
    expect(lines).toHaveLength(5);
    const [users, cdn, r53] = ["users", "cdn", "r53"].map((id) => get(document, id));
    expect(cdn.x).toBeGreaterThan(users.x + users.width);
    expect(r53.x).toBeGreaterThan(cdn.x + cdn.width);
    expect(
      lines.find((line) => line.from === "cdn" && line.to === "r53" && line.name === "routes")
    ).toBeTruthy();
    expect(lines.find((line) => line.to === "users")).toMatchObject({
      name: "back",
      look: { dashed: true },
    });
    expect(get(document, "plain")).toMatchObject({
      fromPort: [0.5, 1],
      toPort: [0.5, 0],
      look: { arrow: "none" },
    });
    const branch = items.find((item) => item.type === "branch")!;
    expect(branch).toMatchObject({
      from: "users",
      to: "idea",
      fromPort: [1, 0.5],
      toPort: [0, 0.5],
    });
  });

  it("changes only what a restatement says, moves items into blocks and deletes with contents", () => {
    const document = canvas(`
      frame f "F" at 0,0 { node a "A" fill #ffffff }
      node b "B" at 500,0
      a -> b as l1
    `);
    write(
      document,
      `
      node a "Renamed"
      edit b fill #d9e9ff by 10,0
      f { b }
      a -> b as l1 "calls"
    `
    );
    expect(get(document, "a")).toMatchObject({ name: "Renamed", look: { fill: "#ffffff" } });
    expect(get(document, "b")).toMatchObject({ inside: "f", look: { fill: "#d9e9ff" } });
    expect(get(document, "l1").name).toBe("calls");
    const f = get(document, "f");
    const b = get(document, "b");
    expect(b.y + b.height).toBeLessThanOrEqual(f.y + f.height);
    write(document, "delete f");
    expect(document.list()).toEqual([]);
  });
});

describe("bands and mistakes", () => {
  it("lays a band behind what it covers, across frames", () => {
    const document = canvas(`
      frame cloud "Cloud" at 0,0 {
        frame r1 "Region one" { node a "A" }
        frame r2 "Region two" below r1 { node b "B" below a gap 100 }
      }
      band rep "Replication" / "Global tables" over a, b
    `);
    const [band, a, b, r1] = ["rep", "a", "b", "r1"].map((id) => get(document, id));
    expect(band.inside).toBe("cloud");
    expect(band.order).toBeLessThan(r1.order);
    expect(band.x).toBeLessThan(a.x);
    expect(band.y + band.height).toBeGreaterThan(b.y + b.height);
    expect(centerX(b)).toBe(centerX(a));
  });

  it("explains mistakes by line and changes nothing", () => {
    const document = canvas('node a "A"');
    const before = printCanvas(document);
    expect(() => write(document, 'node b "B"\nnode c "C" servic')).toThrow(
      /Line 2: "servic" is not a stencil/
    );
    expect(() => write(document, "node d below later\nnode later")).toThrow(
      /Line 1: No item has the id "later"/
    );
    expect(() => write(document, "node e at 1")).toThrow(/Line 1: Expected a position as x,y/);
    expect(() => write(document, "frame f {\n node g")).toThrow(/missing its closing/);
    expect(printCanvas(document)).toBe(before);
  });
});

describe("slides", () => {
  it("numbers slides in their deck, places their contents inside and keeps their size", () => {
    const document = canvas(`
      slide s1 "Problem" deck pitch at 0,0 {
        node a "Pain"
        note n "Quote" below a
      }
      slide s2 "Solution" deck pitch right of s1
      slide s3 "Agenda" deck "Q4 Review" 7
      slide s4 "Plain"
      slide s5 "Second plain"
    `);
    const [s1, s2, s3, s4, s5] = ["s1", "s2", "s3", "s4", "s5"].map((id) => get(document, id));
    expect(s1).toMatchObject({ deck: "pitch", slide: 1, width: 1280, height: 720 });
    expect(s2).toMatchObject({ deck: "pitch", slide: 2 });
    expect(s3).toMatchObject({ deck: "Q4 Review", slide: 7 });
    expect(s4).toMatchObject({ deck: "deck", slide: 1 });
    expect(s5).toMatchObject({ deck: "deck", slide: 2 });
    expect(get(document, "a").inside).toBe("s1");
    expect(get(document, "n").inside).toBe("s1");
    expect(get(document, "a").x).toBeGreaterThan(0);
    expect(s2.x).toBe(1280 + 40);
  });

  it("refuses a deck on anything but a slide", () => {
    const document = new CanvasDocument();
    expect(() => write(document, 'node a "A" deck pitch')).toThrow(/Only a slide/);
    expect(document.list()).toHaveLength(0);
  });

  it("prints slides with their deck and number, and reads them back", () => {
    const document = canvas(`
      slide s1 "Problem" deck "Q4 Review" 3 at 0,0 { node a "Pain" }
      edit s1 deck pitch
    `);
    const text = printCanvas(document);
    expect(text).toContain('slide s1 "Problem" deck pitch 3 at 0,0 size 1280,720 {');
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(get(copy, "s1")).toMatchObject({ deck: "pitch", slide: 3, width: 1280, height: 720 });
    expect(get(copy, "a").inside).toBe("s1");
  });
});

describe("files", () => {
  const SOURCE = `
    style region line #00a1c9 dashed title top text-color #00a1c9
    frame r1 "Region" region at 0,0 {
      node s3 "Ingestion" / "Amazon S3" icon aws:Amazon-Simple-Storage-Service
      card bus "Event Bus" / "Amazon EventBridge" icon aws:Amazon-EventBridge right of s3
      note n "Remember \\"quotes\\"" below s3
    }
    band span "Shared" / "two\\nlines" over s3, bus
    s3.right -> bus "Async Write" via 300,40 path diagonal
    comment on s3 "Why S3?"
    view overview "Overview" center 100,100 zoom 1.5
  `;

  it("prints a canvas that reads back to the same canvas", () => {
    const document = canvas(SOURCE);
    const text = printCanvas(document);
    expect(text.startsWith("arconis 1\n")).toBe(true);
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(printCanvas(copy)).toBe(text);
    // A file keeps stacking as the order of its statements, so only the order numbers change.
    const withoutOrder = (items: Item[]) => items.map((item) => ({ ...item, order: 0 }));
    expect(withoutOrder(copy.list())).toEqual(withoutOrder(document.list()));
  });

  it("keeps a file's ids where they are free and renames the rest", () => {
    const document = canvas('node s3 "Mine" at 900,900');
    const file = printCanvas(canvas(SOURCE));
    importDocument(document, file);
    const items = document.list();
    expect(items.filter((item) => item.name === "Ingestion")).toHaveLength(1);
    const ingestion = items.find((item) => item.name === "Ingestion")!;
    expect(ingestion.id).not.toBe("s3");
    const line = items.find((item) => item.type === "line")!;
    expect(line.from).toBe(ingestion.id);
    expect(get(document, "bus").inside).toBe("r1");
  });
});
