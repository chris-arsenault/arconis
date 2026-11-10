import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument } from "../files/canvasFile";
import { PRACTICE_CANVAS } from "./practice";

describe("practice canvas", () => {
  it("holds the objects the hands-on tasks name, leaving the connection for the person", () => {
    const document = new CanvasDocument();
    importDocument(document, PRACTICE_CANVAS);
    const items = document.list();
    const ids = new Set(items.map((item) => item.id));
    for (const id of ["welcome", "shop", "web", "api", "db", "overview"]) expect(ids).toContain(id);
    expect(document.get("welcome")?.name).toBe("Edit me");
    const lines = items.filter((item) => item.type === "line");
    expect(lines.map((line) => [line.from, line.to])).toEqual([["web", "api"]]);
    // The slide frames everything, so presenting it shows the whole sample.
    const slide = document.get("overview")!;
    for (const item of items.filter((item) => item.type !== "line" && item.id !== "overview")) {
      expect(item.x).toBeGreaterThanOrEqual(slide.x);
      expect(item.y).toBeGreaterThanOrEqual(slide.y);
      expect(item.x + item.width).toBeLessThanOrEqual(slide.x + slide.width);
      expect(item.y + item.height).toBeLessThanOrEqual(slide.y + slide.height);
    }
  });
});
