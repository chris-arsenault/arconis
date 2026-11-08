import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { underlays } from "./templates";

describe("template underlays", () => {
  it("repeats what a template holds under each other slide of its deck, at the same place", () => {
    const document = new CanvasDocument();
    const slide = (id: string, number: number, x: number, deck = "pitch") =>
      document.insert(document.build("slide", x, 0, { id, deck, slide: number }));
    slide("t", 0, 0);
    slide("s1", 1, 2000);
    slide("s2", 2, 4000);
    slide("elsewhere", 1, 6000, "agenda");
    document.insert(
      document.build("text", 1100, 680, { id: "brand", inside: "t", width: 160, height: 30 })
    );
    document.insert(document.build("node", 40, 40, { id: "box", inside: "t" }));
    document.insert(document.build("node", 50, 50, { id: "inner", inside: "box" }));
    document.insert(document.build("line", 0, 0, { id: "l", from: "box", to: "brand" }));
    // A line to something outside the template has no place on the other slides.
    document.insert(document.build("node", 9000, 0, { id: "far" }));
    document.insert(document.build("line", 0, 0, { id: "out", from: "box", to: "far" }));

    const ghosts = underlays(document.list());
    expect(ghosts.map((item) => item.id).sort((a, b) => a.localeCompare(b))).toEqual(
      ["s1", "s2"].flatMap((slide) =>
        ["box", "brand", "inner", "l"].map((id) => `underlay:${slide}:${id}`)
      )
    );
    const on = (slide: string, id: string) =>
      ghosts.find((item) => item.id === `underlay:${slide}:${id}`)!;
    expect(on("s1", "brand")).toMatchObject({ inside: "s1", x: 3100, y: 680, width: 160 });
    expect(on("s2", "brand")).toMatchObject({ inside: "s2", x: 5100 });
    expect(on("s1", "inner").inside).toBe("underlay:s1:box");
    expect(on("s1", "l")).toMatchObject({ from: "underlay:s1:box", to: "underlay:s1:brand" });
    // Nothing of the underlays is in the document.
    expect(document.list().some((item) => item.id.startsWith("underlay:"))).toBe(false);
  });

  it("scales a template to a slide of another size, and draws nothing without a template", () => {
    const document = new CanvasDocument();
    document.insert(document.build("slide", 0, 0, { id: "t", slide: 0, width: 1280, height: 720 }));
    document.insert(
      document.build("slide", 0, 1000, { id: "s", slide: 1, width: 640, height: 360 })
    );
    document.insert(
      document.build("node", 1000, 600, { id: "box", inside: "t", width: 200, height: 100 })
    );
    expect(underlays(document.list())).toMatchObject([
      { id: "underlay:s:box", x: 500, y: 1300, width: 100, height: 50 },
    ]);
    document.patch("t", { slide: 2 });
    expect(underlays(document.list())).toEqual([]);
  });
});
