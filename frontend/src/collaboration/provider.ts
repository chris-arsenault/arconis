import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { FrameAssembler, frames, type Frame, type MessageKind } from "./frames";
import type { Transport } from "./transport";

const REMOTE = Symbol("remote peer");
/** Delays after connecting at which an unanswered join request is repeated. */
const HELLO_RETRIES_MS = [2000, 4500];
const ALONE_AFTER_MS = 6500;

/**
 * idle: no connection. searching: asked peers for the document, no answer yet.
 * receiving: a transfer is arriving. synced: a peer answered with its differences.
 * alone: nobody answered, so this device holds the only reachable copy.
 */
export type SyncState = "idle" | "searching" | "receiving" | "synced" | "alone";

export class CollaborationProvider {
  readonly awareness: Awareness;
  sync: SyncState = "idle";
  private syncTimers: ReturnType<typeof setTimeout>[] = [];
  private id = crypto.randomUUID();
  private assembler = new FrameAssembler();
  private updates: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private antiEntropy: ReturnType<typeof setInterval>;

  constructor(
    readonly doc: Y.Doc,
    readonly transport: Transport,
    private synchronized: () => void
  ) {
    this.awareness = new Awareness(doc);
    this.doc.on("update", this.onUpdate);
    this.awareness.on("update", this.onAwareness);
    transport.onMessage = this.receive;
    transport.onReady = () => {
      // Search first: a fast transport can deliver the answer before send() returns.
      this.startSearching();
      this.send("hello", Y.encodeStateVector(doc));
      this.sendAwareness();
      this.synchronized();
    };
    this.antiEntropy = setInterval(() => this.send("hello", Y.encodeStateVector(doc)), 30000);
  }
  connect() {
    this.transport.connect();
  }
  /** Called when the transport drops: nothing can be in sync until it reconnects. */
  disconnected() {
    this.clearSyncTimers();
    this.setSync("idle");
  }
  private startSearching() {
    this.clearSyncTimers();
    this.setSync("searching");
    this.syncTimers = [
      ...HELLO_RETRIES_MS.map((delay) =>
        setTimeout(() => this.send("hello", Y.encodeStateVector(this.doc)), delay)
      ),
      setTimeout(() => {
        if (this.sync === "searching") this.setSync("alone");
      }, ALONE_AFTER_MS),
    ];
  }
  private clearSyncTimers() {
    this.syncTimers.forEach(clearTimeout);
    this.syncTimers = [];
  }
  private setSync(state: SyncState) {
    if (this.sync === state) return;
    this.sync = state;
    this.synchronized();
  }
  private send(kind: MessageKind, data: Uint8Array, target = "") {
    frames(this.id, kind, data, target).forEach((frame) => this.transport.send(frame));
  }
  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    this.updates.push(update);
    this.flushTimer ??= setTimeout(() => {
      this.send("update", Y.mergeUpdates(this.updates));
      this.updates = [];
      this.flushTimer = null;
    }, 40);
  };
  private onAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin !== REMOTE)
      this.send(
        "awareness",
        encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed])
      );
  };
  private sendAwareness() {
    this.send("awareness", encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
  }
  private receive = (message: string) => {
    const result = this.assembler.receive(message, this.id);
    if (!result) {
      if (this.assembler.receiving && this.sync !== "synced" && this.sync !== "idle")
        this.setSync("receiving");
      return;
    }
    try {
      this.handle(result.frame, result.data);
    } catch {
      /* Invalid peer payloads cannot interrupt local editing. */
    }
  };
  private handle(frame: Frame, data: Uint8Array) {
    if (frame.kind === "hello" || frame.kind === "vector") {
      this.send("update", Y.encodeStateAsUpdate(this.doc, data), frame.from);
      if (frame.kind === "hello") {
        this.send("vector", Y.encodeStateVector(this.doc), frame.from);
        this.sendAwareness();
      }
    } else if (frame.kind === "update") {
      Y.applyUpdate(this.doc, data, REMOTE);
      if (frame.target === this.id) {
        this.clearSyncTimers();
        this.setSync("synced");
      }
      this.synchronized();
    } else applyAwarenessUpdate(this.awareness, data, REMOTE);
  }
  destroy() {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "leave");
    this.doc.off("update", this.onUpdate);
    this.awareness.off("update", this.onAwareness);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.clearSyncTimers();
    clearInterval(this.antiEntropy);
    this.transport.close();
    this.awareness.destroy();
  }
}
