import { randomUUID } from "node:crypto";
import { LanguageError } from "../language/lexer";
import { AgentSession } from "./agentSession";
import { reportEvent } from "./errors";
import type { Relay } from "./relay";

export const SESSION_IDLE_MS = 30 * 60_000;
export const MAX_SESSIONS = 50;
export const MAX_SESSIONS_PER_USER = 5;

export interface SessionOwner {
  user: string;
  clientId: string;
}

interface RoomSession {
  owner: SessionOwner;
  agent: AgentSession;
  lastUsed: number;
}

/** Explicit room handles outlive individual MCP requests and connections, but never the relay. */
export class AgentSessions {
  private rooms = new Map<string, RoomSession>();

  constructor(
    private relay: () => Relay,
    private now: () => number = Date.now
  ) {}

  create(owner: SessionOwner, name: string) {
    this.sweep();
    const own = [...this.rooms.values()].filter((room) => room.owner.user === owner.user).length;
    if (this.rooms.size >= MAX_SESSIONS || own >= MAX_SESSIONS_PER_USER)
      throw new LanguageError("Too many room sessions are open; use close_room on one and retry.");
    const id = randomUUID();
    const agent = new AgentSession(this.relay, name);
    this.rooms.set(id, { owner, agent, lastUsed: this.now() });
    reportEvent("room_session_created", { session: agent.logId, activeSessions: this.rooms.size });
    return { id, agent };
  }

  get(owner: SessionOwner, id: string) {
    const room = this.rooms.get(id);
    if (!room || room.owner.user !== owner.user || room.owner.clientId !== owner.clientId)
      throw new LanguageError(
        "This room session is unknown or has ended. Call open_room and use its returned session_id."
      );
    if (this.now() - room.lastUsed >= SESSION_IDLE_MS) {
      this.discard(id, "idle");
      throw new LanguageError("This room session expired. Call open_room for a new session_id.");
    }
    room.lastUsed = this.now();
    return room.agent;
  }

  discard(id: string, reason: "client_close" | "open_failed" | "idle" | "shutdown") {
    const room = this.rooms.get(id);
    if (!room) return;
    this.rooms.delete(id);
    reportEvent("room_session_ended", {
      session: room.agent.logId,
      reason,
      roomOpen: room.agent.hasRoom,
    });
    room.agent.leave();
  }

  sweep() {
    this.rooms.forEach((room, id) => {
      if (this.now() - room.lastUsed >= SESSION_IDLE_MS) this.discard(id, "idle");
    });
  }

  close() {
    [...this.rooms.keys()].forEach((id) => this.discard(id, "shutdown"));
  }

  get size() {
    return this.rooms.size;
  }
}
