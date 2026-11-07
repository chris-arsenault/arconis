import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { FrameAssembler, frames, type Frame, type MessageKind } from "./frames";
import type { Transport } from "./transport";
import { compareHoldings, encodeHoldings } from "./vectors";

const REMOTE = Symbol("remote peer");
/** Delays after connecting at which an unanswered join request is repeated. */
const HELLO_RETRIES_MS = [2000, 4500];
const ALONE_AFTER_MS = 6500;
/** Cursors and drag previews coalesce to this rate, whatever the pointer does. */
export const PRESENCE_INTERVAL_MS = 80;

const isHidden = () => globalThis.document?.hidden === true;

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
  private presenceChanged = new Set<number>();
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Peers already told who is here, since this connection opened. */
  private announcedTo = new Set<string>();
  /** Whether this connection has asked the whole room for what the first answer missed. */
  private pulled = false;

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
      this.pulled = false;
      this.announcedTo.clear();
      this.send("hello", Y.encodeStateVector(doc));
      this.sendAwareness();
      this.synchronized();
    };
    this.antiEntropy = setInterval(() => this.send("vector", encodeHoldings(doc)), 30000);
    globalThis.document?.addEventListener("visibilitychange", this.onVisibility);
  }
  /** Hidden tabs stay quiet. Peers time their presence out, and it returns on being shown. */
  private onVisibility = () => {
    if (!isHidden()) this.sendAwareness();
  };
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
        setTimeout(() => {
          // A slow large transfer is an answer, and repeating would start a second one.
          if (!this.assembler.receiving) this.send("hello", Y.encodeStateVector(this.doc));
        }, delay)
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
    if (origin === REMOTE || isHidden()) return;
    [...added, ...updated, ...removed].forEach((client) => this.presenceChanged.add(client));
    this.presenceTimer ??= setTimeout(this.flushPresence, PRESENCE_INTERVAL_MS);
  };
  private flushPresence = () => {
    this.presenceTimer = null;
    const clients = [...this.presenceChanged];
    this.presenceChanged.clear();
    if (clients.length) this.send("awareness", encodeAwarenessUpdate(this.awareness, clients));
  };
  private sendAwareness(target = "") {
    this.send("awareness", encodeAwarenessUpdate(this.awareness, [this.doc.clientID]), target);
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
    if (frame.kind === "hello") this.answerJoin(frame.from, data);
    else if (frame.kind === "vector") this.receiveVector(frame, data);
    else if (frame.kind === "update") {
      Y.applyUpdate(this.doc, data, REMOTE);
      if (frame.target === this.id) this.answered();
      this.synchronized();
    } else applyAwarenessUpdate(this.awareness, data, REMOTE);
  }
  /** The answer is sent even when empty, because it is how the joiner learns someone is here. */
  private answerJoin(from: string, vector: Uint8Array) {
    this.noLongerAlone();
    this.announcedTo.add(from);
    this.send("update", Y.encodeStateAsUpdate(this.doc, vector), from);
    this.send("vector", encodeHoldings(this.doc), from);
    this.sendAwareness(from);
  }
  /** Only one person answered, so ask everyone else for anything that answer lacked. */
  private answered() {
    this.clearSyncTimers();
    this.setSync("synced");
    if (this.pulled) return;
    this.pulled = true;
    this.send("vector", encodeHoldings(this.doc));
  }
  private noLongerAlone() {
    if (this.sync === "alone") this.setSync("synced");
  }
  private receiveVector(frame: Frame, data: Uint8Array) {
    this.noLongerAlone();
    const { vector, peerLacks, weLack } = compareHoldings(this.doc, data);
    if (peerLacks) this.send("update", Y.encodeStateAsUpdate(this.doc, vector), frame.from);
    if (!this.announcedTo.has(frame.from)) {
      this.announcedTo.add(frame.from);
      this.sendAwareness(frame.from);
    }
    // A broadcast showing edits this peer lacks gets its vector back, so the sender can reply with
    // them now rather than at the next periodic exchange. Replies are targeted, so this cannot loop.
    if (!frame.target && weLack) this.send("vector", encodeHoldings(this.doc), frame.from);
  }
  destroy() {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "leave");
    this.doc.off("update", this.onUpdate);
    this.awareness.off("update", this.onAwareness);
    globalThis.document?.removeEventListener("visibilitychange", this.onVisibility);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.clearSyncTimers();
    clearInterval(this.antiEntropy);
    this.transport.close();
    this.awareness.destroy();
  }
}
