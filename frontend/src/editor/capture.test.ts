import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { branchChildren } from "../document/relations";
import { deckSlides } from "../document/slides";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { captureNote, captureToTree } from "./capture";
import { slidesFromBranches } from "./slidesFromTree";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

describe("capturing notes", () => {
  it("stacks notes beneath one another and turns the stack into a tree", () => {
    const document = new CanvasDocument();
    const capture = { at: { x: 100, y: 100 }, ids: [] as string[] };
    for (const text of ["Plan", "Research", "Build"])
      capture.ids.push(captureNote(document, capture, text, 1));
    const [plan, research, build] = capture.ids.map((id) => document.get(id)!);
    expect(plan).toMatchObject({ type: "note", name: "Plan", x: 100, y: 100 });
    expect(research.y).toBeGreaterThan(plan.y + plan.height);
    expect(build.y).toBeGreaterThan(research.y);
    const root = captureToTree(document, capture.ids);
    expect(root).toBe(plan.id);
    const items = document.list();
    expect(branchChildren(items, root).map((child) => child.name)).toEqual(["Research", "Build"]);
    expect(document.get(research.id)!.x).toBeGreaterThan(plan.x + plan.width);
  });
});

describe("slides from a tree", () => {
  it("puts a slide over the whole tree and one over each main branch, in a deck named for the root", () => {
    const document = canvas(`
      node root "Quarterly plan" at 0,300
      root => node a "Hiring"
      a => node a1 "Engineers"
      root => node b "Launch"
      tidy root right
    `);
    const ids = slidesFromBranches(document, "root");
    expect(ids).toHaveLength(3);
    const slides = deckSlides(document.list(), "Quarterly plan");
    expect(slides.map((slide) => slide.name)).toEqual(["Quarterly plan", "Hiring", "Launch"]);
    const hiring = slides[1];
    const engineers = document.get("a1")!;
    expect(engineers.x).toBeGreaterThan(hiring.x);
    expect(engineers.x + engineers.width).toBeLessThan(hiring.x + hiring.width);
    expect(engineers.y).toBeGreaterThan(hiring.y);
    expect(hiring.width / hiring.height).toBeCloseTo(16 / 9, 2);
    expect(Math.max(...slides.map((slide) => slide.order))).toBeLessThan(
      document.get("root")!.order
    );
  });
});
