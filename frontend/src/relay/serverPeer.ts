import * as Y from "yjs";
import { CollaborationProvider } from "../collaboration/provider";
import type { ConnectionState, FrameChannel } from "../collaboration/channel";
import { CanvasDocument } from "../document/canvasDocument";
import type { Relay, RelaySocket } from "./relay";
import { LockedTransport } from "../collaboration/lockedTransport";
import {
  DEFAULT_PASSWORD,
  openEnvelope,
  defaultRoomKey,
  createEnvelope,
  envelopeMatches,
  seal,
  unseal,
  WrongPassword,
  type Envelope,
} from "../collaboration/roomKey";
import { decodeContents, encodeContents, type SavedCopy } from "../account/workspaceFile";
import type { PortablePicture } from "../document/pictures";
import { LanguageError } from "../language/lexer";

/** How long a new peer waits for someone in the room to send the canvas. */
export const SYNC_TIMEOUT_MS = 10_000;
const AGENT_COLOR = "#2f7de1";

export type PeerReadiness = "ready" | "nobody" | "locked" | "unanswered";

/**
 * A room member that lives in the relay process, holding the room's canvas in memory while agents
 * work on it. It joins through the relay like any browser, so people see its edits as a peer's.
 */
export class ServerPeer {
  readonly document = new CanvasDocument();
  readonly provider: CollaborationProvider;
  private transport: LockedTransport;
  /** An envelope requiring an explicit password keeps this room browser-owned. */
  locked = false;
  private roomKey: CryptoKey | null = null;
  private envelope: Envelope | null = null;

  get key() {
    if (!this.roomKey) throw new Error("Room key is unavailable.");
    return this.roomKey;
  }

  get retained() {
    return this.relay.agentRoomActive(this.roomId);
  }

  /** A new ordinary room starts with the same key and envelope as a browser-created room. */
  async seed() {
    const key = await defaultRoomKey(this.roomId);
    const envelope = await createEnvelope(DEFAULT_PASSWORD, key, 1);
    this.unlock(key, envelope);
    this.transport.envelopeKnown();
    this.provider.connect();
  }

  private unlock(key: CryptoKey, envelope: Envelope) {
    this.roomKey = key;
    this.envelope = envelope;
    this.transport.unlock(key);
  }

  async mergeCopy(copy: SavedCopy, signal: AbortSignal): Promise<PortablePicture[]> {
    if (copy.roomId !== this.roomId)
      throw new LanguageError("The workspace belongs to another room.");
    const key = await this.openCopyKey(copy.envelope);
    const contents = decodeContents(await unseal(this.roomKey ?? key, copy.sealed));
    if (contents.roomId !== this.roomId)
      throw new LanguageError("The workspace room ID does not match.");
    signal.throwIfAborted();
    if (this.locked) throw new LanguageError("A password is required to open this workspace.");
    Y.applyUpdate(this.document.doc, contents.update);
    if (!this.roomKey) {
      this.unlock(key, copy.envelope);
      this.transport.envelopeKnown();
      this.provider.connect();
    } else if (copy.envelope.revision > (this.envelope?.revision ?? 0)) {
      this.unlock(this.roomKey, copy.envelope);
    }
    return contents.pictures;
  }

  private async openCopyKey(envelope: Envelope) {
    try {
      return await openEnvelope(DEFAULT_PASSWORD, envelope);
    } catch (error) {
      if (error instanceof WrongPassword)
        throw new LanguageError("Password workspaces must be opened in the browser.");
      throw error;
    }
  }

  async captureCopy(pictures: PortablePicture[]): Promise<SavedCopy> {
    const envelope = this.envelope;
    if (!envelope || this.locked) throw new LanguageError("This room cannot be saved by an agent.");
    const update = Y.encodeStateAsUpdate(this.document.doc);
    const sealed = await seal(this.key, encodeContents({ roomId: this.roomId, update, pictures }));
    if (this.locked || this.envelope !== envelope)
      throw new LanguageError("The room key changed during save. Reopen the room.");
    return { roomId: this.roomId, envelope, sealed };
  }

  constructor(
    private relay: Relay,
    readonly roomId: string,
    name: string
  ) {
    const id = crypto.randomUUID();
    this.transport = new LockedTransport(new InProcessTransport(relay, roomId), id);
    this.transport.shareEnvelope = () => (this.locked ? null : this.envelope);
    this.transport.onEnvelope = (envelope) => void this.adoptEnvelope(envelope);
    this.provider = new CollaborationProvider(this.document.doc, this.transport, () => {}, id);
    this.provider.awareness.setLocalStateField("user", { name, color: AGENT_COLOR, agent: true });
  }

  private async adoptEnvelope(envelope: Envelope) {
    const current = this.envelope;
    if (current && current.revision >= envelope.revision) return;
    if (this.roomKey && !(await envelopeMatches(this.roomKey, envelope))) return;
    try {
      const key = await openEnvelope(DEFAULT_PASSWORD, envelope);
      if (this.envelope === current) this.unlock(key, envelope);
    } catch {
      if (this.envelope === current) this.locked = true;
    }
  }

  /** Joins and waits for the canvas from someone in the room. */
  async start(timeout = SYNC_TIMEOUT_MS): Promise<PeerReadiness> {
    if (!this.relay.peopleIn(this.roomId) && !this.retained) return "nobody";
    this.provider.connect();
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.locked) return "locked";
      if (this.provider.sync === "synced") return "ready";
      if (this.provider.sync === "alone") return "unanswered";
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return "unanswered";
  }

  /** Names of the people in the room, from their presence. */
  present() {
    const names: string[] = [];
    this.provider.awareness.getStates().forEach((state, client) => {
      const user = (state as Record<string, unknown>).user;
      if (client === this.document.doc.clientID || !user || typeof user !== "object") return;
      const data = user as Record<string, unknown>;
      if (data.agent) return;
      if (typeof data.name === "string") names.push(data.name);
    });
    return names;
  }

  get people() {
    return this.relay.peopleIn(this.roomId);
  }

  close() {
    this.provider.destroy();
    this.document.destroy();
  }
}

/** Carries frames between a peer in this process and the relay, with no socket between them. */
class InProcessTransport implements FrameChannel {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  private connection: ReturnType<Relay["join"]> | null = null;

  constructor(
    private relay: Relay,
    private roomId: string
  ) {}

  connect() {
    if (this.connection) return;
    const socket: RelaySocket = {
      bufferedAmount: 0,
      // Delivered on the next turn, as a socket would, so a reply never re-enters the relay.
      send: (data) => queueMicrotask(() => this.deliver(data)),
      ping: () => queueMicrotask(() => this.connection?.pong()),
      close: () => this.dropped(),
      terminate: () => this.dropped(),
    };
    this.connection = this.relay.join(this.roomId, socket, false, true);
    this.onStatus("online");
    this.onReady();
  }

  private deliver(data: string) {
    if (!this.connection) return;
    if (data.startsWith('{"relay"')) return;
    this.onMessage(data);
  }

  private dropped() {
    if (!this.connection) return;
    this.connection = null;
    this.onStatus("offline");
  }

  send(message: string) {
    this.connection?.receive(message);
  }

  close() {
    this.connection?.leave();
    this.connection = null;
  }
}
