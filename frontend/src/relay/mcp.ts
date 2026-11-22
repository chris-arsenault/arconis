import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LanguageError } from "../language/lexer";
import { agentName, type AgentSession } from "./agentSession";
import { AgentSessions, type SessionOwner } from "./agentSessions";
import { reportEvent, reportFailure } from "./errors";
import { canvasOperation, toolResult } from "../agents/operations";
import {
  hostedCanvasTools,
  OPEN_ROOM_TOOL,
  CLOSE_ROOM_TOOL,
  OPEN_WORKSPACE_TOOL,
  SAVE_WORKSPACE_TOOL,
} from "../agents/roomTools";
import { AGENT_INSTRUCTIONS } from "../agents/instructions";
import type { AgentWorkspaceStorage, WorkspaceAccount } from "./agentWorkspaceStorage";
import type { Caller } from "../protocol/mcp";
import { parseRoom } from "../protocol/room";

export { MAX_WRITE } from "../agents/operations";

async function answer(
  operation: string,
  work: (state: { session: AgentSession | null }) => unknown
) {
  const state: { session: AgentSession | null } = { session: null };
  const callId = crypto.randomUUID();
  const started = performance.now();
  const context = () => ({
    session: state.session?.logId ?? "none",
    callId,
    operation,
    roomOpen: state.session?.hasRoom ?? false,
  });
  reportEvent("tool_started", context());
  try {
    const result = toolResult(await work(state));
    reportEvent(
      "tool_finished",
      {
        ...context(),
        outcome: result.isError ? "refused" : "succeeded",
        durationMs: performance.now() - started,
      },
      result.isError ? "warn" : "info"
    );
    return result;
  } catch (error) {
    if (error instanceof LanguageError) {
      reportEvent(
        "tool_finished",
        { ...context(), outcome: "refused", durationMs: performance.now() - started },
        "warn"
      );
      return toolResult(`// Nothing was changed. ${error.message}`);
    }
    const errorId = reportFailure(operation, error, {
      ...context(),
      outcome: "failed",
      durationMs: performance.now() - started,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `Arconis could not complete ${operation}. Error reference: ${errorId}. Report this reference to the operator. Read before retrying an edit; its outcome is unverified.`,
        },
      ],
      isError: true,
    };
  }
}

/** Room lifecycle remains hosted; canvas tools are shared with the standalone CLI. */
export function createMcpServer(
  sessions: AgentSessions,
  owner: Caller,
  workspaces: AgentWorkspaceStorage | null
) {
  const server = new McpServer(
    { name: "arconis", version: "3.0.0" },
    {
      instructions: `${AGENT_INSTRUCTIONS}\n\nFor hosted work call open_room with the user's link or code, or open_workspace with the saved workspace UUID. Pass the returned session_id to canvas tools. Create a room with import_document using new_room=true and portable content. Use save_workspace for durable work, including diagrams attached to a Sulion plan. Add the phase URLs returned by Sulion as links on their Arconis objects, save the workspace, and use its workspace_id, room_id and the object IDs with Sulion Plan. Room sessions expire after 30 minutes unused or relay replacement. Use close_room when finished.`,
    }
  );
  for (const tool of hostedCanvasTools()) {
    server.registerTool(tool.name, tool, (args) =>
      answer(tool.name, (state) => {
        const operation = canvasOperation(tool.name);
        if (tool.name === "import_document" && args.new_room === true)
          return importNewRoom(sessions, owner, args, state);
        if (operation.session) {
          if (typeof args.session_id !== "string")
            throw new LanguageError(
              "Pass session_id, or import_document with new_room=true to create a room."
            );
          state.session = sessions.get(owner, z.uuid().parse(args.session_id));
        }
        return operation.run(state.session, args);
      })
    );
  }
  registerRooms(server, sessions, owner);
  registerWorkspaces(server, sessions, owner, workspaces);
  server.server.onerror = (error) => reportFailure("mcp_transport", error);
  server.server.onclose = () => reportEvent("mcp_transport_closed", {});
  return server;
}

