import { outlineOf, type OutlineLine } from "../editor/pasteAs";
import { TextCursor, linesOf } from "./text";
import { findElement, parseXml, type XmlElement } from "./xml";

/** Outlines other tools write, OPML and indented or headed text, as nested lines. */

/** Whether the text is an OPML document. */
export function isOpml(text: string) {
  const start = text.toLowerCase().indexOf("<opml");
  if (start < 0) return false;
  // Only a declaration or a comment may come before the root element.
  const before = text.slice(0, start).trim();
  return (
    !before || ((before.startsWith("<?") || before.startsWith("<!--")) && !before.includes("</"))
  );
}

/** Reads OPML. Several top-level outlines hang from one topic named by the file's title. */
export function parseOpml(text: string): OutlineLine[] {
  const root = parseXml(text);
  const body = findElement(root, "body");
  const top = (body?.children ?? []).filter((child) => child.name === "outline");
  if (!top.length) throw new Error("This OPML file has no outline in it.");
  const lines: OutlineLine[] = [];
  const visit = (element: XmlElement, depth: number) => {
    const topic = (element.attributes.text ?? element.attributes.title ?? "").trim();
    lines.push({ text: topic || "Untitled", depth });
    element.children
      .filter((child) => child.name === "outline")
      .forEach((child) => visit(child, depth + 1));
  };
  if (top.length === 1) visit(top[0], 0);
  else {
    const title = findElement(root, "title")?.text.trim();
    lines.push({ text: title || "Outline", depth: 0 });
    top.forEach((element) => visit(element, 1));
  }
  return lines;
}

const MAX_HEADING = 6;

/** A Markdown heading's level and text, or null when the line is not one. */
function headingOf(line: string) {
  const cursor = new TextCursor(line);
  const level = cursor.takeWhile((char) => char === "#").length;
  const text = cursor.rest.trim();
  const spaced = cursor.rest.startsWith(" ") || cursor.rest.startsWith("\t");
  if (level < 1 || level > MAX_HEADING || !spaced || !text) return null;
  return { level, text };
}

/**
 * A text file as an outline. Markdown headings nest by their level, and the lines beneath a
 * heading nest under it by their indentation; without headings, indentation alone nests.
 */
export function parseOutlineText(text: string): OutlineLine[] {
  const lines = linesOf(text);
  if (!lines.some((line) => headingOf(line))) return outlineOf(text);
  const outline: OutlineLine[] = [];
  let section: string[] = [];
  let level = 0;
  /** Adds the lines gathered since the last heading, nested beneath it. */
  const flush = () => {
    if (section.some((line) => line.trim()))
      for (const line of outlineOf(section.join("\n")))
        outline.push({ text: line.text, depth: level + line.depth });
    section = [];
  };
  for (const line of lines) {
    const heading = headingOf(line);
    if (!heading) {
      section.push(line);
      continue;
    }
    flush();
    level = heading.level;
    outline.push({ text: heading.text, depth: level - 1 });
  }
  flush();
  const shallowest = Math.min(...outline.map((line) => line.depth));
  return outline.map((line) => ({ ...line, depth: line.depth - shallowest }));
}
