import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { listComments } from "../document/comments";
import type { Look } from "../document/types";
import { importDocument, serializeDocument } from "../files/canvasFile";
import { parse } from "./parser";
import { printCanvas, quote } from "./printer";
import { LanguageSession } from "./session";
import { writeStatements } from "./writer";

// Independent authored values. Adding a Look key requires an explicit round-trip expectation.
const FULL_LOOK: Required<Look> = {
  fill: "#123456",
  line: "none",
  lineWidth: 2.5,
  textColor: "#654321",
  textSize: 18,
  font: "serif",
  valign: "bottom",
  textHighlight: "#ffeeaa",
  lineHeight: 1.6,
  paragraphGap: 0.8,
  padding: 11,
  textFit: "height",
  bold: false,
  italic: true,
  underline: true,
  strike: false,
  align: "right",
  rotation: 35,
  dashed: false,
  opacity: 65,
  iconColor: "#112233",
  badge: "lucide:star",
  title: "side",
  vertical: true,
  path: "curved",
  arrow: "open",
  startArrow: "none",
  scale: 1.25,
};
const ALL_LOOK_WORDS = `fill #123456 line none line-width 2.5 text-color #654321 text-size 18
  font serif valign bottom text-highlight #ffeeaa line-height 1.6 paragraph-gap 0.8 padding 11
  text-fit height bold off italic underline strike off align right rotate 35 dashed off opacity 65
  icon-color #112233 badge lucide:star title side vertical path curved arrow open start-arrow none scale 1.25`.replaceAll(
  "\n",
  " "
);

it("round trips every authored Look property and literal Markdown/math through canonical files", () => {
  const source = '# Plan\n\n```typescript\nconst text = "hello";\n```\n\n$$\\frac{a}{b}$$';
  const document = new CanvasDocument();
  writeStatements(
    document,
    parse(`style complete ${ALL_LOOK_WORDS}\ntext doc ${quote(source)} complete ${ALL_LOOK_WORDS}`),
    { author: "Agent" }
  );
  expect(document.namedStyle("complete")).toEqual(FULL_LOOK);
  expect(document.get("doc")?.look).toEqual(FULL_LOOK);
  const file = serializeDocument(document);
  const restored = new CanvasDocument();
  importDocument(restored, file);
  expect(restored.get("doc")?.name).toBe(source);
  expect(restored.get("doc")?.look).toEqual(FULL_LOOK);
  expect(restored.namedStyle("complete")).toEqual(FULL_LOOK);
  expect(serializeDocument(restored)).toBe(file);
});

it("keeps explicit false flags and clears value attributes back to sparse authored defaults", () => {
  const document = new CanvasDocument();
  const session = new LanguageSession(document, "Agent");
  expect(
    session.write('style strong bold italic\ntext doc "Text" strong bold off font serif')
  ).toContain("Done");
  expect(session.write("edit doc font default")).toContain("Done");
  expect(document.get("doc")?.look).toEqual({ bold: false });
  expect(printCanvas(document)).toContain('text doc "Text" strong bold off');
});

it("routes ordered description and layout passes while preserving intentionally unused layout attributes", () => {
  const document = new CanvasDocument();
  const session = new LanguageSession(document, "Agent");
  expect(
    session.write(`
      frame f row { node child "Child" }
      edit f row free
      row virtual fill #ff0000 by 90,90 at 600,700 { node a "A" }
      node b "B" right of a gap 20 width of a nudge 5,7
    `)
  ).toContain("Done");
  expect(document.get("f")?.arrange).toBeUndefined();
  expect(document.get("a")).toMatchObject({ x: 600, y: 700, look: {} });
  expect(document.get("b")).toMatchObject({ x: 785, y: 707, width: 160 });
});

it.each([
  ["item restatement", 'node b "Overwrite"', "b"],
  ["nested edit", 'frame f { edit b "Overwrite" }', "b"],
  ["layout member", 'row { edit b "Overwrite" }', "b"],
  ["inline link item", 'a -> node b "Overwrite" as link', "b"],
  ["named link", 'a -> b "Overwrite" as link', "link"],
  ["delete", "delete b", "b"],
  ["tidy", "tidy b", "b"],
])("refuses a stale direct target in %s", (_name, command, target) => {
  const document = new CanvasDocument();
  const session = new LanguageSession(document, "Agent");
  session.write('node a "A"\nframe f { node b "B" }\na -> b as link');
  document.patch(target, { name: "Changed by someone else" });
  const before = printCanvas(document);
  expect(session.write(command)).toContain("Nothing was changed. Since you last saw them");
  expect(printCanvas(document)).toBe(before);
});

it("keeps endpoint reads and derived cascade effects distinct from directly edited items", () => {
  const document = new CanvasDocument();
  const session = new LanguageSession(document, "Agent");
  session.write('node a "A"\nframe f { node b "B" }\na -> b as link');
  document.patch("b", { name: "Peer value" });
  expect(session.write('a -> b "Uses current endpoint" as link')).toContain("Done");
  expect(document.get("b")?.name).toBe("Peer value");
  document.patch("b", { name: "New peer value" });
  // Existing policy checks the named holder, not every derived item removed with it.
  expect(session.write("delete f")).toContain("Done");
  expect(document.get("b")).toBeNull();
  expect(document.get("link")).toBeNull();
});

it("retains conversation/view semantics when the discussed item changes", () => {
  const document = new CanvasDocument();
  const session = new LanguageSession(document, "Agent");
  session.write('node b "B"\ncomment on b "Initial"');
  const root = listComments(document)[0].id;
  document.patch("b", { name: "Peer value" });
  expect(
    session.write(`
      title "Review"
      style revised fill #ffffff
      comment on b "New discussion"
      reply ${root} "Reply"
      resolve ${root}
      view view1 "Review" center 10,20 zoom 1
      discussion on b { comment imported "Reviewer" at 1000 "Imported conversation" }
    `)
  ).toContain("Done");
  expect(document.get("b")?.name).toBe("Peer value");
  expect(document.views.get("view1")).toMatchObject({ name: "Review" });
  expect(listComments(document).find((comment) => comment.id === root)?.resolved).toBe(true);
  expect(listComments(document)).toHaveLength(4);
});

it.each(["node new via 1,2", "style invalid fill #ffffff at 1,2", "a -> b as link size 10,20"])(
  "rejects attributes in the wrong receiving context without committing: %s",
  (command) => {
    const document = new CanvasDocument();
    const session = new LanguageSession(document, "Agent");
    session.write('node a "A"\nnode b "B"');
    const before = printCanvas(document);
    expect(session.write(`node extra "Uncommitted"\n${command}`)).toContain("Nothing was changed");
    expect(printCanvas(document)).toBe(before);
  }
);
