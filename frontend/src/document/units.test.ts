import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { distanceFactor, formatDistance, scaleBar, unitExpression } from "./units";
import { parse } from "../language/parser";
import { printCanvas } from "../language/printer";
import { writeStatements } from "../language/writer";
import { LanguageSession } from "../language/session";

const house = { world: 100, distance: 1, unit: "m" };

describe("calibrated distances", () => {
  it("converts physical units without moving geometry and supports arbitrary named units", () => {
    expect(distanceFactor(house, "mm")).toBe(10);
    expect(distanceFactor(house, "ft")).toBeCloseTo(1 / 30.48);
    expect(distanceFactor({ world: 100, distance: 3, unit: "paces" }, "m")).toBe(0.03);
    expect(unitExpression("240 cm", "m")).toBe("2.4");
    expect(unitExpression("1e-3 m + 2 mm", "mm").replaceAll(" ", "")).toBe("1+2");
    expect(formatDistance(0.001, "m", true)).toBe("1 mm");
    expect(scaleBar(house, 1, "m")).toMatchObject({ distance: 1, pixels: 100, label: "1 m" });
    expect(scaleBar(house, 10, "m")).toMatchObject({ pixels: 100, label: "100 mm" });
  });

  it("shares calibration atomically, undoes it and preserves geometry and files", () => {
    const document = new CanvasDocument();
    const id = document.create("node", 12.123456789, -2e-9);
    const before = document.get(id);
    document.undo.stopCapturing();
    document.setCalibration(house);
    document.undo.stopCapturing();
    const peer = new CanvasDocument();
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(document.doc));
    expect(peer.calibration()).toEqual(house);
    expect(document.get(id)).toEqual(before);
    const copy = new CanvasDocument();
    writeStatements(copy, parse(printCanvas(document)), { author: "", importing: true });
    expect(copy.calibration()).toEqual(house);
    expect(copy.get(id)).toEqual(document.get(id));
    document.undo.undo();
    expect(document.calibration()).toBeNull();
    document.undo.redo();
    expect(document.calibration()).toEqual(house);
  });

  it("exposes the scale through agent tools and rejects invalid writes atomically", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Surveyor");
    session.write('scale 100 represents 1 "m"');
    expect(session.describe()).toContain('scale 100 represents 1 "m"');
    expect(() =>
      writeStatements(document, parse('title "Wrong"; scale 0 represents 1 "m"'), { author: "" })
    ).toThrow();
    expect(document.title()).toBe("Untitled canvas");
    expect(document.calibration()).toEqual(house);
    session.undoLast();
    expect(document.calibration()).toBeNull();
    session.destroy();
  });
});
