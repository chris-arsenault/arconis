import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type Item } from "../document/types";
import { parse } from "./parser";
import { writeStatements } from "./writer";
import { LanguageSession } from "./session";
import { REFERENCE_DIAGRAM } from "./referenceDiagram";
import { intersects } from "./layout";

function personWrites(document: CanvasDocument, text: string) {
  document.doc.transact(() => writeStatements(document, parse(text), { author: "Person" }), LOCAL);
}

describe("an agent's session", () => {
  it("writes a section in one call and reports where things landed", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Agent");
    const reply = session.write(`
      frame f "Services" {
        node a "API" service
        node b "Worker" service
      }
      a -> b "jobs"
    `);
    expect(reply).toMatch(/Done: 4 created/);
    expect(reply).toMatch(/node a "API" service at \d+,\d+ size 160,90 in f/);
  });

  it("refuses an edit to an item someone changed since the agent saw it", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Agent");
    session.write('node box "Box" at 0,0');
    personWrites(document, "edit box by 0,-200");
    const reply = session.write("edit box by -100,0");
    expect(reply).toMatch(/Nothing was changed/);
    expect(reply).toMatch(/node box "Box" at 0,-200/);
    expect(document.get("box")).toMatchObject({ x: 0, y: -200 });
    // Having been told, the agent can now act on the current state.
    expect(session.write("edit box by -100,0")).toMatch(/Done/);
    expect(document.get("box")).toMatchObject({ x: -100, y: -200 });
  });

  it("places relative to where others moved things, without refusing", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Agent");
    session.write('node box "Box" at 0,0');
    personWrites(document, "edit box at 400,400");
    const reply = session.write('node label "Label" below box');
    expect(reply).toMatch(/Done/);
    expect(reply).toMatch(/Others changed since your last call:\nnode box "Box" at 400,400/);
    expect(document.get("label")!.y).toBe(400 + 90 + 40);
  });

  it("undoes only its own write", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Agent");
    session.write('node mine "Mine" at 0,0');
    personWrites(document, 'node theirs "Theirs" at 300,0');
    session.undoLast();
    expect(document.list().map((item) => item.id)).toEqual(["theirs"]);
  });

  it("reads and discusses in the same language", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Agent");
    session.write('node a "A" at 0,0\nnode b "B" at 100,0\ncomment on a "Too close to b?"');
    const read = session.read({ items: ["a"] });
    expect(read).toMatch(/node a "A" at 0,0 size 160,90/);
    expect(read).toMatch(
      /discussion on a \{\n {2}comment \w+ "Agent" at \d+ "Too close to b\?"\n\}/
    );
    expect(read).toMatch(/\/\/ a overlaps b/);
  });
});

describe("the reference architecture", () => {
  const document = new CanvasDocument();
  const session = new LanguageSession(document, "Agent");
  const reply = session.write(REFERENCE_DIAGRAM);
  const get = (id: string) => document.get(id)!;
  const centerX = (item: Item) => item.x + item.width / 2;
  const centerY = (item: Item) => item.y + item.height / 2;
  const contains = (outer: Item, inner: Item) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

  it("writes in one call", () => {
    expect(reply).toMatch(/^\/\/ Done: \d+ created/);
    expect(document.list().length).toBeGreaterThan(50);
  });

  it("nests frames and keeps every frame around its contents", () => {
    for (const item of document
      .list()
      .filter((candidate) => candidate.inside && candidate.type !== "band"))
      expect(contains(get(item.inside), item), `${item.id} in ${item.inside}`).toBe(true);
    expect(get("ddb1").inside).toBe("dax");
    expect(get("dax").inside).toBe("data");
    expect(get("data").inside).toBe("r1");
  });

  it("aligns items across frames", () => {
    expect(centerX(get("ddb2"))).toBeCloseTo(centerX(get("ddb1")));
    expect(centerX(get("rds2"))).toBeCloseTo(centerX(get("rds1")));
    expect(centerX(get("api2"))).toBeCloseTo(centerX(get("api1")));
    expect(centerY(get("api1"))).toBeCloseTo(centerY(get("users")));
    expect(get("r2").width).toBe(get("r1").width);
    expect(get("r2").x).toBe(get("r1").x);
  });

  it("spaces rows evenly and keeps siblings apart", () => {
    const row = ["fn", "ecs", "saga", "ml"].map(get);
    expect(new Set(row.map(centerY)).size).toBe(1);
    const siblings = document.list().filter((item) => item.inside === "r1");
    for (const left of siblings)
      for (const right of siblings)
        if (left !== right)
          expect(intersects(left, right), `${left.id} and ${right.id}`).toBe(false);
  });

  it("lays bands behind the regions they cross", () => {
    const band = get("rep1");
    expect(band.inside).toBe("cloud");
    expect(band.order).toBeLessThan(get("r1").order);
    expect(contains(band, get("ddb1"))).toBe(true);
    expect(contains(band, get("ddb2"))).toBe(true);
  });

  it("joins lines at the ports and with the labels written", () => {
    const lines = document.list().filter((item) => item.type === "line");
    expect(lines).toHaveLength(19);
    expect(lines.find((line) => line.from === "api1" && line.to === "logic")?.name).toBe(
      "Sync Write"
    );
    expect(lines.find((line) => line.from === "kin")).toMatchObject({
      fromPort: [1, 0.5],
      toPort: [0.5, 1],
    });
    expect(lines.find((line) => line.name === "Logic Events")?.look.vertical).toBe(true);
  });
});
