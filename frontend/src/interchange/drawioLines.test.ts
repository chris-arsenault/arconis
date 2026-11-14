import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument } from "../files/canvasFile";
import { foreignStatements } from "./index";

/** Writes a draw.io model onto a fresh canvas, as a paste does, and returns its items. */
async function imported(cells: string) {
  const document = new CanvasDocument();
  const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
  importDocument(document, `arconis 1\n${await foreignStatements(model, "drawio")}`);
  const items = document.list();
  document.destroy();
  return items;
}

it("reads draw.io horizontal and vertical lines as separators", async () => {
  const cell = (id: string, style: string, size: string) =>
    `<mxCell id="${id}" value="" style="${style}" vertex="1" parent="1"><mxGeometry x="0" y="0" ${size} as="geometry"/></mxCell>`;
  const items = await imported(
    cell("h", "line;strokeWidth=2;html=1;", 'width="160" height="10"') +
      cell("v", "line;direction=south;html=1;", 'width="10" height="160"')
  );
  const separators = items.filter((item) => item.stencil === "separator");
  expect(separators.map((item) => [item.width, item.height])).toEqual([
    [160, 10],
    [10, 160],
  ]);
});

it("keeps the heads draw.io names at each end of a line", async () => {
  const box = (id: string, x: number) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="${x}" y="0" width="80" height="40" as="geometry"/></mxCell>`;
  const edge = (id: string, style: string) =>
    `<mxCell id="${id}" edge="1" parent="1" source="a" target="b" style="${style}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
  const items = await imported(
    box("a", 0) +
      box("b", 300) +
      edge("er", "endArrow=ERzeroToMany;startArrow=ERmandOne;") +
      edge("uml", "endArrow=block;endFill=0;startArrow=diamond;startFill=1;") +
      edge("plain", "")
  );
  const heads = items
    .filter((item) => item.type === "line")
    .map((line) => [line.look.startArrow ?? "none", line.look.arrow ?? "arrow"]);
  expect(heads).toEqual([
    ["only-one", "zero-or-many"],
    ["diamond", "triangle"],
    ["none", "classic"],
  ]);
});
