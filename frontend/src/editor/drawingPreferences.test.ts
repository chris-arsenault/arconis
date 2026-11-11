import { describe, expect, it } from "vitest";
import { DEFAULT_BRUSH, DrawingPreferences } from "./drawingPreferences";

describe("drawing tool preferences", () => {
  it("keeps freehand and vector settings independent across repeated switches", () => {
    const preferences = new DrawingPreferences();
    preferences.update({ color: "#123456", width: 7 });
    preferences.choose("vector");
    preferences.update({ shape: "polygon", fill: "#ff0000", color: "#654321" });
    preferences.choose("freehand");
    expect(preferences.settings).toMatchObject({ shape: "freehand", color: "#123456", width: 7 });
    preferences.choose("vector");
    expect(preferences.settings).toMatchObject({
      shape: "polygon",
      fill: "#ff0000",
      color: "#654321",
    });
  });

  it("restores a shaped pen brush as Vector and keeps saved brushes", () => {
    const preferences = new DrawingPreferences({
      settings: { ...DEFAULT_BRUSH, shape: "arrow" },
      favorites: [{ mode: "pen", shape: "rectangle", color: "#112233" }],
    });
    expect(preferences.tool).toBe("vector");
    expect(preferences.settings).toMatchObject({ shape: "arrow" });
    expect(preferences.favorites[0]).toMatchObject({ shape: "rectangle", color: "#112233" });
  });

  it("round-trips independent defaults and active tool through browser preferences", () => {
    const original = new DrawingPreferences();
    original.choose("freehand");
    original.update({ color: "#abcdef" });
    original.choose("lasso");
    original.choose("vector");
    original.update({ shape: "ellipse", opacity: 70 });
    const restored = new DrawingPreferences(JSON.parse(JSON.stringify(original.serialize())));
    expect(restored.tool).toBe("vector");
    expect(restored.settings).toEqual(original.settings);
    restored.choose("freehand");
    expect(restored.settings.color).toBe("#abcdef");
  });

  it("remembers the brush which receives a sampled color through utility switches", () => {
    const preferences = new DrawingPreferences();
    preferences.choose("vector");
    preferences.update({ shape: "ellipse", fill: "#112233" });
    preferences.choose("eraser");
    preferences.choose("eyedropper");
    const restored = new DrawingPreferences(JSON.parse(JSON.stringify(preferences.serialize())));
    restored.choose(restored.sampleTool);
    restored.update({ fill: "#abcdef" });
    expect(restored.tool).toBe("vector");
    expect(restored.settings).toMatchObject({ shape: "ellipse", fill: "#abcdef" });
  });
});
