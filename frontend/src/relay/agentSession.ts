import { LanguageError } from "../language/lexer";
import { randomUUID } from "node:crypto";
import { LanguageSession, type ReadRequest } from "../language/session";
import { ICON_VENDORS } from "../document/geometry";
import { STENCILS } from "../document/types";
import { loadAllVendors, loadIcons, searchIcons } from "../assets/icons/catalog";
import type { Relay } from "./relay";
import { ServerPeer, type PeerReadiness } from "./serverPeer";
import { parseRoom } from "../protocol/room";

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

  constructor(
    private relay: () => Relay,
    /** How the agent appears to people, and signs its comments. */
    readonly name: string
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
      this.domain = new LanguageSession(peer.document, this.name);
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

  read(request: ReadRequest) {
    return this.require().domain.read(request);
  }

  /** Overlaps, objects outside their holder and text that may not fit, without drawing anything. */
  checkLayout(request: ReadRequest) {
    return this.require().domain.checkLayout(request);
  }

  /** Edits only reach the canvas through people's browsers, so they need someone in the room. */
  write(text: string) {
    const { domain, peer } = this.require();
    if (!peer.people)
      throw new LanguageError(
        "Everyone has left the room, so nothing would be kept. Ask someone to open it again."
      );
    return domain.write(text);
  }

  undo() {
    const { domain, peer } = this.require();
    if (!peer.people)
      throw new LanguageError("Everyone has left the room, so nothing would be kept.");
    return domain.undoLast();
  }

  private require() {
    if (!this.domain || !this.peer) throw new LanguageError("Open a room first with open_room.");
    if (this.peer.locked) throw new LanguageError(REFUSALS.locked);
    return { domain: this.domain, peer: this.peer };
  }

  leave() {
    this.domain?.destroy();
    this.peer?.close();
    this.domain = null;
    this.peer = null;
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

/** Stencils, and icon keys matching a search, for the icon stencil. */
export async function stencils(query: string | undefined) {
  if (!query?.trim())
    return {
      stencils: STENCILS,
      iconSets: ["lucide", "brand", ...ICON_VENDORS],
      iconHint: "Search with a query, such as 'lock server database', to find icon keys.",
    };
  await Promise.all([loadIcons(), loadAllVendors()]);
  // Each word is its own search, so one call can look for several things at once.
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
    ),
  ].slice(0, 8);
  return {
    icons: Object.fromEntries(
      words.map((word) => {
        const found = searchIcons(word, ICONS_PER_WORD + 1);
        return [
          word,
          {
            matches: found.slice(0, ICONS_PER_WORD).map(({ key, title }) => ({ key, title })),
            more: found.length > ICONS_PER_WORD,
          },
        ];
      })
    ),
  };
}
const ICONS_PER_WORD = 12;
