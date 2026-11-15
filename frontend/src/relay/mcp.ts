import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LanguageError } from "../language/lexer";
import { agentName, type AgentSession } from "./agentSession";
import { AgentSessions, type SessionOwner } from "./agentSessions";
import { reportEvent, reportFailure } from "./errors";
import { canvasOperation, toolResult } from "../agents/operations";
import { hostedCanvasTools, OPEN_ROOM_TOOL, CLOSE_ROOM_TOOL } from "../agents/roomTools";
import { AGENT_INSTRUCTIONS } from "../agents/instructions";

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
export function createMcpServer(sessions: AgentSessions, owner: SessionOwner) {
  const server = new McpServer(
    { name: "arconis", version: "3.0.0" },
    {
      instructions: `${AGENT_INSTRUCTIONS}\n\nFor hosted work call open_room with the user's link or code; pass its session_id to room tools. Existing rooms need a browser peer unless retained by a new-room import session. To import into a new room, call import_document with new_room=true and portable content; show its room_url to the user immediately for collaboration. Keep the session open until a browser retains the canvas, or export a copy. New-room copies are held only in session memory, not saved durably. Password and device-only rooms are inaccessible. Use close_room when finished. Sessions expire after 30 minutes unused or relay replacement; reconnecting MCP does not close them.`,
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
        "Present room_url to the user now so they can open Arconis and collaborate. Keep this session open until they join, or export a portable copy before closing.",
      lifetime:
        "Held only in this agent session's memory; expires after 30 minutes unused, close_room, relay replacement or shutdown. This is not a durable saved copy. The original file remains the restore copy.",
    };
  } catch (error) {
    sessions.discard(opened.id, "open_failed");
    throw error;
  }
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
