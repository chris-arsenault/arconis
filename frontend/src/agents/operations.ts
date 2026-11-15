import type { ReadRequest } from "../language/session";
import { languageHelp } from "../language/reference";
import { LanguageError } from "../language/lexer";
import { stencils } from "./stencils";
import { importPortable, exportPortable } from "./transfers";
import { CANVAS_DEFINITIONS, type CanvasDefinition } from "./contract";

export { MAX_WRITE } from "./contract";

export interface CanvasTarget {
  describe(): string;
  read(request: ReadRequest): string;
  checkLayout(request: ReadRequest): string;
  write(statements: string): string;
  undo(): string;
  importDocument(content: string): Promise<unknown>;
  exportDocument(ids: string[], includeMarkup: boolean): Promise<string>;
}

/** The CLI calls these handlers directly; both MCP transports register the same definitions. */
export const CANVAS_OPERATIONS = CANVAS_DEFINITIONS.map((definition) => ({
  ...definition,
  run: (target: CanvasTarget | null, input: unknown) => execute(definition, target, input),
}));

function execute(
  definition: CanvasDefinition,
  target: CanvasTarget | null,
  input: unknown
): unknown {
  if (definition.name === "canvas_help") {
    const { topic } = definition.parse(input);
    const guide = languageHelp(topic);
    if (guide === null)
      throw new LanguageError(`Unknown help topic "${topic}". Call canvas_help without a topic.`);
    return guide;
  }
  if (definition.name === "list_stencils") return stencils(definition.parse(input).query);
  if (!target) throw new LanguageError("Open a file or room first.");
  return executeCanvas(definition, target, input);
}

function executeCanvas(
  definition: Exclude<CanvasDefinition, { name: "canvas_help" | "list_stencils" }>,
  target: CanvasTarget,
  input: unknown
): unknown {
  switch (definition.name) {
    case "describe_canvas":
      definition.parse(input);
      return target.describe();
    case "read":
      return target.read(definition.parse(input));
    case "check_layout":
      return target.checkLayout(definition.parse(input));
    case "write":
      return target.write(definition.parse(input).statements);
    case "undo":
      definition.parse(input);
      return target.undo();
    case "import_document": {
      const args = definition.parse(input);
      return importPortable(target, args.content, args.append, args.final);
    }
    case "export_document": {
      const args = definition.parse(input);
      return exportPortable(target, args.items, args.include_markup, args.offset);
    }
  }
}

export function canvasOperation(name: string) {
  const found = CANVAS_OPERATIONS.find((candidate) => candidate.name === name);
  if (!found) throw new LanguageError(`Unknown action "${name}". Use --help to list actions.`);
  return found;
}

export function toolResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return {
    content: [{ type: "text" as const, text }],
    isError: text.startsWith("// Nothing was changed."),
    ...(typeof value === "object" && value !== null && !Array.isArray(value)
      ? { structuredContent: value as Record<string, unknown> }
      : {}),
  };
}
