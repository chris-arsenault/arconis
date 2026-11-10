import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type Item } from "../document/types";
import { importDocument } from "../files/canvasFile";
import { parse } from "./parser";
import { itemStatement, printCanvas } from "./printer";
import { writeStatements } from "./writer";
import { LanguageSession } from "./session";

function write(document: CanvasDocument, text: string) {
  let result!: ReturnType<typeof writeStatements>;
  document.doc.transact(() => {
    result = writeStatements(document, parse(text), { author: "Agent", now: 1000 });
  }, LOCAL);
  return result;
}
function canvas(text: string) {
  const document = new CanvasDocument();
  write(document, text);
  return document;
}
const get = (document: CanvasDocument, id: string) => document.get(id)!;

const FIELDS =
  'locked hidden collapsed tags api, v2 marker p2 task open link "https://example.com/a" property owner "Ada" property ticket "ARC-1" edited "Ada" at 1700000000000';
const FIELD_VALUES: Partial<Item> = {
  locked: true,
  hidden: true,
  collapsed: true,
  tags: ["api", "v2"],
  marker: "p2",
  task: "open",
  link: "https://example.com/a",
  properties: { owner: "Ada", ticket: "ARC-1" },
  editedBy: "Ada",
  editedAt: 1700000000000,
};

/** Every item type with the fields set, written as a file declares them. */
const EVERY_TYPE = `
  node n "Node" ${FIELDS} at 0,0 size 160,90
  card c "Card" ${FIELDS} at 0,200 size 260,72
  frame f "Frame" ${FIELDS} at 400,0 size 320,220
  group g "Group" ${FIELDS} at 800,0 size 320,220
  band b "Band" ${FIELDS} at 0,400 size 300,100
  text t "Text" ${FIELDS} at 0,600 size 160,90
  note s "Note" ${FIELDS} at 300,600 size 190,170
  picture p "Picture" hash abc123 format image/png ${FIELDS} at 600,600 size 200,100
  slide sl "Slide" deck pitch 1 ${FIELDS} at 0,1000 size 1280,720
  sketch sk "Sketch" ${FIELDS} at 1400,0 size 400,300
  drawing d "" ink line ${FIELDS} points 10,10 100,100
  highlight h "" target n ${FIELDS} points 0,0
  n -> c as l1 ${FIELDS}
  n => s as br ${FIELDS}
  n ..> t as ref ${FIELDS}
`;

