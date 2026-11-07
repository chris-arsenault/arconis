import { IndexeddbPersistence } from "y-indexeddb";
import { CanvasDocument } from "../document/canvasDocument";
import { CollaborationProvider } from "./provider";
import { LocalTransport, readConfig, type ConnectionState, type Transport } from "./transport";
import { RelayTransport } from "./relayTransport";
import { EditCounter } from "./relayStart";

export function createRoomId() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function parseRoom(value: string) {
  let candidate = value.trim();
  try {
    candidate = new URL(candidate).hash.slice(1);
  } catch {
    /* Raw room codes need no URL parsing. */
  }
  candidate = candidate.replace(/^room=/, "");
  return /^[a-f0-9]{48}$/.test(candidate) ? candidate : null;
}

export class RoomSession {
  readonly document = new CanvasDocument();
  readonly persistence: IndexeddbPersistence;
  readonly provider: CollaborationProvider;
  state: ConnectionState = "connecting";
  detail = "Restoring this device's canvas";
  stored = false;
  version = 0;
  private listeners = new Set<() => void>();
  private disposed = false;
  private edits = new EditCounter();
  private transport: Transport;

  constructor(
    readonly id: string,
    name: string,
    /** Creating a room starts the relay, because a new room is about to be shared. */
    private created = false
  ) {
    const config = readConfig();
    const transport =
      config.transport === "local"
        ? new LocalTransport(id)
        : new RelayTransport(config.relayUrl, id);
    this.transport = transport;
    this.persistence = new IndexeddbPersistence(`arconis:${id}`, this.document.doc);
    this.provider = new CollaborationProvider(this.document.doc, transport, this.emit);
    transport.onStatus = (state, detail = "") => {
      this.state = state;
      this.detail = detail;
      if (state !== "online") this.provider.disconnected();
      this.emit();
    };
    this.provider.awareness.setLocalStateField("user", {
      name,
      color: ["#7863d4", "#d56486", "#329883", "#cf8c39"][this.document.doc.clientID % 4],
    });
    this.provider.awareness.on("change", this.emit);
    this.document.doc.on("update", this.emit);
    this.document.doc.on("update", this.onEdit);
  }
  async start() {
    await this.persistence.whenSynced;
    if (!this.disposed) {
      this.stored = true;
      // A person arriving at a room or at their own saved work is about to use the relay. Someone
      // following a link with no local copy has nothing to send yet, and can use the button.
      if (this.created || this.document.doc.store.clients.size > 0) {
        this.transport.markFresh?.();
        this.transport.start?.();
      }
      this.provider.connect();
      this.emit();
    }
  }
  /** Whether the relay is off and someone here can ask for it. */
  get canStartCollaboration() {
    return Boolean(this.transport.start) && (this.state === "stopped" || this.state === "error");
  }
  startCollaboration = () => {
    this.transport.start?.();
  };
  private onEdit = (_update: Uint8Array, origin: unknown) => {
    if (origin === this.persistence || this.state !== "stopped") return;
    if (this.edits.record(Date.now())) this.startCollaboration();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.version;
  emit = () => {
    this.version++;
    this.listeners.forEach((listener) => listener());
  };
  rename(name: string) {
    const user = this.provider.awareness.getLocalState()?.user as { color: string };
    this.provider.awareness.setLocalStateField("user", { ...user, name });
  }
  destroy() {
    this.disposed = true;
    this.provider.destroy();
    void this.persistence.destroy();
    this.document.destroy();
    this.listeners.clear();
  }
}
