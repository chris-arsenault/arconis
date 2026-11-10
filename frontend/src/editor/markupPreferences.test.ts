import { describe, expect, it } from "vitest";
import { DrawingPreferences } from "./drawingPreferences";
import { MARKUP_TOOLS, MarkupPreferences, type MarkupTool } from "./markupPreferences";

describe("markup preferences", () => {
  it("applies one colour and size to every markup tool", () => {
    const markup = new MarkupPreferences();
    markup.color = "#1971c2";
    markup.size = "large";
    markup.tool = "arrow";
    expect(markup.settings).toMatchObject({
      mode: "pen",
      shape: "arrow",
      color: "#1971c2",
      width: 8,
    });
    markup.tool = "marker";
    expect(markup.settings).toMatchObject({
      mode: "highlighter",
      shape: "freehand",
      color: "#1971c2",
      width: 36,
      opacity: 30,
    });
    expect(markup.drawingTool).toBe("marker");
  });

  it("never fills or carries a gradient, whichever tool is chosen", () => {
    const markup = new MarkupPreferences();
    for (const tool of Object.keys(MARKUP_TOOLS) as MarkupTool[]) {
      markup.tool = tool;
      expect(markup.settings).toMatchObject({ fill: "none", gradient: "none" });
    }
  });

  it("round-trips through browser preferences and ignores a damaged copy", () => {
    const markup = new MarkupPreferences();
    markup.tool = "box";
    markup.color = "#2f9e44";
    markup.size = "small";
    const restored = new MarkupPreferences(JSON.parse(JSON.stringify(markup.serialize())));
    expect(restored.serialize()).toEqual(markup.serialize());
    expect(new MarkupPreferences({ tool: "airbrush", color: "red" }).serialize()).toEqual(
      new MarkupPreferences().serialize()
    );
  });

  it("stays independent of the Draw brushes", () => {
    const draw = new DrawingPreferences();
    const markup = new MarkupPreferences();
    draw.choose("vector");
    draw.update({ shape: "ellipse", color: "#123456", fill: "#abcdef" });
    markup.tool = "pen";
    markup.color = "#e03131";
    expect(draw.settings).toMatchObject({ shape: "ellipse", color: "#123456", fill: "#abcdef" });
    expect(markup.settings).toMatchObject({ shape: "freehand", color: "#e03131", fill: "none" });
  });
});
