import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { CanvasDocument } from "../document/canvasDocument";
import { addComment } from "../document/comments";
import { importDocument, serializeDocument } from "../document/files";
import { PICTURE_HASH, PICTURE_STORED, PICTURE_TYPE } from "../document/pictures";
import { RELATION_BRANCH, RELATION_REFERENCE } from "../document/relations";
import { fileSchema, parseFile } from "./format";
import { projectCanvas } from "./model";
import { DomainSession } from "./session";

const open: CanvasDocument[] = [];
afterEach(() => open.splice(0).forEach((document) => document.destroy()));
function canvas() {
  const document = new CanvasDocument();
  open.push(document);
  return document;
}

/** Every kind of item the canvas holds, built through the domain tools and the document. */
function everything() {
  const document = canvas();
  const session = new DomainSession(document, "Writer");
  const outcome = session.apply([
    { op: "title", title: "Everything" },
    {
      op: "add",
      type: "region",
      name: "Backend",
      at: { x: 0, y: 0 },
      size: { width: 800, height: 400 },
      as: "backend",
    },
    {
      op: "add",
      type: "node",
      name: "API",
      stencil: "service",
      inside: "backend",
      look: { fill: "#d9e9ff", bold: true },
    },
    {
      op: "add",
      type: "node",
      name: "Lambda",
      stencil: "icon",
      icon: "aws:Lambda",
      inside: "backend",
    },
    { op: "add", type: "text", note: true, name: "Remember", at: { x: 0, y: 500 } },
    { op: "add", type: "text", name: "Caption", at: { x: 300, y: 500 } },
    {
      op: "connect",
      from: "API",
      to: "Lambda",
      name: "invokes",
      route: "elbow",
      arrow: "open",
      fromPoint: { x: 1, y: 0.5 },
    },
    { op: "branch", from: "Remember", name: "Detail" },
    { op: "reference", from: "Caption", to: "API" },
    { op: "comment", on: "API", text: "Rate limits?" },
    { op: "view", name: "Overview", center: { x: 400, y: 200 }, zoom: 0.5 },
  ]);
  if (outcome.status !== "done") throw new Error(outcome.reason);
  document.create("picture", 900, 0, {
    label: "Logo",
    style: { [PICTURE_HASH]: "a".repeat(64), [PICTURE_TYPE]: "image/png", [PICTURE_STORED]: true },
  });
  document.create("stroke", 0, 0, { points: "[[1,2],[3,4]]", style: { strokeColor: "#6554c0" } });
  return document;
}

/** The canvas with ids replaced by their position, so two copies compare equal. */
function shape(document: CanvasDocument) {
  const projected = projectCanvas(document);
  const position = new Map(projected.items.map((item, index) => [item.id, `#${index}`]));
  const text = JSON.stringify(projected, (key, value: unknown) =>
    ["id", "inside", "from", "to", "on", "onLine"].includes(key) && typeof value === "string"
      ? (position.get(value) ?? "?")
      : value
  );
  return JSON.parse(text) as unknown;
}

it("round-trips every kind of item, discussion and view", () => {
  const source = everything();
  const copy = canvas();
  importDocument(copy, serializeDocument(source));
  const [original, restored] = [shape(source), shape(copy)] as Record<string, unknown>[];
  // Discussion and view ids are fresh in the copy, so compare what they say.
  expect({ ...restored, discussions: undefined, views: undefined }).toEqual({
    ...original,
    discussions: undefined,
    views: undefined,
  });
  expect(projectCanvas(copy).discussions[0].comments[0]).toMatchObject({
    author: "Writer",
    text: "Rate limits?",
  });
  expect(projectCanvas(copy).views[0]).toMatchObject({
    name: "Overview",
    zoom: 0.5,
    center: { x: 400, y: 200 },
  });
});

it("opens a minimal file an agent wrote from the schema alone", () => {
  const document = canvas();
  const file = {
    format: "arconis",
    version: 3,
    items: [
      {
        id: "users",
        type: "node",
        stencil: "person",
        name: "Users",
        x: 0,
        y: 0,
        width: 80,
        height: 80,
      },
      {
        id: "app",
        type: "node",
        stencil: "service",
        name: "App",
        x: 200,
        y: 0,
        width: 160,
        height: 90,
      },
      { id: "uses", type: "connection", from: "users", to: "app", name: "uses" },
      {
        id: "idea",
        type: "node",
        stencil: "rectangle",
        name: "Idea",
        x: 0,
        y: 200,
        width: 160,
        height: 90,
      },
      { id: "step", type: "branch", from: "app", to: "idea" },
      { id: "see", type: "reference", from: "idea", to: "users" },
    ],
  };
  expect(importDocument(document, JSON.stringify(file))).toBe(6);
  const lines = document.list().filter((object) => object.kind === "connector");
  expect(lines.map((line) => line.style.relation)).toEqual([
    undefined,
    RELATION_BRANCH,
    RELATION_REFERENCE,
  ]);
  expect(lines[0]).toMatchObject({
    label: "uses",
    style: { edgeStyle: "orthogonalEdgeStyle", endArrow: "block" },
  });
  expect(lines[1].style.endArrow).toBe("none");
});

it("explains what is wrong with an invalid file", () => {
  const base = { format: "arconis", version: 3 };
  expect(() =>
    parseFile({
      ...base,
      items: [{ id: "a", type: "node", stencil: "hexagon", x: 0, y: 0, width: 1, height: 1 }],
    })
  ).toThrow(/not valid at items\.0\.stencil/);
  expect(() =>
    parseFile({ ...base, items: [{ id: "l", type: "connection", from: "a", to: "b" }] })
  ).toThrow('Item "l" refers to "a", which is not in the file.');
});

it("publishes as a JSON Schema", () => {
  const schema = z.toJSONSchema(fileSchema, { io: "input" }) as {
    properties: Record<string, unknown>;
  };
  expect(Object.keys(schema.properties)).toEqual(
    expect.arrayContaining(["items", "discussions", "views"])
  );
});

it("keeps a selection's discussions and drops holders left out of it", () => {
  const document = everything();
  const api = document.list().find((object) => object.label === "API")!;
  addComment(document, { objectId: api.id, author: "Alice", text: "Second" });
  const file = parseFile(JSON.parse(serializeDocument(document, [api.id])));
  expect(file.items.map((item) => item.name)).toEqual(["API"]);
  expect(file.items[0].inside).toBeUndefined();
  expect(file.discussions).toHaveLength(2);
  expect(file.views).toEqual([]);
});
