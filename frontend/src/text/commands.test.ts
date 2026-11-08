import { expect, it } from "vitest";
import { sourceAction, structuralKey, type SourceEdit } from "./commands";

function apply(source: string, edit: SourceEdit | null) {
  if (!edit) return source;
  return source.slice(0, edit.start) + edit.text + source.slice(edit.end);
}

it("wraps and unwraps source selections with ordinary Markdown", () => {
  const edit = sourceAction("hello world", 6, 11, "bold");
  expect(apply("hello world", edit)).toBe("hello **world**");
  expect(apply("hello **world**", sourceAction("hello **world**", 8, 13, "bold"))).toBe(
    "hello world"
  );
  expect(apply("x", sourceAction("x", 0, 1, "sub"))).toBe("<sub>x</sub>");
});

it("inserts collision-safe code fences around selected source", () => {
  const source = 'const x = "```";';
  const edit = sourceAction(source, 0, source.length, "fence", "typescript");
  expect(edit.text).toBe('````typescript\nconst x = "```";\n````\n');
});

it("continues and exits lists, indents them, and leaves ordinary topic Tab alone", () => {
  expect(apply("1. First", structuralKey("1. First", 8, 8, "Enter"))).toBe("1. First\n2. ");
  expect(apply("- ", structuralKey("- ", 2, 2, "Enter"))).toBe("");
  expect(apply("- First", structuralKey("- First", 7, 7, "Tab"))).toBe("    - First");
  expect(apply("    - First", structuralKey("    - First", 11, 11, "Tab", true))).toBe("- First");
  expect(structuralKey("Topic", 5, 5, "Tab")).toBeNull();
  expect(apply("- First", structuralKey("- First", 7, 7, "Enter", true))).toBe("- First  \n  ");
});

it("indents code without creating a topic or interpreting a code line as a list", () => {
  const source = "```python\n- not a list\n```";
  const caret = source.indexOf("not");
  expect(structuralKey(source, caret, caret, "Enter")).toBeNull();
  expect(apply(source, structuralKey(source, caret, caret, "Tab"))).toContain(
    "\n    - not a list\n"
  );
});

it("keeps the caret after indentation so subsequent typing does not replace the line", () => {
  const edit = structuralKey("- First", 7, 7, "Tab")!;
  expect(edit.anchor).toBe(11);
  expect(edit.head).toBe(11);
  const back = structuralKey("    - First", 11, 11, "Tab", true)!;
  expect(back.anchor).toBe(7);
  expect(back.head).toBe(7);
});
