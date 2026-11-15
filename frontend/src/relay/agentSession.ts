import { LanguageError } from "../language/lexer";
import { randomUUID, randomBytes } from "node:crypto";
import { LanguageSession, type ReadRequest } from "../language/session";
import type { Relay } from "./relay";
import { ServerPeer, type PeerReadiness } from "./serverPeer";
import { parseRoom } from "../protocol/room";
import { roomFiles, type AgentPictureStorage } from "./agentPictures";
import type { CanvasFiles } from "../files/canvasFiles";

/** A room an agent may open: an ordinary room's link or code. */
function parseRoomLink(value: string): string {
  const room = parseRoom(value);
  if (!room) throw new LanguageError("That is not an Arconis room link or code.");
  if (room.startsWith("locked-"))
    throw new LanguageError(
      "This is a password room. Its contents are encrypted, so agents cannot open it."
    );
  if (room.startsWith("local-"))
    throw new LanguageError("This room exists only in one browser, so agents cannot reach it.");
  return room;
}

const REFUSALS: Record<Exclude<PeerReadiness, "ready">, string> = {
  nobody:
    "Nobody has this room open. Someone must have it open in a browser for an agent to work in it.",
  locked: "This is a password room. Its contents are encrypted, so agents cannot open it.",
  unanswered:
    "Nobody in the room answered. It may be a password room, which agents cannot open, or the people there may have just left.",
};

/** One agent's room and language history, independent of MCP transport connections. */
export class AgentSession {
  /** Diagnostic correlation only; never an MCP session credential or room identifier. */
  readonly logId = randomUUID();
  private peer: ServerPeer | null = null;
  private domain: LanguageSession | null = null;
  private files: CanvasFiles | null = null;
  private lifetime = new AbortController();
  private releaseRoom = () => {};

  constructor(
    private relay: () => Relay,
    /** How the agent appears to people, and signs its comments. */
    readonly name: string,
    private pictureStorage: AgentPictureStorage | null = null
  ) {}

  get hasRoom() {
    return this.peer !== null && this.domain !== null;
  }

  async openRoom(link: string) {
    const roomId = parseRoomLink(link);
    this.leave();
    const peer = new ServerPeer(this.relay(), roomId, this.name);
    this.peer = peer;
    try {
      const readiness = await peer.start();
      if (this.peer !== peer)
        throw new LanguageError("This room session ended while opening. Call open_room again.");
      if (readiness !== "ready") throw new LanguageError(REFUSALS[readiness]);
      this.prepare(peer);
      return this.describe();
    } catch (error) {
      this.leave();
      throw error;
    }
  }

  describe() {
    const { domain, peer } = this.require();
    return domain.describe(peer.present());
  }

  async createRoom() {
    this.leave();
    const relay = this.relay();
    const roomId = randomBytes(24).toString("hex");
    const peer = new ServerPeer(relay, roomId, this.name);
    this.peer = peer;
    this.releaseRoom = relay.retainAgentRoom(roomId);
    try {
      await peer.seed();
      if (this.peer !== peer) throw new LanguageError("Room session ended while opening.");
      if (relay.stopping)
        throw new LanguageError("The relay is stopping. Retry after it restarts.");
      this.prepare(peer);
      return roomId;
    } catch (error) {
      this.leave();
      throw error;
    }
  }

  private prepare(peer: ServerPeer) {
    this.domain = new LanguageSession(peer.document, this.name);
    this.lifetime = new AbortController();
    this.files = roomFiles(
      peer.document,
      () => peer.key,
      this.pictureStorage,
      this.lifetime.signal
    );
  }

  read(request: ReadRequest) {
    return this.require().domain.read(request);
  }

  /** Overlaps, objects outside their holder and text that may not fit, without drawing anything. */
  checkLayout(request: ReadRequest) {
    return this.require().domain.checkLayout(request);
  }

  /** Existing rooms need browsers; a seeded room is retained by its creating session. */
  write(text: string) {
    const { domain, peer } = this.require();
    if (!peer.people && !peer.retained)
      throw new LanguageError(
        "Everyone has left the room, so nothing would be kept. Ask someone to open it again."
      );
    return domain.write(text);
  }

  undo() {
    const { domain, peer } = this.require();
    if (!peer.people && !peer.retained)
      throw new LanguageError("Everyone has left the room, so nothing would be kept.");
    return domain.undoLast();
  }

  async importDocument(content: string) {
    const { domain, peer, files } = this.require();
    if (!peer.people && !peer.retained)
      throw new LanguageError("Everyone has left the room; ask someone to open it again.");
    let result = "";
    await files.import(new File([content], "canvas.arconis"), domain.origin, (write) => {
      const imported = domain.importDocument(write);
      result = imported.result;
      return imported.created;
    });
    return result;
  }

  exportDocument(ids: string[], includeMarkup: boolean) {
    return this.require().files.canvas(ids, includeMarkup);
  }

  private require() {
    if (!this.domain || !this.peer || !this.files)
      throw new LanguageError("Open a room first with open_room.");
    if (this.peer.locked) throw new LanguageError(REFUSALS.locked);
    return { domain: this.domain, peer: this.peer, files: this.files };
  }

  leave() {
    this.lifetime.abort();
    this.files = null;
    this.domain?.destroy();
    this.peer?.close();
    this.domain = null;
    this.peer = null;
    this.releaseRoom();
    this.releaseRoom = () => {};
  }
}

/** The participant name supplied when opening a room, independent of initialize metadata. */
export function agentName(value: string) {
  const name = value
    .replace(/[^\w .()-]/g, "")
    .trim()
    .slice(0, 40);
  return `${name || "Agent"} (agent)`;
}

export { stencils } from "../agents/stencils";
