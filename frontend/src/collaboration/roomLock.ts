import * as Y from "yjs";
import type { LockedTransport } from "./lockedTransport";
import type { PictureCodec } from "./pictureStore";
import {
  WrongPassword,
  createEnvelope,
  envelopeMatches,
  generateRoomKey,
  openEnvelope,
  parseEnvelope,
  seal,
  unseal,
  type Envelope,
} from "./roomKey";

/** Past this many stored updates, opening a room merges them into one. */
const COMPACT_AFTER = 100;

/**
 * choose: a new room needs its password. enter: this room's envelope is known and needs its password.
 * waiting: nobody has provided the envelope yet. unlocked: the room key is in hand.
 */
export type LockState = "choose" | "enter" | "waiting" | "unlocked";

/** Where a password room persists on this device: only ciphertext and its envelope. */
export interface LockedStorage {
  envelope(): Promise<unknown>;
  saveEnvelope(envelope: Envelope): Promise<void>;
  updates(): Promise<Uint8Array[]>;
  addUpdate(sealed: Uint8Array): Promise<void>;
  replaceUpdates(sealed: Uint8Array): Promise<void>;
  close(): void;
}

/**
 * A password room's key and local copy. It stands in for y-indexeddb, which would store the document
 * unencrypted, and nothing reaches the document or the network until a password opens the key.
 */
export class RoomLock {
  state: LockState;
  error = "";
  private loaded: Promise<void> | null = null;
  private key: CryptoKey | null = null;
  private envelope: Envelope | null = null;
  private saving = Promise.resolve();
  private opened: () => void = () => {};
  /** Resolves once the room's password has opened it. */
  readonly whenOpen = new Promise<void>((resolve) => {
    this.opened = resolve;
  });

  constructor(
    private storage: LockedStorage,
    private transport: LockedTransport,
    private doc: Y.Doc,
    private changed: () => void,
    created: boolean
  ) {
    this.state = created ? "choose" : "waiting";
    transport.onEnvelope = (envelope) => void this.receiveEnvelope(envelope);
    transport.shareEnvelope = () => this.envelope;
  }

  /** Reads what this device knows about the room, once. */
  get whenSynced() {
    this.loaded ??= this.loadEnvelope();
    return this.loaded;
  }

  private async loadEnvelope() {
    const stored = parseEnvelope(await this.storage.envelope());
    if (!stored) return;
    // A peer's newer envelope can arrive during this lookup, and must survive it.
    if (!this.envelope || stored.revision > this.envelope.revision) this.envelope = stored;
    this.transport.envelopeKnown();
    this.state = "enter";
    this.changed();
  }

  /** Whether this device already knows the room, which counts as arriving at saved work. */
  get hasLocalCopy() {
    return this.envelope !== null;
  }

  async choose(password: string) {
    const key = await generateRoomKey();
    this.envelope = await createEnvelope(password, key, 1);
    await this.storage.saveEnvelope(this.envelope);
    this.transport.envelopeKnown();
    await this.open(key);
  }

  /** Tries a password against the room's envelope. A wrong one changes nothing. */
  async enter(password: string) {
    if (!this.envelope) return;
    try {
      const key = await openEnvelope(password, this.envelope);
      await this.storage.saveEnvelope(this.envelope);
      this.error = "";
      await this.open(key);
    } catch (error) {
      if (!(error instanceof WrongPassword)) throw error;
      this.error = "That password is not right.";
      this.changed();
    }
  }

  /** Rewraps the same key, so the document and everyone already in the room are unaffected. */
  async changePassword(password: string) {
    if (!this.key || !this.envelope) return;
    this.envelope = await createEnvelope(password, this.key, this.envelope.revision + 1);
    await this.storage.saveEnvelope(this.envelope);
    this.transport.broadcastEnvelope(this.envelope);
  }

  private async receiveEnvelope(envelope: Envelope) {
    if (this.envelope && envelope.revision <= this.envelope.revision) return;
    if (this.key) {
      // Only a holder of the key can replace an envelope, or anyone could lock others out.
      if (!(await envelopeMatches(this.key, envelope))) return;
      await this.storage.saveEnvelope(envelope);
      this.envelope = envelope;
      return;
    }
    this.envelope = envelope;
    if (this.state === "waiting") this.state = "enter";
    this.changed();
  }

  private async open(key: CryptoKey) {
    const stored = await this.storage.updates();
    const updates = await Promise.all(stored.map((sealed) => unseal(key, sealed)));
    if (updates.length) Y.applyUpdate(this.doc, Y.mergeUpdates(updates), this);
    if (stored.length > COMPACT_AFTER)
      await this.storage.replaceUpdates(await seal(key, Y.encodeStateAsUpdate(this.doc)));
    this.key = key;
    this.doc.on("update", this.onUpdate);
    this.state = "unlocked";
    this.transport.unlock(key);
    this.opened();
    this.changed();
  }

  /** The envelope, for keeping with a saved copy of the room. */
  get currentEnvelope() {
    return this.envelope;
  }

  /** Takes an envelope from a saved copy, so the room can open where nobody else is online. */
  adoptEnvelope(envelope: Envelope) {
    this.transport.envelopeKnown();
    void this.receiveEnvelope(envelope);
  }

  private onUpdate = (update: Uint8Array, origin: unknown) => {
    const { key } = this;
    if (!key || origin === this) return;
    this.saving = this.saving.then(async () => this.storage.addUpdate(await seal(key, update)));
  };

  /** Keeps picture bytes sealed under the room key, on this device and in shared storage. */
  readonly codec: PictureCodec = {
    seal: (bytes) => seal(this.requireKey(), bytes),
    open: (bytes) => unseal(this.requireKey(), bytes),
  };

  private requireKey() {
    if (!this.key) throw new Error("This room is locked.");
    return this.key;
  }

  async destroy() {
    this.doc.off("update", this.onUpdate);
    await this.saving;
    this.storage.close();
  }
}

function request<T>(action: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    action.onsuccess = () => resolve(action.result);
    action.onerror = () => reject(new Error("This browser could not use its room storage."));
  });
}

/** The browser's storage for one password room. */
export function indexedDbLockedStorage(roomId: string): LockedStorage {
  const opening = indexedDB.open(`arconis-locked:${roomId}`, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore("updates", { autoIncrement: true });
    opening.result.createObjectStore("meta");
  };
  const opened = request(opening);
  const store = async (name: string, mode: IDBTransactionMode) =>
    (await opened).transaction(name, mode).objectStore(name);
  return {
    envelope: async () => request((await store("meta", "readonly")).get("envelope")),
    saveEnvelope: async (envelope) => {
      await request((await store("meta", "readwrite")).put(envelope, "envelope"));
    },
    updates: async () =>
      request((await store("updates", "readonly")).getAll()) as Promise<Uint8Array[]>,
    addUpdate: async (sealed) => {
      await request((await store("updates", "readwrite")).add(sealed));
    },
    replaceUpdates: async (sealed) => {
      const updates = await store("updates", "readwrite");
      updates.clear();
      await request(updates.add(sealed));
    },
    close: () => {
      opened.then((db) => db.close()).catch(() => {});
    },
  };
}
