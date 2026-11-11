import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { isLink } from "../document/types";
import { importDocument } from "../files/canvasFile";
import { diagramAsMermaid, treeAsCsv } from "./exports";
import { foreignStatements } from "./index";

function canvas(statements: string) {
  const document = new CanvasDocument();
  importDocument(document, `arconis 1\n${statements}`);
  return document;
}

it("writes boxes, frames and lines as a Mermaid flowchart that reads back the same", async () => {
  const document = canvas(`frame back "Back end" at 400,0 size 500,300 {
    node api "Orders API" at 420,60
    node store "Orders" database at 420,180
  }
  node user "End \\"user\\"" person at 0,60
  node ready "Ready?" decision at 0,400
  user -> api "asks"
  api -- store
  ready ..> user
  api <-> ready dashed
  picture p hash abc format image/png at 900,900 size 10,10`);
  const text = diagramAsMermaid(document.list());
  expect(text.split("\n")).toEqual([
    "flowchart LR",
    '  subgraph back["Back end"]',
    '    api["Orders API"]',
    '    store[("Orders")]',
    "  end",
    '  user["End #quot;user#quot;"]',
    '  ready{"Ready?"}',
    '  user -->|"asks"| api',
    "  api --- store",
    "  ready -.-> user",
    "  api -.-> ready",
  ]);
  document.destroy();

  const copy = canvas(await foreignStatements(text, "mermaid"));
  const items = copy.list();
  const named = (name: string) => items.find((item) => item.name === name)!;
  expect(named("Orders API").inside).toBe(named("Back end").id);
  expect(named("Orders").stencil).toBe("database");
  expect(named('End "user"')).toBeTruthy();
  expect(items.filter(isLink)).toHaveLength(4);
  copy.destroy();
});

it("writes only the chosen items, and nothing when no box is chosen", () => {
  const document = canvas(`node a "A" at 0,0
  node b "B" at 0,300
  node end "End" at 0,600
  a -> b as w
  b -> end`);
  expect(diagramAsMermaid(document.list(), ["a", "b", "w"]).split("\n")).toEqual([
    "flowchart TD",
    '  a["A"]',
    '  b["B"]',
    "  a --> b",
  ]);
  // An id Mermaid reads as a statement is renamed.
  expect(diagramAsMermaid(document.list())).toContain('n_end["End"]');
  expect(diagramAsMermaid(document.list(), ["w"])).toBe("");
  document.destroy();
});

it("writes a topic tree as CSV with one column for each level", () => {
  const document = canvas(`node root "Launch, phase 1" at 0,0
  root => node m "Marketing" at 300,0
  root => node e "Say \\"go\\"" at 300,200
  m => node b "Blog post" at 600,0`);
  expect(treeAsCsv(document.list(), "root").split("\r\n")).toEqual([
    "Level 1,Level 2,Level 3",
    '"Launch, phase 1",,',
    ",Marketing,",
    ",,Blog post",
    ',"Say ""go""",',
  ]);
  document.destroy();
});
