import { expect, it } from "vitest";
import { lineJumps } from "./crossings";

it("hops the flatter of two crossing lines over the other", () => {
  const jumps = lineJumps(
    [
      {
        id: "across",
        points: [
          [0, 50],
          [200, 50],
        ],
      },
      {
        id: "down",
        points: [
          [80, 0],
          [80, 100],
        ],
      },
    ],
    10
  );
  expect(jumps.get("across")).toEqual([{ segment: 0, t: 0.4 }]);
  expect(jumps.has("down")).toBe(false);
});

it("hops the later of two lines that run alike, and orders hops along a line", () => {
  const jumps = lineJumps(
    [
      {
        id: "first",
        points: [
          [0, 0],
          [100, 60],
        ],
      },
      {
        id: "second",
        points: [
          [0, 60],
          [100, 0],
        ],
      },
      {
        id: "long",
        points: [
          [-50, 30],
          [300, 30],
          [300, 200],
        ],
      },
      {
        id: "post",
        points: [
          [200, 0],
          [200, 100],
        ],
      },
    ],
    5
  );
  expect(jumps.has("first")).toBe(false);
  expect(jumps.get("second")).toEqual([{ segment: 0, t: 0.5 }]);
  // The long line crosses both diagonals at their meeting point and then the post.
  expect(jumps.get("long")!.map((jump) => jump.segment)).toEqual([0, 0]);
  expect(jumps.get("long")![0].t).toBeLessThan(jumps.get("long")![1].t);
});

it("leaves junctions, corners, parallel and separate lines alone", () => {
  const jumps = lineJumps(
    [
      {
        id: "trunk",
        points: [
          [0, 50],
          [200, 50],
        ],
      },
      // Ends on the trunk: a junction.
      {
        id: "branch",
        points: [
          [100, 50],
          [100, 150],
        ],
      },
      // Crosses the trunk within the clearance of the trunk's end: a corner's neighbourhood.
      {
        id: "near",
        points: [
          [195, 0],
          [195, 100],
        ],
      },
      {
        id: "parallel",
        points: [
          [0, 40],
          [200, 40],
        ],
      },
      {
        id: "away",
        points: [
          [500, 0],
          [500, 100],
        ],
      },
    ],
    10
  );
  expect([...jumps.keys()]).toEqual([]);
});
