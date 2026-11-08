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
  expect(agent.write("sketch invalid { note wrong }")).toContain("Nothing was changed");
  expect(serializeDocument(canvas)).toBe(before);
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
