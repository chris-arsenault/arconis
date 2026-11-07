import { z } from "zod";
import { ARROW_NAMES, ROUTE_NAMES } from "./look";
import { STENCILS } from "./model";

/**
 * The domain model as validating schemas. The file format, the MCP tools and the published JSON
 * Schema all come from these, so they cannot drift apart.
 */
const finite = z.number().refine(Number.isFinite, "must be a finite number");
const color = z.string().max(64);
const ref = z.string().min(1).max(200).describe("An item's id, or a name only one item has");

export const lookSchema = z
  .object({
    fill: color.optional(),
    line: color.optional(),
    lineWidth: finite.optional(),
    textColor: color.optional(),
    textSize: finite.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    rotation: finite.optional(),
    iconColor: color.optional(),
    dashed: z.boolean().optional(),
  })
  .strict()
  .describe("How an item looks");

export const pointSchema = z.object({ x: finite, y: finite });
const fraction = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const size = z.object({ width: finite.positive(), height: finite.positive() });
const extra = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .describe("Editor settings with no domain meaning; keep them unchanged when rewriting an item");

const common = {
  id: z
    .string()
    .min(1)
    .max(200)
    .describe("Any string unique in the file; Arconis assigns its own ids when the file is opened"),
  name: z
    .string()
    .max(10_000)
    .default("")
    .describe("The text shown on the item: a node's label, a note's text, a line's label"),
  inside: z
    .string()
    .optional()
    .describe(
      "The id of the item holding this one. Any box can hold others; holding is membership, so the held item keeps its own canvas coordinates and moves with its holder"
    ),
  look: lookSchema.optional(),
  extra: extra.optional(),
};
const coordinate = finite.describe(
  "Canvas units (CSS pixels at 100% zoom), x to the right and y downward, the same for held items"
);
const geometry = {
  x: coordinate.describe("Left edge, in canvas units"),
  y: coordinate.describe("Top edge, in canvas units; y grows downward"),
  width: finite.positive(),
  height: finite.positive(),
};
const linkFields = {
  from: z.string().min(1),
  to: z.string().min(1),
  fromPoint: fraction.optional().describe("Where the line leaves `from`, as fractions of its box"),
  toPoint: fraction.optional().describe("Where the line meets `to`, as fractions of its box"),
  via: z
    .array(z.tuple([finite, finite]))
    .optional()
    .describe("Bend points, in canvas coordinates"),
};

export const nodeSchema = z.object({
  ...common,
  ...geometry,
  type: z.literal("node"),
  stencil: z.enum(STENCILS),
  icon: z.string().max(200).optional().describe("Icon key, for the icon stencil"),
  onLine: z
    .string()
    .optional()
    .describe(
      "A connection this small node sits on, so the line itself can take part in branches and references; most nodes leave it out"
    ),
});
export const regionSchema = z.object({
  ...common,
  ...geometry,
  type: z.literal("region"),
  frame: z
    .enum(["panel", "group"])
    .describe(
      "panel: a titled frame, also used as a screen in layouts; group: a plain grouping box"
    ),
  screen: z.string().optional().describe("Read only: the common screen this size matches"),
});
export const textSchema = z.object({
  ...common,
  ...geometry,
  type: z.literal("text"),
  note: z.boolean().describe("A sticky note rather than plain text"),
});
export const pictureSchema = z.object({
  ...common,
  ...geometry,
  type: z.literal("picture"),
  picture: z.object({ hash: z.string(), type: z.string(), stored: z.boolean() }),
});
export const connectionSchema = z.object({
  ...common,
  ...linkFields,
  type: z.literal("connection"),
  route: z.enum(ROUTE_NAMES).default("orthogonal"),
  arrow: z.enum(ARROW_NAMES).default("arrow"),
});
export const branchSchema = z
  .object({ ...common, ...linkFields, type: z.literal("branch") })
  .describe("One step of a topic tree: `from` is the parent topic, `to` the child");
export const referenceSchema = z
  .object({ ...common, ...linkFields, type: z.literal("reference") })
  .describe("A pointer from one item to another that implies no structure");
export const drawingSchema = z.object({
  ...common,
  type: z.literal("drawing"),
  points: z.array(z.tuple([finite, finite])),
});

export const itemSchema = z.discriminatedUnion("type", [
  nodeSchema,
  regionSchema,
  textSchema,
  pictureSchema,
  connectionSchema,
  branchSchema,
  referenceSchema,
  drawingSchema,
]);

export const discussionSchema = z.object({
  id: z.string().min(1),
  on: z.string().min(1).describe("The id of the item discussed"),
  resolved: z.boolean().default(false),
  comments: z
    .array(
      z.object({
        id: z.string().min(1),
        author: z.string().max(200).describe("The display name of whoever wrote it"),
        text: z.string().max(4000),
        time: finite.describe("When it was written, in milliseconds since 1970 (UTC)"),
      })
    )
    .min(1)
    .describe("The first comment opens the discussion; the rest are replies, oldest first"),
});
export const viewSchema = z
  .object({
    id: z.string().default(""),
    name: z.string(),
    center: pointSchema.optional().describe("The canvas point at the middle of the window"),
    zoom: finite.positive().describe("1 is 100%; 0.5 shows twice as much canvas"),
  })
  .describe("A saved place to look, which people pick from a list");

