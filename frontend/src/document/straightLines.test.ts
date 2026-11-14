import { describe, expect, it } from "vitest";
import { straightSnap, type LineEnd } from "./straightLines";

// A line leaving a box's centre at 100,100 for a point 300 to the right and 5 lower.
const right: LineEnd = { at: { x: 100, y: 100 }, toward: { x: 400, y: 105 } };
// A line from the same box heading 250 down and 3 to the left.
const down: LineEnd = { at: { x: 100, y: 100 }, toward: { x: 97, y: 350 } };

describe("straightSnap", () => {
  it("levels a line whose far point the drag comes near", () => {
    const snap = straightSnap([right], 20, 2, 8);
    expect(snap.dy).toBe(5);
    expect(snap.dx).toBeNull();
    expect(snap.level).toEqual({ from: { x: 120, y: 105 }, to: { x: 400, y: 105 } });
  });

  it("leaves the drag free beyond the tolerance", () => {
    const snap = straightSnap([right], 20, 30, 8);
    expect(snap).toMatchObject({ dx: null, dy: null, level: null, upright: null });
  });

  it("works each axis alone, so one move can straighten two lines", () => {
    const snap = straightSnap([right, down], 1, 1, 8);
    expect(snap.dy).toBe(5);
    expect(snap.dx).toBe(-3);
    expect(snap.upright?.to).toEqual({ x: 97, y: 350 });
  });

  it("takes the nearest line on an axis", () => {
    const other: LineEnd = { at: { x: 100, y: 100 }, toward: { x: 600, y: 98 } };
    expect(straightSnap([right, other], 0, 0, 8).dy).toBe(-2);
    expect(straightSnap([right, other], 0, 4, 8).dy).toBe(5);
  });

  it("ignores a line too short along its run to have a direction", () => {
    const stub: LineEnd = { at: { x: 100, y: 100 }, toward: { x: 104, y: 103 } };
    expect(straightSnap([stub], 0, 0, 8)).toMatchObject({ dx: null, dy: null });
  });
});
