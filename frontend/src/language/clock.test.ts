import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument } from "../files/canvasFile";
import { printCanvas } from "./printer";
import { LanguageSession } from "./session";

it("writes, restates, prints and reads back a node's clock", () => {
  const document = new CanvasDocument();
  const agent = new LanguageSession(document, "Agent");
  expect(
    agent.write(`node t "Break" clock timer 300
    node s "Lap" clock stopwatch elapsed 42
    node now clock time`)
  ).toContain("Done");
  expect(document.get("t")?.clock).toEqual({
    kind: "timer",
    duration: 300,
    started: 0,
    elapsed: 0,
  });
  expect(document.get("s")?.clock).toMatchObject({ kind: "stopwatch", elapsed: 42 });
  expect(document.get("now")?.clock?.kind).toBe("time");

  // `running` starts the clock at the moment it is written.
  const before = Date.now();
  agent.write("edit t clock timer 90 running");
  const running = document.get("t")!.clock!;
  expect(running.duration).toBe(90);
  expect(running.started).toBeGreaterThanOrEqual(before);

  // A file carries what was counted and when the run began, and reads back the same.
  const text = printCanvas(document);
  expect(text).toContain(`clock timer 90 started ${running.started}`);
  expect(text).toContain("clock stopwatch elapsed 42");
  expect(text).toContain("clock time");
  const copy = new CanvasDocument();
  importDocument(copy, text);
  for (const id of ["t", "s", "now"]) expect(copy.get(id)?.clock).toEqual(document.get(id)?.clock);

  agent.write("edit t clock none");
  expect(document.get("t")?.clock).toBeNull();
  copy.destroy();
  document.destroy();
});

it("refuses a clock on anything but a node, and words it does not know", () => {
  const document = new CanvasDocument();
  const agent = new LanguageSession(document, "Agent");
  expect(agent.write('note n "Sticky" clock stopwatch')).toContain("Only a node shows a clock");
  expect(agent.write("node a clock sundial")).toContain("After clock, write");
  expect(agent.write("node a clock timer")).toContain("timer's length");
  expect(document.list()).toHaveLength(0);
  // An id spelled like the attribute still works when a name follows it.
  expect(agent.write('node clock "Wall clock" clock time')).toContain("Done");
  expect(document.get("clock")?.clock?.kind).toBe("time");
  document.destroy();
});
