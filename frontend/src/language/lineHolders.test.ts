import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";

function write(document: CanvasDocument, text: string) {
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return (id: string) => document.list().find((item) => item.id === id)!;
}

describe("where a written line lives", () => {
  it("joins the innermost holder shared by its ends, as a line drawn in the editor does", () => {
    const document = new CanvasDocument();
    const get = write(
      document,
      `
      frame outer "Outer" at 0,0 size 800,600 {
        frame inner "Inner" at 40,40 size 400,300 {
          node a "A" at 60,80
          node b "B" at 260,80
        }
        node c "C" at 500,80
      }
      node d "D" at 1000,80
      a -> b as ab
      a -> c as ac
      a -> d as ad
      a => b as branch
    `
    );
    expect(get("ab").inside).toBe("inner");
    expect(get("ac").inside).toBe("outer");
    expect(get("ad").inside).toBe("");
    expect(get("branch").inside).toBe("inner");
    document.destroy();
  });

  it("keeps an explicit holder, and leaves an existing line where it is when restated", () => {
    const document = new CanvasDocument();
    const get = write(
      document,
      `
      frame f "Frame" at 0,0 size 400,300 {
        node a "A" at 20,40
        node b "B" at 220,40
      }
      a -> b as kept in none
      a -> b as moved
    `
    );
    expect(get("kept").inside).toBe("");
    expect(get("moved").inside).toBe("f");
    write(document, `edit moved in none\na -> b as moved "renamed"`);
    expect(get("moved").inside).toBe("");
    expect(get("moved").name).toBe("renamed");
    document.destroy();
  });
});
