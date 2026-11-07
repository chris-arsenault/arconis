import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DomainError } from "../domain/canvasIndex";
import type { Operation } from "../domain/context";
import { operationSchema } from "../domain/schema";
import { AgentSession, formatSchemas, stencils } from "./agentSession";

/** Most operations one `apply` call may carry. */
export const MAX_BATCH = 200;

const INSTRUCTIONS = `Arconis is a shared canvas for architecture diagrams, mind maps, screen layouts and notes. You work in a room someone has open in a browser; they see your changes as you make them.

The canvas holds items:
- node: a shape in a diagram or a topic in a mind map. Its stencil says what it is (rectangle, ellipse, decision, service, database, cloud, person, or icon with an icon key).
- region: a panel or group that holds other items; a screen layout is a region sized like a screen.
- text: plain text, or a sticky note.
- picture: an image people added.
- connection: a line from one item to another, with a route and an arrow.
- branch: one step of a topic tree, from a parent topic to a child. Any node can grow branches.
- reference: a dashed pointer from one item to another that implies no structure.
- drawing: freehand marks, which you can read and move.
Items can hold other items (\`inside\`), have discussions (threads of comments) and a look (fill, line, text).

Coordinates are canvas units, with x to the right and y downward; x and y are an item's top-left corner.

Start with open_room, then read what you need. Refer to items by id, or by a name only one item has. Change things with apply, which takes a batch of operations and makes all of them or none. Placement can be exact (x, y), relative (by dx, dy) or relational (beside, inside, alignWith).

Others may edit while you work. Every result lists what they changed since your last call, with the current state of those items. If you act on an item someone changed since you last saw it, nothing is changed and you get its current state: decide again and resend. undo reverts only your own last change.`;

type Json = Record<string, unknown>;

function reply(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

/** Domain refusals are answers for the agent; anything else is a fault in the server. */
async function answer(work: () => unknown) {
  try {
    return reply(await work());
  } catch (error) {
    if (error instanceof DomainError) return reply({ status: "failed", reason: error.message });
    throw error;
  }
}

const readShape = {
  items: z.array(z.string()).optional().describe("Ids or unique names of the items to read"),
  inside: z.string().optional().describe("Read a holder and everything it holds"),
  area: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional()
    .describe("Read every box overlapping this area"),
};

/** The tools for one agent connection. */
export function createMcpServer(session: AgentSession) {
  const server = new McpServer(
    { name: "arconis", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );
  registerReading(server, session);
  registerEditing(server, session);
  registerReference(server, session);
  return server;
}

function registerReading(server: McpServer, session: AgentSession) {
  server.registerTool(
    "open_room",
    {
      title: "Open a room",
      description:
        "Joins an Arconis room by its link or code and describes it. Someone must have the room open. Password rooms and device-only rooms cannot be opened.",
      inputSchema: {
        room: z
          .string()
          .describe("The room's link, such as https://arconis.ahara.io/#room=…, or its code"),
      },
    },
    ({ room }) => answer(() => session.openRoom(room))
  );
  server.registerTool(
    "describe_canvas",
    {
      title: "Describe the canvas",
      description:
        "Orientation: title, who is present, counts by type, bounds, an outline of every item (id, type, name, holder), open discussions and saved views.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => answer(() => session.describe())
  );
  server.registerTool(
    "read",
    {
      title: "Read items",
      description:
        "Full state of items with what they hold (holds), their links and the boxes they overlap (overlaps), each listed only when there are any, plus their discussions. Name items, a holder or an area; with none, reads the whole canvas.",
      inputSchema: readShape,
      annotations: { readOnlyHint: true },
    },
    (request) => answer(() => session.read(request))
  );
}

function registerEditing(server: McpServer, session: AgentSession) {
  server.registerTool(
    "apply",
    {
      title: "Change the canvas",
      description: `Applies a batch of up to ${MAX_BATCH} operations as one change: all of them, or none if any fails or targets an item someone else changed since you saw it. Give a new item \`as\` to refer to it later in the same batch. Each result says what happened, including where items landed and what they overlap.`,
      inputSchema: { operations: z.array(operationSchema).min(1).max(MAX_BATCH) },
    },
    ({ operations }) => answer(() => session.apply(operations as Operation[]))
  );
  server.registerTool(
    "undo",
    {
      title: "Undo",
      description: "Reverts your own most recent change, leaving everyone else's work alone.",
      inputSchema: {},
    },
    () => answer(() => session.undo())
  );
}

function registerReference(server: McpServer, session: AgentSession) {
  server.registerTool(
    "list_stencils",
    {
      title: "List stencils",
      description:
        "With no query, the node stencils and icon sets. With a query, icon keys for the icon stencil: each word is searched separately and returns its best matches, marked when more exist. Lucide covers generic ideas (lock, server, users); brand, aws, azure and gcp cover products.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Words to search icon names for, such as 'lambda postgres lock'"),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query }) => answer(() => stencils(query))
  );
  server.registerTool(
    "export_file",
    {
      title: "Export the canvas",
      description:
        "The canvas as an Arconis file: the same items you read, with discussions and views. Pictures are referred to by hash; their bytes stay in the room's storage.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => answer(() => JSON.parse(session.exportFile()) as Json)
  );
  server.registerTool(
    "format_schema",
    {
      title: "Format schema",
      description: "JSON Schemas for the Arconis file and for apply's operations.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => answer(() => formatSchemas())
  );
}
