import { z } from "zod";
import { DomainError } from "../domain/canvasIndex";
import type { Operation } from "../domain/context";
import { exportFile, fileSchema } from "../domain/format";
import { STENCILS } from "../domain/model";
import { operationSchema } from "../domain/schema";
import { DomainSession, type ReadRequest } from "../domain/session";
import { ICON_VENDORS } from "../document/geometry";
import { loadAllVendors, loadIcons, searchIcons } from "../editor/icons";
import type { Relay } from "./relay";
import { ServerPeer, type PeerReadiness } from "./serverPeer";

const ROOM_CODE = /^[a-f0-9]{48}$/;

/** A room an agent may open: an ordinary room's link or code. */
export function parseRoomLink(value: string): string {
  let candidate = value.trim();
  try {
    candidate = new URL(candidate).hash.slice(1);
  } catch {
    /* Raw room codes need no URL parsing. */
  }
  if (candidate.startsWith("locked="))
    throw new DomainError(
      "This is a password room. Its contents are encrypted, so agents cannot open it."
    );
  if (candidate.startsWith("local="))
    throw new DomainError("This room exists only in one browser, so agents cannot reach it.");
  candidate = candidate.replace(/^room=/, "");
  if (!ROOM_CODE.test(candidate))
    throw new DomainError("That is not an Arconis room link or code.");
  return candidate;
}

const REFUSALS: Record<Exclude<PeerReadiness, "ready">, string> = {
  nobody:
    "Nobody has this room open. Someone must have it open in a browser for an agent to work in it.",
  locked: "This is a password room. Its contents are encrypted, so agents cannot open it.",
  unanswered:
    "Nobody in the room answered. It may be a password room, which agents cannot open, or the people there may have just left.",
};

/** One agent's connection: the room it has open and its domain session there. */
export class AgentSession {
  private peer: ServerPeer | null = null;
  private domain: DomainSession | null = null;

  constructor(
    private relay: () => Relay,
    /** How the agent appears to people, and signs its comments. */
    readonly name: string
  ) {}

  async openRoom(link: string) {
    const roomId = parseRoomLink(link);
    this.leave();
    const peer = new ServerPeer(this.relay(), roomId, this.name);
    const readiness = await peer.start();
    if (readiness !== "ready") {
      peer.close();
      throw new DomainError(REFUSALS[readiness]);
    }
    this.peer = peer;
    this.domain = new DomainSession(peer.document, this.name);
    return this.describe();
  }

  describe() {
    const { domain, peer } = this.require();
    return domain.describe(peer.present());
  }

  read(request: ReadRequest) {
    return this.require().domain.read(request);
  }

  /** Edits only reach the canvas through people's browsers, so they need someone in the room. */
  apply(operations: Operation[]) {
    const { domain, peer } = this.require();
    if (!peer.people)
      throw new DomainError(
        "Everyone has left the room, so nothing would be kept. Ask someone to open it again."
      );
    return domain.apply(operations);
  }

  undo() {
    const { domain, peer } = this.require();
    if (!peer.people)
      throw new DomainError("Everyone has left the room, so nothing would be kept.");
    return domain.undoLast();
  }

  exportFile() {
    return exportFile(this.require().peer.document);
  }

  private require() {
    if (!this.domain || !this.peer) throw new DomainError("Open a room first with open_room.");
    if (this.peer.locked) throw new DomainError(REFUSALS.locked);
    return { domain: this.domain, peer: this.peer };
  }

  leave() {
    this.domain?.destroy();
    this.peer?.close();
    this.domain = null;
    this.peer = null;
  }
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

/** The schemas an agent can read to write files or operations directly. */
export function formatSchemas() {
  return {
    file: z.toJSONSchema(fileSchema, { io: "input" }),
    operation: z.toJSONSchema(operationSchema, { io: "input" }),
  };
}
