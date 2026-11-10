import { CollaborationProvider } from "../collaboration/provider";
import type { ConnectionState, FrameChannel } from "../collaboration/channel";
import { CanvasDocument } from "../document/canvasDocument";
import type { Relay, RelaySocket } from "./relay";
import { LockedTransport } from "../collaboration/lockedTransport";
import { DEFAULT_PASSWORD, openEnvelope } from "../collaboration/roomKey";

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

  constructor(
    private relay: Relay,
    readonly roomId: string,
    name: string
  ) {
    const id = crypto.randomUUID();
    this.transport = new LockedTransport(new InProcessTransport(relay, roomId), id);
    this.transport.onEnvelope = (envelope) => {
      void openEnvelope(DEFAULT_PASSWORD, envelope)
        .then((key) => {
          this.transport.shareEnvelope = () => envelope;
          this.transport.unlock(key);
        })
        .catch(() => {
          this.locked = true;
        });
    };
    this.provider = new CollaborationProvider(this.document.doc, this.transport, () => {}, id);
    this.provider.awareness.setLocalStateField("user", { name, color: AGENT_COLOR, agent: true });
  }

  /** Joins and waits for the canvas from someone in the room. */
  async start(timeout = SYNC_TIMEOUT_MS): Promise<PeerReadiness> {
    if (!this.relay.peopleIn(this.roomId)) return "nobody";
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
