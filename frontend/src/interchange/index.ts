import { isOutline, treeStatements, type OutlineLine } from "../editor/pasteAs";
import { looksLikeD2, parseD2 } from "./d2";
import { isDrawio, parseDrawio } from "./drawio";
import { isMermaid, parseMermaid } from "./mermaid";
import { isOpml, parseOpml, parseOutlineText } from "./outline";
import { isPlantUml, parsePlantUml } from "./plantuml";
import { diagramStatements } from "./statements";

/**
 * Diagrams and outlines from other tools, translated into the canvas language. The result is
 * ordinary statements, so an import is written, placed and undone like any other paste.
 */

export type ForeignFormat = "mermaid" | "d2" | "plantuml" | "drawio" | "opml" | "outline";

export const FORMAT_NAMES: Record<ForeignFormat, string> = {
  mermaid: "Mermaid diagram",
  d2: "D2 diagram",
  plantuml: "PlantUML diagram",
  drawio: "draw.io diagram",
  opml: "OPML outline",
  outline: "Outline",
};

/** File extensions that name a format outright. */
const EXTENSIONS: Record<string, ForeignFormat> = {
  mmd: "mermaid",
  mermaid: "mermaid",
  d2: "d2",
  puml: "plantuml",
  plantuml: "plantuml",
  pu: "plantuml",
  iuml: "plantuml",
  drawio: "drawio",
  opml: "opml",
};

/** Extensions whose text is read as an outline when it nests. */
const TEXT_EXTENSIONS = ["txt", "md"];

/** Extensions offered when choosing a file to import, beside the canvas's own. */
export const IMPORT_EXTENSIONS = [...Object.keys(EXTENSIONS), "xml", ...TEXT_EXTENSIONS].map(
  (extension) => `.${extension}`
);

/** Formats recognised by how their text opens, most certain first. */
const DETECTORS: [ForeignFormat, (text: string) => boolean][] = [
  ["drawio", isDrawio],
  ["opml", isOpml],
  ["plantuml", isPlantUml],
  ["mermaid", isMermaid],
];

/** The format pasted text is written in, when it is one this module reads. */
export function foreignFormat(text: string): ForeignFormat | null {
  const found = DETECTORS.find(([, matches]) => matches(text));
  if (found) return found[0];
  return looksLikeD2(text) ? "d2" : null;
}

const isCanvasFile = (text: string) => text.trimStart().startsWith("arconis ");

function nests(text: string) {
  return isOutline(text) || parseOutlineText(text).some((line) => line.depth > 0);
}

/** The format of a chosen file: what its content opens as, then what its name says. */
export function fileFormat(name: string, text: string): ForeignFormat | null {
  if (isCanvasFile(text)) return null;
  const found = DETECTORS.find(([, matches]) => matches(text));
  if (found) return found[0];
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (extension in EXTENSIONS) return EXTENSIONS[extension];
  return TEXT_EXTENSIONS.includes(extension) && nests(text) ? "outline" : null;
}

function tree(lines: OutlineLine[]) {
  if (!lines.length) throw new Error("This outline has no topics.");
  return treeStatements(lines).join("\n");
}

/** Each format's text as canvas-language statements. */
const WRITERS: Record<ForeignFormat, (text: string) => string | Promise<string>> = {
  opml: (text) => tree(parseOpml(text)),
  outline: (text) => tree(parseOutlineText(text)),
  drawio: async (text) => diagramStatements(await parseDrawio(text)),
  d2: (text) => diagramStatements(parseD2(text)),
  mermaid: (text) => imported(parseMermaid(text)),
  plantuml: (text) => imported(parsePlantUml(text)),
};

function imported(read: ReturnType<typeof parseMermaid>) {
  return read.kind === "tree" ? tree(read.lines) : diagramStatements(read.diagram);
}

/** Canvas-language statements for text in a foreign format. Throws what the format's reader says. */
export async function foreignStatements(text: string, format: ForeignFormat) {
  return WRITERS[format](text);
}