describe("fields on every item type", () => {
  it("reads, stores and prints the fields the same way on every type and on lines", () => {
    const document = canvas(EVERY_TYPE);
    const ids = ["n", "c", "f", "g", "b", "t", "s", "p", "sl", "sk", "d", "h", "l1", "br", "ref"];
    for (const id of ids) expect(get(document, id), id).toMatchObject(FIELD_VALUES);
    const text = printCanvas(document);
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(printCanvas(copy)).toBe(text);
    for (const id of ids) expect(get(copy, id), id).toMatchObject(FIELD_VALUES);
    expect(text).toContain(
      'node n "Node" locked hidden collapsed tags api, v2 marker p2 task open link "https://example.com/a" property owner "Ada" property ticket "ARC-1" at 0,0 size 160,90 edited "Ada" at 1700000000000'
    );
    expect(text).toContain(
      'n -> c as l1 locked hidden collapsed tags api, v2 marker p2 task open link "https://example.com/a" property owner "Ada" property ticket "ARC-1" edited "Ada" at 1700000000000'
    );
  });

  it("prints fields between what an item is and how it looks, and a link to an item bare", () => {
    const document = canvas(
      'node a "A" at 0,0\nnode b "B" decision tags todo link a fill #ffd9da at 300,0 size 160,90'
    );
    expect(itemStatement(get(document, "b"))).toBe(
      'node b "B" decision tags todo link a fill #ffd9da at 300,0 size 160,90'
    );
  });

  it("changes only the fields a restatement names, and clears them with off and none", () => {
    const document = canvas('node a "A" locked tags x, y marker p1 task done link b at 0,0');
    write(document, 'edit a property owner "Ada" property env "prod"');
    expect(get(document, "a").properties).toEqual({ owner: "Ada", env: "prod" });
    write(
      document,
      "edit a locked off tags none marker none task none link none property env none"
    );
    const item = get(document, "a");
    expect(item.properties).toEqual({ owner: "Ada" });
    expect(item.locked).toBe(false);
    expect(item.tags).toEqual([]);
    expect(item.marker).toBe("none");
    expect(item.task).toBe("none");
    expect(item.link).toBe("");
    write(document, "edit a hidden tags z");
    expect(get(document, "a")).toMatchObject({ hidden: true, tags: ["z"] });
    expect(get(document, "a").locked).toBe(false);
  });

  it("refuses markers, tasks and tags outside their sets, changing nothing", () => {
    const document = canvas('node a "A"');
    const before = printCanvas(document);
    expect(() => write(document, "edit a marker p9")).toThrow(/Choose marker p1\|p2/);
    expect(() => write(document, "edit a task maybe")).toThrow(/Choose task open\|done/);
    expect(() => write(document, "edit a tags with:colon")).toThrow(/cannot be a tag/);
    expect(() => write(document, "style s locked")).toThrow(/only look properties/);
    expect(printCanvas(document)).toBe(before);
  });

  it("names a line with as after an item declared at its end", () => {
    const document = canvas('node a "A" at 0,0\na -> node b "B" tags x as l1 dashed');
    expect(get(document, "l1")).toMatchObject({ from: "a", to: "b", look: { dashed: true } });
    expect(get(document, "b").tags).toEqual(["x"]);
  });

  it("tells an id that is a field word from the field by the quoted name after it", () => {
    const document = canvas(
      'node locked "Padlock" at 0,0\nnode tags "" at 300,0\nnode other locked'
    );
    expect(get(document, "locked").name).toBe("Padlock");
    expect(get(document, "locked").locked).toBe(false);
    expect(get(document, "tags").tags).toEqual([]);
    expect(get(document, "other").locked).toBe(true);
    const text = printCanvas(document);
    expect(text).toContain('node tags "" at 300,0');
    const copy = new CanvasDocument();
    importDocument(copy, text);
    expect(get(copy, "tags").tags).toEqual([]);
  });
});

describe("who last edited an item", () => {
  it("names the document's author on every write made through it, and not on file import", () => {
    const document = new CanvasDocument();
    document.author = "Grace";
    const id = document.create("note", 0, 0, { name: "Hi" });
    expect(get(document, id).editedBy).toBe("Grace");
    const first = get(document, id).editedAt;
    document.author = "Linus";
    document.patch(id, { x: 10 });
    expect(get(document, id).editedBy).toBe("Linus");
    expect(get(document, id).editedAt).toBeGreaterThanOrEqual(first);
    // Writing the same value again is not an edit.
    document.author = "Nobody";
    document.patch(id, { x: 10 });
    document.patchLook(id, {});
    document.editText(id, "Hi");
    expect(get(document, id).editedBy).toBe("Linus");
    document.editText(id, "Hello");
    expect(get(document, id).editedBy).toBe("Nobody");
    const copy = new CanvasDocument();
    copy.author = "Importer";
    importDocument(copy, printCanvas(document));
    expect(get(copy, id)).toMatchObject({ editedBy: "Nobody", name: "Hello" });
  });

  it("names an agent session as the editor of what it creates and changes", () => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Claude");
    session.write('node a "A" at 0,0\nnode b "B" at 300,0');
    expect(get(document, "a").editedBy).toBe("Claude");
    const other = new LanguageSession(document, "ChatGPT");
    other.write("edit a fill #ffd9da");
    expect(get(document, "a").editedBy).toBe("ChatGPT");
    expect(get(document, "b").editedBy).toBe("Claude");
    expect(session.read({ items: ["a"] })).toContain('edited "ChatGPT" at');
  });
});
