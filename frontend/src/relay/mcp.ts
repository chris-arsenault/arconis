import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LanguageError } from "../language/lexer";
import { LANGUAGE_REFERENCE } from "../language/reference";
import { AgentSession, stencils } from "./agentSession";

/** The most text one write may carry. */
export const MAX_WRITE = 200_000;

const INSTRUCTIONS = `Arconis is a shared canvas for architecture diagrams, mind maps, screen layouts and notes. You work in a room someone has open in a browser; they see your changes as you make them.

You read and change the canvas in the Arconis canvas language below. What you read is written in it, a saved file is the whole canvas in it, and write takes it: one call can build a whole section, with frames, arrangements, styles and lines.

Start with open_room, read what you need, then write. Use list_stencils to find icon keys. Others may edit while you work: every result ends with what they changed since your last call. If you change an item someone changed since you last saw it, nothing is changed and you get its current state: decide again and resend. undo reverts only your own last write.

${LANGUAGE_REFERENCE}`;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** Language refusals are answers for the agent; anything else is a fault in the server. */
async function answer(work: () => unknown) {
  try {
    const value = await work();
    return text(typeof value === "string" ? value : JSON.stringify(value));
  } catch (error) {
    if (error instanceof LanguageError) return text(`// Nothing was changed. ${error.message}`);
    throw error;
  }
}

const readShape = {
  items: z.array(z.string()).optional().describe("Ids of the items to read, with what they hold"),
  inside: z.string().optional().describe("Read a holder and everything it holds"),
  area: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional()
    .describe("Read every item overlapping this area"),
};

/** The tools for one agent connection. */
export function createMcpServer(session: AgentSession) {
  const server = new McpServer(
    { name: "arconis", version: "2.0.0" },
    { instructions: INSTRUCTIONS }
  );
  registerReading(server, session);
  registerWriting(server, session);
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
        "Orientation: title, who is here, counts, bounds, styles, an outline of every item and line by id and name, each deck's slides in order, open discussions and saved views.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => answer(() => session.describe())
  );
  server.registerTool(
    "read",
    {
      title: "Read the canvas",
      description:
        "Items in the canvas language, with what they hold, the lines among them and their discussions. Name items, a holder or an area; with none, the whole canvas as a file.",
      inputSchema: readShape,
      annotations: { readOnlyHint: true },
    },
    (request) => answer(() => session.read(request))
  );
}

function registerWriting(server: McpServer, session: AgentSession) {
  server.registerTool(
    "write",
    {
      title: "Write to the canvas",
      description:
        "Applies statements in the canvas language as one change: all of them, or none if any fails or changes an item someone else changed since you saw it. Returns the statements of what was created and changed, with where items landed and any overlaps.",
      inputSchema: {
        statements: z.string().min(1).max(MAX_WRITE).describe("Statements in the canvas language"),
      },
    },
    ({ statements }) => answer(() => session.write(statements))
  );
  server.registerTool(
    "undo",
    {
      title: "Undo",
      description: "Reverts your own most recent write, leaving everyone else's work alone.",
      inputSchema: {},
    },
    () => answer(() => session.undo())
  );
  server.registerTool(
    "list_stencils",
    {
      title: "List stencils",
      description:
        "With no query, the node stencils and icon sets. With a query, icon keys: each word is searched separately and returns its best matches, marked when more exist. Lucide covers generic ideas (lock, server, users); brand, aws, azure and gcp cover products.",
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
}