const side = z.enum(["left", "right", "above", "below"]);
const edge = z.enum(["left", "center", "right", "top", "middle", "bottom"]);
export const placementSchema = z
  .union([
    z.object({ x: finite, y: finite }).strict().describe("Exact top-left corner"),
    z
      .object({ by: z.object({ dx: finite, dy: finite }) })
      .strict()
      .describe("Offset from where it is now"),
    z
      .object({ beside: ref, side, gap: finite.nonnegative().optional() })
      .strict()
      .describe("Next to another item, centered on it"),
    z
      .object({ inside: ref })
      .strict()
      .describe("In the first clear spot inside a holder, which then holds it"),
    z
      .object({ alignWith: ref, edge })
      .strict()
      .describe("Lined up with an edge or center of another item"),
  ])
  .describe("Where an item goes");

const handle = z
  .string()
  .min(1)
  .max(100)
  .describe("A name later operations in this batch can use for the new item");
export const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    type: z.enum(["node", "region", "text"]),
    name: z.string().max(10_000).optional(),
    stencil: z.enum(STENCILS).optional().describe("For nodes; rectangle if left out"),
    icon: z.string().max(200).optional().describe("Icon key, required for the icon stencil"),
    frame: z.enum(["panel", "group"]).optional().describe("For regions; panel if left out"),
    note: z.boolean().optional().describe("For text: a sticky note"),
    at: placementSchema.optional(),
    size: size
      .optional()
      .describe(
        "Defaults: nodes 160×90, icons 64×64 with the name below, panels 320×220, sticky notes 190×170"
      ),
    inside: ref
      .optional()
      .describe("The holder; with no `at`, the item goes in its first clear spot"),
    look: lookSchema.optional(),
    as: handle.optional(),
  }),
  z.object({
    op: z.literal("connect"),
    from: ref,
    to: ref,
    name: z.string().max(10_000).optional(),
    route: z.enum(ROUTE_NAMES).optional(),
    arrow: z.enum(ARROW_NAMES).optional(),
    fromPoint: fraction.optional(),
    toPoint: fraction.optional(),
    look: lookSchema.optional(),
    as: handle.optional(),
  }),
  z
    .object({
      op: z.literal("branch"),
      from: ref,
      name: z.string().max(10_000).optional(),
      as: handle.optional(),
    })
    .describe(
      "Grows a child topic out of `from`, styled like it, on the side away from its own parent (the right, for a root) and below its existing children. Move it afterwards with place, or lay the whole tree out with arrange's tidy"
    ),
  z.object({
    op: z.literal("reference"),
    from: ref,
    to: ref,
    name: z.string().optional(),
    as: handle.optional(),
  }),
  z
    .object({ op: z.literal("contain"), items: z.array(ref).min(1), in: ref.nullable() })
    .describe("Puts items inside a holder, or back on the canvas with null; nothing moves"),
  z.object({ op: z.literal("relabel"), item: ref, name: z.string().max(10_000) }),
  z.object({
    op: z.literal("restyle"),
    items: z.array(ref).min(1),
    look: lookSchema.optional(),
    route: z.enum(ROUTE_NAMES).optional(),
    arrow: z.enum(ARROW_NAMES).optional(),
  }),
  z
    .object({
      op: z.literal("place"),
      item: ref,
      to: placementSchema.optional(),
      size: size.optional(),
      alone: z.boolean().optional().describe("Leave the topics branching from it where they are"),
    })
    .describe("Moves or resizes an item; what it holds and its branch topics move with it"),
  z
    .object({
      op: z.literal("arrange"),
      items: z.array(ref).optional(),
      align: edge.optional(),
      distribute: z.enum(["horizontal", "vertical"]).optional(),
      tidy: ref.optional().describe("A topic whose tree is laid out around it"),
    })
    .describe("Aligns or evenly spaces two or more items, or tidies a topic tree"),
  z.object({ op: z.literal("remove"), items: z.array(ref).min(1) }),
  z.object({ op: z.literal("comment"), on: ref, text: z.string().min(1).max(4000) }),
  z.object({
    op: z.literal("reply"),
    to: z.string().min(1).describe("A discussion id"),
    text: z.string().min(1).max(4000),
  }),
  z.object({
    op: z.literal("resolve"),
    discussion: z.string().min(1),
    resolved: z.boolean().optional(),
  }),
  z.object({ op: z.literal("title"), title: z.string().max(500) }),
  z.object({
    op: z.literal("view"),
    name: z.string().max(200),
    center: pointSchema,
    zoom: finite.positive(),
  }),
]);
