import { TextCursor, stripTags } from "./text";

/**
 * A small XML reader for the outline and diagram files other tools write. It runs wherever the
 * canvas language does, without a browser's DOM, and reads elements, attributes and text.
 */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** The element's own character data, with entities decoded. */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function entity(name: string) {
  const lower = name.toLowerCase();
  if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
  if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
  return ENTITIES[lower] ?? `&${name};`;
}

/** Text with its character and named entities decoded; unknown names stay as written. */
export function decodeEntities(text: string) {
  return text.replaceAll(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (_whole, name: string) =>
    entity(name)
  );
}

const isBlank = (char: string) => /\s/.test(char);

/** The attributes written in a tag after its name. */
function attributesOf(source: string) {
  const attributes: Record<string, string> = {};
  const cursor = new TextCursor(source);
  while (!cursor.done) {
    cursor.takeWhile(isBlank);
    const name = cursor.takeWhile((char) => !isBlank(char) && char !== "=");
    cursor.takeWhile(isBlank);
    if (!cursor.take("=")) continue;
    cursor.takeWhile(isBlank);
    const quote = cursor.char;
    cursor.index += 1;
    const value = cursor.takeThrough(quote);
    if (value === null) break;
    attributes[name] = decodeEntities(value);
  }
  return attributes;
}

/** Declarations, comments and character-data sections: how each opens and closes. */
const SECTIONS = [
  { open: "<!--", close: "-->", text: false },
  { open: "<![CDATA[", close: "]]>", text: true },
  { open: "<?", close: "?>", text: false },
  { open: "<!", close: ">", text: false },
];

/** Reads past a section that is not an element, returning any text it carries; null if none. */
function section(cursor: TextCursor) {
  const kind = SECTIONS.find(({ open }) => cursor.startsWith(open));
  if (!kind) return null;
  cursor.index += kind.open.length;
  const body = cursor.takeThrough(kind.close);
  if (body === null) cursor.index = cursor.source.length;
  return kind.text ? (body ?? "") : "";
}

/** Reads one tag's source, from after its < through its >, minding quoted attribute values. */
function tag(cursor: TextCursor) {
  cursor.index += 1;
  const body = cursor.takeUntil(">");
  if (cursor.done) throw new Error("This file's XML ends inside a tag.");
  cursor.index += 1;
  return body;
}

function elementOf(body: string): XmlElement {
  const inner = body.endsWith("/") ? body.slice(0, -1) : body;
  const cursor = new TextCursor(inner);
  const name = cursor.takeWhile((char) => !isBlank(char));
  if (!name) throw new Error("This file's XML has a tag without a name.");
  return { name, attributes: attributesOf(cursor.rest), children: [], text: "" };
}

/** Reads a document's root element. Throws when the text is not well-formed enough to follow. */
export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: "", attributes: {}, children: [], text: "" };
  const open: XmlElement[] = [root];
  const cursor = new TextCursor(source);
  while (!cursor.done) {
    const current = open[open.length - 1];
    current.text += decodeEntities(cursor.takeWhile((char) => char !== "<"));
    if (cursor.done) break;
    const aside = section(cursor);
    if (aside !== null) {
      current.text += aside;
      continue;
    }
    const body = tag(cursor);
    if (body.startsWith("/")) {
      if (open.length > 1) open.pop();
      continue;
    }
    const element = elementOf(body);
    current.children.push(element);
    if (!body.endsWith("/")) open.push(element);
  }
  if (!root.children.length) throw new Error("This file has no XML content.");
  return root.children[0];
}

/** The first descendant with this element name, searching the element itself first. */
export function findElement(element: XmlElement, name: string): XmlElement | null {
  if (element.name === name) return element;
  for (const child of element.children) {
    const found = findElement(child, name);
    if (found) return found;
  }
  return null;
}

const BREAKS = ["<br>", "<br/>", "<br />", "</p>", "</div>", "</li>"];

/** Markup such as a draw.io label reduced to its text, with line breaks kept. */
export function plainText(html: string) {
  let broken = html;
  for (const mark of BREAKS) {
    broken = broken.replaceAll(mark, "\n").replaceAll(mark.toUpperCase(), "\n");
  }
  return decodeEntities(stripTags(broken))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
