import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { importDocument, serializeDocument } from "../files/canvasFile";
import { parse } from "./parser";
import { printCanvas, quote } from "./printer";
import { writeStatements } from "./writer";
import { LanguageSession } from "./session";

it("round trips literal multiline Markdown, code, quotes and LaTeX with box styles", () => {
  const source =
    '# Heading\n\n1. **Build**\n   - Review\n\n```python\nprint("hello")\n```\n\n$$\n\\frac{a}{b}\n$$\n\nA literal """ delimiter\n';
  const document = new CanvasDocument();
  writeStatements(
    document,
    parse(
      `text doc ${quote(source)} font serif valign bottom align right text-highlight #ffeeaa line-height 1.5 paragraph-gap 0.6 padding 12 text-fit height underline strike`
    ),
    { author: "Agent" }
  );
  expect(document.get("doc")?.name).toBe(source);
  const saved = serializeDocument(document);
  expect(saved).toContain('print("hello")');
  expect(saved).toContain("\\frac{a}{b}");
  const copy = new CanvasDocument();
  importDocument(copy, saved);
  expect(copy.get("doc")?.name).toBe(source);
  expect(copy.get("doc")?.look).toEqual({
    font: "serif",
    valign: "bottom",
    align: "right",
    textHighlight: "#ffeeaa",
    lineHeight: 1.5,
    paragraphGap: 0.6,
    padding: 12,
    textFit: "height",
    underline: true,
    strike: true,
  });
  expect(printCanvas(copy)).toBe(printCanvas(document));
});

it("accepts agent-authored raw source and preserves old escaped single-line literals", () => {
  const document = new CanvasDocument();
  const input =
    'note n """\n# Plan\n\n```js\nconst x = "hi"; // literal { braces }\n```\n\n$x^2$\n""" at 0,0\nnode a "old\\nname"';
  writeStatements(document, parse(input), { author: "Agent" });
  expect(document.get("n")?.name).toContain('const x = "hi"; // literal { braces }');
  expect(document.get("a")?.name).toBe("old\nname");
  expect(() => parse('text n """\nnever closed')).toThrow("never closed");
});

it("accepts CRLF raw-string framing without changing the authored line endings", () => {
  const document = new CanvasDocument();
  writeStatements(document, parse('text win """\r\n# Title\r\n\r\n$\\alpha$\r\n"""'), {
    author: "Agent",
  });
  expect(document.get("win")?.name).toBe("# Title\r\n\r\n$\\alpha$");
  const copy = new CanvasDocument();
  importDocument(copy, serializeDocument(document));
  expect(copy.get("win")?.name).toBe(document.get("win")?.name);
});

it("validates text style choices and retains resets in named styles", () => {
  expect(() => parse('text x "x" font unknown')).toThrow("not one of");
  expect(() => parse('text x "x" text-size 0')).toThrow("positive");
  expect(() => parse('text x "x" padding -1')).toThrow("non-negative");
  const document = new CanvasDocument();
  writeStatements(
    document,
    parse(
      'style prose font serif valign top line-height 1.4\ntext a "hello" prose\nedit a font mono\nedit a font default'
    ),
    { author: "Agent" }
  );
  expect(document.get("a")?.look.font).toBeUndefined();
  expect(document.namedStyle("prose")).toEqual({ font: "serif", valign: "top", lineHeight: 1.4 });
});

it("lets agents author Markdown natively while retaining atomic writes and stale-edit protection", () => {
  const document = new CanvasDocument();
  const agent = new LanguageSession(document, "Writer");
  const source = "# Design\n\n```ruby\nputs :hello\n```\n\n$E=mc^2$";
  expect(agent.write(`text doc ${quote(source)} font mono at 0,0 size 300,250`)).toContain("Done");
  expect(agent.read({ items: ["doc"] })).toContain(source);
  expect(agent.write("edit doc by 20,30 align right")).toContain("Done");
  expect(document.get("doc")?.name).toBe(source);
  document.editText("doc", source + "\n\nPeer's update");
  expect(agent.write("edit doc font serif")).toContain("Nothing was changed");
  expect(document.get("doc")?.look.font).toBe("mono");
  const before = serializeDocument(document);
  expect(agent.write('node extra "Extra"\nedit doc text-size -1')).toContain("Nothing was changed");
  expect(serializeDocument(document)).toBe(before);
});