async function importNewRoom(
  sessions: AgentSessions,
  owner: SessionOwner,
  args: Record<string, unknown>,
  state: { session: AgentSession | null }
) {
  if (args.session_id) throw new LanguageError("Choose session_id or new_room=true, not both.");
  const opened = sessions.create(
    owner,
    agentName(typeof args.name === "string" ? args.name : "Agent")
  );
  state.session = opened.agent;
  try {
    const roomId = await opened.agent.createRoom();
    const result = await canvasOperation("import_document").run(opened.agent, args);
    if (toolResult(result).isError) {
      sessions.discard(opened.id, "open_failed");
      return result;
    }
    sessions.get(owner, opened.id);
    return {
      session_id: opened.id,
      room_url: sessions.roomLink(roomId),
      canvas: opened.agent.describe(),
      import: result,
      instructions:
        "Use save_workspace to keep this diagram in your account before closing the session. Present room_url to the user so they can open Arconis and collaborate.",
      lifetime:
        "Held only in this agent session's memory; expires after 30 minutes unused, close_room, relay replacement or shutdown. This is not a durable saved copy. The original file remains the restore copy.",
    };
  } catch (error) {
    sessions.discard(opened.id, "open_failed");
    throw error;
  }
}

function registerWorkspaces(
  server: McpServer,
  sessions: AgentSessions,
  owner: Caller,
  storage: AgentWorkspaceStorage | null
) {
  const account = () => {
    if (!owner.scopes.includes("edit:rooms"))
      throw new LanguageError("Reconnect Arconis with permission to edit rooms.");
    if (!storage) throw new LanguageError("Account workspace storage is unavailable.");
    return storage(owner.user);
  };
  server.registerTool("save_workspace", SAVE_WORKSPACE_TOOL, ({ session_id }) =>
    answer("save_workspace", async (state) => {
      const workspace = account();
      state.session = sessions.get(owner, session_id);
      const { id, roomId, title } = await state.session.saveWorkspace(workspace);
      return { workspace_id: id, room_id: roomId, room_url: sessions.roomLink(roomId), title };
    })
  );
  server.registerTool("open_workspace", OPEN_WORKSPACE_TOOL, ({ workspace_id, room, name }) =>
    answer("open_workspace", async (state) => {
      const workspace = account();
      const id = await resolveWorkspaceId(workspace, workspace_id, room);
      const { copy } = await workspace.open(id);
      const opened = sessions.create(owner, agentName(name ?? "Agent"));
      state.session = opened.agent;
      try {
        const { canvas, title } = await opened.agent.openWorkspace(id, copy);
        sessions.get(owner, opened.id);
        return {
          session_id: opened.id,
          workspace_id: id,
          room_id: copy.roomId,
          room_url: sessions.roomLink(copy.roomId),
          title,
          canvas,
        };
      } catch (error) {
        sessions.discard(opened.id, "open_failed");
        throw error;
      }
    })
  );
}

async function resolveWorkspaceId(
  account: WorkspaceAccount,
  id: string | undefined,
  room: string | undefined
) {
  if (id && !room) return id;
  if (!room || id) throw new LanguageError("Pass either workspace_id or a room link.");
  const roomId = parseRoom(room);
  if (!roomId) throw new LanguageError("That is not an Arconis room link or code.");
  const workspaceId = await account.idForRoom(roomId);
  if (!workspaceId)
    throw new LanguageError("This room has no saved workspace in your Arconis account.");
  return workspaceId;
}

function registerRooms(server: McpServer, sessions: AgentSessions, owner: SessionOwner) {
  server.registerTool("open_room", OPEN_ROOM_TOOL, ({ room, name }) =>
    answer("open_room", async (state) => {
      const opened = sessions.create(owner, agentName(name ?? "Agent"));
      state.session = opened.agent;
      try {
        const canvas = await opened.agent.openRoom(room);
        sessions.get(owner, opened.id);
        return { session_id: opened.id, canvas };
      } catch (error) {
        sessions.discard(opened.id, "open_failed");
        throw error;
      }
    })
  );
  server.registerTool("close_room", CLOSE_ROOM_TOOL, ({ session_id }) =>
    answer("close_room", (state) => {
      state.session = sessions.get(owner, session_id);
      sessions.discard(session_id, "client_close");
      return "Room session closed. Call open_room for a new session_id to work again.";
    })
  );
}
