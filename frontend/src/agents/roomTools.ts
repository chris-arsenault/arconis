import { z } from "zod";
import { CANVAS_DEFINITIONS } from "./contract";

export const ROOM_SESSION_SHAPE = {
  session_id: z.uuid().describe("The session_id returned by open_room; reuse across connections"),
};
export const OPEN_ROOM_TOOL = {
  title: "Open a shared canvas room for reading and editing",
  description:
    "Join by room link or code; returns session_id and an outline. Each open has independent read/undo history. Existing rooms need someone in a browser. Password/device-only rooms cannot be opened.",
  inputSchema: { room: z.string(), name: z.string().min(1).max(40).optional() },
  outputSchema: { session_id: z.uuid(), canvas: z.string() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};
export const CLOSE_ROOM_TOOL = {
  description:
    "Release this session's peer and edit history; does not delete canvas content held by browsers.",
  inputSchema: ROOM_SESSION_SHAPE,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};
export const OPEN_WORKSPACE_TOOL = {
  title: "Reopen a saved Arconis workspace",
  description:
    "Open an ordinary workspace in the signed-in Arconis account by saved UUID or room link, even with no browser in the room. Returns a new session_id, the diagram identity and canvas outline. Save any edits with save_workspace.",
  inputSchema: {
    workspace_id: z.uuid().optional(),
    room: z.string().optional().describe("Room link or code if you do not know the workspace UUID"),
    name: z.string().min(1).max(40).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};
export const SAVE_WORKSPACE_TOOL = {
  title: "Save an Arconis diagram to your account",
  description:
    "Save this session's ordinary room as an encrypted workspace in the signed-in Arconis account. Returns a durable workspace_id and room_id for later use, including registration with Sulion Plan. Reuses any saved workspace for this room.",
  inputSchema: ROOM_SESSION_SHAPE,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};

interface HostedCanvasTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
}

export function hostedCanvasTools(): HostedCanvasTool[] {
  return CANVAS_DEFINITIONS.map((tool) => ({
    name: tool.name,
    title:
      tool.name === "write" ? "Create and edit canvas objects" : tool.name.replaceAll("_", " "),
    description: tool.description,
    inputSchema: {
      ...targetShape(tool.name, tool.session),
      ...tool.inputSchema,
    },
    annotations: {
      readOnlyHint: !tool.mutates,
      destructiveHint: tool.mutates,
      openWorldHint: false,
    },
  }));
}

function targetShape(name: string, session: boolean): z.ZodRawShape {
  if (name === "import_document")
    return {
      session_id: z.uuid().optional().describe("Existing session, or omit with new_room=true"),
      new_room: z
        .boolean()
        .default(false)
        .describe("Import into a fresh ordinary room and return its collaboration link"),
      name: z.string().min(1).max(40).optional(),
    };
  return session ? ROOM_SESSION_SHAPE : {};
}

/** Discovery metadata is the actual hosted contract, also served during a relay cold start. */
export function hostedToolsMetadata() {
  const tools = hostedCanvasTools().map((tool) => ({
    ...tool,
    inputSchema: z.toJSONSchema(z.object(tool.inputSchema), { io: "input" }),
  }));
  return [
    ...tools,
    {
      name: "open_room",
      ...OPEN_ROOM_TOOL,
      inputSchema: z.toJSONSchema(z.object(OPEN_ROOM_TOOL.inputSchema), { io: "input" }),
      outputSchema: z.toJSONSchema(z.object(OPEN_ROOM_TOOL.outputSchema)),
    },
    {
      name: "close_room",
      ...CLOSE_ROOM_TOOL,
      inputSchema: z.toJSONSchema(z.object(CLOSE_ROOM_TOOL.inputSchema), { io: "input" }),
    },
    ...Object.entries({
      open_workspace: OPEN_WORKSPACE_TOOL,
      save_workspace: SAVE_WORKSPACE_TOOL,
    }).map(([name, tool]) => ({
      ...tool,
      name,
      inputSchema: z.toJSONSchema(z.object(tool.inputSchema), { io: "input" }),
    })),
  ];
}
