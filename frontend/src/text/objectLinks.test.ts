import { expect, it } from "vitest";
import { canvasObjectId } from "../document/ids";
import { objectLinkEdit } from "./objectLinks";
import { renderMarkdown } from "./markdown";

it.each(["canvas://Storage_A", "local://Storage_A", "CANVAS://Storage_A/"])(
  "keeps case-sensitive object ids in %s and renders an in-canvas link",
  (url) => {
    expect(canvasObjectId(url)).toBe("Storage_A");
    const html = renderMarkdown(`[Storage](${url})`);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('data-hint="Go to linked object"');
    expect(html).not.toContain('target="_blank"');
  }
);

it.each([
  "canvas://",
  "canvas:target",
  "local:/target",
  "canvas://../target",
  "canvas://target?room=elsewhere",
  "canvas://user@target",
  "https://target",
])("does not identify %s as an object destination", (url) => {
  expect(canvasObjectId(url)).toBeNull();
});

it("supports ordinary reference links and keeps code examples literal", () => {
  expect(renderMarkdown("[Read it][storage]\n\n[storage]: canvas://Storage_A")).toContain(
    'href="canvas://Storage_A"'
  );
  expect(renderMarkdown("`[Storage](canvas://Storage_A)`")).not.toContain("<a ");
  expect(renderMarkdown("```markdown\n[Storage](canvas://Storage_A)\n```")).not.toContain("<a ");
});

it("wraps selected Markdown and leaves the caret ready to continue typing", () => {
  const edit = objectLinkEdit("Read **Storage** next", 5, 16, "Storage_A", "Different name");
  expect(edit.text).toBe("[**Storage**](canvas://Storage_A)");
  expect(edit.anchor).toBe(5 + edit.text.length);
  expect(edit.head).toBe(edit.anchor);
});

it("uses an escaped readable name when inserting at an empty caret", () => {
  const edit = objectLinkEdit("Read ", 5, 5, "Storage_A", "Storage [primary]\nregion");
  const rendered = renderMarkdown(edit.text);
  expect(rendered).toContain('href="canvas://Storage_A"');
  expect(rendered).toContain("Storage [primary] region</a>");
});
