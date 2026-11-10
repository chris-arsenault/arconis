import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { serializeDocument, importDocument } from "../files/canvasFile";
import { LanguageSession } from "./session";

it("round trips shared markup, Drawing contents, highlights and gradient ink through the agent language", () => {
  const canvas = new CanvasDocument();
  const agent = new LanguageSession(canvas, "Artist");
  expect(
    agent.write(`note n "Review" at 0,0
    highlight h target n line #ffaa00
    drawing m markup ink arrow points 10,10 90,80 stroke-opacity 35 arrow arrow
    sketch s "Sketch" at 200,0 size 300,200 {
      drawing p ink polygon points 220,20 300,20 260,100 closed fill #ff0000 gradient #0000ff gradient-angle 45
    }`)
  ).toContain("Done");
  expect(canvas.get("p")?.inside).toBe("s");
  expect(canvas.get("h")).toMatchObject({ target: "n", markup: true });
  const file = serializeDocument(canvas);
  const restored = new CanvasDocument();
  importDocument(restored, file);
  expect(serializeDocument(restored)).toBe(file);
  expect(agent.write("edit p line-width 8")).toContain("Done");
  canvas.patch("n", { name: "Human edit" });
  agent.undoLast();
  expect(canvas.get("n")?.name).toBe("Human edit");
  expect(canvas.get("p")?.look.lineWidth).toBeUndefined();
  canvas.remove(["n"]);
  expect(canvas.get("h")).toBeNull();
  canvas.undo.undo();
  expect(canvas.get("h")?.target).toBe("n");
});

it("promotes and releases existing ink through MCP language without moving its world-coordinate points", () => {
  const canvas = new CanvasDocument();
  const agent = new LanguageSession(canvas, "Artist");
  agent.write("drawing mark markup points 10,20 40,60");
  expect(agent.write("sketch s at 0,0 size 100,100 { edit mark workspace }")).toContain("Done");
  expect(canvas.get("mark")).toMatchObject({
    inside: "s",
    markup: false,
    points: [
      [10, 20],
      [40, 60],
    ],
  });
  expect(agent.write("edit mark markup in none")).toContain("Done");
  expect(canvas.get("mark")).toMatchObject({
    inside: "",
    markup: true,
    points: [
      [10, 20],
      [40, 60],
    ],
  });
  const before = serializeDocument(canvas);
  expect(agent.write("mark -> s")).toContain("Nothing was changed");
  expect(serializeDocument(canvas)).toBe(before);
  expect(agent.write("sketch ordinary { note child }")).toContain("Done");
  expect(canvas.get("ordinary")).toMatchObject({ type: "frame", scaleContents: true });
  expect(canvas.get("child")?.inside).toBe("ordinary");
});

it.each(["ink", "target", "markup", "workspace"])(
  "keeps an existing unnamed drawing with keyword ID %s unambiguous in files",
  (id) => {
    const canvas = new CanvasDocument();
    canvas.create("drawing", 0, 0, {
      id,
      points: [
        [10, 20],
        [40, 60],
      ],
    });
    const text = serializeDocument(canvas);
    const restored = new CanvasDocument();
    importDocument(restored, text);
    expect(restored.get(id)?.points).toEqual([
      [10, 20],
      [40, 60],
    ]);
    expect(serializeDocument(restored)).toBe(text);
  }
);

it.each(["edit p markup"])(
  "rejects a connected path's invalid transition atomically: %s",
  (statement) => {
    const canvas = new CanvasDocument();
    const agent = new LanguageSession(canvas, "Artist");
    expect(agent.write("drawing p points 10,10 90,90\nnote n at 300,0\np -> n as wire")).toContain(
      "Done"
    );
    const before = serializeDocument(canvas);
    expect(agent.write(statement)).toContain("Remove connector wire");
    expect(serializeDocument(canvas)).toBe(before);
    expect(agent.write("delete wire\nedit p markup")).toContain("Done");
    const clean = serializeDocument(canvas, [], undefined, false);
    expect(clean).not.toContain("wire");
    const restored = new CanvasDocument();
    importDocument(restored, clean);
    expect(restored.list().map((item) => item.type)).toEqual(["note"]);
    restored.destroy();
    canvas.destroy();
  }
);

it("scales ordinary panel ink and placement together through agent edits and Undo", () => {
  const canvas = new CanvasDocument();
  const agent = new LanguageSession(canvas, "Artist");
  agent.write(`sketch s at 0,0 size 100,100 {
    drawing p points 10,10 90,90 closed fill #ff0000 gradient #0000ff gradient-angle 20
  }`);
  const before = serializeDocument(canvas);
  expect(agent.write("edit s size 200,100 at 200,300")).toContain("Done");
  expect(canvas.get("s")).toMatchObject({
    x: 200,
    y: 300,
    width: 200,
    height: 100,
    scaleContents: true,
  });
  expect(canvas.get("p")?.points).toEqual([
    [220, 310],
    [380, 390],
  ]);
  expect(canvas.get("p")?.look.gradientAngle).toBe(20);
  agent.undoLast();
  expect(serializeDocument(canvas)).toBe(before);
  canvas.destroy();
});

it("moves paths and outlines directly between Markup and a layer through agent writes", () => {
  const canvas = new CanvasDocument();
  const agent = new LanguageSession(canvas, "Artist");
  expect(
    agent.write(`layer art "Artwork"
    node planet "Earth" at 100,100
    drawing p markup points 10,20 40,60
    highlight h target planet`)
  ).toContain("Done");
  expect(
    agent.write("edit p workspace in none in-layer art\nedit h workspace in none in-layer art")
  ).toContain("Done");
  expect(canvas.get("p")).toMatchObject({ markup: false, layer: "art", inside: "" });
  expect(canvas.get("h")).toMatchObject({ markup: false, layer: "art", target: "planet" });
  expect(agent.write("edit p markup in none\nedit h markup in none")).toContain("Done");
  const copy = new CanvasDocument();
  importDocument(copy, serializeDocument(canvas));
  expect(copy.get("p")).toMatchObject({
    markup: true,
    points: [
      [10, 20],
      [40, 60],
    ],
  });
  expect(copy.get("h")).toMatchObject({ markup: true, target: "planet" });
  expect(copy.list()).toHaveLength(3);
  agent.undoLast();
  expect(canvas.get("h")).toMatchObject({ markup: false, layer: "art", target: "planet" });
  copy.destroy();
  canvas.destroy();
});

it("preserves authored appearance when upgrading legacy sketch declarations", () => {
  const canvas = new CanvasDocument();
  const agent = new LanguageSession(canvas, "Artist");
  expect(agent.write('sketch artwork "Art" fill #247dab title side scale-contents off')).toContain(
    "Done"
  );
  expect(canvas.get("artwork")).toMatchObject({
    type: "frame",
    look: { fill: "#247dab", title: "side" },
  });
  expect(canvas.get("artwork")?.scaleContents).toBeUndefined();
  canvas.destroy();
});
