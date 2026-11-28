import { z } from "zod";

export const MAX_WRITE = 200_000;
const selection = {
  items: z.array(z.string()).optional().describe("Ids to read, including their contents"),
  inside: z.string().optional().describe("A holder and its contents"),
  area: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional()
    .describe("Items overlapping this area"),
};

function define<N extends string, T extends z.ZodRawShape>(
  name: N,
  description: string,
  inputSchema: T,
  mutates: boolean,
  session: boolean
) {
  return {
    name,
    description,
    inputSchema,
    mutates,
    session,
    parse: (input: unknown) => z.object(inputSchema).parse(input),
  };
}

/** Schemas and discovery only: control-plane imports must not load canvas execution or icon data. */
export const CANVAS_DEFINITIONS = [
  define(
    "describe_canvas",
    "Inspect title, layers, styles, object ids and discussions. Read actual content before editing.",
    {},
    false,
    true
  ),
  define(
    "read",
    "Read canvas objects and source in the canvas language; select ids, a holder or an area. No filters reads the bounded whole canvas.",
    selection,
    false,
    true
  ),
  define(
    "check_layout",
    "Check overlaps, holder escapes and estimated text overflow. Advisory; preserve intentional overlaps and human edits.",
    selection,
    false,
    true
  ),
  define(
    "write",
    "Create, change, place, connect and delete canvas objects atomically using canvas-language statements. Read affected content first; use canvas_help for syntax. Check layout after substantial writes.",
    { statements: z.string().min(1).max(MAX_WRITE) },
    true,
    true
  ),
  define(
    "undo",
    "Undo this session's most recent mutation, preserving other participants' edits.",
    {},
    true,
    true
  ),
  define(
    "import_document",
    "Import portable .arconis content as one undoable addition using web semantics. For large files send chunks: first append=false, final=false; subsequent append=true; final=true applies once. Staging changes no canvas. Does not replace existing content.",
    {
      content: z.string().min(1),
      append: z.boolean().default(false),
      final: z.boolean().default(true),
    },
    true,
    true
  ),
  define(
    "export_document",
    "Export portable .arconis content including pictures in chunks. Start offset=0; concatenate content and request next_offset until null. Chunks use one snapshot so concurrent edits cannot tear an export. Does not upload to a sharing service.",
    {
      items: z.array(z.string()).default([]),
      include_markup: z.boolean().default(true),
      offset: z.number().int().min(0).default(0),
    },
    false,
    true
  ),
  define(
    "canvas_help",
    "Get canvas-language syntax and examples: no topic lists guides, a topic returns its section, all returns the full reference.",
    { topic: z.string().optional() },
    false,
    false
  ),
  define(
    "list_stencils",
    "List shapes, icon sets and woodworking profiles. Search icon names, physical kinds, nominal lumber sizes and screw gauges with query words.",
    { query: z.string().optional() },
    false,
    false
  ),
] as const;

export type CanvasDefinition = (typeof CANVAS_DEFINITIONS)[number];
