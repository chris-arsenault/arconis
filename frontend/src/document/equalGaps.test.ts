import { expect, it } from "vitest";
import { equalGapSnap, type GapBox } from "./equalGaps";

const box = (x: number, y: number, width = 100, height = 60): GapBox => ({ x, y, width, height });

it("snaps a box to continue the spacing of the two boxes before it", () => {
  // Two boxes 40 apart; the third is dragged to within reach of 40 from the second.
  const snap = equalGapSnap(box(285, 10), [box(0, 0), box(140, 0)], 8);
  expect(snap.dx).toBe(-5);
  expect(snap.dy).toBe(0);
  expect(snap.gaps).toEqual([
    { x1: 100, y1: 35, x2: 140, y2: 35, size: 40 },
    { x1: 240, y1: 35, x2: 280, y2: 35, size: 40 },
  ]);
});

it("snaps a box to continue the spacing of the two boxes after it, and to the middle of two", () => {
  const before = equalGapSnap(box(-143, 0), [box(0, 0), box(140, 0)], 8);
  expect(before.dx).toBe(3);
  expect(before.gaps.map((gap) => gap.size)).toEqual([40, 40]);

  // Between boxes 300 apart, a 100-wide box centres with 100 on each side.
  const between = equalGapSnap(box(196, 0), [box(0, 0), box(400, 0)], 8);
  expect(between.dx).toBe(4);
  expect(between.gaps).toEqual([
    { x1: 100, y1: 30, x2: 200, y2: 30, size: 100 },
    { x1: 300, y1: 30, x2: 400, y2: 30, size: 100 },
  ]);
});

it("works down a column as it does along a row, and on both axes at once", () => {
  const snap = equalGapSnap(
    box(283, 204),
    [box(0, 200), box(140, 200), box(280, 0), box(280, 100)],
    8
  );
  expect(snap).toMatchObject({ dx: -3, dy: -4 });
  expect(snap.gaps).toHaveLength(4);
  // A gap is marked level with what the box shares with its neighbour where it is now.
  expect(snap.gaps[2]).toEqual({ x1: 331.5, y1: 60, x2: 331.5, y2: 100, size: 40 });
});

it("leaves a box alone when it is out of reach, alone in its row, or overlapping its neighbour", () => {
  const none = { dx: 0, dy: 0, gaps: [] };
  expect(equalGapSnap(box(300, 0), [box(0, 0), box(140, 0)], 8)).toEqual(none);
  // The neighbours are not in the moving box's row.
  expect(equalGapSnap(box(280, 500), [box(0, 0), box(140, 0)], 8)).toEqual(none);
  expect(equalGapSnap(box(280, 0), [box(140, 0)], 8)).toEqual(none);
  // Touching boxes have no gap to repeat.
  expect(equalGapSnap(box(200, 0), [box(0, 0), box(100, 0)], 8)).toEqual(none);
});
