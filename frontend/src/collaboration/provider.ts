import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { FrameAssembler, frames, type MessageKind } from "./frames";
import type { Transport } from "./transport";

const REMOTE = Symbol("remote peer");

export class CollaborationProvider {
  readonly awareness: Awareness;
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
      this.send("hello", Y.encodeStateVector(doc));
      this.sendAwareness();
      this.synchronized();
    };
    this.antiEntropy = setInterval(() => this.send("hello", Y.encodeStateVector(doc)), 30000);
  }
  connect() {
    this.transport.connect();
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
    if (!result) return;
    const { frame, data } = result;
    try {
      if (frame.kind === "hello" || frame.kind === "vector") {
        this.send("update", Y.encodeStateAsUpdate(this.doc, data), frame.from);
        if (frame.kind === "hello") {
          this.send("vector", Y.encodeStateVector(this.doc), frame.from);
          this.sendAwareness();
        }
      } else if (frame.kind === "update") {
        Y.applyUpdate(this.doc, data, REMOTE);
        this.synchronized();
      } else applyAwarenessUpdate(this.awareness, data, REMOTE);
    } catch {
      /* Invalid peer payloads cannot interrupt local editing. */
    }
  };
  destroy() {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "leave");
    this.doc.off("update", this.onUpdate);
    this.awareness.off("update", this.onAwareness);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    clearInterval(this.antiEntropy);
    this.transport.close();
    this.awareness.destroy();
  }
}
