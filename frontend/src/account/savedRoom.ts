import * as Y from "yjs";
import type { CanvasDocument } from "../document/canvasDocument";
import { decodePicture, encodePicture, pictureHashes } from "../document/pictures";
import type { PictureCodec, StoredPicture } from "../collaboration/pictureStore";
import type { Envelope } from "../collaboration/roomKey";
import { decodeContents, encodeContents, type SavedCopy } from "./workspaceFile";
import type { SaveableRoom } from "./workspaceSaver";

/** Current room-key capabilities; the adapter reads live envelope state for each operation. */
interface SavedRoomKey {
  readonly requiresPassword: boolean;
  readonly codec: PictureCodec;
  readonly currentEnvelope: Envelope | null;
  readonly whenOpen: Promise<void>;
  adoptEnvelope(envelope: Envelope): void;
  onPasswordChange(listener: () => void): () => void;
}

interface SavedPictures {
  read(hash: string): Promise<StoredPicture | undefined>;
  keep(hash: string, picture: StoredPicture): Promise<void>;
}

/** Account-specific saved-copy policy, independent of room and editor implementations. */
export class SavedRoom implements SaveableRoom {
  private origin = Symbol("saved copy");

  constructor(
    readonly id: string,
    private document: CanvasDocument,
    private pictures: SavedPictures,
    private key: SavedRoomKey,
    private signal: AbortSignal,
    private restored: () => void
  ) {}

  title() {
    // The real title is inside what the password protects.
    return this.key.requiresPassword ? "Password room" : this.document.title();
  }

  async contents(): Promise<SavedCopy> {
    this.signal.throwIfAborted();
    const contents = {
      roomId: this.id,
      update: Y.encodeStateAsUpdate(this.document.doc),
      pictures: await this.unsharedPictures(),
    };
    this.signal.throwIfAborted();
    const envelope = this.key.currentEnvelope;
    if (!envelope) throw new Error("Open this password room before saving.");
    const sealed = await this.key.codec.seal(encodeContents(contents));
    this.signal.throwIfAborted();
    return { roomId: this.id, envelope, sealed };
  }

  async apply(copy: SavedCopy) {
    if (this.signal.aborted) return;
    this.key.adoptEnvelope(copy.envelope);
    await this.waitForKey(this.key);
    if (this.signal.aborted) return;
    const contents = decodeContents(await this.key.codec.open(copy.sealed));
    const decoded = await Promise.all(contents.pictures.map(decodePicture));
    if (this.signal.aborted) return;
    await Promise.all(
      decoded
        .filter((picture) => picture !== null)
        .map((picture) => this.pictures.keep(picture.hash, picture))
    );
    if (!this.signal.aborted) {
      Y.applyUpdate(this.document.doc, contents.update, this.origin);
      this.restored();
    }
  }

  onChange(listener: () => void) {
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== this.origin && origin !== this.key) listener();
    };
    this.document.doc.on("update", onUpdate);
    const stop = this.key.onPasswordChange(listener);
    return () => {
      this.document.doc.off("update", onUpdate);
      stop();
    };
  }

  private async waitForKey(key: SavedRoomKey) {
    if (this.signal.aborted) return;
    let abort!: () => void;
    const stopped = new Promise<void>((resolve) => {
      abort = resolve;
      this.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      await Promise.race([key.whenOpen, stopped]);
    } finally {
      this.signal.removeEventListener("abort", abort);
    }
  }

  /** Include locally held stored bytes when peers cannot obtain them from shared storage. */
  private async unsharedPictures() {
    const items = this.document.list().filter((item) => item.picture && !item.picture.stored);
    const found = await Promise.all(
      pictureHashes(items).map(async (hash) => {
        const picture = await this.pictures.read(hash);
        return picture && encodePicture(hash, picture.type, picture.bytes);
      })
    );
    return found.flatMap((picture) => picture ?? []);
  }
}
